import { NextResponse } from 'next/server';

/**
 * Webhook endpoints — deliberately NOT implemented.
 *
 * These exist because Vaani, Telegram, Google Calendar and HubSpot all need a
 * URL to call, and the URLs have to be stable before Phase 7 configures them.
 *
 * They return 501 and they read NOTHING. That is the point. An endpoint that
 * accepted and stored a payload before signature verification exists would be
 * an unauthenticated write to a public URL on a public repository, and a call
 * transcript is the most sensitive thing this system handles. So the body is
 * never parsed, never logged, never persisted.
 *
 * Phase 5 implements the voice webhook behind signature verification; Phase 7
 * the rest.
 */

const KNOWN_CHANNELS = new Set(['voice', 'telegram', 'calendar', 'hubspot']);

const IMPLEMENTED_IN: Record<string, string> = {
  voice: 'Phase 5 — the Vaani call flow, behind signed-webhook verification',
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
        'read, parsed, logged or stored until signature verification is built.',
      implementedIn: IMPLEMENTED_IN[channel],
    },
    { status: 501, headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ channel: string }> },
): Promise<NextResponse> {
  const { channel } = await context.params;
  if (!KNOWN_CHANNELS.has(channel)) {
    return NextResponse.json({ error: 'unknown_channel', channel }, { status: 404 });
  }
  // The request body is never touched.
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
  return notImplemented(channel);
}
