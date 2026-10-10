/**
 * Every sentence the system is allowed to say about price.
 *
 * Non-negotiable 1: the system never quotes a price. Ruled again on
 * 10 Oct 2026 — the brief's §1 mention of "a pricing quote from the system" is
 * a slip; no figure ever leaves this system, including in the designer's
 * handoff note.
 *
 * The sentence below is NOT drafted. It is copied verbatim from
 * context/pricing.md, which already supplies it under "The only acceptable
 * response to a pricing question". A test asserts it still matches that file
 * (tests/unit/approved-phrase-verbatim.test.ts), and a second test asserts no
 * figure from pricing.md appears in anything outbound
 * (tests/acceptance/T01-no-price-leak.test.ts).
 *
 * Changing this text needs Nikhil's sign-off, recorded in the settings audit
 * log (brief §8A).
 */

export const APPROVAL_STATUS = 'NEEDS_NIKHIL_APPROVAL' as const;

export const PRICE_DEFLECTION =
  'Pricing depends on the site, the materials you choose, and the scope — your designer ' +
  'will walk you through it in detail at the consultation. I can book that for you right ' +
  'now if you\'d like.';

/**
 * Phrases pricing.md names as forbidden. Kept as data so a test can assert the
 * agent never emits them, and so the classifier prompt can carry them.
 *
 * pricing.md, "What the agent must never say".
 */
export const FORBIDDEN_PRICE_PHRASINGS: readonly string[] = [
  'Any specific number, range, or per-sq-ft figure',
  "It'll cost around...",
  'Our rates start at...',
  "For a 2BHK it's typically...",
] as const;

/**
 * Caller-facing scripts for the other outcomes are Phase 5 (the Vaani call
 * flow), and they are the founder's wording to approve, not mine to invent. The
 * decline line below is the only one with a written source: qualified.md's "At
 * the boundary" section.
 */
export const DECLINE_GRACEFULLY =
  'This sounds like it may not be the right fit for us right now — but feel free to reach ' +
  'out if your timeline or scope changes.';

/** Everything the system may say, for the price-leak sweep to iterate over. */
export const ALL_OUTBOUND_PHRASES: readonly string[] = [
  PRICE_DEFLECTION,
  DECLINE_GRACEFULLY,
] as const;
