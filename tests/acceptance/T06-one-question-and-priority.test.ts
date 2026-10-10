/**
 * T06 — exactly one clarifying question, then score once more.
 * Plus the priority ranking (brief §5.5).
 *
 * The five September calls that trigger a question are T10, T11, T13, T14 and
 * T18. None of those transcripts contains the answer, because the front desk
 * never asked — so the continuations below are SIMULATED, clearly marked, and
 * appended to the real transcript so the evidence verifier treats them exactly
 * as it would a real caller turn. They are not in `readings.ts` with the real
 * readings and they are not presented as data.
 */

import { describe, expect, it } from 'vitest';
import { MAX_QUESTIONS_PER_CALL, runCall } from '@/pipeline/runCall';
import { prioritise } from '@/pipeline/priority';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { PRIORITY_WEIGHTS, maxAchievableScore } from '@config/priority';
import { CRITERIA } from '@config/criteria';
import { transcriptFor } from '../fixtures/phone-transcripts';
import { readingFor } from '../fixtures/readings';
import type { Extraction } from '@/schemas/extraction';
import type { CriterionResult, CriterionScore, ScopeClass } from '@/types';

const settings = DEFAULT_SETTINGS;

/**
 * Append a simulated caller turn — the answer to the one question.
 *
 * Threading this through `runCall` is the design fault these tests found. The
 * answer is by definition absent from the transcript as it stood when the
 * question was asked, so scoring the second reading against the original text
 * downgraded every newly-resolved criterion for having no evidence: the caller
 * answered and the system refused to hear it.
 */
function withAnswer(id: string, answerLine: string): string {
  return `${transcriptFor(id).body}\nCaller: ${answerLine}`;
}

function answered(
  id: string,
  criterionId: string,
  result: CriterionResult,
  quote: string | null = null,
): Extraction {
  const first = readingFor(id);
  return {
    ...first,
    criteria: first.criteria.map((c) =>
      c.id === criterionId
        ? {
            ...c,
            result,
            evidence_quote: quote ?? c.evidence_quote,
            reasoning: "resolved by the caller's answer to the one question",
          }
        : c,
    ),
  };
}

describe('T06 the question budget is one, and it is enforced in one place', () => {
  it('is one', () => {
    expect(MAX_QUESTIONS_PER_CALL).toBe(1);
  });

  it('asks on T11, where no timeline was ever mentioned', () => {
    const result = runCall({
      transcript: transcriptFor('T11').body,
      firstReading: readingFor('T11'),
      settings,
    });
    expect(result.firstDecision.outcome).toBe('ask_one');
    expect(result.questionCriterionId).toBe('timeline');
    expect(result.questionsAsked).toBe(1);
  });

  it('re-scores once when the answer comes back, and books', () => {
    const answer = 'We could start in January, so about three months';
    const result = runCall({
      transcript: transcriptFor('T11').body,
      firstReading: readingFor('T11'),
      secondReading: answered('T11', 'timeline', 'pass', answer),
      secondTranscript: withAnswer('T11', answer),
      settings,
    });
    expect(result.secondDecision?.outcome).toBe('book');
    expect(result.finalDecision.outcome).toBe('book');
    expect(result.questionsAsked).toBe(1);
  });

  it('the answer only counts if it is in the transcript the model was given', () => {
    // Same reading, but the continuation is withheld. The criterion the caller
    // supposedly resolved has no evidence, so it goes back to unclear.
    const answer = 'We could start in January, so about three months';
    const result = runCall({
      transcript: transcriptFor('T11').body,
      firstReading: readingFor('T11'),
      secondReading: answered('T11', 'timeline', 'pass', answer),
      settings,
    });
    const timeline = result.finalScore.scores.find((s) => s.criterionId === 'timeline');
    expect(timeline?.result).toBe('unclear');
    expect(timeline?.downgradeReason).toBe('quote_not_found');
  });

  it('forwards as borderline when the answer leaves one thing unclear', () => {
    const answer = 'We want it finished by April';
    const result = runCall({
      transcript: transcriptFor('T13').body,
      firstReading: readingFor('T13'),
      secondReading: answered('T13', 'timeline', 'pass', answer),
      secondTranscript: withAnswer('T13', answer),
      settings,
    });
    // The decision maker was never established on T13 and stays unclear.
    expect(result.finalDecision.outcome).toBe('book');
    expect(result.finalDecision.borderline).toBe(true);
    expect(result.finalDecision.borderlineCriterionId).toBe('decision_maker');
  });

  it('declines nobody on the strength of an answer alone — a fail still reviews', () => {
    const answer = 'Honestly we need it done in two weeks';
    const result = runCall({
      transcript: transcriptFor('T11').body,
      firstReading: readingFor('T11'),
      secondReading: answered('T11', 'timeline', 'fail', answer),
      secondTranscript: withAnswer('T11', answer),
      settings,
    });
    expect(result.finalDecision.outcome).toBe('review');
    expect(result.finalDecision.reachesDesignerDirectly).toBe(false);
  });

  it('never asks a second question, even when the answer resolves nothing', () => {
    const answer = 'I am not sure what the area is called exactly';
    const result = runCall({
      transcript: transcriptFor('T10').body,
      firstReading: readingFor('T10'),
      secondReading: answered('T10', 'service_area', 'unclear'),
      secondTranscript: withAnswer('T10', answer),
      settings,
    });
    expect(result.secondDecision?.outcome).not.toBe('ask_one');
    expect(result.questionsAsked).toBe(1);
  });

  it('does not ask at all when the first decision is clear', () => {
    const result = runCall({
      transcript: transcriptFor('T01').body,
      firstReading: readingFor('T01'),
      settings,
    });
    expect(result.questionsAsked).toBe(0);
    expect(result.questionCriterionId).toBeNull();
    expect(result.secondDecision).toBeNull();
  });

  it('ignores a second reading that was never asked for', () => {
    const result = runCall({
      transcript: transcriptFor('T01').body,
      firstReading: readingFor('T01'),
      secondReading: answered('T01', 'timeline', 'fail', 'done by March'),
      settings,
    });
    expect(result.finalDecision.outcome).toBe('book');
    expect(result.secondScore).toBeNull();
  });

  it('the caller not answering leaves the first decision standing', () => {
    for (const id of ['T10', 'T11', 'T13', 'T14', 'T18']) {
      const result = runCall({
        transcript: transcriptFor(id).body,
        firstReading: readingFor(id),
        settings,
      });
      expect(result.finalDecision.outcome, id).toBe('ask_one');
    }
  });
});

describe('priority orders the queue and never gates it', () => {
  const scores = (results: Partial<Record<string, CriterionResult>>): readonly CriterionScore[] =>
    CRITERIA.map((c) => ({
      criterionId: c.id,
      evidenceQuote: 'q',
      reasoning: 'r',
      result: results[c.id] ?? 'pass',
      downgradedForBadEvidence: false,
      downgradeReason: null,
    }));

  const base = {
    scores: scores({}),
    scopeClass: 'full_home' as ScopeClass,
    areaSqft: 1400,
    borderline: false,
    qualifiedByFrontDesk: false,
  };

  it('a large full home with the owner on the call ranks high', () => {
    const p = prioritise({ ...base, areaSqft: 2400 });
    expect(p.band).toBe('high');
    // And "high" is actually reachable, which it was not with fixed bands.
    expect(p.score).toBe(maxAchievableScore());
  });

  it('the borderline penalty does not charge twice for one missing sentence', () => {
    const dmUnclear = scores({ decision_maker: 'unclear' });
    const sameFact = prioritise({
      ...base,
      scores: dmUnclear,
      borderline: true,
      borderlineCriterionId: 'decision_maker',
    });
    const differentFact = prioritise({
      ...base,
      scores: dmUnclear,
      borderline: true,
      borderlineCriterionId: 'timeline',
    });
    expect(sameFact.components.some((c) => c.name === 'borderline')).toBe(false);
    expect(differentFact.components.some((c) => c.name === 'borderline')).toBe(true);
    expect(sameFact.score).toBeGreaterThan(differentFact.score);
  });

  it('a borderline lead on a different criterion ranks lower than a clean one', () => {
    const clean = prioritise(base).score;
    const flagged = prioritise({ ...base, borderline: true, borderlineCriterionId: 'timeline' }).score;
    expect(flagged).toBeLessThan(clean);
  });

  it('but a borderline lead still has a priority at all — it is never held back', () => {
    const p = prioritise({
      ...base,
      borderline: true,
      borderlineCriterionId: 'timeline',
      scopeClass: 'single_room',
      areaSqft: null,
    });
    expect(['high', 'medium', 'low']).toContain(p.band);
  });

  it('a missing decision maker costs points but does not zero the lead', () => {
    const withDm = prioritise(base).score;
    const without = prioritise({ ...base, scores: scores({ decision_maker: 'unclear' }) }).score;
    expect(without).toBeLessThan(withDm);
    expect(without).toBeGreaterThan(0);
  });

  it('a front-desk-qualified lead is not penalised, per D3 as proposed', () => {
    expect(PRIORITY_WEIGHTS.frontDeskQualifiedPenalty).toBe(0);
    expect(prioritise({ ...base, qualifiedByFrontDesk: true }).score).toBe(prioritise(base).score);
  });

  it('every component explains itself, so a queue position is never a mystery', () => {
    const p = prioritise({ ...base, borderline: true, borderlineCriterionId: 'timeline' });
    expect(p.components.length).toBeGreaterThan(1);
    for (const c of p.components) {
      expect(c.name).toBeTruthy();
      expect(c.why.length).toBeGreaterThan(5);
    }
  });

  it('declares the two inputs the brief asks for and we cannot supply', () => {
    const p = prioritise(base);
    expect(p.unavailableInputs.join(' ')).toContain('timeline urgency');
    expect(p.unavailableInputs.join(' ')).toContain('source');
    // Both weights exist in config and are deliberately unused until D31.
    expect(PRIORITY_WEIGHTS.timelineUrgency).toBeGreaterThan(0);
    expect(PRIORITY_WEIGHTS.warmSource).toBeGreaterThan(0);
    for (const c of p.components) {
      expect(c.name).not.toContain('urgency');
      expect(c.name).not.toContain('source');
    }
  });

  it('ranks the September bookings in a defensible order', () => {
    const booked = ['T01', 'T02', 'T05', 'T06', 'T12', 'T15', 'T17', 'T20'].map((id) => {
      const r = runCall({
        transcript: transcriptFor(id).body,
        firstReading: readingFor(id),
        settings,
      });
      return { id, outcome: r.finalDecision.outcome, score: r.priority.score };
    });

    for (const b of booked) expect(b.outcome, b.id).toBe('book');

    // The 5,500 sq ft villa and the 2,400 sq ft Koregaon Park flat must not
    // rank below the 875 sq ft Undri flat on the strength of one unsaid
    // sentence about who decides.
    const by = (id: string): number => booked.find((b) => b.id === id)?.score ?? -1;
    expect(by('T12')).toBeGreaterThanOrEqual(by('T15'));
    expect(by('T05')).toBeGreaterThanOrEqual(by('T15'));
  });
});
