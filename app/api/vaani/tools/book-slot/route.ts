import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { bookSlotForCall } from '@/vaani/book-tool';
import { buildAdapters } from '@/adapters';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { containsNoPriceFigure } from '@config/price-language';
import { log } from '@/logging';

/**
 * The booking tool Vaani calls once the caller has chosen a time.
 *
 * The failure mode that matters is a caller who believes they are booked and
 * is not. So this endpoint never claims success it did not get: a thrown
 * error, an unreadable body or a lost slot all end with a person, and only a
 * real calendar event produces "that is booked".
 */

export const dynamic = 'force-dynamic';

const SECRET_HEADER = 'x-aangan-tool-secret';

const RequestSchema = z
  .object({
    call_id: z.string().min(1),
    /** ISO start time, exactly as offer_slots returned it. */
    starts_at: z.string().min(1),
    designer_id: z.string().min(1),
    caller_name: z.string().nullable().default(null),
    caller_email: z.string().nullable().default(null),
  })
  .passthrough();

function secretOk(given: string | null): boolean {
  const expected = process.env['VAANI_TOOL_SECRET'];
  if (!expected || !given) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function handOver(reason: string, callId: string | null): NextResponse {
  log('warn', 'vaani.book.handover', { reason });
  return NextResponse.json(
    {
      say: 'Let me take your details and someone from the studio will confirm the appointment with you shortly.',
      next_action: 'take_details',
      booked: false,
      event_id: null,
      written_confirmation: false,
      reference: callId,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!secretOk(request.headers.get(SECRET_HEADER))) {
    log('warn', 'vaani.book.unauthorised', {});
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return handOver('body was not JSON', null);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return handOver(`invalid request: ${first ? first.path.join('.') : 'unknown field'}`, null);
  }

  if (Number.isNaN(new Date(parsed.data.starts_at).getTime())) {
    return handOver('starts_at was not a usable time', parsed.data.call_id);
  }

  try {
    const result = await bookSlotForCall({
      callId: parsed.data.call_id,
      startsAt: parsed.data.starts_at,
      designerId: parsed.data.designer_id,
      callerName: parsed.data.caller_name,
      callerEmail: parsed.data.caller_email,
      now: new Date().toISOString(),
      settings: DEFAULT_SETTINGS,
      adapters: buildAdapters(),
    });

    const verdict = containsNoPriceFigure(result.say);
    if (!verdict.ok) return handOver('spoken line failed the price guard', parsed.data.call_id);

    log('info', 'vaani.book.result', {
      booked: result.booked,
      writtenConfirmation: result.written_confirmation,
      next: result.next_action,
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch {
    // An unknown designer id, an adapter failure, anything: never tell a
    // caller they are booked when we do not know that they are.
    return handOver('booking threw', parsed.data.call_id);
  }
}

export function GET(): NextResponse {
  return NextResponse.json(
    { tool: 'book_slot', method: 'POST', authentication: `header ${SECRET_HEADER}` },
    { status: 405, headers: { 'cache-control': 'no-store' } },
  );
}
