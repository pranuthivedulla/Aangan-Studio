/**
 * The mid-call booking tool (map box 14: "Booked inside the call: calendar
 * event, designer and client invited").
 *
 * Three things this has to get right, in order of how badly they fail.
 *
 * THE SLOT MAY HAVE GONE. Nothing was held while the caller thought about
 * it, deliberately — holding would block a designer's afternoon for everyone
 * who hesitated. So availability is re-checked in the instant before the
 * write, and if it has gone the caller is told plainly and offered the list
 * again. A double booking is two people arriving at one designer.
 *
 * THE READ-BACK. Box 12 says "reads back", and it is not decoration: the
 * caller's last chance to catch "Tuesday" when they said "Thursday" is
 * hearing it repeated. So the confirmation names the day, the date, the time
 * and the designer.
 *
 * THE EMAIL. The brief makes the calendar invite the caller's only written
 * confirmation, which means somebody has to spell an address down a phone
 * line. That is error-prone and slow, and it is the single most likely thing
 * to go wrong in this flow. Booking therefore does NOT require it: with an
 * address the caller gets the invite, without one the booking still happens
 * and the agent says a person will confirm. Recorded as D39 rather than
 * forcing a caller to spell "dot co dot in" twice.
 */

import type { Adapters } from '@/adapters/types';
import type { Settings } from '@config/settings-schema';
import type { Slot } from '@/types';
import { bookSlot } from '@/pipeline/slots';
import { designerById } from '@config/rota';
import { speakableSlot } from './slots-tool';

export interface BookRequest {
  readonly callId: string;
  readonly startsAt: string;
  readonly designerId: string;
  readonly callerName: string | null;
  readonly callerEmail: string | null;
  readonly now: string;
  readonly settings: Settings;
  readonly adapters: Adapters;
}

export interface BookResponse {
  readonly say: string;
  readonly next_action: 'confirmed' | 'offer_slots' | 'take_details';
  readonly booked: boolean;
  readonly event_id: string | null;
  /** True when the booking stands but no invite could be sent. */
  readonly written_confirmation: boolean;
  readonly reference: string;
}

/**
 * Deliberately strict, and deliberately not clever.
 *
 * An address heard over a phone line is a guess. A wrong one sends a
 * stranger a client's consultation details, so anything that does not look
 * unambiguously like an address is treated as absent — the booking still
 * happens, and a person confirms it. Silently "correcting" what we thought
 * we heard would be worse than having nothing.
 */
export function usableEmail(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) return null;
  return trimmed;
}

export async function bookSlotForCall(request: BookRequest): Promise<BookResponse> {
  const { callId, startsAt, designerId, now, settings, adapters } = request;

  const designer = designerById(designerId);
  const slot: Slot = {
    startsAt,
    endsAt: new Date(
      new Date(startsAt).getTime() + settings.CONSULTATION_DURATION_MIN * 60_000,
    ).toISOString(),
    designerId,
  };

  const email = usableEmail(request.callerEmail);

  const result = await bookSlot({
    slot,
    reference: callId,
    designerEmail: designer.email,
    clientEmail: email,
    calendar: adapters.calendar,
    settings,
  });

  if (result.lostRace || result.eventId === null) {
    return {
      say:
        'I am sorry — that time has just been taken. Let me find you another one.',
      next_action: 'offer_slots',
      booked: false,
      event_id: null,
      written_confirmation: false,
      reference: callId,
    };
  }

  const when = speakableSlot(startsAt, now);
  const firstName = designer.name.split(' ')[0] ?? designer.name;

  const confirmation = email
    ? `That is booked: ${when}, with ${firstName}. A calendar invitation is on its way to your email.`
    : `That is booked: ${when}, with ${firstName}. Someone from the studio will confirm the details with you.`;

  return {
    say: confirmation,
    next_action: 'confirmed',
    booked: true,
    event_id: result.eventId,
    written_confirmation: email !== null,
    reference: callId,
  };
}
