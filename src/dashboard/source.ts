/**
 * Where the dashboard's numbers come from (map box 22: "Fed by 23 and 19").
 *
 * Box 23 is Supabase — call log, cost, lead state, acknowledgement clock.
 * Box 19 is what the designer typed into HubSpot — budget, insights, won.
 *
 * Both are read through adapters and nothing else, which is acceptance test
 * T22. With mocks that means an empty dashboard, and an empty dashboard is the
 * correct answer today: no call has been taken. The page says so rather than
 * showing zeros, because zero is a measurement and "never ran" is not.
 */

import type { Adapters } from '@/adapters/types';
import type { Lead } from '@/types';
import type { LiveSnapshot, Metric } from './metrics';

const have = (value: number, unit: Metric['unit'] = 'count'): Metric => ({ value, unit });
const missing = (absent: string): Metric => ({ value: null, absent });

const NO_CALLS = 'no calls have been taken yet';
const NO_COST = 'needs live voice and model usage (Phase 7)';
const NO_CRM = 'designer has not recorded an outcome in HubSpot yet';

/**
 * Build the live snapshot from whatever the adapters actually hold.
 *
 * Every count here is derived from lead state, so it cannot drift from what
 * the pipeline did. Rates and costs stay absent until there is something to
 * divide by — a "0% answered in 5 minutes" on an empty month reads as failure.
 */
export async function loadLiveSnapshot(adapters: Adapters): Promise<LiveSnapshot> {
  const leads: readonly Lead[] = await adapters.store.allLeads();
  const costPaise = await adapters.store.totalCostPaise();
  const { won, pipelinePaise } = await adapters.crm.wonLostCounts();

  const count = (predicate: (l: Lead) => boolean): number => leads.filter(predicate).length;

  const calls = leads.length;
  const qualified = count((l) => l.outcome === 'book');
  const booked = count((l) => ['booked', 'handed_off', 'acknowledged', 'consulted'].includes(l.state));
  const consulted = count((l) => l.state === 'consulted');
  const borderline = count((l) => l.borderline);
  const complaints = count((l) => l.intent === 'complaint');

  const perLead = (total: number, n: number): Metric =>
    n === 0 ? missing(NO_COST) : have(Math.round(total / n / 100), 'rupees');

  return {
    callsTaken: have(calls),
    qualified: have(qualified),
    booked: have(booked),
    consulted: calls === 0 ? missing(NO_CALLS) : have(consulted),
    won: won === null ? missing(NO_CRM) : have(won),

    // Response-time rates need an answered-at timestamp per call, which only
    // exists once calls are flowing.
    answeredWithinFiveMinutes: missing(NO_CALLS),
    answeredWithinOneHour: missing(NO_CALLS),
    answeredByVaani: missing(NO_CALLS),

    awaitingAcknowledgement: have(count((l) => l.state === 'handed_off')),
    escalated: have(count((l) => l.state === 'escalated')),
    frontDeskBacklog: have(count((l) => l.state === 'review' || l.state === 'parked')),
    complaints: have(complaints),

    costPerCall: costPaise === 0 ? missing(NO_COST) : perLead(costPaise, calls),
    costPerQualifiedLead: costPaise === 0 ? missing(NO_COST) : perLead(costPaise, qualified),
    costPerBookedConsultation: costPaise === 0 ? missing(NO_COST) : perLead(costPaise, booked),
    monthlyCost: costPaise === 0 ? missing(NO_COST) : have(Math.round(costPaise / 100), 'rupees'),
    pipelineValue:
      pipelinePaise === null ? missing(NO_CRM) : have(Math.round(pipelinePaise / 100), 'rupees'),

    borderlineForwarded: have(borderline),
    borderlineLaterWon: won === null ? missing(NO_CRM) : have(0),
  };
}

/**
 * Recent activity (the reference's right-hand feed).
 *
 * Derived from lead state and the settings audit, through the adapters like
 * everything else. It carries NO caller detail — a feed saying "Priya from
 * Kothrud booked with Seed" would hand Nikhil exactly the per-person view the
 * visibility matrix withholds. So an entry names what happened and when, and
 * nothing about who.
 */

export type ActivityKind =
  | 'call_taken'
  | 'qualified'
  | 'booked'
  | 'handed_off'
  | 'acknowledged'
  | 'escalated'
  | 'review'
  | 'complaint'
  | 'setting_changed';

export interface ActivityItem {
  readonly at: string;
  readonly kind: ActivityKind;
  readonly text: string;
}

const STATE_ACTIVITY: Partial<Record<Lead['state'], { kind: ActivityKind; text: string }>> = {
  booked: { kind: 'booked', text: 'A consultation was booked inside the call' },
  handed_off: { kind: 'handed_off', text: 'A lead was handed to a designer' },
  acknowledged: { kind: 'acknowledged', text: 'A designer acknowledged a lead' },
  consulted: { kind: 'acknowledged', text: 'A consultation was held' },
  escalated: { kind: 'escalated', text: 'A lead went unacknowledged and escalated' },
  review: { kind: 'review', text: 'A lead went to the front desk' },
  parked: { kind: 'review', text: 'A lead was parked for the next working day' },
  declined: { kind: 'review', text: 'An enquiry was politely declined' },
};

export async function loadRecentActivity(
  adapters: Adapters,
  limit = 8,
): Promise<readonly ActivityItem[]> {
  const leads = await adapters.store.allLeads();
  const audit = await adapters.store.settingsAudit();

  const fromLeads: ActivityItem[] = leads.flatMap((lead) => {
    if (lead.intent === 'complaint') {
      return [{ at: lead.updatedAt, kind: 'complaint' as const, text: 'A complaint reached the front desk' }];
    }
    const entry = STATE_ACTIVITY[lead.state];
    return entry ? [{ at: lead.updatedAt, kind: entry.kind, text: entry.text }] : [];
  });

  const fromSettings: ActivityItem[] = audit.map((change) => ({
    at: change.changedAt,
    kind: 'setting_changed' as const,
    // The key, never the value: one of these settings is the spoken price
    // sentence, and the feed is not the place for it.
    text: `${change.changedBy} changed ${change.key}`,
  }));

  return [...fromLeads, ...fromSettings]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/** What the feed will show once calls arrive. Used for the empty state. */
export const ACTIVITY_EXAMPLES: readonly string[] = [
  'A call was answered after four unanswered rings',
  'A consultation was booked inside the call',
  'A lead was handed to a designer',
  'A lead went unacknowledged and escalated',
  'A complaint reached the front desk',
];
