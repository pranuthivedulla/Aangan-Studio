/**
 * Vaani's webhook events, parsed defensively.
 *
 * Their spec is unusually candid about the payload, and the warning is worth
 * quoting because it shapes this whole file:
 *
 *   "Event-specific payload. Phone numbers are masked. Defensive-parse — no
 *    sub-field is guaranteed."
 *
 * So: every field inside `data` is optional, nothing is trusted, and the
 * envelope is validated separately from the contents. A payload we cannot
 * read is a lead we must not drop — it goes to a human, not to an exception.
 *
 * THE PHONE NUMBER PROBLEM. Phone is our unique client key (brief §7, D16):
 * it is how a repeat caller is recognised and how we avoid two records for
 * one person (acceptance test T09). Vaani masks it. Until we know what the
 * mask looks like and whether an unmasked number is available another way,
 * repeat-caller detection cannot work from the webhook alone. Recorded as
 * D36 rather than papered over.
 *
 * Delivery characteristics from the same spec, which the receiver must cope
 * with: "a scheduler drains the queue ~once/minute", "exponential backoff up
 * to 8 attempts (~256 min), each attempt timing out after 10s", and
 * "After 5 consecutive failures the webhook is auto-disabled". That last one
 * is why the route acknowledges fast and does the work after: a slow handler
 * does not just delay a lead, it eventually switches the integration off.
 */

import { z } from 'zod';

/** Exactly the enum in their spec, plus the test-only ping. */
export const VAANI_EVENT_TYPES = [
  'call.completed',
  'call.failed',
  'meeting.ended',
  'lead.created',
  'usage.charged',
  'low_balance.warned',
  'webhook.ping',
] as const;

export type VaaniEventType = (typeof VAANI_EVENT_TYPES)[number];

/**
 * The envelope. These three fields are the only things the spec guarantees,
 * so they are the only things required.
 */
export const VaaniEventSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.string().min(1),
    created: z.number().int().nonnegative().optional(),
    data: z.record(z.unknown()).default({}),
  })
  .passthrough();

export type VaaniEvent = z.infer<typeof VaaniEventSchema>;

export type ParsedEvent =
  | { ok: true; event: VaaniEvent; known: boolean }
  | { ok: false; reason: string };

export function parseVaaniEvent(rawBody: string): ParsedEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'body is not valid JSON' };
  }
  const result = VaaniEventSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, reason: first ? `${first.path.join('.')}: ${first.message}` : 'bad envelope' };
  }
  // An unrecognised type is acknowledged, not rejected: they add events, and
  // a 4xx on a type we have not met yet counts toward the five consecutive
  // failures that auto-disable the subscription.
  const known = (VAANI_EVENT_TYPES as readonly string[]).includes(result.data.type);
  return { ok: true, event: result.data, known };
}

/**
 * Pull a transcript out of a `call.completed` payload.
 *
 * The field name is a guess until we see a real event — the spec documents no
 * sub-fields. Several plausible names are tried, and the result says plainly
 * when none matched, so a missing transcript routes the lead to a human
 * instead of silently producing an empty call.
 */
export function extractTranscript(event: VaaniEvent): string | null {
  const candidates = ['transcript', 'full_transcript', 'text', 'conversation'];
  for (const key of candidates) {
    const value = event.data[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

/** The call id, under whichever key it turns up. Needed for idempotency. */
export function extractCallId(event: VaaniEvent): string | null {
  for (const key of ['call_id', 'callId', 'id', 'session_id']) {
    const value = event.data[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return typeof event.id === 'string' ? event.id : null;
}
