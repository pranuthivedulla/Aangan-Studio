/**
 * Run the engine over the twenty September phone calls.
 *
 * One function, two consumers: the test that writes RESULTS-20-CALLS.md and
 * the deployed results page. They must not have separate copies, or the
 * published table could agree with nothing.
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN: evidence quotes, transcripts, caller
 * names, phone numbers. The results page is PUBLIC — the repository is open for
 * coursework assessment — so the only things leaving this function are
 * verdicts, scope classes and the engine's own one-line rationale. There is a
 * test asserting that caller speech never appears in a row.
 */

import { decide, type DecisionRule } from '@/pipeline/decide';
import { score } from '@/pipeline/score';
import { runCall } from '@/pipeline/runCall';
import { DEFAULT_SETTINGS, type Settings } from '@config/settings-schema';
import type { CriterionResult, Outcome, ScopeClass } from '@/types';
import { readingFor } from './readings';
import { transcriptFor } from './transcripts';

export const CALL_IDS: readonly string[] = Array.from(
  { length: 20 },
  (_, i) => `T${String(i + 1).padStart(2, '0')}`,
);

/** The two repeat callers in the September set. */
const REPEAT_CALLERS = new Set(['T16', 'T17']);

export interface CallRow {
  readonly id: string;
  readonly results: Readonly<Record<string, CriterionResult>>;
  readonly scopeClass: ScopeClass;
  readonly intent: string;
  readonly outcome: Outcome;
  readonly rule: DecisionRule;
  readonly borderline: boolean;
  readonly questionCriterionId: string | null;
  readonly blockedBy: readonly string[];
  /** Criteria where the code overrode the model, and why. */
  readonly downgrades: readonly string[];
  readonly rationale: string;
  readonly reachesDesigner: boolean;
  readonly priorityScore: number;
  readonly priorityBand: string;
}

export function runOneCall(id: string, settings: Settings = DEFAULT_SETTINGS): CallRow {
  const transcript = transcriptFor(id).body;
  const reading = readingFor(id);

  const scored = score(reading, transcript);
  const decision = decide({
    score: scored,
    askedQuestionCount: 0,
    isRepeatCaller: REPEAT_CALLERS.has(id),
    isExistingClient: id === 'T09',
    settings,
  });
  const { priority } = runCall({ transcript, firstReading: reading, settings });

  return {
    id,
    results: Object.fromEntries(scored.scores.map((s) => [s.criterionId, s.result])),
    scopeClass: scored.scopeClass,
    intent: scored.intent,
    outcome: decision.outcome,
    rule: decision.rule,
    borderline: decision.borderline,
    questionCriterionId: decision.questionCriterionId,
    blockedBy: scored.blockedBy,
    downgrades: scored.scores
      .filter((s) => s.downgradedForBadEvidence)
      .map((s) => `${s.criterionId}:${s.downgradeReason}`),
    rationale: decision.rationale,
    reachesDesigner: decision.reachesDesignerDirectly,
    priorityScore: priority.score,
    priorityBand: priority.band,
  };
}

export function runAllCalls(settings: Settings = DEFAULT_SETTINGS): readonly CallRow[] {
  return CALL_IDS.map((id) => runOneCall(id, settings));
}

export function outcomeCounts(rows: readonly CallRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
}
