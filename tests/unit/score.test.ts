/**
 * Scoring: where the model's reading ends and arithmetic begins.
 *
 * The thing these tests protect is the override. Criteria 2 and 4 are decided
 * by code even when the model says otherwise, because they are a lookup and a
 * comparison, not a judgement. A model that "feels" a Nashik address is
 * workable must not be able to act on it.
 */

import { describe, expect, it } from 'vitest';
import { refineScopeClass, score } from '@/pipeline/score';
import type { Extraction } from '@/schemas/extraction';
import { CRITERIA } from '@config/criteria';
import { COMMERCIAL_MIN_SQFT } from '@config/scope';
import { floorsAreConfigured } from '@config/budget-floor';
import { decisionById } from '@config/open-decisions';
import { transcriptFor } from '../fixtures/phone-transcripts';
import type { CriterionResult } from '@/types';

const t01 = transcriptFor('T01').body;

function extraction(over: {
  fields?: Partial<Extraction['fields']>;
  results?: Partial<Record<string, CriterionResult>>;
  quotes?: Partial<Record<string, string | null>>;
  scope?: Extraction['scope_class'];
  intent?: Extraction['intent'];
}): Extraction {
  return {
    fields: {
      space_type: '3BHK',
      area_sqft: 1400,
      scope: 'full redesign',
      timeline: 'March',
      decision_maker: 'owner',
      location: 'Kothrud',
      budget_mentioned: null,
      language: 'en',
      ...over.fields,
    },
    criteria: CRITERIA.map((c) => ({
      id: c.id,
      // A real T01 caller line, so evidence verification passes honestly.
      evidence_quote:
        over.quotes && c.id in over.quotes
          ? (over.quotes[c.id] ?? null)
          : 'We want to redo the whole thing',
      reasoning: 'r',
      result: over.results?.[c.id] ?? 'pass',
    })),
    scope_class: over.scope ?? 'full_home',
    intent: over.intent ?? 'new_enquiry',
    price_asked: false,
    confidence: 0.9,
  };
}

const resultFor = (s: ReturnType<typeof score>, id: string): CriterionResult | undefined =>
  s.scores.find((x) => x.criterionId === id)?.result;

describe('criterion 2 is decided by the locality table, not the model', () => {
  it('passes a served locality', () => {
    const s = score(extraction({ fields: { location: 'Kothrud - Dahanukar Colony' } }), t01);
    expect(resultFor(s, 'service_area')).toBe('pass');
  });

  it('fails an excluded place even when the model said pass', () => {
    const s = score(
      extraction({ fields: { location: 'Nashik' }, results: { service_area: 'pass' } }),
      t01,
    );
    expect(resultFor(s, 'service_area')).toBe('fail');
  });

  it('passes a served locality even when the model said fail', () => {
    const s = score(
      extraction({ fields: { location: 'Pimple Saudagar' }, results: { service_area: 'fail' } }),
      t01,
    );
    expect(resultFor(s, 'service_area')).toBe('pass');
  });

  it('an unlisted Pune locality is unclear, never a fail', () => {
    for (const location of ['Kharadi', 'Nanded City', 'somewhere near Pune']) {
      const s = score(extraction({ fields: { location } }), t01);
      expect(resultFor(s, 'service_area'), location).toBe('unclear');
    }
  });

  it('no location at all is unclear', () => {
    const s = score(extraction({ fields: { location: null } }), t01);
    expect(resultFor(s, 'service_area')).toBe('unclear');
    expect(s.scores.find((x) => x.criterionId === 'service_area')?.reasoning).toContain('no location');
  });

  it('says why, in words a front-desk reader can use', () => {
    const s = score(extraction({ fields: { location: 'Kharadi' } }), t01);
    expect(s.scores.find((x) => x.criterionId === 'service_area')?.reasoning).toContain('Kharadi');
  });
});

describe('criterion 4 follows qualified.md exactly', () => {
  it('silence is a pass — "If budget is not mentioned, treat as qualified"', () => {
    const s = score(extraction({ fields: { budget_mentioned: null } }), t01);
    expect(resultFor(s, 'budget_band')).toBe('pass');
  });

  it('silence is a pass even when the model guessed otherwise', () => {
    const s = score(
      extraction({ fields: { budget_mentioned: null }, results: { budget_band: 'fail' } }),
      t01,
    );
    expect(resultFor(s, 'budget_band')).toBe('pass');
  });

  it('a volunteered figure is unclear while no floor is set, and names D20', () => {
    const s = score(extraction({ fields: { budget_mentioned: 125_000 } }), t01);
    expect(resultFor(s, 'budget_band')).toBe('unclear');
    expect(s.blockedBy).toContain('D20');
  });

  it('cannot fail anyone on budget today — the T10 situation, stated plainly', () => {
    expect(floorsAreConfigured()).toBe(false);
    for (const amount of [1, 1_000, 125_000, 10_000_000]) {
      const s = score(extraction({ fields: { budget_mentioned: amount } }), t01);
      expect(resultFor(s, 'budget_band')).not.toBe('fail');
    }
    expect(decisionById('D20').status).toBe('blocking');
  });

  it('the model cannot fail a budget on its own authority', () => {
    const s = score(
      extraction({ fields: { budget_mentioned: 100_000 }, results: { budget_band: 'fail' } }),
      t01,
    );
    expect(resultFor(s, 'budget_band')).toBe('unclear');
  });
});

describe('criteria 1, 3 and 5 stay with the model, once its evidence checks out', () => {
  it('keeps a well-evidenced pass', () => {
    const s = score(extraction({ results: { real_project: 'pass' } }), t01);
    expect(resultFor(s, 'real_project')).toBe('pass');
  });

  it('keeps a well-evidenced fail', () => {
    const s = score(extraction({ results: { timeline: 'fail' } }), t01);
    expect(resultFor(s, 'timeline')).toBe('fail');
  });

  it('downgrades a fabricated quote, whatever the model concluded', () => {
    const s = score(
      extraction({
        results: { decision_maker: 'pass' },
        quotes: { decision_maker: 'I am the sole owner and I decide everything' },
      }),
      t01,
    );
    expect(resultFor(s, 'decision_maker')).toBe('unclear');
    expect(s.scores.find((x) => x.criterionId === 'decision_maker')?.downgradeReason).toBe('quote_not_found');
  });

  it('downgrades a quote the front desk spoke', () => {
    const s = score(
      extraction({ results: { real_project: 'pass' }, quotes: { real_project: 'That sounds like a complete redesign' } }),
      t01,
    );
    expect(resultFor(s, 'real_project')).toBe('unclear');
    expect(s.scores.find((x) => x.criterionId === 'real_project')?.downgradeReason).toBe('quote_not_caller_speech');
  });
});

describe('scope refinement', () => {
  it('leaves non-commercial scopes alone', () => {
    expect(refineScopeClass('full_home', 5500).scopeClass).toBe('full_home');
    expect(refineScopeClass('partial', 900).scopeClass).toBe('partial');
    expect(refineScopeClass('advice_only', null).scopeClass).toBe('advice_only');
  });

  it('flags a tiny commercial job but does not reclassify it, because D2 is unanswered', () => {
    const refined = refineScopeClass('commercial', 180);
    expect(COMMERCIAL_MIN_SQFT).toBeNull();
    expect(refined.scopeClass).toBe('commercial');
    expect(refined.blockedBy).toBe('D2');
  });

  it('flags a job over the ~3,000 cap rather than declining it', () => {
    const refined = refineScopeClass('commercial', 4000);
    expect(refined.scopeClass).toBe('commercial');
    expect(refined.blockedBy).toBe('D30');
    expect(decisionById('D30').currentDefault).toContain('flagged');
  });

  it('passes a commercial job inside the stated range cleanly', () => {
    expect(refineScopeClass('commercial', 800)).toEqual({ scopeClass: 'commercial', blockedBy: null });
    expect(refineScopeClass('commercial', 2200)).toEqual({ scopeClass: 'commercial', blockedBy: null });
  });

  it('cannot refine without an area', () => {
    expect(refineScopeClass('commercial', null)).toEqual({ scopeClass: 'commercial', blockedBy: null });
  });
});

describe('the result carries everything a human needs', () => {
  it('always returns one score per configured criterion, in order', () => {
    const s = score(extraction({}), t01);
    expect(s.scores.map((x) => x.criterionId)).toEqual(CRITERIA.map((c) => c.id));
  });

  it('invents an unclear score for a criterion the model skipped', () => {
    const partial = extraction({});
    const missing: Extraction = { ...partial, criteria: partial.criteria.slice(0, 2) };
    const s = score(missing, t01);
    expect(s.scores).toHaveLength(CRITERIA.length);
    expect(resultFor(s, 'decision_maker')).toBe('unclear');
  });

  it('passes the intent and the price flag straight through', () => {
    const s = score({ ...extraction({ intent: 'price_enquiry' }), price_asked: true }, t01);
    expect(s.intent).toBe('price_enquiry');
    expect(s.priceAsked).toBe(true);
  });

  it('every blocking id it reports is a real decision', () => {
    const s = score(extraction({ fields: { budget_mentioned: 100_000, area_sqft: 180 }, scope: 'commercial' }), t01);
    for (const id of s.blockedBy) expect(() => decisionById(id)).not.toThrow();
    expect(s.blockedBy).toEqual(['D2', 'D20']);
  });
});
