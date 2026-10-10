/**
 * Priority (brief §5.5, map box 10). Orders the queue. Never decides whether a
 * lead is forwarded — that is the gate's job, and a borderline lead is
 * forwarded at a lower priority, never held back.
 *
 * TWO OF THE BRIEF'S FOUR INPUTS DO NOT EXIST YET, and this file says so
 * rather than faking them.
 *
 * §5.5 says `priority = f(timeline urgency, scope size, decision-maker
 * present, source)`. Of those:
 *
 *   scope size            available — scope class and area
 *   decision-maker present available — criterion 5's result
 *   timeline urgency      NOT available. Criterion 3 says whether a timeline
 *                         is FEASIBLE, which is a different question from how
 *                         SOON they want to start. T12's "March next year, no
 *                         rush" and T15's "possession in six weeks" both pass
 *                         criterion 3 and are nothing alike.
 *   source                NOT available. Four of the twenty September callers
 *                         opened with a referral — "Vikram Agarwal asked me to
 *                         call", "I got your number from a friend" — and
 *                         nothing in the data model records it.
 *
 * I could infer both by keyword-matching the transcript. I have not, because a
 * silent keyword match that mis-reads "no rush" as urgent would reorder a
 * designer's day with no way to see why. Both are recorded as D31, and their
 * weights sit unused until the question is answered.
 */

import type { CriterionScore, ScopeClass } from '@/types';
import { PRIORITY_WEIGHTS, bandFor, type PriorityBand } from '@config/priority';

export interface PriorityInput {
  readonly scores: readonly CriterionScore[];
  readonly scopeClass: ScopeClass;
  readonly areaSqft: number | null;
  readonly borderline: boolean;
  /** Which criterion made it borderline. Needed to avoid double-charging. */
  readonly borderlineCriterionId?: string | null;
  readonly qualifiedByFrontDesk: boolean;
}

export interface PriorityResult {
  readonly score: number;
  readonly band: PriorityBand;
  /** Every component, so a queue position is always explainable. */
  readonly components: readonly { name: string; points: number; why: string }[];
  /** Inputs the brief asks for that we cannot supply yet. */
  readonly unavailableInputs: readonly string[];
}

/**
 * Scope size, as a proxy for project value. Deliberately coarse — three steps,
 * not a formula. The brief says average project value is ₹8–14 lakh across the
 * board, so a finer gradient would be invented precision.
 */
function scopeSizePoints(scopeClass: ScopeClass, areaSqft: number | null): {
  points: number;
  why: string;
} {
  const w = PRIORITY_WEIGHTS.scopeSize;
  if (scopeClass === 'full_home' || scopeClass === 'commercial') {
    if (areaSqft !== null && areaSqft >= 2000) {
      return { points: w * 2, why: `${scopeClass}, ${areaSqft} sq ft — large` };
    }
    return { points: w, why: `${scopeClass}${areaSqft === null ? '' : `, ${areaSqft} sq ft`}` };
  }
  if (scopeClass === 'partial') return { points: Math.round(w / 2), why: 'partial home' };
  if (scopeClass === 'single_room') return { points: 0, why: 'single room' };
  return { points: 0, why: `${scopeClass} — no size signal` };
}

export function prioritise(input: PriorityInput): PriorityResult {
  const components: { name: string; points: number; why: string }[] = [];

  const size = scopeSizePoints(input.scopeClass, input.areaSqft);
  components.push({ name: 'scope size', ...size });

  const dm = input.scores.find((s) => s.criterionId === 'decision_maker');
  if (dm?.result === 'pass') {
    components.push({
      name: 'decision maker present',
      points: PRIORITY_WEIGHTS.decisionMakerPresent,
      why: 'the person who decides was on the call',
    });
  }

  // The borderline penalty must not charge twice for the same fact.
  //
  // A lead is usually borderline BECAUSE the decision maker is unclear — and
  // that already cost it the decision-maker points above. Applying the penalty
  // as well priced one missing sentence twice, which ranked T12 (a 5,500 sq ft
  // villa) below T15 (an 875 sq ft flat) purely because the villa's caller
  // never said "I decide". A test caught it on 10 Oct 2026.
  const borderlineAlreadyPriced =
    input.borderline && input.borderlineCriterionId === 'decision_maker' && dm?.result !== 'pass';

  if (input.borderline && !borderlineAlreadyPriced) {
    components.push({
      name: 'borderline',
      points: PRIORITY_WEIGHTS.borderlinePenalty,
      why: 'forwarded with an unclear criterion — still forwarded, just lower',
    });
  }

  if (input.qualifiedByFrontDesk) {
    components.push({
      name: 'qualified by front desk',
      points: PRIORITY_WEIGHTS.frontDeskQualifiedPenalty,
      why: 'reviewed by a human first (D3: proposed as no penalty)',
    });
  }

  const score = components.reduce((sum, c) => sum + c.points, 0);

  return {
    score,
    band: bandFor(score),
    components,
    unavailableInputs: ['timeline urgency (D31)', 'source / referral (D31)'],
  };
}
