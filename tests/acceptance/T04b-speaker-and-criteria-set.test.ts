/**
 * T04, second half — the evidence check is as paranoid as it claims to be.
 *
 * Three defects from the Phase 1 review are closed here:
 *   C3  a quote the STUDIO spoke was accepted as caller evidence
 *   C4  the same sentence punctuated with "--" instead of an em dash was
 *       silently rejected, downgrading a sound criterion to unclear
 *   C5/C6 duplicate, unknown and missing criterion ids were all accepted
 *
 * All of it runs against the real September transcripts.
 */

import { describe, expect, it } from 'vitest';
import {
  MODEL_INTENTS,
  MODEL_SCOPE_CLASSES,
  parseExtraction,
  quoteIsCallerSpeech,
  quoteIsPresent,
  splitSpeakerTurns,
  transcriptHasSpeakers,
  validateCriteriaSet,
  verifyEvidence,
  type Extraction,
} from '@/schemas/extraction';
import { CRITERIA } from '@config/criteria';
import { SCOPE_CLASSES } from '@config/scope';
import { transcriptFor } from '../fixtures/phone-transcripts';

const t01 = transcriptFor('T01').body;
const t02 = transcriptFor('T02').body;
const t08 = transcriptFor('T08').body;

function fullCriteria(
  overrides: Partial<Record<string, Extraction['criteria'][number]>> = {},
): Extraction['criteria'] {
  return CRITERIA.map(
    (c) =>
      overrides[c.id] ?? {
        id: c.id,
        evidence_quote: null,
        reasoning: 'nothing said about this',
        result: 'unclear' as const,
      },
  );
}

function extraction(criteria: Extraction['criteria']): Extraction {
  return {
    fields: {
      space_type: null, area_sqft: null, scope: null, timeline: null,
      decision_maker: null, location: null, budget_mentioned: null, language: null,
    },
    criteria,
    scope_class: 'full_home',
    intent: 'new_enquiry',
    price_asked: false,
    confidence: 0.8,
  };
}

// ---------------------------------------------------------------------------

describe('speaker attribution', () => {
  it('splits a real transcript into caller and studio turns', () => {
    const turns = splitSpeakerTurns(t01);
    expect(turns.filter((t) => t.speaker === 'caller').length).toBeGreaterThan(3);
    expect(turns.filter((t) => t.speaker === 'studio').length).toBeGreaterThan(3);
  });

  it('keeps a wrapped line with the speaker above it', () => {
    // T01's first caller turn runs over two lines in the source.
    const firstCaller = splitSpeakerTurns(t01).find((t) => t.speaker === 'caller');
    expect(firstCaller?.text).toContain('Shruti Joshi');
  });

  it('strips the speaker label from the text', () => {
    for (const turn of splitSpeakerTurns(t01)) {
      expect(turn.text.startsWith('Caller:')).toBe(false);
      expect(turn.text.startsWith('Front Desk:')).toBe(false);
    }
  });

  it('C3 FIXED: a studio line is no longer accepted as caller evidence', () => {
    const studioLine = 'That works well. Shall I set up a consultation?';
    expect(quoteIsPresent(studioLine, t02)).toBe(true);        // it IS in the transcript
    expect(quoteIsCallerSpeech(studioLine, t02)).toBe(false);  // but the desk said it

    const scores = verifyEvidence(
      extraction(
        fullCriteria({
          budget_band: {
            id: 'budget_band',
            evidence_quote: studioLine,
            reasoning: 'caller seemed comfortable',
            result: 'pass',
          },
        }),
      ),
      t02,
    );
    const budget = scores.find((s) => s.criterionId === 'budget_band');
    expect(budget?.result).toBe('unclear');
    expect(budget?.downgradeReason).toBe('quote_not_caller_speech');
  });

  it('still accepts what the caller actually said', () => {
    const callerLine = 'Full redesign';
    expect(quoteIsCallerSpeech(callerLine, t02)).toBe(true);

    const scores = verifyEvidence(
      extraction(
        fullCriteria({
          real_project: {
            id: 'real_project',
            evidence_quote: callerLine,
            reasoning: 'wants a full redesign with execution',
            result: 'pass',
          },
        }),
      ),
      t02,
    );
    const real = scores.find((s) => s.criterionId === 'real_project');
    expect(real?.result).toBe('pass');
    expect(real?.downgradeReason).toBeNull();
  });

  it('rejects a quote that straddles two speakers', () => {
    const straddle = 'Yes, but can you give me a rough ballpark first? Even a range? I genuinely';
    expect(quoteIsCallerSpeech(straddle, t02)).toBe(false);
  });

  it('a transcript with no speaker labels falls back to presence only', () => {
    // T08 is the missed call: a note, no dialogue. Attribution is meaningless
    // there, so it must not become an automatic downgrade.
    expect(transcriptHasSpeakers(t08)).toBe(false);
    const scores = verifyEvidence(
      extraction(
        fullCriteria({
          service_area: {
            id: 'service_area',
            evidence_quote: 'Nanded City area',
            reasoning: 'area noted by the desk',
            result: 'pass',
          },
        }),
      ),
      t08,
    );
    expect(scores.find((s) => s.criterionId === 'service_area')?.result).toBe('pass');
  });
});

describe('C4 FIXED: dash punctuation no longer decides whether evidence counts', () => {
  const sentence = 'We move in November';

  it('the transcript uses an em dash', () => {
    expect(t02).toContain('—');
  });

  it.each([
    ['em dash', 'We move in November — so maybe starting design from October?'],
    ['double hyphen', 'We move in November -- so maybe starting design from October?'],
    ['single hyphen', 'We move in November - so maybe starting design from October?'],
    ['en dash', 'We move in November – so maybe starting design from October?'],
  ])('%s matches', (_label, quote) => {
    expect(quoteIsPresent(quote, t02)).toBe(true);
    expect(quoteIsCallerSpeech(quote, t02)).toBe(true);
  });

  it('still rejects genuinely different words', () => {
    expect(quoteIsPresent(`${sentence} and want to start immediately`, t02)).toBe(false);
  });

  it('still rejects an invented quote', () => {
    expect(quoteIsPresent('Our budget is twenty lakh', t02)).toBe(false);
  });
});

describe('C5/C6 FIXED: the criteria set must be exactly the configured five', () => {
  it('accepts all five, once each', () => {
    expect(validateCriteriaSet(extraction(fullCriteria())).ok).toBe(true);
  });

  it('rejects a duplicate id', () => {
    const dupes = [...fullCriteria(), fullCriteria()[0]!];
    const result = validateCriteriaSet(extraction(dupes));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('duplicate');
  });

  it('rejects an unknown id', () => {
    const withUnknown = [
      ...fullCriteria(),
      { id: 'vibe_check', evidence_quote: null, reasoning: 'x', result: 'fail' as const },
    ];
    const result = validateCriteriaSet(extraction(withUnknown));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('unknown');
  });

  it('rejects a missing id', () => {
    const short = fullCriteria().slice(0, 4);
    const result = validateCriteriaSet(extraction(short));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('missing');
  });

  it('parseExtraction enforces it by default', () => {
    const short = JSON.stringify(extraction(fullCriteria().slice(0, 2)));
    expect(parseExtraction(short).ok).toBe(false);
  });

  it('and can be opted out of only for shape probes', () => {
    const short = JSON.stringify(extraction(fullCriteria().slice(0, 2)));
    expect(parseExtraction(short, { requireFullCriteriaSet: false }).ok).toBe(true);
  });

  it('accepts a well-formed full extraction', () => {
    expect(parseExtraction(JSON.stringify(extraction(fullCriteria()))).ok).toBe(true);
  });
});

describe('C1/C2 FIXED: the model can express every class a ruling depends on', () => {
  it('advice_only is sayable, so the D26 ruling is implementable', () => {
    expect(MODEL_SCOPE_CLASSES).toContain('advice_only');
  });

  it('partial is sayable, so the partial-home fixtures are reachable', () => {
    expect(MODEL_SCOPE_CLASSES).toContain('partial');
  });

  it('service_failure and price_enquiry are sayable, so D22 and F2 are implementable', () => {
    expect(MODEL_INTENTS).toContain('service_failure');
    expect(MODEL_INTENTS).toContain('price_enquiry');
  });

  it('only commercial_below_min is unreachable, and that is by design', () => {
    const declared = SCOPE_CLASSES.map((s) => s.id);
    const unreachable = declared.filter((id) => !(MODEL_SCOPE_CLASSES as readonly string[]).includes(id));
    expect(unreachable).toEqual(['commercial_below_min']);
    // It is derived from area against a minimum no context file states (D2).
    expect(SCOPE_CLASSES.find((s) => s.id === 'commercial_below_min')?.pendingDecision).toContain('D2');
  });

  it('the schema rejects a class outside the model vocabulary', () => {
    const bad = { ...extraction(fullCriteria()), scope_class: 'commercial_below_min' };
    expect(parseExtraction(JSON.stringify(bad)).ok).toBe(false);
  });
});
