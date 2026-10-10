/**
 * Facts about each September call, read from the document's own headers.
 *
 *   T01 · Phone · 2 September · 10:23am · 4 min 12 sec
 *   T08 · Phone · 9 September · 10:47pm · MISSED CALL
 *   T17 · Phone · 22 September · 2:14pm then 2:16pm
 *
 * Every number on the dashboard that describes September comes from here —
 * parsed, not estimated. Where the document does not say something (how long
 * the front desk took to pick up, what a call cost), the dashboard shows a
 * blank and says why. Inventing a plausible figure would be worse than showing
 * nothing: people believe dashboards.
 */

import type { Settings } from '@config/settings-schema';
import { isWorkingDate, openMinute, closeMinute } from '@/time/working-clock';
import { transcriptFor } from '@/demo/transcripts';
import { CALL_IDS } from '@/demo/run-calls';

/** The enquiry document is September 2026. */
export const YEAR = 2026;
export const MONTH = 9;

export interface CallFacts {
  readonly id: string;
  /** yyyy-mm-dd */
  readonly dateKey: string;
  /** Minutes past midnight, studio-local. */
  readonly minuteOfDay: number;
  /** As written, e.g. "10:23am". */
  readonly clockTime: string;
  readonly durationSec: number | null;
  /** The front desk never picked up. */
  readonly missed: boolean;
  /** Outside working hours, or on a day the studio is shut. */
  readonly outOfHours: boolean;
}

function parseClock(text: string): { minuteOfDay: number; clockTime: string } | null {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = (m[3] ?? '').toLowerCase();
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return { minuteOfDay: hour * 60 + minute, clockTime: `${m[1]}:${m[2]}${meridiem}` };
}

function parseDuration(text: string): number | null {
  const m = /(\d+)\s*min(?:\s*(\d+)\s*sec)?/i.exec(text);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

export function factsFor(id: string, settings: Settings): CallFacts {
  const header = transcriptFor(id).header;

  const day = /(\d{1,2})\s+September/i.exec(header);
  if (!day) throw new Error(`${id}: no date in header "${header}"`);
  const dateKey = `${YEAR}-09-${String(Number(day[1])).padStart(2, '0')}`;

  const clock = parseClock(header);
  if (!clock) throw new Error(`${id}: no time in header "${header}"`);

  const missed = /MISSED CALL/i.test(header);
  const duration = missed ? null : parseDuration(header);

  const openToday = isWorkingDate(dateKey, settings);
  const outOfHours =
    !openToday ||
    clock.minuteOfDay < openMinute(settings) ||
    clock.minuteOfDay >= closeMinute(settings);

  return {
    id,
    dateKey,
    minuteOfDay: clock.minuteOfDay,
    clockTime: clock.clockTime,
    durationSec: duration,
    missed,
    outOfHours,
  };
}

export function allCallFacts(settings: Settings): readonly CallFacts[] {
  return CALL_IDS.map((id) => factsFor(id, settings));
}
