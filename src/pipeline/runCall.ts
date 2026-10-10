/**
 * One call, end to end through the deterministic half of the pipeline
 * (map boxes 9 → 10, with the one-question loop back through box 12).
 *
 * This is where "ask ONE question" is actually enforced. The rule is easy to
 * state and easy to lose: a loop that re-scores and re-decides will happily
 * ask again if nothing stops it, and a caller asked three clarifying questions
 * by an automated voice hangs up. So the question budget is counted here, in
 * one place, and `decide` is given the count rather than being trusted to
 * remember.
 *
 * No I/O, no model call, no clock. The model's reading comes in as data, which
 * is what lets all twenty September calls run in milliseconds with no
 * credentials.
 */

import type { Settings } from '@config/settings-schema';
import type { Extraction } from '@/schemas/extraction';
import { decide, type DecideResult } from './decide';
import { prioritise, type PriorityResult } from './priority';
import { score, type ScoreResult } from './score';

export const MAX_QUESTIONS_PER_CALL = 1;

export interface RunCallInput {
  readonly transcript: string;
  /** The model's reading of the call so far. */
  readonly firstReading: Extraction;
  /**
   * The model's reading AFTER the one clarifying question was answered.
   * Omitted when no question was asked, or when the caller did not answer —
   * in which case the first decision stands and the lead goes to a human.
   */
  readonly secondReading?: Extraction;
  /**
   * The transcript INCLUDING the caller's answer to the one question.
   *
   * This is not a convenience. Evidence must be a quote from the transcript,
   * and the answer to the question is by definition not in the transcript as
   * it stood when the question was asked. Scoring the second reading against
   * the original text meant every newly-resolved criterion was downgraded for
   * having no evidence -- the caller answered and the system refused to hear
   * it. Found by test on 10 Oct 2026.
   */
  readonly secondTranscript?: string;
  readonly isRepeatCaller?: boolean;
  readonly isExistingClient?: boolean;
  readonly settings: Settings;
}

export interface RunCallResult {
  readonly firstScore: ScoreResult;
  readonly firstDecision: DecideResult;
  /** Set only when a question was asked and an answer came back. */
  readonly secondScore: ScoreResult | null;
  readonly secondDecision: DecideResult | null;
  /** What actually happens to this lead. */
  readonly finalScore: ScoreResult;
  readonly finalDecision: DecideResult;
  readonly priority: PriorityResult;
  readonly questionsAsked: number;
  /** The question that was put to the caller, if any. */
  readonly questionCriterionId: string | null;
}

export function runCall(input: RunCallInput): RunCallResult {
  const { transcript, firstReading, secondReading, settings } = input;
  const isRepeatCaller = input.isRepeatCaller ?? false;
  const isExistingClient = input.isExistingClient ?? false;

  const firstScore = score(firstReading, transcript);
  const firstDecision = decide({
    score: firstScore,
    askedQuestionCount: 0,
    isRepeatCaller,
    isExistingClient,
    settings,
  });

  const askedAQuestion = firstDecision.outcome === 'ask_one';
  let secondScore: ScoreResult | null = null;
  let secondDecision: DecideResult | null = null;

  if (askedAQuestion && secondReading !== undefined) {
    secondScore = score(secondReading, input.secondTranscript ?? transcript);
    secondDecision = decide({
      score: secondScore,
      // The budget is spent. `decide` cannot choose `ask_one` again.
      askedQuestionCount: MAX_QUESTIONS_PER_CALL,
      isRepeatCaller,
      isExistingClient,
      settings,
    });

    // Belt and braces: the only place that could re-ask is this function, and
    // this is the line that makes it impossible.
    if (secondDecision.outcome === 'ask_one') {
      throw new Error(
        'runCall: the pipeline tried to ask a second question. One is the limit.',
      );
    }
  }

  const finalScore = secondScore ?? firstScore;
  const finalDecision = secondDecision ?? firstDecision;

  const priority = prioritise({
    scores: finalScore.scores,
    scopeClass: finalScore.scopeClass,
    areaSqft: (secondReading ?? firstReading).fields.area_sqft,
    borderline: finalDecision.borderline,
    borderlineCriterionId: finalDecision.borderlineCriterionId,
    qualifiedByFrontDesk: false,
  });

  return {
    firstScore,
    firstDecision,
    secondScore,
    secondDecision,
    finalScore,
    finalDecision,
    priority,
    questionsAsked: askedAQuestion ? MAX_QUESTIONS_PER_CALL : 0,
    questionCriterionId: firstDecision.questionCriterionId,
  };
}
