/**
 * The price guard, in one function.
 *
 * Non-negotiable 1: the system never quotes a price. That rule was being
 * enforced in exactly one place — a test sweep over the phrases committed in
 * `approved-phrases.ts` — while the sentence the agent actually speaks is a
 * RUNTIME SETTING, editable from the admin page with no deploy and no review.
 * So until 10 Oct 2026 the first rule in the brief could be defeated by typing
 * a figure into a text box.
 *
 * This is the shared verdict. The settings schema calls it on every write, and
 * the acceptance sweep calls it on every outbound phrase, so the admin page and
 * the test suite can never disagree about what counts as a price.
 *
 * It is deliberately blunt: a sentence whose whole job is to DEFLECT a price
 * question has no legitimate need for a number, a currency marker or a rate
 * word. All three are refused rather than judged. A false rejection costs
 * somebody a rewording; a false acceptance puts a figure in a caller's ear.
 */

export type PriceLanguageVerdict = { ok: true } | { ok: false; reason: string };

/** Any digit. There is no price-deflection sentence that needs one. */
const DIGITS = /\d/;

/** Rupee sign, or a written currency reference. */
const CURRENCY = /(₹|\brs\.?\b|\binr\b|\brupees?\b)/i;

/**
 * Rate and figure language, including the four phrasings `pricing.md` names
 * under "What the agent must never say", and the number words a figure could
 * hide behind once digits are banned.
 */
const RATE_LANGUAGE = new RegExp(
  [
    'per\\s*sq\\.?\\s*ft',
    'per\\s*square\\s*(foot|feet)',
    '\\blakhs?\\b',
    '\\bcrores?\\b',
    '\\bthousand\\b',
    '\\bhundred\\b',
    'price\\s*list',
    'rate\\s*card',
    '\\brates?\\s+(start|begin)',
    '\\bstarts?\\s+at\\b',
    '\\bcosts?\\s+(around|about|approximately)\\b',
    "\\bit'?ll\\s+cost\\b",
    '\\bballpark\\b',
    '\\bquotations?\\b',
    '\\bestimates?\\b',
    '\\btypically\\s+(it|its|it\\s+is)\\b',
  ].join('|'),
  'i',
);

export function containsNoPriceLanguage(text: string): PriceLanguageVerdict {
  if (DIGITS.test(text)) {
    return { ok: false, reason: 'must contain no digits — the system never quotes a price' };
  }
  if (CURRENCY.test(text)) {
    return { ok: false, reason: 'must contain no currency amount or rupee reference' };
  }
  const hit = RATE_LANGUAGE.exec(text);
  if (hit) {
    return { ok: false, reason: `must not promise or imply a figure ("${hit[0]}")` };
  }
  return { ok: true };
}
