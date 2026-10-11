/**
 * T12 / box 14 — booking inside the call.
 *
 * The failure that matters most is a caller who hangs up believing they have
 * an appointment and does not. Every path here either produces a real
 * calendar event or says plainly that a person will follow up.
 */

import { describe, expect, it } from 'vitest';
import { bookSlotForCall, usableEmail } from '@/vaani/book-tool';
import { mockAdapters, mockCalendar } from '@/adapters/mocks';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { containsNoPriceFigure } from '@config/price-language';
import type { Slot } from '@/types';

const s = DEFAULT_SETTINGS;
const ist = (d: string, t: string): string => new Date(`${d}T${t}+05:30`).toISOString();
const NOW = ist('2026-10-12', '10:05');
const SLOT_START = ist('2026-10-13', '11:00');

function adaptersWith(busy?: Record<string, readonly Slot[]>, stealSlotOnInsert = false) {
  const base = mockAdapters();
  const calendar =
    busy || stealSlotOnInsert
      ? mockCalendar({ ...(busy ? { busy } : {}), ...(stealSlotOnInsert ? { stealSlotOnInsert } : {}) })
      : base.calendar;
  return { ...base, calendar };
}

const request = (over: Partial<Parameters<typeof bookSlotForCall>[0]> = {}) => ({
  callId: 'call-1',
  startsAt: SLOT_START,
  designerId: 'd1',
  callerName: 'Priya',
  callerEmail: 'priya@example.com',
  now: NOW,
  settings: s,
  adapters: adaptersWith(),
  ...over,
});

describe('a booking that works', () => {
  it('creates the event and confirms it', async () => {
    const r = await bookSlotForCall(request());
    expect(r.booked).toBe(true);
    expect(r.event_id).not.toBeNull();
    expect(r.next_action).toBe('confirmed');
  });

  it('reads the time back, which is the caller’s last chance to catch a mistake', async () => {
    const r = await bookSlotForCall(request());
    expect(r.say).toContain('tomorrow at 11am');
    expect(r.say).toContain('That is booked');
  });

  it('names the designer by first name', async () => {
    const r = await bookSlotForCall(request());
    expect(r.say).toContain('Seed');
  });

  it('promises an invitation only when there is an address to send it to', async () => {
    const withEmail = await bookSlotForCall(request());
    expect(withEmail.written_confirmation).toBe(true);
    expect(withEmail.say.toLowerCase()).toContain('calendar invitation');

    const without = await bookSlotForCall(request({ callerEmail: null }));
    expect(without.booked).toBe(true);
    expect(without.written_confirmation).toBe(false);
    expect(without.say.toLowerCase()).not.toContain('invitation');
    expect(without.say.toLowerCase()).toContain('confirm the details');
  });
});

describe('an address heard down a phone line', () => {
  it('accepts a clean one, and tidies spacing and case', () => {
    expect(usableEmail('  Priya@Example.COM ')).toBe('priya@example.com');
    expect(usableEmail('p r i y a @example.com')).toBe('priya@example.com');
  });

  it('refuses anything it cannot be sure of, rather than guessing', () => {
    for (const bad of [
      'priya at example dot com',
      'priya@example',
      '@example.com',
      'priya@.com',
      'not an email',
      '',
    ]) {
      expect(usableEmail(bad), bad).toBeNull();
    }
  });

  it('a refused address does not stop the booking', async () => {
    const r = await bookSlotForCall(request({ callerEmail: 'priya at example dot com' }));
    expect(r.booked).toBe(true);
    expect(r.written_confirmation).toBe(false);
  });
});

describe('T12 the slot may have gone while the caller decided', () => {
  it('refuses to double-book, and offers to look again', async () => {
    const taken: Slot = { startsAt: SLOT_START, endsAt: ist('2026-10-13', '12:00'), designerId: 'd1' };
    const r = await bookSlotForCall(request({ adapters: adaptersWith({ d1: [taken] }) }));
    expect(r.booked).toBe(false);
    expect(r.event_id).toBeNull();
    expect(r.next_action).toBe('offer_slots');
    expect(r.say.toLowerCase()).toContain('just been taken');
  });

  it('survives losing the race at the insert itself', async () => {
    const r = await bookSlotForCall(request({ adapters: adaptersWith(undefined, true) }));
    expect(r.booked).toBe(false);
    expect(r.next_action).toBe('offer_slots');
  });

  it('never says "booked" without an event id', async () => {
    for (const adapters of [adaptersWith(undefined, true), adaptersWith()]) {
      const r = await bookSlotForCall(request({ adapters }));
      if (r.say.includes('That is booked')) expect(r.event_id).not.toBeNull();
      if (r.event_id === null) expect(r.booked).toBe(false);
    }
  });

  it('booking the same call and slot twice creates one event', async () => {
    const adapters = adaptersWith();
    const first = await bookSlotForCall(request({ adapters }));
    const second = await bookSlotForCall(request({ adapters }));
    expect(first.booked).toBe(true);
    expect(second.booked).toBe(false);
  });
});

describe('what the client sees, and what a caller hears', () => {
  it('the invitation carries no figure and no internal note', async () => {
    const adapters = adaptersWith();
    await bookSlotForCall(request({ adapters }));
    const event = (adapters.calendar as ReturnType<typeof mockCalendar>).events[0];
    expect(event?.description).not.toMatch(/\d/);
    expect(event?.description.toLowerCase()).not.toContain('handoff');
    expect(event?.clientEmail).toBe('priya@example.com');
  });

  it('every spoken line passes the price guard', async () => {
    const cases = [
      request(),
      request({ callerEmail: null }),
      request({ adapters: adaptersWith(undefined, true) }),
    ];
    for (const c of cases) {
      const r = await bookSlotForCall(c);
      expect(containsNoPriceFigure(r.say).ok, r.say).toBe(true);
      expect(r.say).toMatch(/[.?]$/);
    }
  });
});
