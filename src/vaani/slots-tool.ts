/**
 * The mid-call slot tool (map boxes 6, 11 and 12).
 *
 * The agent asks us for times, we read the designer's diary, and the agent
 * speaks them back. So the headline output is not a timestamp — it is a
 * sentence. "Tuesday the fourteenth at eleven in the morning" is what a
 * caller can answer; "2026-10-14T11:00:00+05:30" is what makes an automated
 * voice sound like a machine reading a log file.
 *
 * Assignment stays deterministic and stays ours: the duty rota picks the
 * designer, not the agent, and never the founder.
 *
 * WHAT HAPPENS WHEN THERE IS NOTHING TO OFFER. Not an apology and a dead
 * end. Acceptance test T11 requires a graceful human path, so the caller is
 * told a person will ring them back and the lead goes to the front desk with
 * a reason. A caller who has just explained their whole project and is then
 * told "no availability, goodbye" is a lost project.
 */

import type { Adapters } from '@/adapters/types';
import type { Settings } from '@config/settings-schema';
import type { Slot } from '@/types';
import { assign } from '@/pipeline/assign';
import { offerSlots } from '@/pipeline/slots';
import { designerById } from '@config/rota';
import { __internals, nextOpening } from '@/time/working-clock';

const { toWall } = __internals;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

/** "Tuesday the 14th at 11am" — what the agent reads aloud. */
export function speakableSlot(iso: string, now: string): string {
  const wall = toWall(iso);
  const [y, m, d] = wall.dateKey.split('-').map(Number);
  const weekday = DAY_NAMES[(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7];

  const hour24 = Math.floor(wall.minuteOfDay / 60);
  const minute = wall.minuteOfDay % 60;
  const meridiem = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const time = minute === 0 ? `${hour12}${meridiem}` : `${hour12}:${String(minute).padStart(2, '0')}${meridiem}`;

  const today = toWall(now).dateKey;
  const tomorrow = toWall(new Date(new Date(now).getTime() + 86_400_000).toISOString()).dateKey;
  if (wall.dateKey === today) return `today at ${time}`;
  if (wall.dateKey === tomorrow) return `tomorrow at ${time}`;

  // Beyond tomorrow a weekday alone is ambiguous across a fortnight, so the
  // date goes in too.
  return `${weekday} the ${ordinal(d ?? 1)} of ${MONTH_NAMES[(m ?? 1) - 1]} at ${time}`;
}

export interface OfferedSlot {
  /** What the caller refers to: "the second one". */
  readonly id: string;
  readonly speakable: string;
  readonly startsAt: string;
  readonly designerId: string;
}

export interface SlotsResponse {
  readonly say: string;
  readonly next_action: 'confirm_slot' | 'take_details';
  readonly slots: readonly OfferedSlot[];
  readonly designer_id: string | null;
  readonly reference: string;
}

function listSlots(slots: readonly OfferedSlot[]): string {
  const spoken = slots.map((s) => s.speakable);
  if (spoken.length === 1) return spoken[0] as string;
  const last = spoken[spoken.length - 1] as string;
  return `${spoken.slice(0, -1).join(', ')}, or ${last}`;
}

export async function offerSlotsForCall(args: {
  callId: string;
  now: string;
  settings: Settings;
  adapters: Adapters;
  loadToday?: Readonly<Record<string, number>>;
}): Promise<SlotsResponse> {
  const { callId, now, settings, adapters } = args;

  // Assign from the day the consultation could actually happen, not from
  // today. A live run on a Sunday found this: the studio is shut, assign()
  // returned nobody, and the caller was fobbed off with a callback while
  // Monday sat completely free. An out-of-hours caller is the whole reason
  // this system exists, so they get Monday's duty designer and Monday's
  // diary.
  let dateKey: string;
  try {
    dateKey = toWall(nextOpening(now, settings)).dateKey;
  } catch {
    // Settings have closed the studio for longer than the clock will search.
    // A caller is on the line, so this degrades rather than throwing.
    return {
      say: 'Let me take your details and someone from the studio will call you back to fix a time.',
      next_action: 'take_details',
      slots: [],
      designer_id: null,
      reference: callId,
    };
  }

  const assignment = assign(
    args.loadToday === undefined ? { dateKey } : { dateKey, loadToday: args.loadToday },
  );

  if (assignment.designerId === null) {
    return {
      say:
        'Let me take your details — one of our designers will call you back shortly to fix a time.',
      next_action: 'take_details',
      slots: [],
      designer_id: null,
      reference: callId,
    };
  }

  const found = await offerSlots({
    designerId: assignment.designerId,
    now,
    settings,
    calendar: adapters.calendar,
  });

  if (found.noSlotsAvailable || found.slots.length === 0) {
    return {
      say:
        'I do not have a time I can confirm right now — let me take your details and we will call you back today with one.',
      next_action: 'take_details',
      slots: [],
      designer_id: assignment.designerId,
      reference: callId,
    };
  }

  const offered: OfferedSlot[] = found.slots.map((slot: Slot, i: number) => ({
    id: `slot_${i + 1}`,
    speakable: speakableSlot(slot.startsAt, now),
    startsAt: slot.startsAt,
    designerId: slot.designerId,
  }));

  const designer = designerById(assignment.designerId);
  return {
    say:
      `I can offer you ${listSlots(offered)}, with ${designer.name.split(' ')[0]}. ` +
      'Which of those suits you?',
    next_action: 'confirm_slot',
    slots: offered,
    designer_id: assignment.designerId,
    reference: callId,
  };
}
