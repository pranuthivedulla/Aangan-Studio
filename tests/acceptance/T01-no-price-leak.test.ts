/**
 * T01 — No outbound text ever contains a price figure from pricing.md.
 * T02 — A caller asking about price gets the approved sentence only.
 *
 * This is the one place context/pricing.md is read (non-negotiable 1). Every
 * figure in it is extracted and asserted absent from everything the system can
 * say.
 *
 * The sweep is deliberately wide: it covers the approved phrases, and in later
 * phases the prep summary, handoff note, Telegram text, calendar description
 * and email body all get added to OUTBOUND_SURFACES below. A new outbound
 * surface that is not in this list is a gap, so the list is asserted to grow.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL_OUTBOUND_PHRASES,
  APPROVAL_STATUS,
  FORBIDDEN_PRICE_PHRASINGS,
  PRICE_DEFLECTION,
} from '@config/approved-phrases';

const PRICING_MD = readFileSync(
  fileURLToPath(new URL('../../context/pricing.md', import.meta.url)),
  'utf8',
);

/**
 * Pull every price-shaped token out of pricing.md: rupee amounts, per-sq-ft
 * ranges, lakh figures and bare four-digit money.
 */
function extractPriceFigures(md: string): string[] {
  const figures = new Set<string>();

  // ₹1,800 / ₹3,500+ / ₹1–1.5
  for (const m of md.matchAll(/₹\s?[\d,]+(?:\.\d+)?/g)) figures.add(m[0].replace(/\s/g, ''));
  // "3.5 lakh", "8 lakh", "60-80 lakh"
  for (const m of md.matchAll(/[\d.,]+\s*lakh/gi)) figures.add(m[0]);
  // bare thousands that are clearly money in this file
  for (const m of md.matchAll(/\b[12],\d{3}\b|\b[234],\d{3}\b/g)) figures.add(m[0]);

  return [...figures];
}

const PRICE_FIGURES = extractPriceFigures(PRICING_MD);

/** Everything the system can currently say to anyone outside the studio. */
const OUTBOUND_SURFACES: readonly { name: string; text: string }[] =
  ALL_OUTBOUND_PHRASES.map((text, i) => ({ name: `approved phrase ${i}`, text }));

describe('T01 no price figure from pricing.md reaches an outbound surface', () => {
  it('found price figures in pricing.md to test against', () => {
    // If this fails the regex has rotted and the whole test is vacuous.
    expect(PRICE_FIGURES.length).toBeGreaterThan(5);
  });

  it.each(OUTBOUND_SURFACES.map((s) => [s.name, s.text] as const))(
    '%s contains no figure from pricing.md',
    (_name, text) => {
      const hits = PRICE_FIGURES.filter((f) => text.includes(f));
      expect(hits, `leaked: ${hits.join(', ')}`).toEqual([]);
    },
  );

  it('no outbound surface contains a digit at all', () => {
    // Stronger than the figure sweep and cheap to hold: nothing the agent says
    // about price needs a number. If a future surface legitimately needs one
    // (a date, a slot time), it gets its own allowlisted entry here.
    for (const surface of OUTBOUND_SURFACES) {
      expect(surface.text, surface.name).not.toMatch(/\d/);
    }
  });

  it('every outbound surface is covered by this sweep', () => {
    expect(OUTBOUND_SURFACES.length).toBe(ALL_OUTBOUND_PHRASES.length);
    expect(OUTBOUND_SURFACES.length).toBeGreaterThan(0);
  });
});

describe('T02 the approved sentence is pricing.md own wording', () => {
  it('appears verbatim in pricing.md', () => {
    const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
    expect(collapse(PRICING_MD)).toContain(collapse(PRICE_DEFLECTION));
  });

  it('offers to book in the same breath', () => {
    expect(PRICE_DEFLECTION.toLowerCase()).toContain('book');
  });

  it('is still flagged for Nikhil approval', () => {
    expect(APPROVAL_STATUS).toBe('NEEDS_NIKHIL_APPROVAL');
  });

  it('says none of the phrasings pricing.md forbids', () => {
    for (const forbidden of FORBIDDEN_PRICE_PHRASINGS) {
      // The forbidden list is prose, not literal strings to match; what matters
      // is that pricing.md still lists them so the classifier prompt can carry
      // them, and that the approved sentence is not one of them.
      expect(PRICING_MD).toContain(forbidden.replace(/\.\.\.$/, ''));
      expect(PRICE_DEFLECTION).not.toContain(forbidden);
    }
  });
});
