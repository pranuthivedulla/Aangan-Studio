/**
 * The qualification criteria, as DATA.
 *
 * Source of truth: context/qualified.md. The `text` field of each criterion is
 * copied verbatim from that file and must not be paraphrased, shortened or
 * "improved" — the model is shown this wording and the tests assert it matches
 * the file on disk (tests/unit/criteria-verbatim.test.ts).
 *
 * Adding a criterion means adding an entry here. No pipeline code changes
 * (brief §5.3). `criteria-extra.md` has not been supplied; see OPEN_DECISIONS
 * D10.
 */

import type { CriterionRole, UnclearBehaviour } from '@/types';

export interface CriterionDef {
  /** Stable id. Used in stored scores, so never renumber these. */
  readonly id: string;
  /** Nikhil's own heading from qualified.md. */
  readonly label: string;
  /** Verbatim body from qualified.md. Do not edit without editing the file. */
  readonly text: string;
  /** gate = decides the outcome. rank = orders the queue. prep = note only. */
  readonly role: CriterionRole;
  /**
   * What an `unclear` on this criterion does, per qualified.md's "At the
   * boundary" section:
   *   "Unclear on 1, 2, or 3: ask one direct question."
   *   "Unclear on 4 or 5: do not push. Treat as qualified and note the
   *    uncertainty in the handoff note."
   */
  readonly onUnclear: UnclearBehaviour;
}

export const CRITERIA: readonly CriterionDef[] = [
  {
    id: 'real_project',
    label: 'Real project — not just advice',
    text:
      'The person wants design and execution, not a consultation or a second opinion. ' +
      'Red flags: "just looking for ideas," "can you come and advise," "I\'ll do the ' +
      'execution myself." Our minimum engagement is a room redesign with full execution.',
    role: 'gate',
    onUnclear: 'ask_one',
  },
  {
    id: 'service_area',
    label: 'In our service area',
    text:
      'Pune city or PCMC. If the site is in Talegaon, Nashik, Mumbai, or anywhere outside ' +
      "our area — decline politely. We don't have the vendor network outside Pune.",
    role: 'gate',
    onUnclear: 'ask_one',
  },
  {
    id: 'timeline',
    label: 'Realistic timeline',
    text:
      'The site must be available for execution within 8–10 weeks of the consultation. ' +
      'If someone needs it done in 3 weeks, we cannot serve them well. Ask: "When would ' +
      'you need the project complete?" — if the answer makes execution impossible, say ' +
      'so honestly.',
    role: 'gate',
    onUnclear: 'ask_one',
  },
  {
    id: 'budget_band',
    label: 'Right budget band (broadly)',
    text:
      "Don't quote. Don't probe. But if a caller volunteers a number that is clearly " +
      'below what any project of their described scope would cost — for example, ₹1–1.5 ' +
      'lakh for a full flat redesign — address the misalignment on the call. It\'s kinder ' +
      'than discovering it at consultation. If budget is not mentioned, treat as qualified.',
    role: 'gate',
    onUnclear: 'forward_with_note',
  },
  {
    id: 'decision_maker',
    label: 'Decision-maker on the call (or represented)',
    text:
      'The person should be the one who decides, or calling on behalf of someone who has ' +
      'authorised them to move forward. "My spouse wants to do this but they\'re not ' +
      'available" is fine if the caller confirms they\'re authorised. "I\'m just doing ' +
      'initial research for my in-laws" is not sufficient on its own.',
    role: 'gate',
    onUnclear: 'forward_with_note',
  },
] as const;

export const GATE_CRITERION_IDS: readonly string[] = CRITERIA.filter(
  (c) => c.role === 'gate',
).map((c) => c.id);

/**
 * Things qualified.md says explicitly do NOT disqualify. Kept as data so the
 * classifier prompt can carry them and so a regression test can assert that
 * none of them ever produces a `fail`.
 */
export const NON_DISQUALIFIERS: readonly string[] = [
  'Not knowing exactly what they want (that\'s the consultation\'s job)',
  'Calling outside office hours (answer, qualify, book)',
  'Asking for pricing (deflect, but do not disqualify)',
  'Being uncertain about materials, style, or layout',
  'A single room project (one room with full execution is fine)',
  'A rented apartment (fine, as long as no structural changes)',
] as const;

export function criterionById(id: string): CriterionDef {
  const found = CRITERIA.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown criterion id: ${id}`);
  return found;
}
