import { buildAdapters } from '@/adapters';
import { loadLiveSnapshot } from '@/dashboard/source';
import { render, type Metric } from '@/dashboard/metrics';

export const dynamic = 'force-static';

/**
 * Box 22 of the components map, and only box 22:
 * "Vercel dashboard, read-only: funnel, queues, cost, complaint count.
 *  Fed by 23 and 19."
 *
 * Four things, in that order. The September replay lives on /results, where
 * it belongs — this page is what Nikhil opens to run the studio, not evidence
 * that the engine works.
 *
 * Every number comes through the adapters (acceptance test T22). With mocks
 * that means an empty dashboard, and an empty dashboard is the honest answer:
 * no call has been taken. A figure that is absent says why, rather than
 * showing a zero that would read as failure.
 */

function Stat({
  label,
  metric,
  hint,
  big,
}: {
  label: string;
  metric: Metric;
  hint?: string;
  big?: boolean;
}) {
  const absent = metric.value === null;
  return (
    <div className="card stat-card">
      <div className={`stat${big ? ' stat-lg' : ''}${absent ? ' muted' : ''}`}>
        {render(metric)}
      </div>
      <div className="label">{label}</div>
      {absent ? <div className="absent">{metric.absent}</div> : hint ? <div className="absent">{hint}</div> : null}
    </div>
  );
}

function FunnelStep({ label, metric, last }: { label: string; metric: Metric; last?: boolean }) {
  const absent = metric.value === null;
  return (
    <>
      <div className="funnel-step">
        <div className={`stat stat-lg${absent ? ' muted' : ''}`}>{render(metric)}</div>
        <div className="label">{label}</div>
        {absent ? <div className="absent">{metric.absent}</div> : null}
      </div>
      {last ? null : <div className="funnel-arrow" aria-hidden="true">→</div>}
    </>
  );
}

export default async function Dashboard() {
  const live = await loadLiveSnapshot(buildAdapters());

  return (
    <>
      <h1>Nikhil&apos;s dashboard</h1>
      <p className="lede">
        Four questions, answered automatically: how many enquiries became consultations, how
        fast we replied, what is waiting on someone right now, and what it costs per booked
        consultation.
      </p>

      <div className="card warn">
        <strong>Nothing has run yet.</strong> This is the view on day one, before the first
        call. Figures that need the system to be live are blank and say what they are waiting
        for — none of them is estimated or filled in to look complete, because a dashboard of
        invented numbers is worse than an empty one. To see the engine working, read{' '}
        <a href="/results">the twenty September calls</a>.
      </div>

      {/* ---------------------------------------------------------------- */}
      <h2>The funnel</h2>
      <p>Where enquiries go, from the phone ringing to work won.</p>
      <div className="funnel">
        <FunnelStep label="Calls taken" metric={live.callsTaken} />
        <FunnelStep label="Qualified" metric={live.qualified} />
        <FunnelStep label="Booked" metric={live.booked} />
        <FunnelStep label="Consulted" metric={live.consulted} />
        <FunnelStep label="Won" metric={live.won} last />
      </div>

      {/* ---------------------------------------------------------------- */}
      <h2>Speed</h2>
      <p>
        The reason the system exists. An enquiry answered within the hour converts about four
        times better than one answered the next day — and once calls are flowing, these
        figures let that be checked rather than believed.
      </p>
      <div className="grid">
        <Stat label="Answered within 5 minutes" metric={live.answeredWithinFiveMinutes} />
        <Stat label="Answered within 1 hour" metric={live.answeredWithinOneHour} />
        <Stat label="Answered by the agent" metric={live.answeredByVaani} hint="rather than by a person" />
      </div>

      {/* ---------------------------------------------------------------- */}
      <h2>Waiting on someone</h2>
      <p>The queues worth looking at each morning. Anything here is a lead going cold.</p>
      <div className="grid">
        <Stat label="Unowned leads" metric={live.awaitingAcknowledgement} hint="handed to a designer, not yet acknowledged" />
        <Stat label="Escalated" metric={live.escalated} hint="past 30 working minutes" />
        <Stat label="Front-desk review" metric={live.frontDeskBacklog} hint="declines, parks and unclear cases" />
        <Stat label="Complaints" metric={live.complaints} hint="never routed to Nikhil, only counted here" />
      </div>

      {/* ---------------------------------------------------------------- */}
      <h2>Cost</h2>
      <p>
        Cost per booked consultation is the figure that decides whether this is worth running.
        It needs real voice minutes and real model usage, so it is blank until calls flow.
      </p>
      <div className="grid">
        <Stat label="Per booked consultation" metric={live.costPerBookedConsultation} big />
        <Stat label="Per call" metric={live.costPerCall} />
        <Stat label="Per qualified lead" metric={live.costPerQualifiedLead} />
        <Stat label="This month" metric={live.monthlyCost} />
        <Stat label="Pipeline value generated" metric={live.pipelineValue} />
      </div>

      {/* ---------------------------------------------------------------- */}
      <h2>Was forwarding the doubtful ones right?</h2>
      <p>
        The system deliberately forwards borderline leads rather than holding them back. That
        is a bet, and it should be judged on evidence rather than instinct.
      </p>
      <div className="grid">
        <Stat label="Forwarded as borderline" metric={live.borderlineForwarded} />
        <Stat label="Of those, later won" metric={live.borderlineLaterWon} />
      </div>

      <p className="footnote">
        Read-only. Figures come from the call log and from what designers record in the CRM —
        boxes 23 and 19 of the components map — through the same adapters the rest of the
        system uses. Individual transcripts and the designer&apos;s handoff note are not shown
        here and are not readable from this page.
      </p>
    </>
  );
}
