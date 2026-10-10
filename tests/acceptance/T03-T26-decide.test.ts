/**
 * The decision rules, one test per rule row (brief §5.4).
 *
 * Covers acceptance tests:
 *   T03 (as reworded by D28) a lead with any failed criterion never reaches a
 *       designer without a human deciding first
 *   T06 one clarifying question, then re-score
 *   T07 narrow scope → front-desk review
 *   T08 complaint → front desk, never Nikhil
 *   T25 one unclear → forwarded as borderline, criterion named
 *   T26 a fail, out-of-service, complaint or narrow scope is NEVER forwarded
 *   T27 MAX_UNCLEAR_FORWARD changes routing with no code change
 */

import { describe, expect, it } from 'vitest';
import {
  DECISION_ORDER,
  decide,
  violatesT03,
  type DecideInput,
  type DecisionRule,
} from '@/pipeline/decide';
import type { ScoreResult } from '@/pipeline/score';
import { DEFAULT_SETTINGS, type Settings } from '@config/settings-schema';
import { CRITERIA } from '@config/criteria';
import type { CriterionResult, CriterionScore, Intent, ScopeClass } from '@/types';

function scores(results: Partial<Record<string, CriterionResult>>): readonly CriterionScore[] {
  return CRITERIA.map((c) => ({
    criterionId: c.id,
    evidenceQuote: 'quoted',
    reasoning: 'r',
    result: results[c.id] ?? 'pass',
    downgradedForBadEvidence: false,
    downgradeReason: null,
  }));
}

function scoreResult(
  over: {
    results?: Partial<Record<string, CriterionResult>>;
    scopeClass?: ScopeClass;
    intent?: Intent;
  } = {},
): ScoreResult {
  return {
    scores: scores(over.results ?? {}),
    scopeClass: over.scopeClass ?? 'full_home',
    intent: over.intent ?? 'new_enquiry',
    priceAsked: false,
    blockedBy: [],
  };
}

function input(
  score: ScoreResult,
  over: Partial<Omit<DecideInput, 'score'>> = {},
  settings: Partial<Settings> = {},
): DecideInput {
  return {
    score,
    askedQuestionCount: 0,
    isRepeatCaller: false,
    isExistingClient: false,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe('the rule order is written down and complete', () => {
  it('lists every rule exactly once', () => {
    expect(new Set(DECISION_ORDER).size).toBe(DECISION_ORDER.length);
    expect(DECISION_ORDER).toHaveLength(12);
  });

  it('puts the non-negotiables above the gate arithmetic', () => {
    const idx = (r: DecisionRule): number => DECISION_ORDER.indexOf(r);
    expect(idx('kill_switch')).toBeLessThan(idx('complaint'));
    expect(idx('complaint')).toBeLessThan(idx('scope_declines'));
    expect(idx('scope_declines')).toBeLessThan(idx('gate_fails_at_threshold'));
    expect(idx('gate_fails_at_threshold')).toBeLessThan(idx('gate_fail_below_threshold'));
    expect(idx('gate_fail_below_threshold')).toBeLessThan(idx('ask_one_question'));
    expect(idx('ask_one_question')).toBeLessThan(idx('borderline_forward'));
  });
});

describe('kill switch', () => {
  it('sends everything to the front desk and decides nothing', () => {
    const d = decide(
      input(scoreResult({ results: { service_area: 'fail' } }), {}, {
        KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK: true,
      }),
    );
    expect(d.outcome).toBe('review');
    expect(d.rule).toBe('kill_switch');
  });

  it('beats even a clean booking', () => {
    const d = decide(input(scoreResult(), {}, { KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK: true }));
    expect(d.outcome).toBe('review');
  });
});

describe('T08 a complaint goes to the front desk', () => {
  it('is a complaint, not a sales outcome', () => {
    const d = decide(input(scoreResult({ intent: 'complaint' })));
    expect(d.outcome).toBe('complaint');
    expect(d.rule).toBe('complaint');
  });

  it('beats an out-of-area address, so a complaining client is not declined', () => {
    // The ordering bug this guards: an existing client who has moved, or whose
    // address was mis-extracted, must not be declined instead of heard.
    const d = decide(
      input(scoreResult({ intent: 'complaint', results: { service_area: 'fail' }, scopeClass: 'out_of_service' })),
    );
    expect(d.outcome).toBe('complaint');
  });

  it('never reaches a designer directly', () => {
    expect(decide(input(scoreResult({ intent: 'complaint' }))).reachesDesignerDirectly).toBe(false);
  });
});

describe('D22 a pre-sale response failure is its own thing', () => {
  it('goes to the front desk, not the complaint queue and not a designer', () => {
    const d = decide(input(scoreResult({ intent: 'service_failure' })));
    expect(d.outcome).toBe('review');
    expect(d.rule).toBe('service_failure');
    expect(d.rationale).toContain('unanswered');
  });

  it('is never parked, however much is unclear', () => {
    const d = decide(
      input(
        scoreResult({
          intent: 'service_failure',
          results: { real_project: 'unclear', timeline: 'unclear', decision_maker: 'unclear' },
        }),
        { askedQuestionCount: 1 },
      ),
    );
    expect(d.outcome).toBe('review');
  });
});

describe('scope declines on its own, whatever the gate says', () => {
  it.each([
    ['out_of_service', 'out_of_service' as ScopeClass],
    ['advice_only (D26)', 'advice_only' as ScopeClass],
  ])('%s declines', (_label, scopeClass) => {
    const d = decide(input(scoreResult({ scopeClass })));
    expect(d.outcome).toBe('decline');
    expect(d.rule).toBe('scope_declines');
  });

  it('declines even when all five criteria pass — the Nashik and restaurant case', () => {
    const d = decide(input(scoreResult({ scopeClass: 'out_of_service', results: {} })));
    expect(d.outcome).toBe('decline');
  });
});

describe('D24 the gate threshold', () => {
  it('two failures decline', () => {
    const d = decide(input(scoreResult({ results: { timeline: 'fail', budget_band: 'fail' } })));
    expect(d.outcome).toBe('decline');
    expect(d.rule).toBe('gate_fails_at_threshold');
  });

  it('ONE failure goes to front-desk review, not a decline', () => {
    const d = decide(input(scoreResult({ results: { budget_band: 'fail' } })));
    expect(d.outcome).toBe('review');
    expect(d.rule).toBe('gate_fail_below_threshold');
  });

  it('the threshold is config: set it to 1 and one failure declines again', () => {
    const d = decide(
      input(scoreResult({ results: { budget_band: 'fail' } }), {}, { GATE_FAIL_THRESHOLD: 1 }),
    );
    expect(d.outcome).toBe('decline');
  });
});

describe('T03 as reworded (D28): a failure never reaches a designer unseen', () => {
  const failCombinations: Partial<Record<string, CriterionResult>>[] = [
    { real_project: 'fail' },
    { service_area: 'fail' },
    { timeline: 'fail' },
    { budget_band: 'fail' },
    { decision_maker: 'fail' },
    { timeline: 'fail', budget_band: 'fail' },
    { real_project: 'fail', service_area: 'fail', timeline: 'fail' },
  ];

  it.each(failCombinations.map((r) => [JSON.stringify(r), r] as const))(
    '%s never books',
    (_label, results) => {
      const d = decide(input(scoreResult({ results })));
      expect(d.outcome).not.toBe('book');
      expect(d.reachesDesignerDirectly).toBe(false);
      expect(violatesT03(scoreResult({ results }), d)).toBe(false);
    },
  );

  it('holds at every threshold setting', () => {
    for (const GATE_FAIL_THRESHOLD of [1, 2, 3, 4, 5]) {
      for (const results of failCombinations) {
        const s = scoreResult({ results });
        const d = decide(input(s, {}, { GATE_FAIL_THRESHOLD }));
        expect(violatesT03(s, d), `threshold ${GATE_FAIL_THRESHOLD} ${JSON.stringify(results)}`).toBe(false);
      }
    }
  });

  it('and holds even with the forwarding limit opened wide', () => {
    const s = scoreResult({ results: { budget_band: 'fail', timeline: 'unclear' } });
    const d = decide(input(s, { askedQuestionCount: 1 }, { MAX_UNCLEAR_FORWARD: 5 }));
    expect(violatesT03(s, d)).toBe(false);
  });
});

describe('T07 narrow scope and the undocumented commercial minimum', () => {
  it.each([
    ['narrow_scope', 'narrow_scope' as ScopeClass],
    ['commercial_below_min (D2)', 'commercial_below_min' as ScopeClass],
    ['unclear scope', 'unclear' as ScopeClass],
  ])('%s goes to review, never a decline and never a designer', (_label, scopeClass) => {
    const d = decide(input(scoreResult({ scopeClass })));
    expect(d.outcome).toBe('review');
    expect(d.rule).toBe('scope_needs_review');
    expect(d.reachesDesignerDirectly).toBe(false);
  });
});

describe('T06 exactly one clarifying question', () => {
  it('asks when criterion 1, 2 or 3 is unclear', () => {
    const d = decide(input(scoreResult({ results: { timeline: 'unclear' } })));
    expect(d.outcome).toBe('ask_one');
    expect(d.questionCriterionId).toBe('timeline');
  });

  it('does not ask twice', () => {
    const d = decide(
      input(scoreResult({ results: { timeline: 'unclear' } }), { askedQuestionCount: 1 }),
    );
    expect(d.outcome).not.toBe('ask_one');
  });

  it('never asks about budget or the decision maker — qualified.md says do not push', () => {
    const d = decide(
      input(scoreResult({ results: { budget_band: 'unclear', decision_maker: 'unclear' } })),
    );
    expect(d.outcome).not.toBe('ask_one');
  });

  it('asks about the first askable criterion in rubric order', () => {
    const d = decide(
      input(scoreResult({ results: { real_project: 'unclear', timeline: 'unclear' } })),
    );
    expect(d.questionCriterionId).toBe('real_project');
  });
});

describe('T25 borderline forwarding', () => {
  it('one unclear, nothing failed, after the question → booked and flagged', () => {
    const d = decide(
      input(scoreResult({ results: { decision_maker: 'unclear' } }), { askedQuestionCount: 1 }),
    );
    expect(d.outcome).toBe('book');
    expect(d.borderline).toBe(true);
    expect(d.borderlineCriterionId).toBe('decision_maker');
  });

  it('forwards an unclear decision-maker without asking, per qualified.md', () => {
    const d = decide(input(scoreResult({ results: { decision_maker: 'unclear' } })));
    expect(d.outcome).toBe('book');
    expect(d.borderline).toBe(true);
  });

  it('T27 raising the limit forwards two unclears with no code change', () => {
    const two = { budget_band: 'unclear' as CriterionResult, decision_maker: 'unclear' as CriterionResult };
    expect(decide(input(scoreResult({ results: two }))).outcome).toBe('park');
    expect(
      decide(input(scoreResult({ results: two }), {}, { MAX_UNCLEAR_FORWARD: 2 })).outcome,
    ).toBe('book');
  });

  it('T27 lowering it to zero stops borderline forwarding entirely', () => {
    const d = decide(
      input(scoreResult({ results: { decision_maker: 'unclear' } }), {}, { MAX_UNCLEAR_FORWARD: 0 }),
    );
    expect(d.outcome).toBe('park');
  });
});

describe('parking, and who is never parked', () => {
  it('parks when too much is unknown', () => {
    const d = decide(
      input(
        scoreResult({ results: { budget_band: 'unclear', decision_maker: 'unclear' } }),
        { askedQuestionCount: 1 },
      ),
    );
    expect(d.outcome).toBe('park');
    expect(d.rule).toBe('too_unclear_park');
  });

  it('F1: a repeat caller is reviewed today instead of parked until tomorrow', () => {
    const d = decide(
      input(
        scoreResult({ results: { budget_band: 'unclear', decision_maker: 'unclear' } }),
        { askedQuestionCount: 1, isRepeatCaller: true },
      ),
    );
    expect(d.outcome).toBe('review');
    expect(d.rule).toBe('too_unclear_review');
  });

  it('and that behaviour is a setting, not a hard-coded kindness', () => {
    const d = decide(
      input(
        scoreResult({ results: { budget_band: 'unclear', decision_maker: 'unclear' } }),
        { askedQuestionCount: 1, isRepeatCaller: true },
        { NEVER_PARK_REPEAT_OR_SERVICE_FAILURE: false },
      ),
    );
    expect(d.outcome).toBe('park');
  });
});

describe('T26 the bias toward forwarding is bounded', () => {
  const neverForwarded: [string, Parameters<typeof scoreResult>[0]][] = [
    ['a gate fail', { results: { timeline: 'fail' } }],
    ['two gate fails', { results: { timeline: 'fail', budget_band: 'fail' } }],
    ['out of service', { scopeClass: 'out_of_service' }],
    ['advice only', { scopeClass: 'advice_only' }],
    ['a complaint', { intent: 'complaint' }],
    ['a service failure', { intent: 'service_failure' }],
    ['narrow scope', { scopeClass: 'narrow_scope' }],
    ['below the commercial minimum', { scopeClass: 'commercial_below_min' }],
  ];

  it.each(neverForwarded)('%s is never forwarded, at any forwarding limit', (_label, over) => {
    for (const MAX_UNCLEAR_FORWARD of [0, 1, 2, 5]) {
      const d = decide(input(scoreResult(over), { askedQuestionCount: 1 }, { MAX_UNCLEAR_FORWARD }));
      expect(d.outcome, `${_label} at limit ${MAX_UNCLEAR_FORWARD}`).not.toBe('book');
      expect(d.reachesDesignerDirectly).toBe(false);
    }
  });
});

describe('the clean case', () => {
  it('all five pass → book', () => {
    const d = decide(input(scoreResult()));
    expect(d.outcome).toBe('book');
    expect(d.rule).toBe('all_clear');
    expect(d.borderline).toBe(false);
    expect(d.reachesDesignerDirectly).toBe(true);
  });

  it('is the only rule that books without a flag', () => {
    const d = decide(input(scoreResult()));
    expect(d.borderlineCriterionId).toBeNull();
  });
});
