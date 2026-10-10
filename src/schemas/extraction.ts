/**
 * The contract with Gemini Flash (brief §5.1).
 *
 * Two rules this file exists to enforce:
 *
 *   1. The model NEVER emits an outcome. It emits fields, evidence, reasoning
 *      and a per-criterion result. `decideOutcome` is TypeScript (Phase 2).
 *   2. `evidence_quote` must be a literal substring of the transcript. A quote
 *      that is not present downgrades that criterion to `unclear` — it does not
 *      fail the call, and it does not get trusted (acceptance test T04).
 *
 * Key order in the schema matters: evidence and reasoning come before `result`,
 * so the model reasons before it answers.
 */

import { z } from 'zod';
import type { CriterionScore } from '@/types';

export const ExtractedFieldsSchema = z
  .object({
    space_type: z.string().nullable(),
    area_sqft: z.number().nullable(),
    scope: z.string().nullable(),
    timeline: z.string().nullable(),
    decision_maker: z.string().nullable(),
    location: z.string().nullable(),
    budget_mentioned: z.number().nullable(),
    language: z.string().nullable(),
  })
  .strict();

export const CriterionJudgementSchema = z
  .object({
    id: z.string().min(1),
    evidence_quote: z.string().nullable(),
    reasoning: z.string().max(400),
    result: z.enum(['pass', 'unclear', 'fail']),
  })
  .strict();

export const ExtractionSchema = z
  .object({
    fields: ExtractedFieldsSchema,
    criteria: z.array(CriterionJudgementSchema).min(1),
    scope_class: z.enum([
      'full_home',
      'single_room',
      'narrow_scope',
      'commercial',
      'out_of_service',
      'unclear',
    ]),
    intent: z.enum(['new_enquiry', 'existing_client', 'complaint', 'other']),
    price_asked: z.boolean(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type Extraction = z.infer<typeof ExtractionSchema>;
export type CriterionJudgement = z.infer<typeof CriterionJudgementSchema>;

/**
 * Normalise for substring comparison. The transcripts are PDF-extracted, so
 * whitespace and dash characters vary; a quote that differs only in those
 * should still count. Anything beyond that — different words, invented
 * numbers — must not.
 */
function normaliseForQuoteMatch(s: string): string {
  return s
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function quoteIsPresent(quote: string, transcript: string): boolean {
  const q = normaliseForQuoteMatch(quote);
  if (q.length === 0) return false;
  return normaliseForQuoteMatch(transcript).includes(q);
}

/**
 * Turn validated model output into stored scores, downgrading any criterion
 * whose quote is not in the transcript.
 *
 * A `fail` with fabricated evidence is downgraded too. That is deliberate: a
 * fail is an adverse decision about a caller, and it must rest on something
 * the caller actually said.
 */
export function verifyEvidence(
  extraction: Extraction,
  transcript: string,
): readonly CriterionScore[] {
  return extraction.criteria.map((c) => {
    const hasQuote = c.evidence_quote !== null && c.evidence_quote.trim() !== '';
    const quoteOk = hasQuote && quoteIsPresent(c.evidence_quote as string, transcript);

    if (hasQuote && !quoteOk) {
      return {
        criterionId: c.id,
        evidenceQuote: null,
        reasoning: c.reasoning,
        result: 'unclear',
        downgradedForBadEvidence: true,
      };
    }

    // No quote at all: a pass or a fail without evidence is not evidence-first,
    // so it cannot stand. `unclear` is the honest result.
    if (!hasQuote && c.result !== 'unclear') {
      return {
        criterionId: c.id,
        evidenceQuote: null,
        reasoning: c.reasoning,
        result: 'unclear',
        downgradedForBadEvidence: true,
      };
    }

    return {
      criterionId: c.id,
      evidenceQuote: hasQuote ? (c.evidence_quote as string) : null,
      reasoning: c.reasoning,
      result: c.result,
      downgradedForBadEvidence: false,
    };
  });
}

export type ParseResult =
  | { ok: true; extraction: Extraction }
  | { ok: false; reason: string };

/** Parse raw model text. Never throws; the caller retries once then reviews. */
export function parseExtraction(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    // Models fence JSON in ```json blocks often enough to be worth one pass.
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
    if (!fenced?.[1]) return { ok: false, reason: 'not valid JSON' };
    try {
      json = JSON.parse(fenced[1]);
    } catch {
      return { ok: false, reason: 'not valid JSON' };
    }
  }

  const result = ExtractionSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      reason: first ? `${first.path.join('.')}: ${first.message}` : 'schema mismatch',
    };
  }
  return { ok: true, extraction: result.data };
}
