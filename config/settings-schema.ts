/**
 * Runtime settings (brief §8A). Nothing here may be hard-coded elsewhere and
 * nothing here needs a deploy to change.
 *
 * Stored in Supabase `settings`, validated with this schema on read AND on
 * write, cached briefly, edited from a role-gated admin page, every change
 * audited. An invalid value is rejected with a message and never saved
 * (acceptance test T29).
 */

import { z } from 'zod';

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM in 24-hour time');

/** 1 = Monday ... 7 = Sunday (ISO-8601 weekday numbering). */
const isoWeekday = z.number().int().min(1).max(7);

export const SettingsSchema = z
  .object({
    /**
     * Rings before Vaani picks up. Non-negotiable 11. The mapping from a ring
     * count to seconds is a carrier/Vaani setting — [verify], see RUNBOOK.
     */
    RING_THRESHOLD: z.number().int().min(1).max(12).default(4),
    /** Optional separate out-of-hours threshold (D19). null = use the above. */
    RING_THRESHOLD_AFTER_HOURS: z.number().int().min(1).max(12).nullable().default(null),

    /**
     * How many gate-criterion fails it takes to decline.
     * RULED 10 Oct 2026: 2. A single gate fail goes to front-desk review.
     * I recommended 1 (brief §5.4, and the desk's own behaviour on T03/T04/T10);
     * overruled. Out-of-service scope still declines independently of this.
     */
    GATE_FAIL_THRESHOLD: z.number().int().min(1).max(5).default(2),

    /** Borderline forwarding limit (brief §5.4, D18). */
    MAX_UNCLEAR_FORWARD: z.number().int().min(0).max(5).default(1),
    /** Optional per-designer daily cap on borderline leads. null = uncapped. */
    BORDERLINE_DAILY_CAP_PER_DESIGNER: z.number().int().min(0).nullable().default(null),

    /** Acknowledgement window in WORKING minutes before the backup is paged. */
    ACK_WINDOW_WORKING_MIN: z.number().int().min(1).max(600).default(30),
    /** Further wait before the front-desk lead is paged. */
    ACK_ESCALATION_2_WORKING_MIN: z.number().int().min(1).max(600).default(30),

    WORKING_HOURS_START: hhmm.default('10:00'),
    WORKING_HOURS_END: hhmm.default('19:00'),
    /** Mon–Sat. D5: confirm with Nikhil. */
    WORKING_DAYS: z.array(isoWeekday).min(1).max(7).default([1, 2, 3, 4, 5, 6]),
    /** ISO dates the studio is closed. D5. */
    HOLIDAYS: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
    TIMEZONE: z.string().default('Asia/Kolkata'),

    /** Slots offered in the call. Brief §6 says 2–3. */
    SLOT_COUNT_OFFERED: z.number().int().min(1).max(5).default(3),
    /** How far ahead to look for slots, in working days (D8). */
    SLOT_WINDOW_WORKING_DAYS: z.number().int().min(1).max(30).default(5),
    /** Minutes of buffer either side of a consultation (D8). */
    SLOT_BUFFER_MIN: z.number().int().min(0).max(240).default(30),
    CONSULTATION_DURATION_MIN: z.number().int().min(15).max(240).default(60),

    /** A call from the same number inside this window attaches to the open lead (D9). */
    REPEAT_CALLER_WINDOW_DAYS: z.number().int().min(1).max(365).default(30),

    /** D4. 'wait_for_opening' is the brief's stated default. */
    AFTER_HOURS_COMPLAINT_BEHAVIOUR: z
      .enum(['wait_for_opening', 'auto_reply_with_callback_time'])
      .default('wait_for_opening'),

    /** D6. Email a designer who has not bound Telegram (box 25). */
    RESEND_FALLBACK_ENABLED: z.boolean().default(true),

    /**
     * F1 / D22: a repeat caller or a service-failure case is never parked,
     * however many criteria are unclear. T16 is the case that prompted this.
     */
    NEVER_PARK_REPEAT_OR_SERVICE_FAILURE: z.boolean().default(true),

    /**
     * Non-negotiable kill switch (brief §8A). Every call goes to the front
     * desk; the agent books nobody and declines nobody.
     */
    KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK: z.boolean().default(false),

    /**
     * The approved price sentence. Defaults to config/approved-phrases.ts.
     * Changing it requires Nikhil's sign-off recorded in the audit log.
     */
    APPROVED_PRICE_SENTENCE: z.string().min(1).nullable().default(null),
  })
  .strict();

export type Settings = z.infer<typeof SettingsSchema>;

/** The defaults, materialised. Used by the mock store and by tests. */
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

/**
 * Validate one key/value pair on the way in. Returns either the coerced value
 * or a human-readable reason, never a thrown error — the admin page shows the
 * reason and the bad value is not saved.
 */
export function validateSetting(
  key: string,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (!(SETTING_KEYS as string[]).includes(key)) {
    return { ok: false, reason: `Unknown setting: ${key}` };
  }
  const candidate = { ...DEFAULT_SETTINGS, [key]: value };
  const result = SettingsSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues.find((i) => i.path[0] === key) ?? result.error.issues[0];
    return { ok: false, reason: issue ? `${key}: ${issue.message}` : `${key}: invalid value` };
  }
  return { ok: true, value: result.data[key as keyof Settings] };
}
