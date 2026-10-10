/**
 * The acknowledgement clock and the escalation chain (brief §6, map box 20).
 *
 * Thirty working minutes with no acknowledgement pages the backup designer;
 * another thirty pages the front-desk lead. Acknowledging stops the chain.
 * **Nikhil is never paged** — he sees an unowned-lead count on his dashboard
 * and nothing else (non-negotiable 7, acceptance test T14).
 *
 * The decision of what is due is a pure function of four things: when the lead
 * was handed off, whether it has been acknowledged, the time now, and the
 * settings. No I/O, no ambient clock. The runner below does the notifying and
 * is deliberately thin, because the part worth testing hard is the arithmetic.
 */

import type { EmailAdapter, NotifyAdapter, StoreAdapter } from '@/adapters/types';
import type { Settings } from '@config/settings-schema';
import { DESIGNERS, FRONT_DESK_LEAD_ID, designerById } from '@config/rota';
import { addWorkingMinutes, workingMinutesBetween } from '@/time/working-clock';
import { log } from '@/logging';

export type EscalationStep = 'none' | 'backup_designer' | 'front_desk_lead';

export interface EscalationState {
  /** What is due right now. */
  readonly step: EscalationStep;
  /** When the next step falls due, or null when the chain is finished. */
  readonly nextDueAt: string | null;
  /** Working minutes the lead has waited. */
  readonly waitedWorkingMinutes: number;
  readonly acknowledged: boolean;
  readonly reason: string;
}

export interface EscalationInput {
  readonly handedOffAt: string;
  readonly acknowledgedAt: string | null;
  readonly now: string;
  readonly settings: Settings;
}

/**
 * When the first escalation falls due. An after-hours handoff starts counting
 * at the next opening, which `addWorkingMinutes` does for us (T13).
 */
export function firstDueAt(handedOffAt: string, settings: Settings): string {
  return addWorkingMinutes(handedOffAt, settings.ACK_WINDOW_WORKING_MIN, settings);
}

export function secondDueAt(handedOffAt: string, settings: Settings): string {
  return addWorkingMinutes(
    handedOffAt,
    settings.ACK_WINDOW_WORKING_MIN + settings.ACK_ESCALATION_2_WORKING_MIN,
    settings,
  );
}

export function escalationState(input: EscalationInput): EscalationState {
  const { handedOffAt, acknowledgedAt, now, settings } = input;

  if (acknowledgedAt !== null) {
    return {
      step: 'none',
      nextDueAt: null,
      waitedWorkingMinutes: workingMinutesBetween(handedOffAt, acknowledgedAt, settings),
      acknowledged: true,
      reason: 'acknowledged; the chain stops here',
    };
  }

  const waited = workingMinutesBetween(handedOffAt, now, settings);
  const first = firstDueAt(handedOffAt, settings);
  const second = secondDueAt(handedOffAt, settings);
  const nowMs = new Date(now).getTime();

  if (nowMs >= new Date(second).getTime()) {
    return {
      step: 'front_desk_lead',
      nextDueAt: null,
      waitedWorkingMinutes: waited,
      acknowledged: false,
      reason: `${waited} working minutes unacknowledged; front-desk lead is the last step`,
    };
  }
  if (nowMs >= new Date(first).getTime()) {
    return {
      step: 'backup_designer',
      nextDueAt: second,
      waitedWorkingMinutes: waited,
      acknowledged: false,
      reason: `${waited} working minutes unacknowledged; notifying the backup designer`,
    };
  }
  return {
    step: 'none',
    nextDueAt: first,
    waitedWorkingMinutes: waited,
    acknowledged: false,
    reason: `${waited} of ${settings.ACK_WINDOW_WORKING_MIN} working minutes used`,
  };
}

export class FounderPagedError extends Error {
  constructor(id: string) {
    super(`refused to page "${id}". Nikhil is never paged; he sees a dashboard count.`);
    this.name = 'FounderPagedError';
  }
}

/** Who a step pages. Never the founder — asserted here and by test. */
export function escalationTarget(
  step: EscalationStep,
  backupDesignerId: string | null,
): string | null {
  if (step === 'none') return null;
  if (step === 'front_desk_lead') return FRONT_DESK_LEAD_ID;
  if (backupDesignerId === null) return FRONT_DESK_LEAD_ID;

  const designer = DESIGNERS.find((d) => d.id === backupDesignerId);
  if (designer && !designer.eligibleAsDesigner) throw new FounderPagedError(backupDesignerId);
  return backupDesignerId;
}

export interface RunEscalationArgs extends EscalationInput {
  readonly leadId: string;
  readonly backupDesignerId: string | null;
  readonly crmRecordUrl: string;
  readonly notify: NotifyAdapter;
  readonly email: EmailAdapter;
  readonly store: StoreAdapter;
}

export interface RunEscalationResult {
  readonly state: EscalationState;
  readonly notifiedId: string | null;
  readonly channel: 'telegram' | 'email' | null;
  readonly alreadyFired: boolean;
}

/**
 * Fire one step, at most once.
 *
 * The idempotency key is the lead plus the step, so a cron that runs every
 * minute for the next hour notifies the backup once, not sixty times (T17).
 * The alert carries a summary and a link — never the handoff note, never a
 * transcript (T15, T21).
 */
export async function runEscalation(args: RunEscalationArgs): Promise<RunEscalationResult> {
  const state = escalationState(args);
  if (state.step === 'none') {
    return { state, notifiedId: null, channel: null, alreadyFired: false };
  }

  const target = escalationTarget(state.step, args.backupDesignerId);
  if (target === null) {
    return { state, notifiedId: null, channel: null, alreadyFired: false };
  }

  const key = `escalate:${args.leadId}:${state.step}`;
  if (await args.store.seenIdempotencyKey(key)) {
    return { state, notifiedId: target, channel: null, alreadyFired: true };
  }

  const text =
    `Unacknowledged lead after ${state.waitedWorkingMinutes} working minutes. ` +
    `Step: ${state.step}.`;

  const designer = DESIGNERS.find((d) => d.id === target);
  const useEmail =
    designer !== undefined && !designer.telegramBound && args.settings.RESEND_FALLBACK_ENABLED;

  if (useEmail) {
    await args.email.send({
      to: designerById(target).email,
      subject: 'Aangan: unacknowledged lead',
      body: `${text}\n${args.crmRecordUrl}`,
      idempotencyKey: key,
    });
  } else {
    await args.notify.send({
      chat: state.step === 'front_desk_lead' ? 'front_desk' : 'designers',
      text,
      linkUrl: args.crmRecordUrl,
      idempotencyKey: key,
    });
  }

  await args.store.recordIdempotencyKey(key);
  log('warn', 'lead.escalated', {
    leadId: args.leadId,
    step: state.step,
    waitedWorkingMinutes: state.waitedWorkingMinutes,
  });

  return {
    state,
    notifiedId: target,
    channel: useEmail ? 'email' : 'telegram',
    alreadyFired: false,
  };
}
