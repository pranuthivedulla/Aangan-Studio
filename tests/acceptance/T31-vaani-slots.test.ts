/**
 * The slot tool: times a caller can actually answer.
 *
 * The thing under test is as much the English as the diary lookup. An
 * automated voice that reads out an ISO timestamp has failed even if the
 * timestamp is correct.
 */

import { describe, expect, it } from 'vitest';
import { offerSlotsForCall, speakableSlot } from '@/vaani/slots-tool';
import { mockAdapters, mockCalendar } from '@/adapters/mocks';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { containsNoPriceFigure } from '@config/price-language';
import { DESIGNERS } from '@config/rota';
import type { Slot } from '@/types';

const s = DEFAULT_SETTINGS;
const ist = (d: string, t: string): string => new Date(`${d}T${t}+05:30`).toISOString();

/** 2026-10-12 is a Monday and a seeded rota day. */
const MONDAY_MORNING = ist('2026-10-12', '10:05');

function adaptersWith(busy?: Record<string, readonly Slot[]>) {
  const base = mockAdapters();
  return { ...base, calendar: busy ? mockCalendar({ busy }) : base.calendar };
}

describe('times are spoken, not printed', () => {
  it('reads a same-day slot as "today"', () => {
    expect(speakableSlot(ist('2026-10-12', '15:00'), MONDAY_MORNING)).toBe('today at 3pm');
  });

  it('reads the next day as "tomorrow"', () => {
    expect(speakableSlot(ist('2026-10-13', '11:00'), MONDAY_MORNING)).toBe('tomorrow at 11am');
  });

  it('names the day and date beyond tomorrow, because a weekday alone is ambiguous', () => {
    expect(speakableSlot(ist('2026-10-15', '14:30'), MONDAY_MORNING)).toBe(
      'Thursday the 15th of October at 2:30pm',
    );
  });

  it('gets ordinals right, including the awkward ones', () => {
    expect(speakableSlot(ist('2026-10-21', '10:00'), MONDAY_MORNING)).toContain('21st');
    expect(speakableSlot(ist('2026-10-22', '10:00'), MONDAY_MORNING)).toContain('22nd');
    expect(speakableSlot(ist('2026-10-23', '10:00'), MONDAY_MORNING)).toContain('23rd');
    expect(speakableSlot(ist('2026-12-11', '10:00'), MONDAY_MORNING)).toContain('11th');
    expect(speakableSlot(ist('2026-12-13', '10:00'), MONDAY_MORNING)).toContain('13th');
  });

  it('says midday hours without a 24-hour clock', () => {
    expect(speakableSlot(ist('2026-10-12', '12:00'), MONDAY_MORNING)).toBe('today at 12pm');
    expect(speakableSlot(ist('2026-10-12', '13:00'), MONDAY_MORNING)).toBe('today at 1pm');
  });

  it('contains no ISO timestamp anywhere a caller would hear it', () => {
    const spoken = speakableSlot(ist('2026-10-15', '14:30'), MONDAY_MORNING);
    // Not a bare "T": "Thursday" has one. The ISO date-time separator is
    // what must not survive, along with the offset and the numeric date.
    expect(spoken).not.toMatch(/\d{2}T\d{2}/);
    expect(spoken).not.toContain('+05:30');
    expect(spoken).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(spoken).not.toContain('Z');
  });
});

describe('offering times', () => {
  it('offers the configured number and names the designer', async () => {
    const r = await offerSlotsForCall({
      callId: 'c1',
      now: MONDAY_MORNING,
      settings: s,
      adapters: adaptersWith(),
    });
    expect(r.slots).toHaveLength(s.SLOT_COUNT_OFFERED);
    expect(r.next_action).toBe('confirm_slot');
    expect(r.say).toContain('Which of those suits you?');
    expect(r.designer_id).not.toBeNull();
  });

  it('assignment is ours and deterministic, not the agents', async () => {
    const a = await offerSlotsForCall({ callId: 'c1', now: MONDAY_MORNING, settings: s, adapters: adaptersWith() });
    const b = await offerSlotsForCall({ callId: 'c2', now: MONDAY_MORNING, settings: s, adapters: adaptersWith() });
    expect(a.designer_id).toBe(b.designer_id);
  });

  it('never offers the founder', async () => {
    const founder = DESIGNERS.find((d) => !d.eligibleAsDesigner);
    const r = await offerSlotsForCall({ callId: 'c1', now: MONDAY_MORNING, settings: s, adapters: adaptersWith() });
    expect(r.designer_id).not.toBe(founder?.id);
  });

  it('gives each slot a handle the caller can choose by', async () => {
    const r = await offerSlotsForCall({ callId: 'c1', now: MONDAY_MORNING, settings: s, adapters: adaptersWith() });
    expect(r.slots.map((x) => x.id)).toEqual(['slot_1', 'slot_2', 'slot_3']);
    for (const slot of r.slots) expect(slot.speakable.length).toBeGreaterThan(6);
  });

  it('reads the list as English, with an "or" before the last', async () => {
    const r = await offerSlotsForCall({ callId: 'c1', now: MONDAY_MORNING, settings: s, adapters: adaptersWith() });
    expect(r.say).toContain(', or ');
  });

  it('skips a time the designer is already busy', async () => {
    const busy: Slot = {
      startsAt: ist('2026-10-12', '11:00'),
      endsAt: ist('2026-10-12', '12:00'),
      designerId: 'd1',
    };
    const r = await offerSlotsForCall({
      callId: 'c1',
      now: MONDAY_MORNING,
      settings: s,
      adapters: adaptersWith({ d1: [busy] }),
    });
    for (const slot of r.slots) {
      expect(slot.startsAt).not.toBe(busy.startsAt);
    }
  });
});

describe('T11 there is always a human path', () => {
  it('nobody on the rota: the caller is called back, not turned away', async () => {
    const r = await offerSlotsForCall({
      callId: 'c1',
      // 14 Oct has nobody on duty in the seeded rota.
      now: ist('2026-10-14', '11:00'),
      settings: s,
      adapters: adaptersWith(),
    });
    expect(r.next_action).toBe('take_details');
    expect(r.slots).toEqual([]);
    expect(r.say.toLowerCase()).toContain('call you back');
  });

  it('a full diary ends the same way, not in an apology and silence', async () => {
    const fullWeek: Slot[] = [];
    for (let d = 12; d <= 24; d++) {
      const day = `2026-10-${String(d).padStart(2, '0')}`;
      fullWeek.push({ startsAt: ist(day, '10:00'), endsAt: ist(day, '19:00'), designerId: 'd1' });
    }
    const r = await offerSlotsForCall({
      callId: 'c1',
      now: MONDAY_MORNING,
      settings: s,
      adapters: adaptersWith({ d1: fullWeek }),
    });
    expect(r.next_action).toBe('take_details');
    expect(r.say.toLowerCase()).toContain('call you back');
  });

  it('every spoken line is a complete sentence a person could say', async () => {
    for (const now of [MONDAY_MORNING, ist('2026-10-14', '11:00')]) {
      const r = await offerSlotsForCall({ callId: 'c1', now, settings: s, adapters: adaptersWith() });
      expect(r.say).toMatch(/[.?]$/);
      expect(r.say.length).toBeGreaterThan(30);
    }
  });
});

describe('a time is not a price', () => {
  it('spoken slots pass the price guard', async () => {
    const r = await offerSlotsForCall({ callId: 'c1', now: MONDAY_MORNING, settings: s, adapters: adaptersWith() });
    expect(containsNoPriceFigure(r.say).ok, r.say).toBe(true);
  });

  it('and so does every individual slot phrase', () => {
    for (const t of ['09:30', '12:00', '15:45', '18:00']) {
      const spoken = speakableSlot(ist('2026-10-15', t), MONDAY_MORNING);
      expect(containsNoPriceFigure(spoken).ok, spoken).toBe(true);
    }
  });
});
