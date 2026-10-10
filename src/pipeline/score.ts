/**
 * Scoring (brief §5.4, map box 9): turn the model's reading of a call into
 * per-criterion results and a scope class.
 *
 * The division of labour, which is the whole point of this file:
 *
 *   The MODEL judges criteria 1, 3 and 5 — real project, timeline, decision
 *   maker. Those need reading comprehension, and every judgement arrives with a
 *   caller quote that `verifyEvidence` has already checked.
 *
 *   The CODE decides criteria 2 and 4 — service area and budget — and overrides
 *   the model where it disagrees. Neither is a judgement: area is a lookup
 *   against services.md's list, and budget is a comparison against a floor.
 *   A model that "feels" a Nashik address is fine, or that a volunteered
 *   ₹1 lakh is workable, must not be able to act on it.
 *
 * Nothing here decides an outcome. That is `decide.ts`.
 */

import type { CriterionScore, Intent, ScopeClass } from '@/types';
import type { Extraction } from '@/schemas/extraction';
import { verifyEvidence } from '@/schemas/extraction';
import { CRITERIA } from '@config/criteria';
import { resolveArea } from '@config/localities';
import { floorFor } from '@config/budget-floor';
import { COMMERCIAL_MAX_SQFT, COMMERCIAL_MIN_SQFT } from '@config/scope';

export interface ScoreResult {
  readonly scores: readonly CriterionScore[];
  readonly scopeClass: ScopeClass;
  readonly intent: Intent;
  readonly priceAsked: boolean;
  /**
   * Open decisions that stopped this call being scored properly. Carried all
   * the way to the front-desk queue, so a human sees "we could not judge the
   * budget because no floor is set" rather than an unexplained `unclear`.
   */
  readonly blockedBy: readonly string[];
}

const CRITERION_SERVICE_AREA = 'service_area';
const CRITERION_BUDGET = 'budget_band';

/**
 * Criterion 2, decided from the locality table.
 *
 * An unrecognised locality is `unclear`, never `fail`. services.md's list ends
 * with "and adjoining areas" and omits Kharadi and Nanded City, both of which
 * appear in the September calls. A wrong decline here is a lost project with
 * no human in the loop; a wrong `unclear` costs one question.
 */
function scoreServiceArea(
  location: string | null,
  modelScore: CriterionScore,
): CriterionScore {
  const verdict = resolveArea(location);
  if (verdict === 'unknown') {
    return {
      ...modelScore,
      result: 'unclear',
      reasoning: location
        ? `"${location}" is not in the service-area list and not excluded; needs confirming`
        : 'no location given',
    };
  }
  return {
    ...modelScore,
    result: verdict === 'in_area' ? 'pass' : 'fail',
    reasoning:
      verdict === 'in_area'
        ? `"${location ?? ''}" is in Pune city or PCMC per services.md`
        : `"${location ?? ''}" is named outside the service area in services.md`,
  };
}

/**
 * Criterion 4, decided by comparison.
 *
 * qualified.md, verbatim: "If budget is not mentioned, treat as qualified."
 * So silence is a pass, and only a volunteered number can fail — and only
 * against a floor Nikhil has set. With no floor, the honest answer is
 * `unclear` plus a note naming D20, not a guess in either direction.
 */
function scoreBudget(
  budgetMentioned: number | null,
  scopeClass: ScopeClass,
  modelScore: CriterionScore,
): { score: CriterionScore; blockedBy: string | null } {
  if (budgetMentioned === null) {
    return {
      score: {
        ...modelScore,
        result: 'pass',
        reasoning: 'budget not mentioned; qualified.md says treat as qualified',
      },
      blockedBy: null,
    };
  }

  const floor = floorFor(scopeClass);
  if (floor === null) {
    return {
      score: {
        ...modelScore,
        result: 'unclear',
        reasoning: `caller volunteered a budget but no floor is set for ${scopeClass} (D20)`,
      },
      blockedBy: 'D20',
    };
  }

  const below = budgetMentioned < floor;
  return {
    score: {
      ...modelScore,
      result: below ? 'fail' : 'pass',
      reasoning: below
        ? `volunteered budget is below the configured floor for ${scopeClass}`
        : `volunteered budget is at or above the configured floor for ${scopeClass}`,
    },
    blockedBy: null,
  };
}

/**
 * Refine the model's scope class with the two things only arithmetic can
 * settle.
 *
 * `commercial_below_min` is reachable only once Nikhil sets a minimum (D2).
 * Until then a 180 sq ft pod stays `commercial` and the gate sends it to
 * review, which is the behaviour the Phase 0 plan argued for: the agent must
 * not decline on a rule that exists in no document.
 */
export function refineScopeClass(
  modelScope: Extraction['scope_class'],
  areaSqft: number | null,
): { scopeClass: ScopeClass; blockedBy: string | null } {
  if (modelScope !== 'commercial' || areaSqft === null) {
    return { scopeClass: modelScope, blockedBy: null };
  }
  if (COMMERCIAL_MIN_SQFT !== null && areaSqft < COMMERCIAL_MIN_SQFT) {
    return { scopeClass: 'commercial_below_min', blockedBy: null };
  }
  if (areaSqft < 500) {
    // Below anything the studio has described taking on, but there is no
    // written minimum to fail it against.
    return { scopeClass: 'commercial', blockedBy: 'D2' };
  }
  if (areaSqft > COMMERCIAL_MAX_SQFT) {
    // services.md says "up to approximately 3,000 sq ft". "Approximately"
    // means a hard cut is wrong, so this does not decline — it flags.
    return { scopeClass: 'commercial', blockedBy: 'D30' };
  }
  return { scopeClass: 'commercial', blockedBy: null };
}

export function score(extraction: Extraction, transcript: string): ScoreResult {
  const verified = verifyEvidence(extraction, transcript);
  const blockedBy = new Set<string>();

  const refined = refineScopeClass(extraction.scope_class, extraction.fields.area_sqft);
  if (refined.blockedBy) blockedBy.add(refined.blockedBy);

  const scores = CRITERIA.map((criterion): CriterionScore => {
    const modelScore =
      verified.find((s) => s.criterionId === criterion.id) ??
      ({
        criterionId: criterion.id,
        evidenceQuote: null,
        reasoning: 'not judged by the model',
        result: 'unclear',
        downgradedForBadEvidence: true,
        downgradeReason: 'no_quote_for_decided_result',
      } satisfies CriterionScore);

    if (criterion.id === CRITERION_SERVICE_AREA) {
      return scoreServiceArea(extraction.fields.location, modelScore);
    }
    if (criterion.id === CRITERION_BUDGET) {
      const result = scoreBudget(
        extraction.fields.budget_mentioned,
        refined.scopeClass,
        modelScore,
      );
      if (result.blockedBy) blockedBy.add(result.blockedBy);
      return result.score;
    }
    return modelScore;
  });

  // D21: the caller is not the decider, but named someone who is. That is
  // exactly T14's shape -- a son calling for parents who will attend and
  // decide. qualified.md calls it insufficient AND says to forward it, so the
  // front desk is told the question is open rather than being handed a bare
  // "unclear".
  const dm = scores.find((s) => s.criterionId === 'decision_maker');
  if (dm?.result === 'unclear' && extraction.fields.decision_maker !== null) {
    blockedBy.add('D21');
  }

  return {
    scores,
    scopeClass: refined.scopeClass,
    intent: extraction.intent,
    priceAsked: extraction.price_asked,
    blockedBy: [...blockedBy].sort(),
  };
}
