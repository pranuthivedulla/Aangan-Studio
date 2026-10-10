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

/**
 * The second, looser check — and the distinction matters.
 *
 * `containsNoPriceLanguage` above bans every digit, which is right for the
 * one sentence the agent SPEAKS about price: it needs no number, so a number
 * is a bug. Applying the same rule everywhere was wrong, and a test caught it
 * on 10 Oct 2026: the designer's handoff note has to say "3BHK",
 * "1,400 sq ft" and "done by March". Those are the facts of the project, not
 * a quote.
 *
 * So internal and client-visible prose is checked for price FIGURES instead:
 * currency amounts, lakh and crore figures, per-sq-ft rates, rate language,
 * and a bare number sitting next to a cost word. A plain area or a month
 * passes, which is what makes the note usable.
 */
export function containsNoPriceFigure(text: string): PriceLanguageVerdict {
  if (CURRENCY.test(text)) {
    return { ok: false, reason: 'must contain no currency amount or rupee reference' };
  }

  const figurePatterns: readonly [RegExp, string][] = [
    [/\d[\d,.]*\s*(lakhs?|crores?)/i, 'a lakh or crore figure'],
    [/(lakhs?|crores?)\s*\d/i, 'a lakh or crore figure'],
    [/\d[\d,.]*\s*(\/|per)\s*(sq\.?\s*ft|square\s*(foot|feet))/i, 'a per-square-foot rate'],
    [/(per\s*sq\.?\s*ft|per\s*square\s*(foot|feet))[^.]{0,12}\d/i, 'a per-square-foot rate'],
    [
      /(cost|price|priced|rate|charge|charges|budget|quote|quotation|estimate)[^.]{0,20}\d/i,
      'a number next to a cost word',
    ],
    [/\d[^.]{0,20}(per\s*sq|a\s*square\s*foot)/i, 'a per-square-foot rate'],
  ];

  for (const [pattern, label] of figurePatterns) {
    const hit = pattern.exec(text);
    if (hit) return { ok: false, reason: `must not contain ${label} ("${hit[0].trim()}")` };
  }

  const hit = RATE_LANGUAGE.exec(text);
  if (hit) {
    return { ok: false, reason: `must not promise or imply a figure ("${hit[0]}")` };
  }
  return { ok: true };
}
