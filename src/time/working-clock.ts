/**
 * The working-minute clock (brief §6).
 *
 * Why this exists at all: an enquiry that arrives at 10:47pm must not be
 * eleven hours overdue by breakfast. The acknowledgement window is thirty
 * WORKING minutes, counted only while the studio is open, and an after-hours
 * lead starts its clock at the next opening (acceptance test T13).
 *
 * TIMEZONE, STATED PLAINLY. All arithmetic is done at a fixed +05:30 offset.
 * That is correct for Asia/Kolkata and only because India has no daylight
 * saving — there is no transition to land on. `assertSupportedTimezone` refuses
 * anything else rather than silently computing the wrong answer, because a
 * clock that is quietly an hour out for half the year is worse than one that
 * will not start.
 *
 * Working hours, working days and holidays are all runtime settings, so none
 * of this needs a deploy to correct (brief §8A, D5).
 */

import type { Settings } from '@config/settings-schema';

const IST_OFFSET_MINUTES = 330;
const MS_PER_MINUTE = 60_000;

export const SUPPORTED_TIMEZONE = 'Asia/Kolkata';

export class UnsupportedTimezoneError extends Error {
  constructor(tz: string) {
    super(
      `working-clock supports only ${SUPPORTED_TIMEZONE} (got "${tz}"). The arithmetic ` +
        'assumes a fixed offset and no daylight saving; another zone needs real tz handling.',
    );
    this.name = 'UnsupportedTimezoneError';
  }
}

export function assertSupportedTimezone(settings: Settings): void {
  if (settings.TIMEZONE !== SUPPORTED_TIMEZONE) {
    throw new UnsupportedTimezoneError(settings.TIMEZONE);
  }
}

export interface WallClock {
  /** yyyy-mm-dd in studio-local time. */
  readonly dateKey: string;
  /** 1 = Monday ... 7 = Sunday. */
  readonly isoWeekday: number;
  /** Minutes since local midnight. */
  readonly minuteOfDay: number;
}

function toWall(iso: string): WallClock {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return {
    dateKey: `${y}-${m}-${d}`,
    isoWeekday: ((shifted.getUTCDay() + 6) % 7) + 1,
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function fromWall(dateKey: string, minuteOfDay: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcMs =
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0) +
    (minuteOfDay - IST_OFFSET_MINUTES) * MS_PER_MINUTE;
  return new Date(utcMs).toISOString();
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function parseHhmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function openMinute(settings: Settings): number {
  return parseHhmm(settings.WORKING_HOURS_START);
}
export function closeMinute(settings: Settings): number {
  return parseHhmm(settings.WORKING_HOURS_END);
}
export function minutesPerWorkingDay(settings: Settings): number {
  return Math.max(0, closeMinute(settings) - openMinute(settings));
}

export function isWorkingDate(dateKey: string, settings: Settings): boolean {
  if (settings.HOLIDAYS.includes(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = ((new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7) + 1;
  return settings.WORKING_DAYS.includes(weekday);
}

export function isOpenAt(iso: string, settings: Settings): boolean {
  assertSupportedTimezone(settings);
  const wall = toWall(iso);
  return (
    isWorkingDate(wall.dateKey, settings) &&
    wall.minuteOfDay >= openMinute(settings) &&
    wall.minuteOfDay < closeMinute(settings)
  );
}

/** Guard against a holiday list or working-day set that closes the studio forever. */
const MAX_DAYS_SEARCHED = 400;

/**
 * The next instant the studio is open, or `iso` itself if it already is.
 * This is where an after-hours lead's clock starts (T13).
 */
export function nextOpening(iso: string, settings: Settings): string {
  assertSupportedTimezone(settings);
  const wall = toWall(iso);
  const open = openMinute(settings);
  const close = closeMinute(settings);

  if (isWorkingDate(wall.dateKey, settings)) {
    if (wall.minuteOfDay < open) return fromWall(wall.dateKey, open);
    if (wall.minuteOfDay < close) return iso;
  }

  let dateKey = addDays(wall.dateKey, 1);
  for (let i = 0; i < MAX_DAYS_SEARCHED; i++) {
    if (isWorkingDate(dateKey, settings)) return fromWall(dateKey, open);
    dateKey = addDays(dateKey, 1);
  }
  throw new Error(
    `nextOpening: no working day found within ${MAX_DAYS_SEARCHED} days. Check WORKING_DAYS and HOLIDAYS.`,
  );
}

/**
 * Add working minutes to an instant. An after-hours start is moved to the next
 * opening first, so the window is always a full thirty open minutes.
 */
export function addWorkingMinutes(iso: string, minutes: number, settings: Settings): string {
  assertSupportedTimezone(settings);
  if (minutes < 0) throw new Error('addWorkingMinutes: minutes must not be negative');
  if (minutesPerWorkingDay(settings) <= 0) {
    throw new Error('addWorkingMinutes: the working day is zero minutes long');
  }

  let cursor = nextOpening(iso, settings);
  let remaining = minutes;
  const close = closeMinute(settings);

  for (let i = 0; i < MAX_DAYS_SEARCHED; i++) {
    const wall = toWall(cursor);
    const leftToday = close - wall.minuteOfDay;
    if (remaining < leftToday) return fromWall(wall.dateKey, wall.minuteOfDay + remaining);
    // Exactly exhausting the day lands on closing time, which is an instant
    // nobody is working: the backup designer would be paged at 19:00 as the
    // lights go off. Roll to the next opening so a due time is always a moment
    // the studio is open.
    if (remaining === leftToday) {
      return nextOpening(fromWall(addDays(wall.dateKey, 1), 0), settings);
    }
    remaining -= leftToday;
    cursor = nextOpening(fromWall(addDays(wall.dateKey, 1), 0), settings);
  }
  throw new Error('addWorkingMinutes: ran past the day-search limit');
}

/** Working minutes elapsed between two instants. Never negative. */
export function workingMinutesBetween(fromIso: string, toIso: string, settings: Settings): number {
  assertSupportedTimezone(settings);
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (to <= from) return 0;

  const open = openMinute(settings);
  const close = closeMinute(settings);
  let total = 0;
  let dateKey = toWall(fromIso).dateKey;
  const lastKey = toWall(toIso).dateKey;

  for (let i = 0; i < MAX_DAYS_SEARCHED; i++) {
    if (isWorkingDate(dateKey, settings)) {
      const dayOpen = new Date(fromWall(dateKey, open)).getTime();
      const dayClose = new Date(fromWall(dateKey, close)).getTime();
      const overlapStart = Math.max(from, dayOpen);
      const overlapEnd = Math.min(to, dayClose);
      if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / MS_PER_MINUTE;
    }
    if (dateKey === lastKey) break;
    dateKey = addDays(dateKey, 1);
  }
  return Math.round(total);
}

/** Exposed for slot generation and tests. */
export const __internals = { toWall, fromWall, addDays, parseHhmm };
