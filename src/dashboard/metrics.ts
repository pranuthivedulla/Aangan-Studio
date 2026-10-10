/**
 * Nikhil's numbers (brief §9, map box 22).
 *
 * The dashboard answers four questions he currently answers by hand:
 *
 *   1. Of the enquiries that came in, how many became consultations?
 *   2. How fast did we reply — and does replying faster really convert better?
 *   3. What is sitting there unanswered right now?
 *   4. What is this costing per booked consultation, against what it brings in?
 *
 * THE RULE THIS FILE FOLLOWS: a number is either measured or it is absent.
 * Nothing is estimated, modelled or filled in to make a panel look complete.
 * Every metric is `number | null`, and null renders as "no data yet" with the
 * reason — because a dashboard of plausible invented figures is worse than an
 * empty one. People believe dashboards.
 *
 * Two sources, kept apart on purpose:
 *   SEPTEMBER — the 20 real calls replayed through the engine. Measured.
 *   LIVE      — what has actually happened since go-live. Currently nothing.
 */

import type { Settings } from '@config/settings-schema';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { outcomeCounts, runAllCalls, type CallRow } from '@/demo/run-calls';
import { allCallFacts, type CallFacts } from './call-facts';

/** A number we have, or an explicit absence with the reason. */
export interface Metric {
  readonly value: number | null;
  readonly unit?: 'count' | 'percent' | 'rupees' | 'minutes';
  /** Why there is no value. Shown instead of a figure. */
  readonly absent?: string;
}

const have = (value: number, unit: Metric['unit'] = 'count'): Metric => ({ value, unit });
const missing = (absent: string): Metric => ({ value: null, absent });

export interface SeptemberSnapshot {
  readonly calls: Metric;
  readonly answeredByAHuman: Metric;
  readonly missedEntirely: Metric;
  readonly outOfHours: Metric;
  /** Under this system, Vaani answers at ring four, so none go unanswered. */
  readonly wouldGoUnanswered: Metric;
  readonly reachAnDesigner: Metric;
  readonly flaggedBorderline: Metric;
  readonly needAHuman: Metric;
  readonly declinedByTheAgent: Metric;
  readonly oneQuestionAsked: Metric;
  readonly blockedOnADecision: Metric;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly medianCallLengthMin: Metric;
}

export interface LiveSnapshot {
  readonly callsTaken: Metric;
  readonly qualified: Metric;
  readonly booked: Metric;
  readonly consulted: Metric;
  readonly won: Metric;
  readonly answeredWithinFiveMinutes: Metric;
  readonly answeredWithinOneHour: Metric;
  readonly answeredByVaani: Metric;
  readonly awaitingAcknowledgement: Metric;
  readonly escalated: Metric;
  readonly frontDeskBacklog: Metric;
  readonly complaints: Metric;
  readonly costPerCall: Metric;
  readonly costPerQualifiedLead: Metric;
  readonly costPerBookedConsultation: Metric;
  readonly monthlyCost: Metric;
  readonly pipelineValue: Metric;
  readonly borderlineForwarded: Metric;
  readonly borderlineLaterWon: Metric;
}

export interface DashboardData {
  readonly september: SeptemberSnapshot;
  readonly live: LiveSnapshot;
  readonly rows: readonly CallRow[];
  readonly facts: readonly CallFacts[];
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (upper === undefined) return null;
  return sorted.length % 2 === 0 && lower !== undefined ? (lower + upper) / 2 : upper;
}

export function septemberSnapshot(
  rows: readonly CallRow[],
  facts: readonly CallFacts[],
): SeptemberSnapshot {
  const counts = outcomeCounts(rows);
  const booked = rows.filter((r) => r.outcome === 'book');
  const humanNeeded = rows.filter((r) => r.outcome === 'review' || r.outcome === 'complaint');
  const missed = facts.filter((f) => f.missed);
  const durations = facts
    .map((f) => f.durationSec)
    .filter((d): d is number => d !== null)
    .map((d) => d / 60);

  return {
    calls: have(rows.length),
    answeredByAHuman: have(facts.length - missed.length),
    missedEntirely: have(missed.length),
    outOfHours: have(facts.filter((f) => f.outOfHours).length),
    // Non-negotiable 11: the agent picks up after four unanswered rings, at
    // any hour. Nothing reaches voicemail because there is no voicemail.
    wouldGoUnanswered: have(0),
    reachAnDesigner: have(booked.length),
    flaggedBorderline: have(booked.filter((r) => r.borderline).length),
    needAHuman: have(humanNeeded.length),
    declinedByTheAgent: have(rows.filter((r) => r.outcome === 'decline').length),
    oneQuestionAsked: have(rows.filter((r) => r.outcome === 'ask_one').length),
    blockedOnADecision: have(rows.filter((r) => r.blockedBy.length > 0).length),
    outcomes: counts,
    medianCallLengthMin: (() => {
      const m = median(durations);
      return m === null ? missing('no call durations recorded') : have(Math.round(m * 10) / 10, 'minutes');
    })(),
  };
}

/**
 * The live snapshot.
 *
 * Every figure here needs the system to have actually run. It has not, so
 * every figure is absent and says why. When Phase 7 connects the real
 * integrations these read from Supabase and HubSpot through the same adapters
 * the rest of the pipeline uses — nothing about the page changes.
 */
export function liveSnapshot(): LiveSnapshot {
  const noCalls = 'no calls have been taken yet';
  const noDesigners = 'needs designers using the system';
  const noCrm = 'needs the CRM connected (Phase 7)';
  const noCost = 'needs live voice and model usage (Phase 7)';

  return {
    callsTaken: have(0),
    qualified: have(0),
    booked: have(0),
    consulted: missing(noDesigners),
    won: missing(noCrm),
    answeredWithinFiveMinutes: missing(noCalls),
    answeredWithinOneHour: missing(noCalls),
    answeredByVaani: missing(noCalls),
    awaitingAcknowledgement: have(0),
    escalated: have(0),
    frontDeskBacklog: have(0),
    complaints: have(0),
    costPerCall: missing(noCost),
    costPerQualifiedLead: missing(noCost),
    costPerBookedConsultation: missing(noCost),
    monthlyCost: missing(noCost),
    pipelineValue: missing(noCrm),
    borderlineForwarded: have(0),
    borderlineLaterWon: missing(noCrm),
  };
}

export function dashboardData(settings: Settings = DEFAULT_SETTINGS): DashboardData {
  const rows = runAllCalls(settings);
  const facts = allCallFacts(settings);
  return {
    september: septemberSnapshot(rows, facts),
    live: liveSnapshot(),
    rows,
    facts,
  };
}

/** Format a metric for display. Null renders as its reason, never as zero. */
export function render(metric: Metric): string {
  if (metric.value === null) return '—';
  switch (metric.unit) {
    case 'percent':
      return `${Math.round(metric.value)}%`;
    case 'rupees':
      return `₹${metric.value.toLocaleString('en-IN')}`;
    case 'minutes':
      return `${metric.value} min`;
    default:
      return String(metric.value);
  }
}

export function percentOf(part: Metric, whole: Metric): Metric {
  if (part.value === null || whole.value === null || whole.value === 0) {
    return missing(part.absent ?? whole.absent ?? 'not measurable');
  }
  return have(Math.round((part.value / whole.value) * 100), 'percent');
}
