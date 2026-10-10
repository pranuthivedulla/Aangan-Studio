/**
 * T13 — an after-hours lead starts its clock at the next opening.
 * Plus C9/C10 from the Phase 1 review, which bite here.
 *
 * The failure this prevents: T08 arrived at 10:47pm. On a wall clock it is
 * eleven hours overdue by 10am. On the working clock it has not started.
 *
 * All times below are written as IST (+05:30), because that is how the studio
 * experiences them.
 */

import { describe, expect, it } from 'vitest';
import {
  UnsupportedTimezoneError,
  addWorkingMinutes,
  isOpenAt,
  isWorkingDate,
  minutesPerWorkingDay,
  nextOpening,
  workingMinutesBetween,
} from '@/time/working-clock';
import { DEFAULT_SETTINGS, SettingsSchema, validateSetting, type Settings } from '@config/settings-schema';

const s: Settings = DEFAULT_SETTINGS;
/** 2026-10-12 is a Monday; 2026-10-17 a Saturday; 2026-10-18 a Sunday. */
const ist = (d: string, t: string): string => new Date(`${d}T${t}+05:30`).toISOString();
const asIst = (iso: string): string =>
  new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().replace('.000Z', '').replace('T', ' ');

describe('the studio calendar', () => {
  it('works Monday to Saturday by default, not Sunday', () => {
    expect(isWorkingDate('2026-10-12', s)).toBe(true); // Monday
    expect(isWorkingDate('2026-10-17', s)).toBe(true); // Saturday
    expect(isWorkingDate('2026-10-18', s)).toBe(false); // Sunday
  });

  it('respects a holiday, which is a runtime setting', () => {
    const withHoliday = { ...s, HOLIDAYS: ['2026-10-12'] };
    expect(isWorkingDate('2026-10-12', withHoliday)).toBe(false);
  });

  it('is open 10:00 to 19:00', () => {
    expect(isOpenAt(ist('2026-10-12', '09:59'), s)).toBe(false);
    expect(isOpenAt(ist('2026-10-12', '10:00'), s)).toBe(true);
    expect(isOpenAt(ist('2026-10-12', '18:59'), s)).toBe(true);
    expect(isOpenAt(ist('2026-10-12', '19:00'), s)).toBe(false);
    expect(minutesPerWorkingDay(s)).toBe(540);
  });

  it('is closed all day Sunday', () => {
    expect(isOpenAt(ist('2026-10-18', '12:00'), s)).toBe(false);
  });

  it('refuses a timezone it cannot compute correctly rather than guessing', () => {
    expect(() => isOpenAt(ist('2026-10-12', '12:00'), { ...s, TIMEZONE: 'Europe/London' })).toThrow(
      UnsupportedTimezoneError,
    );
  });
});

describe('T13 the clock starts at the next opening', () => {
  it("T08's 10:47pm call starts counting at 10am the next morning", () => {
    const call = ist('2026-09-09', '22:47');
    expect(asIst(nextOpening(call, s))).toBe('2026-09-10 10:00:00');
  });

  it('a 3am call starts the same morning', () => {
    expect(asIst(nextOpening(ist('2026-10-12', '03:00'), s))).toBe('2026-10-12 10:00:00');
  });

  it('a Saturday evening call starts Monday morning', () => {
    expect(asIst(nextOpening(ist('2026-10-17', '20:00'), s))).toBe('2026-10-19 10:00:00');
  });

  it('a call during hours starts immediately', () => {
    const during = ist('2026-10-12', '14:30');
    expect(nextOpening(during, s)).toBe(during);
  });

  it('skips a holiday', () => {
    const withHoliday = { ...s, HOLIDAYS: ['2026-10-13'] };
    expect(asIst(nextOpening(ist('2026-10-12', '20:00'), withHoliday))).toBe('2026-10-14 10:00:00');
  });

  it('gives up rather than looping forever if every day is closed', () => {
    // 400 real, consecutive holidays from the day after the call.
    const holidays = Array.from({ length: 400 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 13) + i * 86_400_000).toISOString().slice(0, 10),
    );
    expect(() => nextOpening(ist('2026-10-12', '20:00'), { ...s, HOLIDAYS: holidays })).toThrow(
      /no working day found/,
    );
  });
});

describe('adding working minutes', () => {
  it('30 minutes from 14:00 is 14:30', () => {
    expect(asIst(addWorkingMinutes(ist('2026-10-12', '14:00'), 30, s))).toBe('2026-10-12 14:30:00');
  });

  it('30 minutes from 18:50 spills to 10:20 the next working day', () => {
    // Ten minutes left on Monday, twenty owed on Tuesday.
    expect(asIst(addWorkingMinutes(ist('2026-10-12', '18:50'), 30, s))).toBe('2026-10-13 10:20:00');
  });

  it("30 minutes from T08's 10:47pm call is 10:30 the next morning", () => {
    expect(asIst(addWorkingMinutes(ist('2026-09-09', '22:47'), 30, s))).toBe('2026-09-10 10:30:00');
  });

  it('30 minutes from Saturday 18:45 lands Monday morning, skipping Sunday', () => {
    expect(asIst(addWorkingMinutes(ist('2026-10-17', '18:45'), 30, s))).toBe('2026-10-19 10:15:00');
  });

  it('a full working day lands at the next opening', () => {
    expect(asIst(addWorkingMinutes(ist('2026-10-12', '10:00'), 540, s))).toBe('2026-10-13 10:00:00');
  });

  it('refuses negative minutes', () => {
    expect(() => addWorkingMinutes(ist('2026-10-12', '10:00'), -1, s)).toThrow();
  });
});

describe('measuring working minutes', () => {
  it('counts only open time', () => {
    expect(workingMinutesBetween(ist('2026-10-12', '14:00'), ist('2026-10-12', '14:45'), s)).toBe(45);
  });

  it('ignores the night', () => {
    // 18:00 Monday to 11:00 Tuesday = 60 open + 60 open.
    expect(workingMinutesBetween(ist('2026-10-12', '18:00'), ist('2026-10-13', '11:00'), s)).toBe(120);
  });

  it('ignores Sunday entirely', () => {
    expect(workingMinutesBetween(ist('2026-10-18', '09:00'), ist('2026-10-18', '23:00'), s)).toBe(0);
  });

  it('counts nothing for a lead that arrived and was answered out of hours', () => {
    expect(workingMinutesBetween(ist('2026-09-09', '22:47'), ist('2026-09-09', '23:30'), s)).toBe(0);
  });

  it('never goes negative', () => {
    expect(workingMinutesBetween(ist('2026-10-13', '10:00'), ist('2026-10-12', '10:00'), s)).toBe(0);
  });

  it('spans a week correctly', () => {
    // Monday 10:00 to the following Monday 10:00 = six working days.
    expect(workingMinutesBetween(ist('2026-10-12', '10:00'), ist('2026-10-19', '10:00'), s)).toBe(540 * 6);
  });
});

describe('C9/C10 the settings that would have broken this clock', () => {
  it('C9: closing before opening is now rejected', () => {
    const bad = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      WORKING_HOURS_START: '19:00',
      WORKING_HOURS_END: '10:00',
    });
    expect(bad.success).toBe(false);
  });

  it('C9: equal open and close is rejected too', () => {
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, WORKING_HOURS_START: '10:00', WORKING_HOURS_END: '10:00' }).success,
    ).toBe(false);
  });

  it('C10: an acknowledgement window longer than a working day is rejected', () => {
    expect(validateSetting('ACK_WINDOW_WORKING_MIN', 600).ok).toBe(false);
    expect(validateSetting('ACK_WINDOW_WORKING_MIN', 540).ok).toBe(true);
    expect(validateSetting('ACK_WINDOW_WORKING_MIN', 30).ok).toBe(true);
  });

  it('C10: the second escalation delay is bounded the same way', () => {
    expect(validateSetting('ACK_ESCALATION_2_WORKING_MIN', 600).ok).toBe(false);
  });

  it('a consultation plus buffers must fit in the day', () => {
    expect(validateSetting('CONSULTATION_DURATION_MIN', 240).ok).toBe(true);
    const tooLong = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      CONSULTATION_DURATION_MIN: 240,
      SLOT_BUFFER_MIN: 240,
    });
    expect(tooLong.success).toBe(false);
  });

  it('shortening the working day invalidates an ack window that no longer fits', () => {
    const bad = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      WORKING_HOURS_START: '10:00',
      WORKING_HOURS_END: '10:20',
      ACK_WINDOW_WORKING_MIN: 30,
    });
    expect(bad.success).toBe(false);
  });
});
