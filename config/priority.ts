/**
 * Priority weights (brief §5.5).
 *
 * [Guessing] — every number in this file is mine, not Nikhil's. No context
 * file ranks enquiries. They are here so priority is one editable table rather
 * than conditionals scattered through the pipeline, and they are runtime
 * settings so they can be tuned without a deploy (brief §8A). See
 * OPEN_DECISIONS D3.
 *
 * Priority orders the queue. It NEVER decides whether a lead is forwarded —
 * that is the gate's job, and a borderline lead is forwarded at a lower
 * priority, never held back (brief §5.5).
 */

export const PRIORITY_WEIGHTS_STATUS = 'GUESSED_NEEDS_NIKHIL_APPROVAL' as const;

export interface PriorityWeights {
  /** Site available soon / caller has a hard date. */
  readonly timelineUrgency: number;
  /** Bigger scope, bigger project value. */
  readonly scopeSize: number;
  /** Decision-maker on the call rather than represented. */
  readonly decisionMakerPresent: number;
  /** Referral or existing-client source. */
  readonly warmSource: number;
  /** Subtracted when the lead is forwarded with an unclear criterion. */
  readonly borderlinePenalty: number;
  /** Subtracted for a lead the front desk qualified after review (D3). */
  readonly frontDeskQualifiedPenalty: number;
}

export const PRIORITY_WEIGHTS: PriorityWeights = {
  timelineUrgency: 3,
  scopeSize: 2,
  decisionMakerPresent: 2,
  warmSource: 2,
  borderlinePenalty: -2,
  // Proposed in the brief as "same scale, not auto-lower". 0 implements that.
  frontDeskQualifiedPenalty: 0,
};

export const PRIORITY_BANDS = {
  high: 7,
  medium: 4,
} as const;

export type PriorityBand = 'high' | 'medium' | 'low';

export function bandFor(score: number): PriorityBand {
  if (score >= PRIORITY_BANDS.high) return 'high';
  if (score >= PRIORITY_BANDS.medium) return 'medium';
  return 'low';
}
