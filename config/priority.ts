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

/**
 * Bands are a share of what is currently ACHIEVABLE, not fixed numbers.
 *
 * Fixed thresholds were wrong and a test caught it: with two of the brief's
 * four inputs unavailable (D31), the best a lead could score was 6 against a
 * "high" threshold of 7, so the top band was unreachable and every lead was
 * medium or low. Expressing the bands as a proportion means they stay
 * meaningful today and re-calibrate themselves the moment urgency and source
 * become available.
 */
export const PRIORITY_BAND_SHARES = {
  high: 0.7,
  medium: 0.4,
} as const;

export type PriorityBand = 'high' | 'medium' | 'low';

/** The most a lead can score with the inputs that exist today. */
export function maxAchievableScore(): number {
  const w = PRIORITY_WEIGHTS;
  // Largest scope size (doubled) plus a confirmed decision maker. Urgency and
  // source are excluded deliberately: see D31.
  return w.scopeSize * 2 + w.decisionMakerPresent;
}

export function bandFor(score: number, max = maxAchievableScore()): PriorityBand {
  if (max <= 0) return 'low';
  const share = score / max;
  if (share >= PRIORITY_BAND_SHARES.high) return 'high';
  if (share >= PRIORITY_BAND_SHARES.medium) return 'medium';
  return 'low';
}
