/**
 * The contract with Gemini Flash (brief §5.1).
 *
 * Three rules this file exists to enforce:
 *
 *   1. The model NEVER emits an outcome. It emits fields, evidence, reasoning
 *      and a per-criterion result. `decideOutcome` is TypeScript (Phase 2).
 *   2. `evidence_quote` must be a literal substring of the transcript, AND it
 *      must be something the CALLER said. A quote that is not present, or that
 *      turns out to be the studio's own words, downgrades that criterion to
 *      `unclear` (acceptance test T04).
 *   3. The criteria set must be exactly the configured criteria — no duplicates,
 *      no unknown ids, none missing.
 *
 * Key order in the schema matters: evidence and reasoning come before `result`,
 * so the model reasons before it answers.
 */

import { z } from 'zod';
import type { CriterionScore } from '@/types';
import { CRITERIA } from '@config/criteria';

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

/**
 * Scope classes the MODEL may emit.
 *
 * Deviation from brief §5.1, declared: the brief's list omits `partial` and
 * `advice_only`, but five of the twenty September fixtures are partial-home
 * projects and the ruling of 10 Oct 2026 (D26) declines advice-only enquiries
 * as out-of-service. Without these two words in the model's vocabulary, that
 * ruling is unimplementable and those five fixtures unreachable. Both are
 * things plainly observable in a transcript, so the model is the right place
 * for them.
 *
 * `commercial_below_min` is deliberately NOT here. It is derived in code from
 * area against a minimum that no context file states (D2), so until Nikhil sets
 * one it is unreachable by design, not by accident.
 */
export const MODEL_SCOPE_CLASSES = [
  'full_home',
  'partial',
  'single_room',
  'narrow_scope',
  'commercial',
  'advice_only',
  'out_of_service',
  'unclear',
] as const;

/**
 * Intents the MODEL may emit.
 *
 * Also wider than brief §5.1, for the same reason: `service_failure` (a caller
 * whose earlier enquiry was never answered — T16, W08) and `price_enquiry` (a
 * caller who leads with price and offers nothing else — W02, F04, F07) are both
 * visible in the transcript, and D22 and finding F2 both depend on them.
 */
export const MODEL_INTENTS = [
  'new_enquiry',
  'existing_client',
  'complaint',
  'service_failure',
  'price_enquiry',
  'other',
] as const;

export const ExtractionSchema = z
  .object({
    fields: ExtractedFieldsSchema,
    criteria: z.array(CriterionJudgementSchema).min(1),
    scope_class: z.enum(MODEL_SCOPE_CLASSES),
    intent: z.enum(MODEL_INTENTS),
    price_asked: z.boolean(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type Extraction = z.infer<typeof ExtractionSchema>;
export type CriterionJudgement = z.infer<typeof CriterionJudgementSchema>;

// ---------------------------------------------------------------------------
// Quote matching
// ---------------------------------------------------------------------------

/**
 * Normalise for substring comparison.
 *
 * Dash handling is the subtle part. The transcripts use em dashes; a model
 * transcribing one may write "--", and the earlier cp1252 extraction of the
 * same PDF rendered them that way too. Collapsing any RUN of dashes to a
 * single hyphen means the same sentence matches however it was punctuated.
 * Before this, a legitimate quote written with "--" was silently rejected and
 * the criterion downgraded to unclear — a false negative on the one mechanism
 * the whole design rests on.
 */
function normaliseForQuoteMatch(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[-‐-―]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function quoteIsPresent(quote: string, transcript: string): boolean {
  const q = normaliseForQuoteMatch(quote);
  if (q.length === 0) return false;
  return normaliseForQuoteMatch(transcript).includes(q);
}

// ---------------------------------------------------------------------------
// Who said it
// ---------------------------------------------------------------------------

export type Speaker = 'caller' | 'studio' | 'meta';

export interface SpeakerTurn {
  readonly speaker: Speaker;
  readonly text: string;
}

const CALLER_LABELS = /^(caller|customer|client)\s*:/i;
const STUDIO_LABELS = /^(front desk|agent|assistant|receptionist|studio|aangan)\s*:/i;
const META_LABELS = /^(note|status|first call|second call|missed call)\b/i;

/**
 * Split a transcript into turns by speaker label. A line with no label belongs
 * to the turn above it, which is how wrapped lines stay with their speaker.
 * Anything before the first label is `meta` — headers, timestamps, notes.
 */
export function splitSpeakerTurns(transcript: string): readonly SpeakerTurn[] {
  const turns: { speaker: Speaker; lines: string[] }[] = [];
  let current: { speaker: Speaker; lines: string[] } | null = null;

  for (const rawLine of transcript.split(/\r?\n/)) {
    const line = rawLine.replace(/^[\f\u000b\s]+/, '');
    if (line === '') continue;

    let speaker: Speaker | null = null;
    if (CALLER_LABELS.test(line)) speaker = 'caller';
    else if (STUDIO_LABELS.test(line)) speaker = 'studio';
    else if (META_LABELS.test(line)) speaker = 'meta';

    if (speaker !== null) {
      current = { speaker, lines: [line.replace(/^[^:]*:\s*/, '')] };
      turns.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else {
      current = { speaker: 'meta', lines: [line] };
      turns.push(current);
    }
  }

  return turns.map((t) => ({ speaker: t.speaker, text: t.lines.join(' ') }));
}

/**
 * Is this quote something the caller actually said?
 *
 * The five criteria are all about what the CALLER wants. A judgement backed by
 * the studio's own words is fabricated reasoning that happens to survive a
 * substring check — and on a live call, where the agent is one of the two
 * speakers, it is the agent quoting itself as proof.
 *
 * A quote is caller speech if it appears inside a single caller turn. Spanning
 * two turns means it crosses a speaker boundary, so it is not one person's
 * words and does not count.
 */
export function quoteIsCallerSpeech(quote: string, transcript: string): boolean {
  const q = normaliseForQuoteMatch(quote);
  if (q.length === 0) return false;
  return splitSpeakerTurns(transcript)
    .filter((t) => t.speaker === 'caller')
    .some((t) => normaliseForQuoteMatch(t.text).includes(q));
}

/**
 * True when the transcript has no speaker labels at all — a web form, a note,
 * or T08's missed call. Attribution is then meaningless rather than failed, so
 * presence in the transcript is the most that can be asked.
 */
export function transcriptHasSpeakers(transcript: string): boolean {
  return splitSpeakerTurns(transcript).some((t) => t.speaker !== 'meta');
}

// ---------------------------------------------------------------------------
// Evidence verification
// ---------------------------------------------------------------------------

export type DowngradeReason =
  | 'quote_not_found'
  | 'quote_not_caller_speech'
  | 'no_quote_for_decided_result';

/**
 * Turn validated model output into stored scores, downgrading any criterion
 * whose evidence does not hold up.
 *
 * A `fail` is downgraded too. That is deliberate: a fail is an adverse decision
 * about a caller, and it must rest on something the caller actually said.
 */
export function verifyEvidence(
  extraction: Extraction,
  transcript: string,
): readonly CriterionScore[] {
  const attributable = transcriptHasSpeakers(transcript);

  return extraction.criteria.map((c): CriterionScore => {
    const hasQuote = c.evidence_quote !== null && c.evidence_quote.trim() !== '';

    const downgrade = (reason: DowngradeReason): CriterionScore => ({
      criterionId: c.id,
      evidenceQuote: null,
      reasoning: c.reasoning,
      result: 'unclear',
      downgradedForBadEvidence: true,
      downgradeReason: reason,
    });

    if (!hasQuote) {
      // An honest "unclear, nothing was said about this" needs no quote.
      if (c.result === 'unclear') {
        return {
          criterionId: c.id,
          evidenceQuote: null,
          reasoning: c.reasoning,
          result: 'unclear',
          downgradedForBadEvidence: false,
          downgradeReason: null,
        };
      }
      return downgrade('no_quote_for_decided_result');
    }

    const quote = c.evidence_quote as string;
    if (!quoteIsPresent(quote, transcript)) return downgrade('quote_not_found');
    if (attributable && !quoteIsCallerSpeech(quote, transcript)) {
      return downgrade('quote_not_caller_speech');
    }

    return {
      criterionId: c.id,
      evidenceQuote: quote,
      reasoning: c.reasoning,
      result: c.result,
      downgradedForBadEvidence: false,
      downgradeReason: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; extraction: Extraction }
  | { ok: false; reason: string };

export interface ParseOptions {
  /**
   * Require exactly the configured criteria: all of them, each once, no
   * unknown ids. Default true. Only a test probing JSON shape should pass
   * false — the scoring path must never accept a partial criteria set, because
   * the gate would then be computed over whatever subset the model felt like
   * returning.
   */
  readonly requireFullCriteriaSet?: boolean;
}

/** Checks the criteria array against config/criteria.ts. */
export function validateCriteriaSet(
  extraction: Extraction,
): { ok: true } | { ok: false; reason: string } {
  const expected = CRITERIA.map((c) => c.id);
  const got = extraction.criteria.map((c) => c.id);

  const duplicates = got.filter((id, i) => got.indexOf(id) !== i);
  if (duplicates.length > 0) {
    return { ok: false, reason: `duplicate criterion ids: ${[...new Set(duplicates)].join(', ')}` };
  }
  const unknown = got.filter((id) => !expected.includes(id));
  if (unknown.length > 0) {
    return { ok: false, reason: `unknown criterion ids: ${unknown.join(', ')}` };
  }
  const missing = expected.filter((id) => !got.includes(id));
  if (missing.length > 0) {
    return { ok: false, reason: `missing criterion ids: ${missing.join(', ')}` };
  }
  return { ok: true };
}

/** Parse raw model text. Never throws; the caller retries once then reviews. */
export function parseExtraction(raw: string, opts: ParseOptions = {}): ParseResult {
  const requireFullSet = opts.requireFullCriteriaSet ?? true;

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

  if (requireFullSet) {
    const checked = validateCriteriaSet(result.data);
    if (!checked.ok) return { ok: false, reason: checked.reason };
  }

  return { ok: true, extraction: result.data };
}
