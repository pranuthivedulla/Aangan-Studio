/**
 * The contract between Vaani's custom tool and our engine (map boxes 9-12).
 *
 * Vaani's "Create Custom Tool" form turns out to do exactly what box 12
 * needs: an API Endpoint we host, Parameters "the agent needs to extract from
 * user conversations before invoking this tool", and "Store Fields as
 * Variables" which maps our JSON response onto variables the agent can speak.
 * So the agent asks us mid-call and reads our answer back.
 *
 * WHAT THIS CHANGES, AND THE ONE THING IT COSTS.
 *
 * Our anti-fabrication rule is that every criterion judgement must carry a
 * verbatim quote from the caller, checked as a real substring and checked to
 * be the CALLER speaking. A tool call gives us extracted values, not a
 * transcript — "timeline: March" with nothing to verify it against.
 *
 * So the contract asks for both: the value AND the caller's words. The agent
 * is told to pass what the caller actually said. That is weaker than checking
 * against a transcript we hold, because we are trusting Vaani's model to
 * quote honestly rather than proving it — so the quotes are re-verified after
 * the call, when `call.completed` delivers the real transcript, and a
 * judgement whose quote turns out to be absent downgrades then. In-call we
 * are fast and provisional; post-call we are strict.
 */

import { z } from 'zod';
import { MODEL_SCOPE_CLASSES } from '@/schemas/extraction';

/** A value the agent extracted, with the caller's own words behind it. */
const Observed = z
  .object({
    value: z.string().min(1).nullable().default(null),
    /** What the caller actually said. Re-verified post-call. */
    quote: z.string().nullable().default(null),
  })
  .strict();

/**
 * What the agent sends us. Everything is optional because a caller answers
 * in whatever order they like and the agent may call this mid-way through.
 */
export const ToolRequestSchema = z
  .object({
    call_id: z.string().min(1),
    /** Masked or not; never used as the client key without D36 resolved. */
    caller_id: z.string().nullable().default(null),
    space_type: Observed.default({ value: null, quote: null }),
    area_sqft: Observed.default({ value: null, quote: null }),
    scope: Observed.default({ value: null, quote: null }),
    timeline: Observed.default({ value: null, quote: null }),
    decision_maker: Observed.default({ value: null, quote: null }),
    location: Observed.default({ value: null, quote: null }),
    budget_mentioned: Observed.default({ value: null, quote: null }),
    /**
     * What kind of job this is, in the agent's words.
     *
     * A classification, not a criterion, so it carries no quote — the same
     * division of labour the batch path uses, where the model classifies and
     * the code decides what to do about it. Leaving this out was a real bug:
     * without it every call fell to "unclear scope" and went to the front
     * desk, however complete the answers were.
     */
    scope_class: z.enum(MODEL_SCOPE_CLASSES).default('unclear'),
    /** True once the caller has asked about price, at any point. */
    price_asked: z.boolean().default(false),
    /** How many clarifying questions the agent has already asked. */
    questions_asked: z.number().int().min(0).default(0),
    language: z.string().nullable().default(null),
  })
  .strict();

export type ToolRequest = z.infer<typeof ToolRequestSchema>;

/** The observation fields, used by the flattener below. */
export const OBSERVED_FIELDS = [
  'space_type',
  'area_sqft',
  'scope',
  'timeline',
  'decision_maker',
  'location',
  'budget_mentioned',
] as const;

/**
 * Accept flat parameters as well as nested ones.
 *
 * Vaani's "Add parameter" defines a flat list, so the agent will more
 * naturally send `timeline` and `timeline_quote` than a nested object. Rather
 * than force their form into a shape it may not support, fold the flat pairs
 * into the nested shape the engine reads. A body that already uses nested
 * objects passes through untouched, so either works and neither is a special
 * case anyone has to remember.
 */
export function normaliseToolBody(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const input = { ...(body as Record<string, unknown>) };

  for (const field of OBSERVED_FIELDS) {
    const quoteKey = `${field}_quote`;
    const raw = input[field];
    const hasFlatQuote = quoteKey in input;
    const isNested = typeof raw === 'object' && raw !== null;

    if (isNested && !hasFlatQuote) continue;

    if (raw !== undefined || hasFlatQuote) {
      input[field] = {
        value: typeof raw === 'string' || typeof raw === 'number' ? String(raw) : isNested ? ((raw as Record<string, unknown>)['value'] ?? null) : null,
        quote: typeof input[quoteKey] === 'string' ? input[quoteKey] : null,
      };
    }
    delete input[quoteKey];
  }
  return input;
}

/**
 * What we send back.
 *
 * `say` is the only field the caller ever hears, and it is checked for price
 * language before it leaves. Everything else is for the agent's own routing,
 * mapped through "Store Fields as Variables".
 */
export interface ToolResponse {
  /** Speak this. Guaranteed free of price figures. */
  readonly say: string;
  /** book | ask_one | decline | review | park | complaint */
  readonly outcome: string;
  /** What the agent should do next, in its own vocabulary. */
  readonly next_action: 'offer_slots' | 'ask_question' | 'close_politely' | 'take_details';
  /** Present only when next_action is ask_question. */
  readonly question: string | null;
  /** True when the lead is forwarded with something unconfirmed. */
  readonly borderline: boolean;
  /** Our own reference, for correlating with the post-call webhook. */
  readonly reference: string;
}
