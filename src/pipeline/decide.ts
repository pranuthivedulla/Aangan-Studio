/**
 * The decision (brief §5.4, map box 10). The only place an outcome is chosen.
 *
 * Every rule below is a row you could read aloud to Nikhil, and every row has
 * its own test. The ORDER is as load-bearing as the rules: "complaint" has to
 * beat "out of area", which has to beat "two failures", which has to beat "one
 * failure". Get the order wrong and a complaining existing client gets
 * declined as out-of-area. `DECISION_ORDER` below is that order, written down
 * once, and asserted by test.
 *
 * As amended 10 Oct 2026:
 *   D24  two or more gate fails decline; ONE gate fail goes to front-desk
 *        review, not a decline
 *   D26  advice_only declines as an out-of-service scope, whatever the gate says
 *   D28  T03 reworded: a lead with any failed criterion never reaches a
 *        designer without a human deciding first
 *   D22  a repeat caller or a service failure is never parked
 */

import type { Intent, Outcome } from '@/types';
import type { Settings } from '@config/settings-schema';
import { CRITERIA, criterionById } from '@config/criteria';
import { declinesOnScope, scopeById } from '@config/scope';
import type { ScoreResult } from './score';

export interface DecideInput {
  readonly score: ScoreResult;
  /** How many clarifying questions have already been asked. Max one. */
  readonly askedQuestionCount: number;
  readonly isRepeatCaller: boolean;
  readonly isExistingClient: boolean;
  readonly settings: Settings;
}

export interface DecideResult {
  readonly outcome: Outcome;
  readonly borderline: boolean;
  readonly borderlineCriterionId: string | null;
  /** Which criterion the single clarifying question is about. */
  readonly questionCriterionId: string | null;
  readonly rationale: string;
  /** The rule that fired, by name. Makes the order auditable. */
  readonly rule: DecisionRule;
  /** True when this lead may reach a designer without a human first (D28). */
  readonly reachesDesignerDirectly: boolean;
}

export type DecisionRule =
  | 'kill_switch'
  | 'complaint'
  | 'service_failure'
  | 'scope_declines'
  | 'gate_fails_at_threshold'
  | 'gate_fail_below_threshold'
  | 'scope_needs_review'
  | 'ask_one_question'
  | 'borderline_forward'
  | 'too_unclear_park'
  | 'too_unclear_review'
  | 'all_clear';

/** The order rules are tried in. Asserted by test; do not reorder casually. */
export const DECISION_ORDER: readonly DecisionRule[] = [
  'kill_switch',
  'complaint',
  'service_failure',
  'scope_declines',
  'gate_fails_at_threshold',
  'gate_fail_below_threshold',
  'scope_needs_review',
  'ask_one_question',
  'borderline_forward',
  'too_unclear_park',
  'too_unclear_review',
  'all_clear',
];

const HUMAN_FIRST_OUTCOMES: readonly Outcome[] = ['decline', 'review', 'park', 'complaint'];

export function decide(input: DecideInput): DecideResult {
  const { score, settings, askedQuestionCount, isRepeatCaller } = input;

  const gateIds = CRITERIA.filter((c) => c.role === 'gate').map((c) => c.id);
  const gateScores = score.scores.filter((s) => gateIds.includes(s.criterionId));
  const fails = gateScores.filter((s) => s.result === 'fail');
  const unclears = gateScores.filter((s) => s.result === 'unclear');

  const result = (
    rule: DecisionRule,
    outcome: Outcome,
    rationale: string,
    extra: Partial<DecideResult> = {},
  ): DecideResult => ({
    outcome,
    borderline: false,
    borderlineCriterionId: null,
    questionCriterionId: null,
    rationale,
    rule,
    reachesDesignerDirectly: !HUMAN_FIRST_OUTCOMES.includes(outcome),
    ...extra,
  });

  // 1. Kill switch. Nothing is decided by the agent at all.
  if (settings.KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK) {
    return result('kill_switch', 'review', 'kill switch on: every call goes to the front desk');
  }

  // 2. A complaint is never a sales decision. Front desk, never Nikhil.
  if (score.intent === 'complaint') {
    return result('complaint', 'complaint', 'caller is complaining about existing work');
  }

  // 3. A pre-sale response failure (T16, W08). Still a live lead, and an
  //    apology owed, so the front desk takes it — and never parks it (D22).
  if (score.intent === 'service_failure') {
    return result(
      'service_failure',
      'review',
      'caller\'s earlier enquiry went unanswered; front desk calls back today',
    );
  }

  // 4. Out of scope by services.md. Declines whatever the criteria say, which
  //    is what keeps Nashik and the restaurant declining under D24's threshold.
  if (declinesOnScope(score.scopeClass)) {
    return result(
      'scope_declines',
      'decline',
      `${score.scopeClass}: ${scopeById(score.scopeClass).basis.slice(0, 80)}`,
    );
  }

  // 5. Enough gate failures to decline (D24: two by default).
  if (fails.length >= settings.GATE_FAIL_THRESHOLD) {
    return result(
      'gate_fails_at_threshold',
      'decline',
      `${fails.length} gate criteria failed: ${fails.map((f) => f.criterionId).join(', ')}`,
    );
  }

  // 6. One failure, below the threshold. A human looks at it. It does NOT
  //    reach a designer and it is NOT declined by the agent (D24, D28).
  if (fails.length > 0) {
    return result(
      'gate_fail_below_threshold',
      'review',
      `${fails[0]?.criterionId} failed; below the decline threshold, so the front desk decides`,
    );
  }

  // 7. Scope the agent must not rule on: narrow scope (the founder's office
  //    ruled it), an undocumented commercial minimum, or an unclear scope.
  if (scopeById(score.scopeClass).routing === 'review') {
    return result(
      'scope_needs_review',
      'review',
      `${score.scopeClass} is for the front desk to decide`,
    );
  }

  // 8. One clarifying question, and only one, and only for the criteria
  //    qualified.md says to ask about (1, 2, 3).
  const askable = unclears.filter(
    (s) => criterionById(s.criterionId).onUnclear === 'ask_one',
  );
  if (askable.length > 0 && askedQuestionCount < 1) {
    return result(
      'ask_one_question',
      'ask_one',
      `unclear on ${askable[0]?.criterionId}; asking one question`,
      { questionCriterionId: askable[0]?.criterionId ?? null },
    );
  }

  // 9. Still unclear, nothing failed, within the forwarding limit: send it,
  //    flagged, with the unclear criterion named first (brief §5.4, T25).
  if (unclears.length > 0 && unclears.length <= settings.MAX_UNCLEAR_FORWARD) {
    return result(
      'borderline_forward',
      'book',
      `forwarding with ${unclears.length} unclear criterion (bias toward forwarding)`,
      { borderline: true, borderlineCriterionId: unclears[0]?.criterionId ?? null },
    );
  }

  // 10. Too much unknown. Park it for the front desk tomorrow — unless this is
  //     a repeat caller, who is never parked (D22, finding F1: the default
  //     would have parked T16, a hot lead the desk booked on the spot).
  if (unclears.length > settings.MAX_UNCLEAR_FORWARD) {
    if (isRepeatCaller && settings.NEVER_PARK_REPEAT_OR_SERVICE_FAILURE) {
      return result(
        'too_unclear_review',
        'review',
        `${unclears.length} unclear, but a repeat caller is never parked; front desk calls back today`,
      );
    }
    return result(
      'too_unclear_park',
      'park',
      `${unclears.length} unclear criteria; front desk follows up next working day`,
    );
  }

  // 11. All five pass.
  return result('all_clear', 'book', 'all gate criteria pass');
}

/**
 * D28, as a function: the reworded promise T03. A lead carrying any failed
 * criterion must never reach a designer without a human deciding first.
 */
export function violatesT03(
  score: ScoreResult,
  decision: DecideResult,
): boolean {
  const hasFail = score.scores.some((s) => s.result === 'fail');
  return hasFail && decision.reachesDesignerDirectly;
}

/** Intents that must never be handled as a sales lead. */
export const NON_SALES_INTENTS: readonly Intent[] = ['complaint', 'service_failure'];
