/**
 * Lead state machine. Illegal transitions throw (brief §8).
 *
 * The non-obvious assertion here is the last one: nothing reaches a terminal
 * state without a human having seen it. `declined` and `parked` are terminal
 * for the machine but they are queues for the front desk (non-negotiable 7),
 * and `consulted` is terminal because the designer got there.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_STATES,
  HUMAN_REVIEW_STATES,
  IllegalTransitionError,
  TERMINAL_STATES,
  allowedFrom,
  canTransition,
  isTerminal,
  transition,
} from '@/state/leadState';

describe('lead state machine', () => {
  it('walks the happy path', () => {
    let s = transition('received', 'qualified');
    s = transition(s, 'booked');
    s = transition(s, 'handed_off');
    s = transition(s, 'acknowledged');
    s = transition(s, 'consulted');
    expect(s).toBe('consulted');
  });

  it('walks the ask-one-question path', () => {
    let s = transition('received', 'unclear');
    s = transition(s, 'qualified');
    expect(s).toBe('qualified');
  });

  it('walks the front-desk review path', () => {
    let s = transition('received', 'review');
    s = transition(s, 'qualified');
    s = transition(s, 'booked');
    expect(s).toBe('booked');
  });

  it('walks the escalation path and stops on acknowledgement', () => {
    let s = transition('handed_off', 'escalated');
    s = transition(s, 'acknowledged');
    expect(s).toBe('acknowledged');
  });

  it('throws on an illegal transition', () => {
    expect(() => transition('received', 'booked')).toThrow(IllegalTransitionError);
    expect(() => transition('declined', 'qualified')).toThrow(IllegalTransitionError);
    expect(() => transition('consulted', 'received')).toThrow(IllegalTransitionError);
  });

  it('never books a declined or parked lead', () => {
    expect(canTransition('declined', 'booked')).toBe(false);
    expect(canTransition('parked', 'booked')).toBe(false);
  });

  it('cannot skip handoff between booked and acknowledged', () => {
    expect(canTransition('booked', 'acknowledged')).toBe(false);
  });

  it('has a transition list for every state', () => {
    expect(ALL_STATES).toHaveLength(11);
    for (const s of ALL_STATES) expect(allowedFrom(s)).toBeDefined();
  });

  it('terminal states have no exits', () => {
    for (const s of TERMINAL_STATES) {
      expect(isTerminal(s)).toBe(true);
      expect(allowedFrom(s)).toEqual([]);
    }
  });

  it('every state can reach either a human queue or a consultation', () => {
    // No silent failures (non-negotiable 7): there is no state from which a
    // lead can neither reach a person nor reach a consultation.
    const reachesHumanOrConsult = (start: string): boolean => {
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length > 0) {
        const s = stack.pop() as (typeof ALL_STATES)[number];
        if (seen.has(s)) continue;
        seen.add(s);
        if (HUMAN_REVIEW_STATES.includes(s) || s === 'consulted') return true;
        stack.push(...allowedFrom(s));
      }
      return false;
    };
    for (const s of ALL_STATES) {
      expect(reachesHumanOrConsult(s), `${s} is a dead end`).toBe(true);
    }
  });
});
