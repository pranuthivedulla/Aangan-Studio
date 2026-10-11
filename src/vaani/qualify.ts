/**
 * The mid-call qualification tool: turn what the agent has heard into a
 * decision and a sentence to say.
 *
 * This is the same engine the 20 September calls run through — `score` then
 * `decide`, unchanged. Vaani supplies the observations; our TypeScript makes
 * the call. "The AI proposes, code decides" survives the integration, which
 * is the whole reason for doing it this way rather than rebuilding the rules
 * in their flow builder.
 */

import { z } from 'zod';
import type { Settings } from '@config/settings-schema';
import type { Extraction } from '@/schemas/extraction';
import { score } from '@/pipeline/score';
import { decide } from '@/pipeline/decide';
import { criterionById } from '@config/criteria';
import { containsNoPriceFigure } from '@config/price-language';
import { PRICE_DEFLECTION } from '@config/approved-phrases';
import type { ToolRequest, ToolResponse } from './tool-contract';

/**
 * Build a transcript stand-in from the quotes the agent passed.
 *
 * The evidence verifier checks a quote is present AND spoken by the caller,
 * so the quotes are assembled into caller turns. This is provisional by
 * construction: it proves the agent gave us consistent quotes, not that the
 * caller said them. The real check happens post-call against the real
 * transcript.
 */
function provisionalTranscript(request: ToolRequest): string {
  const quotes = [
    request.space_type.quote,
    request.scope.quote,
    request.area_sqft.quote,
    request.timeline.quote,
    request.decision_maker.quote,
    request.location.quote,
    request.budget_mentioned.quote,
  ].filter((q): q is string => typeof q === 'string' && q.trim() !== '');
  return quotes.map((q) => `Caller: ${q}`).join('\n');
}

function numberOrNull(raw: string | null): number | null {
  if (raw === null) return null;
  const digits = raw.replace(/[^\d.]/g, '');
  if (digits === '') return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** Map the agent's observations onto the shape the engine already reads. */
export function toExtraction(request: ToolRequest): Extraction {
  const judge = (
    id: string,
    observed: { value: string | null; quote: string | null },
  ): Extraction['criteria'][number] => ({
    id,
    evidence_quote: observed.quote,
    reasoning: observed.value === null ? 'not established on the call yet' : `caller indicated: ${observed.value}`,
    // The agent never decides pass or fail. It reports what it heard; an
    // observation with a quote is a candidate, and `score` rules on it.
    result: observed.value === null ? 'unclear' : 'pass',
  });

  return {
    fields: {
      space_type: request.space_type.value,
      area_sqft: numberOrNull(request.area_sqft.value),
      scope: request.scope.value,
      timeline: request.timeline.value,
      decision_maker: request.decision_maker.value,
      location: request.location.value,
      budget_mentioned: numberOrNull(request.budget_mentioned.value),
      language: request.language,
    },
    criteria: [
      judge('real_project', request.scope),
      judge('service_area', request.location),
      judge('timeline', request.timeline),
      judge('budget_band', request.budget_mentioned),
      judge('decision_maker', request.decision_maker),
    ],
    scope_class: request.scope_class,
    intent: request.price_asked ? 'price_enquiry' : 'new_enquiry',
    price_asked: request.price_asked,
    confidence: 0.5,
  };
}

export class SayLeakError extends Error {
  constructor(reason: string) {
    super(`refused to return a spoken line: ${reason}`);
    this.name = 'SayLeakError';
  }
}

export function qualifyForCall(request: ToolRequest, settings: Settings): ToolResponse {
  const extraction = toExtraction(request);
  const transcript = provisionalTranscript(request);

  const scored = score(extraction, transcript);
  const decision = decide({
    score: scored,
    askedQuestionCount: request.questions_asked,
    isRepeatCaller: false,
    isExistingClient: false,
    settings,
  });

  let say: string;
  let next: ToolResponse['next_action'];
  let question: string | null = null;

  switch (decision.outcome) {
    case 'book':
      say = 'That sounds like something we can help with. Let me find you a time with one of our designers.';
      next = 'offer_slots';
      break;
    case 'ask_one': {
      const criterion = criterionById(decision.questionCriterionId ?? 'timeline');
      question = questionFor(criterion.id);
      say = question;
      next = 'ask_question';
      break;
    }
    case 'decline':
      say =
        'This sounds like it may not be the right fit for us right now — but do reach out if your timeline or scope changes.';
      next = 'close_politely';
      break;
    default:
      // review, park, complaint: a person picks it up. Never say "no" to a
      // caller the agent is not entitled to turn away.
      say = 'Thank you — let me take your details and someone from the studio will call you back.';
      next = 'take_details';
      break;
  }

  if (request.price_asked) {
    say = `${settings.APPROVED_PRICE_SENTENCE ?? PRICE_DEFLECTION} ${say}`;
  }

  // The last gate before a caller hears it.
  const verdict = containsNoPriceFigure(say);
  if (!verdict.ok) throw new SayLeakError(verdict.reason);

  return {
    say,
    outcome: decision.outcome,
    next_action: next,
    question,
    borderline: decision.borderline,
    reference: request.call_id,
  };
}

/**
 * The one question, per criterion. Nikhil's own wording where he gave it:
 * qualified.md says to ask "When would you need the project complete?".
 */
function questionFor(criterionId: string): string {
  switch (criterionId) {
    case 'timeline':
      return 'When would you need the project complete?';
    case 'service_area':
      return 'Which area is the property in?';
    case 'real_project':
      return 'Are you looking for design and execution together, or just some advice to start with?';
    default:
      return 'Could you tell me a little more about the project?';
  }
}

export const ToolRequestValidator = z.object({}).passthrough();
