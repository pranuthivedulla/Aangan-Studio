/**
 * Consultation slots (brief §6, map boxes 6 and 14).
 *
 * Two or three slots are offered inside the call, NOTHING IS HELD, and the
 * event is created only once the caller confirms. Holding a slot during a
 * three-minute phone call would block a designer's diary for every caller who
 * hesitated, and there is no mechanism to release it when they hang up.
 *
 * Not holding has a cost, and it is the race: two callers can be offered the
 * same 11am. So availability is re-checked immediately before the insert, and
 * the caller is told honestly if it has gone (acceptance test T12). That
 * trade-off is deliberate — a rare apology beats a diary full of phantom
 * bookings.
 *
 * When there is nothing to offer, the caller is not dead-ended: the lead goes
 * to a human with a reason (T11).
 */

import type { CalendarAdapter } from '@/adapters/types';
import type { Slot } from '@/types';
import type { Settings } from '@config/settings-schema';
import {
  addWorkingMinutes,
  closeMinute,
  isWorkingDate,
  nextOpening,
  openMinute,
  __internals,
} from '@/time/working-clock';

const { toWall, fromWall, addDays } = __internals;

/** Offered start times land on the half hour. Nobody books an 11:07 consultation. */
const SLOT_GRANULARITY_MINUTES = 30;

export interface OfferSlotsInput {
  readonly designerId: string;
  /** Now, ISO. Slots are never offered in the past. */
  readonly now: string;
  readonly settings: Settings;
  readonly calendar: CalendarAdapter;
}

export interface OfferSlotsResult {
  readonly slots: readonly Slot[];
  readonly noSlotsAvailable: boolean;
  /** Why there is nothing, for the front desk to act on. */
  readonly reason: string | null;
}

function overlaps(a: Slot, b: Slot, bufferMinutes: number): boolean {
  const aStart = new Date(a.startsAt).getTime() - bufferMinutes * 60_000;
  const aEnd = new Date(a.endsAt).getTime() + bufferMinutes * 60_000;
  const bStart = new Date(b.startsAt).getTime();
  const bEnd = new Date(b.endsAt).getTime();
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Every half-hour start inside working hours, over the configured window, that
 * leaves room for a full consultation before closing.
 */
export function candidateSlots(
  designerId: string,
  now: string,
  settings: Settings,
): readonly Slot[] {
  const out: Slot[] = [];
  const duration = settings.CONSULTATION_DURATION_MIN;
  const open = openMinute(settings);
  const close = closeMinute(settings);

  // Start from the next opening, so an after-hours caller is offered tomorrow
  // rather than tonight.
  let dateKey = toWall(nextOpening(now, settings)).dateKey;
  let workingDaysSeen = 0;

  for (let i = 0; i < 60 && workingDaysSeen < settings.SLOT_WINDOW_WORKING_DAYS; i++) {
    if (isWorkingDate(dateKey, settings)) {
      workingDaysSeen += 1;
      for (let m = open; m + duration <= close; m += SLOT_GRANULARITY_MINUTES) {
        const startsAt = fromWall(dateKey, m);
        if (new Date(startsAt).getTime() <= new Date(now).getTime()) continue;
        out.push({
          startsAt,
          endsAt: new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString(),
          designerId,
        });
      }
    }
    dateKey = addDays(dateKey, 1);
  }
  return out;
}

export async function offerSlots(input: OfferSlotsInput): Promise<OfferSlotsResult> {
  const { designerId, now, settings, calendar } = input;

  // The clock throws if the settings close the studio for longer than it will
  // search -- a holiday list gone wrong, or a working-day set emptied by
  // mistake. During a live call that exception would drop the caller, so it
  // degrades to "no slots, here is why" and a human picks it up (D15).
  let candidates: readonly Slot[];
  let busy: readonly Slot[];
  try {
    const windowEnd = addWorkingMinutes(
      now,
      settings.SLOT_WINDOW_WORKING_DAYS * (closeMinute(settings) - openMinute(settings)),
      settings,
    );
    busy = await calendar.freeBusy(designerId, now, windowEnd);
    candidates = candidateSlots(designerId, now, settings);
  } catch (error) {
    return {
      slots: [],
      noSlotsAvailable: true,
      reason: `no working hours available: ${(error as Error).message}`,
    };
  }

  const free = candidates.filter(
    (candidate) => !busy.some((b) => overlaps(candidate, b, settings.SLOT_BUFFER_MIN)),
  );

  if (free.length === 0) {
    return {
      slots: [],
      noSlotsAvailable: true,
      reason:
        busy.length > 0
          ? `${designerId} has no free consultation slot in the next ${settings.SLOT_WINDOW_WORKING_DAYS} working days`
          : `no working hours available in the next ${settings.SLOT_WINDOW_WORKING_DAYS} working days`,
    };
  }

  // Spread the offer across days where possible: three slots in one afternoon
  // is a worse offer than one each on three days.
  const byDay = new Map<string, Slot[]>();
  for (const slot of free) {
    const key = toWall(slot.startsAt).dateKey;
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }
  const spread: Slot[] = [];
  let round = 0;
  while (spread.length < settings.SLOT_COUNT_OFFERED && round < 20) {
    for (const slots of byDay.values()) {
      const slot = slots[round];
      if (slot && spread.length < settings.SLOT_COUNT_OFFERED) spread.push(slot);
    }
    round += 1;
  }

  return { slots: spread, noSlotsAvailable: false, reason: null };
}

export interface BookSlotResult {
  readonly eventId: string | null;
  /** The slot went between the offer and the insert. Tell the caller. */
  readonly lostRace: boolean;
  readonly reason: string | null;
}

/**
 * Book the confirmed slot. Re-checks availability first, because nothing was
 * held while the caller decided.
 *
 * The description passed to the calendar carries NO price figure and NOT the
 * handoff note — the event is visible to the client (brief §7, T01, T15).
 */
export async function bookSlot(args: {
  slot: Slot;
  /**
   * What makes this booking unique. The lead id in the batch path, the call
   * id mid-call. It was a whole Lead before, of which only the id was ever
   * read, so every caller faked one to satisfy the signature.
   */
  reference: string;
  designerEmail: string;
  clientEmail: string | null;
  calendar: CalendarAdapter;
  settings: Settings;
}): Promise<BookSlotResult> {
  const { slot, reference, calendar, settings } = args;

  const busy = await calendar.freeBusy(slot.designerId, slot.startsAt, slot.endsAt);
  if (busy.some((b) => overlaps(slot, b, settings.SLOT_BUFFER_MIN))) {
    return { eventId: null, lostRace: true, reason: 'slot was taken while the caller decided' };
  }

  const created = await calendar.createEvent({
    slot,
    designerEmail: args.designerEmail,
    clientEmail: args.clientEmail,
    summary: 'Aangan Studio design consultation',
    description: 'Consultation booked from a phone enquiry. Details on the CRM record.',
    // Same lead and same slot must never create two events (T17).
    idempotencyKey: `book:${reference}:${slot.startsAt}`,
  });

  if (created === null) {
    return { eventId: null, lostRace: true, reason: 'calendar refused the insert; slot gone' };
  }
  return { eventId: created.eventId, lostRace: false, reason: null };
}
