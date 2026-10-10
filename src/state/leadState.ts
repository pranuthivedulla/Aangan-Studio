/**
 * Lead state machine (brief §8). Illegal transitions throw.
 *
 *   received → qualified | unclear | declined | parked | review
 *   unclear  → qualified | declined | parked | review      (after the one question)
 *   review   → qualified | declined | parked               (front desk decides)
 *   qualified→ booked | parked
 *   booked   → handed_off
 *   handed_off → acknowledged | escalated
 *   escalated → acknowledged
 *   acknowledged → consulted
 *
 * `declined`, `parked` and `consulted` are terminal. Nothing silently leaves
 * the machine (non-negotiable 7): `declined`, `parked` and `review` are all
 * human-visible queues, not dead ends.
 */

import type { LeadState } from '@/types';

const TRANSITIONS: Readonly<Record<LeadState, readonly LeadState[]>> = {
  received: ['qualified', 'unclear', 'declined', 'parked', 'review'],
  unclear: ['qualified', 'declined', 'parked', 'review'],
  review: ['qualified', 'declined', 'parked'],
  qualified: ['booked', 'parked'],
  booked: ['handed_off'],
  handed_off: ['acknowledged', 'escalated'],
  escalated: ['acknowledged'],
  acknowledged: ['consulted'],
  declined: [],
  parked: [],
  consulted: [],
};

export const TERMINAL_STATES: readonly LeadState[] = ['declined', 'parked', 'consulted'];

/** States a human has to look at. Used by the front-desk queue and dashboard. */
export const HUMAN_REVIEW_STATES: readonly LeadState[] = ['review', 'parked', 'declined'];

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: LeadState,
    readonly to: LeadState,
  ) {
    super(`Illegal lead transition: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: LeadState, to: LeadState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function transition(from: LeadState, to: LeadState): LeadState {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
  return to;
}

export function isTerminal(state: LeadState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function allowedFrom(state: LeadState): readonly LeadState[] {
  return TRANSITIONS[state] ?? [];
}

/** Every state in the machine. Used to assert the table is exhaustive. */
export const ALL_STATES = Object.keys(TRANSITIONS) as LeadState[];
