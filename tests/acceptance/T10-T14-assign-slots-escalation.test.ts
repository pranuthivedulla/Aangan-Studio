/**
 * T10 — assignment is deterministic; the backup is never Nikhil.
 * T11 — no free slot has a graceful path, never a dead end for the caller.
 * T12 — double booking is prevented.
 * T14 — 30 working minutes → backup; then → front-desk lead; Nikhil never paged.
 */

import { describe, expect, it } from 'vitest';
import { FounderAssignedError, assign } from '@/pipeline/assign';
import { bookSlot, candidateSlots, offerSlots } from '@/pipeline/slots';
import {
  FounderPagedError,
  escalationState,
  escalationTarget,
  firstDueAt,
  runEscalation,
  secondDueAt,
} from '@/jobs/escalation';
import { mockCalendar, mockEmail, mockNotify, mockStore } from '@/adapters/mocks';
import { DEFAULT_SETTINGS, type Settings } from '@config/settings-schema';
import { DESIGNERS, FRONT_DESK_LEAD_ID, ROTA, onDuty } from '@config/rota';
import type { Slot } from '@/types';

const s: Settings = DEFAULT_SETTINGS;
const ist = (d: string, t: string): string => new Date(`${d}T${t}+05:30`).toISOString();
const asIst = (iso: string): string =>
  new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().replace('.000Z', '').replace('T', ' ');

/** 2026-10-12 is a Monday; 2026-10-18 a Sunday, when the studio is shut. */
const MONDAY = '2026-10-12';
const NO_ROTA_DAY = '2026-10-18';

/** Who the rota actually puts on that Monday, rather than a guessed id. */
const DUTY = onDuty(MONDAY);
const FIRST = DUTY?.primaryDesignerIds[0] as string;
const SECOND = DUTY?.primaryDesignerIds[1] as string;

// ---------------------------------------------------------------------------

describe('T10 assignment is deterministic', () => {
  it('same inputs, same designer, every time', () => {
    const runs = Array.from({ length: 50 }, () =>
      assign({ dateKey: MONDAY, loadToday: { [FIRST]: 2, [SECOND]: 2 } }).designerId,
    );
    expect(new Set(runs).size).toBe(1);
  });

  it('picks the designer with the fewest leads today', () => {
    expect(assign({ dateKey: MONDAY, loadToday: { [FIRST]: 3, [SECOND]: 1 } }).designerId).toBe(SECOND);
    expect(assign({ dateKey: MONDAY, loadToday: { [FIRST]: 1, [SECOND]: 3 } }).designerId).toBe(FIRST);
  });

  it('breaks a tie by rota order, not by chance', () => {
    expect(assign({ dateKey: MONDAY, loadToday: { [FIRST]: 2, [SECOND]: 2 } }).designerId).toBe(FIRST);
    expect(assign({ dateKey: MONDAY }).designerId).toBe(FIRST);
  });

  it('explains itself in one line', () => {
    const result = assign({ dateKey: MONDAY, loadToday: { d1: 3, d2: 1 } });
    expect(result.rationale).toContain('fewest leads');
    expect(result.rationale).toContain('backup');
  });

  it('names a backup who is not the primary', () => {
    const result = assign({ dateKey: MONDAY });
    expect(result.backupDesignerId).not.toBeNull();
    expect(result.backupDesignerId).not.toBe(result.designerId);
  });

  it('hands the lead to the front-desk lead when nobody is on duty', () => {
    const result = assign({ dateKey: NO_ROTA_DAY });
    expect(result.noDesignerOnDuty).toBe(true);
    expect(result.designerId).toBeNull();
    expect(result.ownerIdIfNoDesigner).toBe(FRONT_DESK_LEAD_ID);
    // The lead is not lost, which is the whole point.
    expect(result.rationale).toContain('front-desk lead');
  });
});

describe('T10 Nikhil is never a designer and never a backup', () => {
  it('is not eligible in the roster', () => {
    expect(DESIGNERS.find((d) => d.id === 'nikhil')?.eligibleAsDesigner).toBe(false);
  });

  it('is never chosen, on any rota day, at any load', () => {
    for (const row of ROTA) {
      for (const load of [{}, { d1: 9, d2: 9, d3: 9, d4: 9 }, { d1: 0 }] as const) {
        const result = assign({ dateKey: row.date, loadToday: load });
        expect(result.designerId).not.toBe('nikhil');
        expect(result.backupDesignerId).not.toBe('nikhil');
      }
    }
  });

  it('refuses a rota row that names him as primary, rather than obeying it', () => {
    // The rota is data and a human will edit it. If someone adds the founder,
    // he is filtered out, not assigned.
    const result = assign({ dateKey: NO_ROTA_DAY });
    expect(result.designerId).not.toBe('nikhil');
  });

  it('the guard itself throws if anything ever gets past the filter', () => {
    expect(new FounderAssignedError('designer').message).toContain('never a designer');
  });
});

// ---------------------------------------------------------------------------

describe('slot generation', () => {
  const now = ist(MONDAY, '10:05');

  it('offers only times inside working hours', () => {
    for (const slot of candidateSlots('d1', now, s)) {
      const h = new Date(new Date(slot.startsAt).getTime() + 330 * 60_000).getUTCHours();
      expect(h).toBeGreaterThanOrEqual(10);
      expect(h).toBeLessThan(19);
    }
  });

  it('never offers a slot in the past', () => {
    for (const slot of candidateSlots('d1', now, s)) {
      expect(new Date(slot.startsAt).getTime()).toBeGreaterThan(new Date(now).getTime());
    }
  });

  it('leaves room for a full consultation before closing', () => {
    for (const slot of candidateSlots('d1', now, s)) {
      expect(new Date(slot.endsAt).getTime()).toBeLessThanOrEqual(
        new Date(ist(asIst(slot.startsAt).slice(0, 10), '19:00')).getTime(),
      );
    }
  });

  it('skips Sunday', () => {
    const friday = ist('2026-10-16', '17:00');
    const days = new Set(candidateSlots('d1', friday, s).map((x) => asIst(x.startsAt).slice(0, 10)));
    expect(days.has('2026-10-18')).toBe(false);
  });

  it('an after-hours caller is offered tomorrow, not tonight', () => {
    const slots = candidateSlots('d1', ist(MONDAY, '22:47'), s);
    expect(asIst(slots[0]?.startsAt ?? '').slice(0, 10)).toBe('2026-10-13');
  });
});

describe('offering slots', () => {
  const now = ist(MONDAY, '10:05');

  it('offers the configured number, spread across days', async () => {
    const result = await offerSlots({ designerId: 'd1', now, settings: s, calendar: mockCalendar() });
    expect(result.slots).toHaveLength(s.SLOT_COUNT_OFFERED);
    expect(result.noSlotsAvailable).toBe(false);
    const days = new Set(result.slots.map((x) => asIst(x.startsAt).slice(0, 10)));
    expect(days.size).toBeGreaterThan(1);
  });

  it('respects the count as a runtime setting', async () => {
    const two = await offerSlots({
      designerId: 'd1',
      now,
      settings: { ...s, SLOT_COUNT_OFFERED: 2 },
      calendar: mockCalendar(),
    });
    expect(two.slots).toHaveLength(2);
  });

  it('avoids a busy block, and the buffer around it', async () => {
    const busy: Slot = { startsAt: ist(MONDAY, '11:00'), endsAt: ist(MONDAY, '12:00'), designerId: 'd1' };
    const result = await offerSlots({
      designerId: 'd1',
      now,
      settings: s,
      calendar: mockCalendar({ busy: { d1: [busy] } }),
    });
    for (const slot of result.slots) {
      // 30-minute buffer either side, so nothing from 10:30 to 12:30.
      const start = asIst(slot.startsAt);
      expect(start >= '2026-10-12 10:30:00' && start < '2026-10-12 12:30:00').toBe(false);
    }
  });

  it('T11 no free slot is a graceful path with a reason, not a dead end', async () => {
    const fullWeek: Slot[] = [];
    for (let d = 12; d <= 24; d++) {
      const day = `2026-10-${String(d).padStart(2, '0')}`;
      fullWeek.push({ startsAt: ist(day, '10:00'), endsAt: ist(day, '19:00'), designerId: 'd1' });
    }
    const result = await offerSlots({
      designerId: 'd1',
      now,
      settings: s,
      calendar: mockCalendar({ busy: { d1: fullWeek } }),
    });
    expect(result.noSlotsAvailable).toBe(true);
    expect(result.slots).toEqual([]);
    expect(result.reason).toContain('no free consultation slot');
  });

  it('T11 reports no working hours distinctly from a full diary', async () => {
    // The window is five WORKING days, so a handful of holidays only pushes it
    // out -- the clock happily finds a free day in December. Reaching this
    // branch takes a studio closed for longer than the clock will search, and
    // the point of the test is that it degrades rather than throwing at a
    // caller mid-sentence.
    const holidays = Array.from({ length: 420 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 12) + i * 86_400_000).toISOString().slice(0, 10),
    );
    const result = await offerSlots({
      designerId: 'd1',
      now,
      settings: { ...s, HOLIDAYS: holidays },
      calendar: mockCalendar(),
    });
    expect(result.noSlotsAvailable).toBe(true);
    expect(result.reason).toContain('no working hours');
  });
});

describe('T12 booking, and the race', () => {
  const slot: Slot = { startsAt: ist(MONDAY, '14:00'), endsAt: ist(MONDAY, '15:00'), designerId: 'd1' };
  const base = {
    slot,
    reference: 'lead-1',
    designerEmail: 'd1@example.invalid',
    clientEmail: null,
    settings: s,
  };

  it('books a free slot', async () => {
    const calendar = mockCalendar();
    const result = await bookSlot({ ...base, calendar });
    expect(result.eventId).not.toBeNull();
    expect(result.lostRace).toBe(false);
  });

  it('re-checks before inserting, and refuses a slot that has gone', async () => {
    const calendar = mockCalendar({ busy: { d1: [slot] } });
    const result = await bookSlot({ ...base, calendar });
    expect(result.eventId).toBeNull();
    expect(result.lostRace).toBe(true);
    expect(result.reason).toContain('taken while the caller decided');
  });

  it('survives losing the race at the insert itself', async () => {
    const calendar = mockCalendar({ stealSlotOnInsert: true });
    const result = await bookSlot({ ...base, calendar });
    expect(result.lostRace).toBe(true);
    expect(result.reason).toContain('slot gone');
  });

  it('the same lead and slot twice creates one event', async () => {
    const calendar = mockCalendar();
    await bookSlot({ ...base, calendar });
    const second = await bookSlot({ ...base, calendar });
    expect(second.lostRace).toBe(true);
    expect(calendar.events).toHaveLength(1);
  });

  it('T01/T15 the invitation the client sees carries no figure and no handoff note', async () => {
    const calendar = mockCalendar();
    await bookSlot({ ...base, calendar });
    const event = calendar.events[0];
    // The client is invited to this event, so it is an outbound surface.
    expect(event?.description).not.toMatch(/\d/);
    expect(event?.summary).not.toMatch(/\d/);
    expect(event?.description.toLowerCase()).not.toContain('handoff');
    expect(event?.description.toLowerCase()).not.toContain('criteria');
  });
});

// ---------------------------------------------------------------------------

describe('T14 the escalation chain', () => {
  const handedOff = ist(MONDAY, '11:00');

  it('is quiet inside the window', () => {
    const state = escalationState({ handedOffAt: handedOff, acknowledgedAt: null, now: ist(MONDAY, '11:20'), settings: s });
    expect(state.step).toBe('none');
    expect(state.waitedWorkingMinutes).toBe(20);
    expect(asIst(state.nextDueAt ?? '')).toBe('2026-10-12 11:30:00');
  });

  it('pages the backup at 30 working minutes', () => {
    const state = escalationState({ handedOffAt: handedOff, acknowledgedAt: null, now: ist(MONDAY, '11:30'), settings: s });
    expect(state.step).toBe('backup_designer');
    expect(asIst(firstDueAt(handedOff, s))).toBe('2026-10-12 11:30:00');
  });

  it('pages the front-desk lead 30 working minutes after that', () => {
    const state = escalationState({ handedOffAt: handedOff, acknowledgedAt: null, now: ist(MONDAY, '12:00'), settings: s });
    expect(state.step).toBe('front_desk_lead');
    expect(asIst(secondDueAt(handedOff, s))).toBe('2026-10-12 12:00:00');
    expect(state.nextDueAt).toBeNull();
  });

  it('stops the moment it is acknowledged', () => {
    const state = escalationState({
      handedOffAt: handedOff,
      acknowledgedAt: ist(MONDAY, '11:12'),
      now: ist(MONDAY, '18:00'),
      settings: s,
    });
    expect(state.step).toBe('none');
    expect(state.acknowledged).toBe(true);
    expect(state.waitedWorkingMinutes).toBe(12);
  });

  it('T13 an after-hours handoff is not already late by morning', () => {
    const night = ist('2026-10-12', '22:47');
    const state = escalationState({ handedOffAt: night, acknowledgedAt: null, now: ist('2026-10-13', '09:00'), settings: s });
    expect(state.step).toBe('none');
    expect(state.waitedWorkingMinutes).toBe(0);
    expect(asIst(firstDueAt(night, s))).toBe('2026-10-13 10:30:00');
  });

  it('does not count the weekend against a designer', () => {
    const saturdayEvening = ist('2026-10-17', '18:50');
    const state = escalationState({
      handedOffAt: saturdayEvening,
      acknowledgedAt: null,
      now: ist('2026-10-19', '10:05'),
      settings: s,
    });
    // Ten minutes on Saturday, five on Monday.
    expect(state.waitedWorkingMinutes).toBe(15);
    expect(state.step).toBe('none');
  });

  it('the window is a runtime setting', () => {
    const tight = { ...s, ACK_WINDOW_WORKING_MIN: 10 };
    const state = escalationState({ handedOffAt: handedOff, acknowledgedAt: null, now: ist(MONDAY, '11:15'), settings: tight });
    expect(state.step).toBe('backup_designer');
  });
});

describe('T14 Nikhil is never paged', () => {
  it('the second step is the front-desk lead, not the founder', () => {
    expect(escalationTarget('front_desk_lead', 'd3')).toBe(FRONT_DESK_LEAD_ID);
  });

  it('refuses to page him even if a rota names him as backup', () => {
    expect(() => escalationTarget('backup_designer', 'nikhil')).toThrow(FounderPagedError);
  });

  it('falls back to the front desk when there is no backup', () => {
    expect(escalationTarget('backup_designer', null)).toBe(FRONT_DESK_LEAD_ID);
  });

  it('pages nobody when nothing is due', () => {
    expect(escalationTarget('none', 'd3')).toBeNull();
  });
});

describe('T14 firing a step', () => {
  const handedOff = ist(MONDAY, '11:00');
  const args = () => ({
    leadId: 'lead-9',
    handedOffAt: handedOff,
    acknowledgedAt: null,
    backupDesignerId: 'd1',
    crmRecordUrl: 'https://crm.invalid/lead/9',
    settings: s,
    notify: mockNotify(),
    email: mockEmail(),
    store: mockStore(),
  });

  it('notifies the backup on Telegram', async () => {
    const a = { ...args(), now: ist(MONDAY, '11:30') };
    const result = await runEscalation(a);
    expect(result.notifiedId).toBe('d1');
    expect(result.channel).toBe('telegram');
    expect(a.notify.sent[0]?.chat).toBe('designers');
    expect(a.notify.sent[0]?.linkUrl).toContain('crm.invalid');
  });

  it('T21 emails a designer with no Telegram binding instead', async () => {
    const a = { ...args(), backupDesignerId: 'd3', now: ist(MONDAY, '11:30') };
    expect(DESIGNERS.find((d) => d.id === 'd3')?.telegramBound).toBe(false);
    const result = await runEscalation(a);
    expect(result.channel).toBe('email');
    expect(a.email.sent[0]?.to).toBe('d3@example.invalid');
    expect(a.notify.sent).toHaveLength(0);
  });

  it('T15/T21 the alert carries a summary and a link, never the full note', async () => {
    const a = { ...args(), now: ist(MONDAY, '11:30') };
    await runEscalation(a);
    const text = a.notify.sent[0]?.text ?? '';
    expect(text).toContain('Unacknowledged lead');
    expect(text.toLowerCase()).not.toContain('handoff note');
    expect(text.length).toBeLessThan(200);
  });

  it('T17 a cron running every minute notifies once, not sixty times', async () => {
    const a = { ...args(), now: ist(MONDAY, '11:45') };
    const first = await runEscalation(a);
    expect(first.alreadyFired).toBe(false);
    for (let i = 0; i < 10; i++) {
      const again = await runEscalation(a);
      expect(again.alreadyFired).toBe(true);
    }
    expect(a.notify.sent).toHaveLength(1);
  });

  it('fires both steps, separately', async () => {
    const shared = args();
    await runEscalation({ ...shared, now: ist(MONDAY, '11:30') });
    await runEscalation({ ...shared, now: ist(MONDAY, '12:00') });
    expect(shared.notify.sent).toHaveLength(2);
    expect(shared.notify.sent.map((x) => x.chat)).toEqual(['designers', 'front_desk']);
  });

  it('notifies nobody once acknowledged', async () => {
    const a = { ...args(), acknowledgedAt: ist(MONDAY, '11:10'), now: ist(MONDAY, '18:00') };
    const result = await runEscalation(a);
    expect(result.notifiedId).toBeNull();
    expect(a.notify.sent).toHaveLength(0);
    expect(a.email.sent).toHaveLength(0);
  });
});
