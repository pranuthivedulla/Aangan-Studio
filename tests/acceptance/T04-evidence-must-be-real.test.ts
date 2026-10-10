/**
 * T04 — A quote not in the transcript downgrades that criterion to `unclear`.
 * T05 — Invalid model JSON → one retry → review, no crash.
 *
 * These two are the whole of "the AI proposes, code decides" (non-negotiable
 * 3). They run against the real September transcripts, not invented text.
 */

import { describe, expect, it } from 'vitest';
import {
  parseExtraction,
  quoteIsPresent,
  verifyEvidence,
  type Extraction,
} from '@/schemas/extraction';
import { transcriptFor } from '../fixtures/phone-transcripts';

const t01 = transcriptFor('T01').body;

function extractionWith(
  criteria: Extraction['criteria'],
  overrides: Partial<Extraction> = {},
): Extraction {
  return {
    fields: {
      space_type: '3BHK',
      area_sqft: 1400,
      scope: 'full redesign',
      timeline: 'March',
      decision_maker: 'owner and husband',
      location: 'Kothrud',
      budget_mentioned: null,
      language: 'en',
    },
    criteria,
    scope_class: 'full_home',
    intent: 'new_enquiry',
    price_asked: false,
    confidence: 0.9,
    ...overrides,
  };
}

describe('T04 evidence must be a real substring of the transcript', () => {
  it('accepts a quote that is actually in the transcript', () => {
    const quote = 'We want to redo the whole thing';
    expect(quoteIsPresent(quote, t01)).toBe(true);

    const scores = verifyEvidence(
      extractionWith([
        { id: 'real_project', evidence_quote: quote, reasoning: 'wants full redesign', result: 'pass' },
      ]),
      t01,
    );
    expect(scores[0]?.result).toBe('pass');
    expect(scores[0]?.downgradedForBadEvidence).toBe(false);
    expect(scores[0]?.evidenceQuote).toBe(quote);
  });

  it('downgrades a fabricated quote to unclear and drops the quote', () => {
    const invented = 'We have a budget of twenty lakh and want to start on Monday';
    expect(quoteIsPresent(invented, t01)).toBe(false);

    const scores = verifyEvidence(
      extractionWith([
        { id: 'budget_band', evidence_quote: invented, reasoning: 'caller gave a budget', result: 'pass' },
      ]),
      t01,
    );
    expect(scores[0]?.result).toBe('unclear');
    expect(scores[0]?.downgradedForBadEvidence).toBe(true);
    expect(scores[0]?.evidenceQuote).toBeNull();
  });

  it('downgrades a fabricated quote even when the model said FAIL', () => {
    // A fail is an adverse decision about a caller. It has to rest on
    // something the caller actually said.
    const invented = 'I am calling from Nashik';
    const scores = verifyEvidence(
      extractionWith([
        { id: 'service_area', evidence_quote: invented, reasoning: 'out of area', result: 'fail' },
      ]),
      t01,
    );
    expect(scores[0]?.result).toBe('unclear');
    expect(scores[0]?.downgradedForBadEvidence).toBe(true);
  });

  it('downgrades a pass with no quote at all', () => {
    const scores = verifyEvidence(
      extractionWith([
        { id: 'timeline', evidence_quote: null, reasoning: 'seems fine', result: 'pass' },
      ]),
      t01,
    );
    expect(scores[0]?.result).toBe('unclear');
    expect(scores[0]?.downgradedForBadEvidence).toBe(true);
  });

  it('leaves an honest unclear-with-no-quote alone', () => {
    const scores = verifyEvidence(
      extractionWith([
        { id: 'budget_band', evidence_quote: null, reasoning: 'budget never mentioned', result: 'unclear' },
      ]),
      t01,
    );
    expect(scores[0]?.result).toBe('unclear');
    expect(scores[0]?.downgradedForBadEvidence).toBe(false);
  });

  it('tolerates whitespace and dash differences but not different words', () => {
    expect(quoteIsPresent('We  want   to redo the whole thing', t01)).toBe(true);
    expect(quoteIsPresent('We want to redo the entire thing', t01)).toBe(false);
  });
});

describe('T05 invalid model output is rejected, not guessed at', () => {
  it('rejects text that is not JSON', () => {
    const result = parseExtraction('Sure! Here is my assessment of the caller.');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not valid JSON');
  });

  it('unwraps a fenced JSON block', () => {
    const payload = JSON.stringify(
      extractionWith([
        { id: 'real_project', evidence_quote: 'redo the whole thing', reasoning: 'r', result: 'pass' },
      ]),
    );
    const result = parseExtraction('```json\n' + payload + '\n```');
    expect(result.ok).toBe(true);
  });

  it('rejects valid JSON that does not match the schema', () => {
    const result = parseExtraction(JSON.stringify({ fields: {}, criteria: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an outcome field, because the model never decides the outcome', () => {
    const payload = {
      ...extractionWith([
        { id: 'real_project', evidence_quote: 'redo the whole thing', reasoning: 'r', result: 'pass' },
      ]),
      outcome: 'book',
    };
    const result = parseExtraction(JSON.stringify(payload));
    expect(result.ok).toBe(false);
  });

  it('rejects a confidence outside 0..1', () => {
    const payload = extractionWith(
      [{ id: 'real_project', evidence_quote: 'redo the whole thing', reasoning: 'r', result: 'pass' }],
      { confidence: 7 },
    );
    const result = parseExtraction(JSON.stringify(payload));
    expect(result.ok).toBe(false);
  });
});
