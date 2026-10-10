/**
 * The dashboard tells the truth about what it does not know.
 *
 * The failure this guards against is specific and common: a dashboard that
 * shows 0 where it means "we have never measured this". Zero is a
 * measurement. It says the thing happened zero times. "No calls have been
 * taken yet" is not zero, and conflating them is how a founder concludes his
 * agent is answering nobody when in fact it has never been switched on.
 */

import { describe, expect, it } from 'vitest';
import {
  dashboardData,
  liveSnapshot,
  percentOf,
  render,
  septemberSnapshot,
} from '@/dashboard/metrics';
import { allCallFacts, factsFor } from '@/dashboard/call-facts';
import { runAllCalls } from '@/demo/run-calls';
import { DEFAULT_SETTINGS } from '@config/settings-schema';

const s = DEFAULT_SETTINGS;
const data = dashboardData();

describe('September facts are parsed from the document, not invented', () => {
  const facts = allCallFacts(s);

  it('reads all twenty', () => {
    expect(facts).toHaveLength(20);
  });

  it('reads T01 exactly as the header states it', () => {
    const f = factsFor('T01', s);
    expect(f.dateKey).toBe('2026-09-02');
    expect(f.clockTime).toBe('10:23am');
    expect(f.durationSec).toBe(4 * 60 + 12);
    expect(f.missed).toBe(false);
  });

  it('knows T08 was the missed one, at 10:47pm', () => {
    const f = factsFor('T08', s);
    expect(f.missed).toBe(true);
    expect(f.durationSec).toBeNull();
    expect(f.clockTime).toBe('10:47pm');
    expect(f.outOfHours).toBe(true);
  });

  it('converts afternoon times correctly', () => {
    expect(factsFor('T02', s).minuteOfDay).toBe(14 * 60 + 41);
  });

  it('flags a 9:15am call as before opening', () => {
    const f = factsFor('T20', s);
    expect(f.minuteOfDay).toBe(9 * 60 + 15);
    expect(f.outOfHours).toBe(true);
  });

  it('every call has a real September date', () => {
    for (const f of facts) expect(f.dateKey).toMatch(/^2026-09-\d{2}$/);
  });
});

describe('the September panel is measured', () => {
  const snap = septemberSnapshot(runAllCalls(), allCallFacts(s));

  it('counts the twenty', () => {
    expect(snap.calls.value).toBe(20);
  });

  it('counts the one nobody answered', () => {
    expect(snap.missedEntirely.value).toBe(1);
    expect(snap.answeredByAHuman.value).toBe(19);
  });

  it('says none would go unanswered now, because the agent picks up at ring four', () => {
    expect(snap.wouldGoUnanswered.value).toBe(0);
  });

  it('agrees with the engine on where the calls go', () => {
    const rows = runAllCalls();
    expect(snap.reachAnDesigner.value).toBe(rows.filter((r) => r.outcome === 'book').length);
    expect(snap.declinedByTheAgent.value).toBe(rows.filter((r) => r.outcome === 'decline').length);
    const parts =
      (snap.reachAnDesigner.value ?? 0) +
      (snap.needAHuman.value ?? 0) +
      (snap.declinedByTheAgent.value ?? 0) +
      (snap.oneQuestionAsked.value ?? 0);
    expect(parts).toBe(20);
  });

  it('has a median call length, because the document records durations', () => {
    expect(snap.medianCallLengthMin.value).toBeGreaterThan(0);
  });
});

describe('the live panel admits it has no data', () => {
  const live = liveSnapshot();

  it.each([
    ['consulted', live.consulted],
    ['won', live.won],
    ['answeredWithinFiveMinutes', live.answeredWithinFiveMinutes],
    ['answeredWithinOneHour', live.answeredWithinOneHour],
    ['answeredByVaani', live.answeredByVaani],
    ['costPerCall', live.costPerCall],
    ['costPerQualifiedLead', live.costPerQualifiedLead],
    ['costPerBookedConsultation', live.costPerBookedConsultation],
    ['monthlyCost', live.monthlyCost],
    ['pipelineValue', live.pipelineValue],
    ['borderlineLaterWon', live.borderlineLaterWon],
  ])('%s is absent with a reason, not zero', (_name, metric) => {
    expect(metric.value).toBeNull();
    expect(metric.absent?.length ?? 0).toBeGreaterThan(8);
  });

  it('shows a real zero only where zero is the measurement', () => {
    // Nothing is queued because nothing has arrived. That IS zero.
    expect(live.awaitingAcknowledgement.value).toBe(0);
    expect(live.escalated.value).toBe(0);
    expect(live.frontDeskBacklog.value).toBe(0);
    expect(live.complaints.value).toBe(0);
    expect(live.callsTaken.value).toBe(0);
  });

  it('never invents a cost', () => {
    for (const m of [live.costPerCall, live.costPerBookedConsultation, live.monthlyCost]) {
      expect(m.value).toBeNull();
    }
  });
});

describe('rendering', () => {
  it('renders an absent metric as a dash, never as zero', () => {
    expect(render({ value: null, absent: 'no calls yet' })).toBe('—');
    expect(render({ value: 0, unit: 'count' })).toBe('0');
  });

  it('formats units', () => {
    expect(render({ value: 42, unit: 'percent' })).toBe('42%');
    expect(render({ value: 1200, unit: 'rupees' })).toContain('₹');
    expect(render({ value: 4.5, unit: 'minutes' })).toBe('4.5 min');
  });

  it('a percentage of an unknown is unknown, not zero', () => {
    const p = percentOf({ value: null, absent: 'no data' }, { value: 20, unit: 'count' });
    expect(p.value).toBeNull();
  });

  it('does not divide by zero', () => {
    expect(percentOf({ value: 3 }, { value: 0 }).value).toBeNull();
  });
});

describe('the dashboard leaks nothing, like every other public page', () => {
  it('carries no caller speech, name or number', () => {
    const text = JSON.stringify(data);
    for (const needle of ['Dahanukar', 'redo the whole thing', 'Priya', 'Mehta', '+91']) {
      expect(text).not.toContain(needle);
    }
  });
});
