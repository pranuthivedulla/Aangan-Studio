/**
 * Mock implementations of all seven adapters. These are the DEFAULT — the
 * whole pipeline runs on them with no credentials (acceptance test T19).
 *
 * They are in-memory and deterministic. Determinism matters: assignment and
 * slot tests assert the same inputs give the same answer (T10), so nothing
 * here may use Math.random or the wall clock without being passed one.
 */

import type {
  Adapters,
  CalendarAdapter,
  CrmAdapter,
  EmailAdapter,
  FieldOwner,
  LlmAdapter,
  NotifyAdapter,
  NotifyChat,
  SettingsChange,
  StoreAdapter,
  VoiceAdapter,
  VoiceOrchestrationMode,
} from './types';
import type { CallCost, Enquiry, Lead, PhoneE164, Slot } from '@/types';
import { DEFAULT_SETTINGS, validateSetting, type Settings } from '@config/settings-schema';

// ---------------------------------------------------------------------------
// Field ownership (brief §7). The single-writer rule, as data.
// ---------------------------------------------------------------------------

export const FIELD_OWNERS: Readonly<Record<string, FieldOwner>> = {
  name: 'system',
  phone: 'system',
  location: 'system',
  criteria_scores: 'system',
  transcript: 'system',
  handoff_note: 'system',
  status: 'system',
  assigned_designer: 'system',
  qualified_by: 'system',
  budget: 'designer',
  insights: 'designer',
  granola_notes: 'designer',
  additional_notes: 'designer',
  review_decision: 'front_desk',
};

export class FieldOwnershipError extends Error {
  constructor(field: string, actor: FieldOwner, owner: FieldOwner) {
    super(`${actor} may not write "${field}"; it is owned by ${owner}`);
    this.name = 'FieldOwnershipError';
  }
}

// ---------------------------------------------------------------------------

export interface MockVoiceOptions {
  readonly orchestration?: VoiceOrchestrationMode;
  readonly calls?: Readonly<Record<string, { enquiry: Enquiry; cost: CallCost }>>;
}

export function mockVoice(opts: MockVoiceOptions = {}): VoiceAdapter & {
  readonly turnReplies: { turnIndex: number; say: string }[];
} {
  const orchestration = opts.orchestration ?? 'per_turn';
  const turnReplies: { turnIndex: number; say: string }[] = [];
  return {
    name: 'voice',
    mode: 'mock',
    orchestration,
    turnReplies,
    verifyWebhook: (_rawBody, signature) => signature === 'mock-valid-signature',
    async fetchCall(callId) {
      const found = opts.calls?.[callId];
      if (!found) throw new Error(`mockVoice: no seeded call ${callId}`);
      return found;
    },
    async replyToTurn(turn, reply) {
      if (orchestration !== 'per_turn') {
        throw new Error('mockVoice: replyToTurn is not available in post_call_only mode');
      }
      turnReplies.push({ turnIndex: turn.turnIndex, say: reply.say });
    },
  };
}

export interface MockLlmOptions {
  /** Queue of raw responses, consumed in order. Lets a test force a retry. */
  readonly responses?: readonly string[];
}

export function mockLlm(opts: MockLlmOptions = {}): LlmAdapter & { readonly calls: number } {
  const queue = [...(opts.responses ?? [])];
  let calls = 0;
  const adapter = {
    name: 'llm' as const,
    mode: 'mock' as const,
    get calls() {
      return calls;
    },
    async complete(_prompt: string, _input: string) {
      calls += 1;
      const text = queue.shift() ?? '{}';
      return { text, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  return adapter;
}

export function mockCalendar(seed: {
  readonly busy?: Readonly<Record<string, readonly Slot[]>>;
  readonly free?: Readonly<Record<string, readonly Slot[]>>;
  readonly provider?: string;
  /** Simulates the race: the slot is taken between freeBusy and insert. */
  readonly stealSlotOnInsert?: boolean;
} = {}): CalendarAdapter & { readonly events: { eventId: string; slot: Slot }[] } {
  const events: { eventId: string; slot: Slot }[] = [];
  let counter = 0;
  return {
    name: 'calendar',
    mode: 'mock',
    provider: seed.provider ?? 'mock-google',
    events,
    async freeBusy(designerId, _fromIso, _toIso) {
      return seed.free?.[designerId] ?? [];
    },
    async createEvent(args) {
      if (seed.stealSlotOnInsert) return null;
      if (events.some((e) => e.slot.startsAt === args.slot.startsAt && e.slot.designerId === args.slot.designerId)) {
        return null;
      }
      counter += 1;
      const eventId = `mock-event-${counter}`;
      events.push({ eventId, slot: args.slot });
      return { eventId };
    },
  };
}

export function mockCrm(): CrmAdapter & {
  readonly clients: Map<PhoneE164, Record<string, unknown>>;
  readonly handoffNotes: Map<string, string>;
  readonly leads: Lead[];
} {
  const clients = new Map<PhoneE164, Record<string, unknown>>();
  const handoffNotes = new Map<string, string>();
  const leads: Lead[] = [];
  return {
    name: 'crm',
    mode: 'mock',
    clients,
    handoffNotes,
    leads,
    async upsertClient(phone, fields) {
      const existing = clients.get(phone) ?? {};
      clients.set(phone, { ...existing, ...fields });
      return { clientId: phone };
    },
    async writeFields({ clientId, actor, fields }) {
      for (const field of Object.keys(fields)) {
        const owner = FIELD_OWNERS[field];
        if (!owner) throw new Error(`Unknown CRM field: ${field}`);
        if (owner !== actor) throw new FieldOwnershipError(field, actor, owner);
      }
      const existing = clients.get(clientId) ?? {};
      clients.set(clientId, { ...existing, ...fields });
    },
    async storeHandoffNote(clientId, note) {
      handoffNotes.set(clientId, note);
    },
    async recordLead(lead) {
      leads.push(lead);
      return { recordUrl: `https://crm.invalid/lead/${lead.id}` };
    },
  };
}

export function mockNotify(): NotifyAdapter & {
  readonly sent: { chat: NotifyChat; text: string; linkUrl?: string }[];
} {
  const sent: { chat: NotifyChat; text: string; linkUrl?: string }[] = [];
  const seen = new Set<string>();
  return {
    name: 'notify',
    mode: 'mock',
    sent,
    async send({ chat, text, linkUrl, idempotencyKey }) {
      if (seen.has(idempotencyKey)) return;
      seen.add(idempotencyKey);
      sent.push(linkUrl === undefined ? { chat, text } : { chat, text, linkUrl });
    },
  };
}

export function mockEmail(): EmailAdapter & {
  readonly sent: { to: string; subject: string; body: string }[];
} {
  const sent: { to: string; subject: string; body: string }[] = [];
  const seen = new Set<string>();
  return {
    name: 'email',
    mode: 'mock',
    sent,
    async send({ to, subject, body, idempotencyKey }) {
      if (seen.has(idempotencyKey)) return;
      seen.add(idempotencyKey);
      sent.push({ to, subject, body });
    },
  };
}

export function mockStore(initial: Partial<Settings> = {}): StoreAdapter {
  let settings: Settings = { ...DEFAULT_SETTINGS, ...initial };
  const audit: SettingsChange[] = [];
  const idempotency = new Set<string>();
  const leads = new Map<string, Lead>();
  const costs = new Map<string, CallCost>();

  return {
    name: 'store',
    mode: 'mock',
    async readSettings() {
      return settings;
    },
    async writeSetting({ key, value, changedBy }) {
      const checked = validateSetting(key, value);
      if (!checked.ok) return { ok: false, reason: checked.reason };
      const oldValue = settings[key as keyof Settings];
      settings = { ...settings, [key]: checked.value } as Settings;
      audit.push({
        key,
        oldValue,
        newValue: checked.value,
        changedBy,
        // Caller-supplied clock would be better; the audit row is written by
        // the admin route, which passes one in Phase 6.
        changedAt: new Date(0).toISOString(),
      });
      return { ok: true };
    },
    async settingsAudit() {
      return audit;
    },
    async seenIdempotencyKey(key) {
      return idempotency.has(key);
    },
    async recordIdempotencyKey(key) {
      idempotency.add(key);
    },
    async saveLead(lead) {
      leads.set(lead.id, lead);
    },
    async loadLeadsByClient(phone) {
      return [...leads.values()].filter((l) => l.clientId === phone);
    },
    async recordCost(callId, cost) {
      costs.set(callId, cost);
    },
    async totalCostPaise() {
      return [...costs.values()].reduce((sum, c) => sum + c.totalPaise, 0);
    },
  };
}

/** A full mock stack. This is what the pipeline gets unless told otherwise. */
export function mockAdapters(): Adapters {
  return {
    voice: mockVoice(),
    llm: mockLlm(),
    calendar: mockCalendar(),
    crm: mockCrm(),
    notify: mockNotify(),
    email: mockEmail(),
    store: mockStore(),
  };
}
