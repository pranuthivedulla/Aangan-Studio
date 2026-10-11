import { NextResponse } from 'next/server';
import { SIGNATURE_HEADER, verifySignature } from '@/vaani/signature';
import { parseVaaniEvent } from '@/vaani/events';
import { log } from '@/logging';

/**
 * Webhook endpoints.
 *
 * `voice` is real as far as it can be: it verifies Vaani's signature over the
 * raw body before touching the contents, parses the envelope defensively, and
 * acknowledges. It does NOT yet run the pipeline — that is Phase 7, once
 * credentials exist and the payload shape has been seen.
 *
 * The other three exist so their URLs are stable before Phase 7 configures
 * them, and they read nothing at all. An endpoint that parsed a payload
 * before signature verification existed would be an unauthenticated write to
 * a public URL, and a call transcript is the most sensitive thing here.
 *
 * Status codes are chosen against Vaani's retry behaviour, which their spec
 * describes: retries with exponential backoff up to 8 attempts, and
 * "After 5 consecutive failures the webhook is auto-disabled". So:
 *   - a bad signature is 401 and is MEANT to fail;
 *   - an event we do not handle yet is 200, because refusing it would count
 *     toward the five failures and switch the integration off;
 *   - we never hold the connection open doing work.
 */

const KNOWN_CHANNELS = new Set(['voice', 'telegram', 'calendar', 'hubspot']);

const IMPLEMENTED_IN: Record<string, string> = {
  voice: 'Phase 7 — the pipeline runs on call.completed once credentials exist',
  telegram: 'Phase 7 — designer binding and alert delivery',
  calendar: 'Phase 7 — booking change notifications',
  hubspot: 'Phase 7 — designer edits flowing back, or polling if webhooks need a paid tier',
};

function notImplemented(channel: string): NextResponse {
  return NextResponse.json(
    {
      error: 'not_implemented',
      channel,
      message:
        'This endpoint exists so the URL is stable, and refuses on purpose. No payload is ' +
        'read, parsed, logged or stored.',
      implementedIn: IMPLEMENTED_IN[channel],
    },
    { status: 501, headers: { 'cache-control': 'no-store' } },
  );
}

async function handleVoice(request: Request): Promise<NextResponse> {
  // Raw bytes, before any parsing: the signature covers the body exactly as
  // sent, and re-serialising JSON would break it.
  const rawBody = await request.text();
  const verdict = verifySignature(
    rawBody,
    request.headers.get(SIGNATURE_HEADER),
    process.env['VAANI_WEBHOOK_SECRET'],
  );

  if (!verdict.ok) {
    // The reason is logged, never the body — an unverified body is an
    // untrusted body and must not reach a log.
    log('warn', 'vaani.webhook.rejected', { reason: verdict.reason });
    return NextResponse.json(
      { error: 'signature_verification_failed', reason: verdict.reason },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  const parsed = parseVaaniEvent(rawBody);
  if (!parsed.ok) {
    log('warn', 'vaani.webhook.unparseable', { reason: parsed.reason });
    // Signed but unreadable. Acknowledge so the subscription is not disabled,
    // and say plainly that it needs a human; retrying will not fix a payload
    // we cannot read.
    return NextResponse.json(
      { accepted: true, handled: false, reason: parsed.reason, needsHuman: true },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }

  log('info', 'vaani.webhook.received', { type: parsed.event.type, known: parsed.known });

  return NextResponse.json(
    {
      accepted: true,
      type: parsed.event.type,
      known: parsed.known,
      handled: false,
      message:
        'Signature verified and envelope parsed. The pipeline does not run on this event ' +
        'yet — see OPEN_DECISIONS D27 and D36.',
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ channel: string }> },
): Promise<NextResponse> {
  const { channel } = await context.params;
  if (!KNOWN_CHANNELS.has(channel)) {
    return NextResponse.json({ error: 'unknown_channel', channel }, { status: 404 });
  }
  if (channel === 'voice') return handleVoice(request);
  return notImplemented(channel);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ channel: string }> },
): Promise<NextResponse> {
  const { channel } = await context.params;
  if (!KNOWN_CHANNELS.has(channel)) {
    return NextResponse.json({ error: 'unknown_channel', channel }, { status: 404 });
  }
  // GET never carries an event, so it stays a plain refusal on every channel.
  return notImplemented(channel);
}
