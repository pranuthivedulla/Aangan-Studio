/**
 * Who can read and write what (brief §7). The single-writer rule and the
 * visibility matrix, as data.
 *
 * The one that matters most, because it is the easiest to leak and the most
 * personal: **the handoff note is designer-only**. Not the front desk, not
 * Nikhil, never Telegram, never an email body. It exists so a designer walks
 * into a consultation already knowing what the caller said, including what
 * they hesitated about — and that is exactly why nobody else sees it.
 *
 * Nikhil reads aggregates and nothing else. Not a policy flourish: he asked
 * for a funnel, and a founder who can read every transcript is a founder whose
 * staff know he can.
 *
 * Treat this as the PROPOSED default (D7) and confirm it with him. It is
 * enforced in code today and asserted by acceptance tests T15 and T16.
 */

export type Role = 'system' | 'designer' | 'front_desk' | 'nikhil';

export interface FieldPolicy {
  /** Exactly one writer per field. Code rejects the others. */
  readonly owner: Role;
  /** Roles that may read an individual record's value. */
  readonly readers: readonly Role[];
  /**
   * When true, a designer may read it only on leads assigned to them, and the
   * front desk only on leads in its own queue.
   */
  readonly ownRecordsOnly?: boolean;
  /** Why the access is shaped this way, for whoever reviews it next. */
  readonly note?: string;
}

export const FIELD_POLICIES: Readonly<Record<string, FieldPolicy>> = {
  // --- From the call. System-written, broadly readable.
  name: { owner: 'system', readers: ['system', 'designer', 'front_desk'] },
  phone: { owner: 'system', readers: ['system', 'designer', 'front_desk'] },
  location: { owner: 'system', readers: ['system', 'designer', 'front_desk'] },
  criteria_scores: { owner: 'system', readers: ['system', 'designer', 'front_desk'] },
  status: { owner: 'system', readers: ['system', 'designer', 'front_desk'] },
  assigned_designer: { owner: 'system', readers: ['system', 'designer', 'front_desk'] },
  qualified_by: { owner: 'system', readers: ['system', 'designer', 'front_desk'] },

  // --- Sensitive. Restricted by role AND by ownership.
  transcript: {
    owner: 'system',
    readers: ['system', 'designer', 'front_desk'],
    ownRecordsOnly: true,
    note: 'a designer reads their own leads; the front desk reads its own queue; Nikhil never',
  },
  handoff_note: {
    owner: 'system',
    readers: ['system', 'designer'],
    ownRecordsOnly: true,
    note: 'designer-only, own leads only. Never Telegram, never email, never the front desk',
  },

  // --- Designer's own notes. Nobody else reads them, including the founder.
  budget: { owner: 'designer', readers: ['designer'], ownRecordsOnly: true },
  insights: { owner: 'designer', readers: ['designer'], ownRecordsOnly: true },
  granola_notes: { owner: 'designer', readers: ['designer'], ownRecordsOnly: true },
  additional_notes: { owner: 'designer', readers: ['designer'], ownRecordsOnly: true },

  // --- Front desk's decision on a reviewed lead.
  review_decision: {
    owner: 'front_desk',
    readers: ['system', 'designer', 'front_desk'],
  },
};

export const ALL_FIELDS: readonly string[] = Object.keys(FIELD_POLICIES);

/** Fields no role may ever see outside the studio's own systems. */
export const NEVER_OUTBOUND: readonly string[] = [
  'transcript',
  'handoff_note',
  'criteria_scores',
  'budget',
  'insights',
  'granola_notes',
  'additional_notes',
];

export class FieldAccessError extends Error {
  constructor(role: Role, field: string, action: 'read' | 'write') {
    super(`${role} may not ${action} "${field}"`);
    this.name = 'FieldAccessError';
  }
}

export function policyFor(field: string): FieldPolicy {
  const policy = FIELD_POLICIES[field];
  if (!policy) throw new Error(`Unknown field: ${field}`);
  return policy;
}

export function canWrite(role: Role, field: string): boolean {
  return policyFor(field).owner === role;
}

/**
 * Can this role read this field on this record?
 *
 * Nikhil is absent from every `readers` list on purpose. He is not forgotten —
 * `canReadAggregate` is his access, and it answers a different question:
 * counts and rates, never a person.
 */
export function canRead(
  role: Role,
  field: string,
  context: { isOwnRecord?: boolean } = {},
): boolean {
  const policy = policyFor(field);
  if (!policy.readers.includes(role)) return false;
  if (policy.ownRecordsOnly && role !== 'system') {
    return context.isOwnRecord === true;
  }
  return true;
}

/** Aggregates only: counts, rates, totals. Never an individual record. */
export function canReadAggregate(role: Role, field: string): boolean {
  if (role === 'nikhil') {
    // Even in aggregate, a founder does not need the designer's private notes
    // or the caller's words. Counts of them, yes; their contents, no.
    return !NEVER_OUTBOUND.includes(field) || field === 'criteria_scores';
  }
  return canRead(role, field, { isOwnRecord: true });
}

/** The fields a role may read on a record, for building a filtered view. */
export function readableFields(
  role: Role,
  context: { isOwnRecord?: boolean } = {},
): readonly string[] {
  return ALL_FIELDS.filter((f) => canRead(role, f, context));
}
