import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { offerSlotsForCall } from '@/vaani/slots-tool';
import { buildAdapters } from '@/adapters';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { containsNoPriceFigure } from '@config/price-language';
import { log } from '@/logging';

/**
 * The slot tool Vaani calls once qualification says `offer_slots`.
 *
 * Nothing is held. The slots are read from the diary and spoken; the booking
 * tool re-checks availability before it writes anything, because a caller
 * thinking out loud for twenty seconds must not block a designer's afternoon.
 */

export const dynamic = 'force-dynamic';

const SECRET_HEADER = 'x-aangan-tool-secret';

const RequestSchema = z
  .object({
    call_id: z.string().min(1),
    /** Testing hook only: pin the clock. Ignored unless explicitly allowed. */
    now: z.string().datetime().optional(),
  })
  .passthrough();

function secretOk(given: string | null): boolean {
  const expected = process.env['VAANI_TOOL_SECRET'];
  if (!expected || !given) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whenever we cannot offer a time, a person does. Never a dead end (T11). */
function handOver(reason: string, callId: string | null): NextResponse {
  log('warn', 'vaani.slots.handover', { reason });
  return NextResponse.json(
    {
      say: 'Let me take your details and someone from the studio will call you back today to fix a time.',
      next_action: 'take_details',
      slots: [],
      designer_id: null,
      reference: callId,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!secretOk(request.headers.get(SECRET_HEADER))) {
    log('warn', 'vaani.slots.unauthorised', {});
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return handOver('body was not JSON', null);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return handOver('invalid request', null);

  try {
    const result = await offerSlotsForCall({
      callId: parsed.data.call_id,
      now: new Date().toISOString(),
      settings: DEFAULT_SETTINGS,
      adapters: buildAdapters(),
    });

    // Times carry digits; prices must not. The guard allows a date and
    // refuses a rate, so it still runs on everything the caller hears.
    const verdict = containsNoPriceFigure(result.say);
    if (!verdict.ok) return handOver(`spoken line failed the price guard: ${verdict.reason}`, parsed.data.call_id);

    log('info', 'vaani.slots.offered', {
      count: result.slots.length,
      next: result.next_action,
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return handOver('slot lookup threw', parsed.data.call_id);
  }
}

export function GET(): NextResponse {
  return NextResponse.json(
    { tool: 'offer_slots', method: 'POST', authentication: `header ${SECRET_HEADER}` },
    { status: 405, headers: { 'cache-control': 'no-store' } },
  );
}
