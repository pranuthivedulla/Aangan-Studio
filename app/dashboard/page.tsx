import { dashboardData, percentOf, render, type Metric } from '@/dashboard/metrics';

export const dynamic = 'force-static';

function Stat({ label, metric, note }: { label: string; metric: Metric; note?: string }) {
  const absent = metric.value === null;
  return (
    <div className="card">
      <div className={absent ? 'stat muted' : 'stat'}>{render(metric)}</div>
      <div className="label">{label}</div>
      {absent ? (
        <div className="absent">{metric.absent}</div>
      ) : note ? (
        <div className="absent">{note}</div>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { september: s, live: l, facts } = dashboardData();

  const outOfHoursPct = percentOf(s.outOfHours, s.calls);
  const reachPct = percentOf(s.reachAnDesigner, s.calls);
  const humanPct = percentOf(s.needAHuman, s.calls);
  const borderlinePct = percentOf(s.flaggedBorderline, s.reachAnDesigner);

  return (
    <>
      <h1>Nikhil&apos;s dashboard</h1>
      <p className="lede">
        The four questions worth asking every month: how many enquiries became
        consultations, how fast we replied, what is sitting unanswered, and what it costs
        per booked consultation.
      </p>

      <div className="card warn">
        <strong>Read this before you read the numbers.</strong> The system has taken no
        calls, so everything that needs it to be running is blank and says why. Nothing on
        this page is estimated or modelled to fill a gap — a dashboard of plausible invented
        figures is worse than an empty one, because people believe dashboards. The September
        panel below is real: 20 actual enquiries, replayed through the finished engine.
      </div>

      {/* ------------------------------------------------------------------ */}
      <h2>Live — since go-live</h2>
      <p>Nothing has run yet. This is what Nikhil sees on day one, before the first call.</p>

      <h3>The funnel</h3>
      <div className="grid">
        <Stat label="Calls taken" metric={l.callsTaken} />
        <Stat label="Qualified" metric={l.qualified} />
        <Stat label="Consultations booked" metric={l.booked} />
        <Stat label="Consultations held" metric={l.consulted} />
        <Stat label="Won" metric={l.won} />
      </div>

      <h3>Speed — the thing the whole system exists for</h3>
      <p>
        An enquiry answered within the hour converts about four times better than one
        answered the next day. Nikhil believes that; he has never been able to check it.
        Once calls are running, the conversion-by-response-time breakdown below lets him
        check it himself rather than taking it on faith.
      </p>
      <div className="grid">
        <Stat label="Answered within 5 minutes" metric={l.answeredWithinFiveMinutes} />
        <Stat label="Answered within 1 hour" metric={l.answeredWithinOneHour} />
        <Stat label="Answered by the agent, not a person" metric={l.answeredByVaani} />
      </div>
      <div className="card">
        <div className="label">Conversion by response time</div>
        <p style={{ marginTop: 10, marginBottom: 0 }}>
          Needs booked consultations with known response times and a won/lost outcome
          against each. It is the one panel that proves or disproves the 4× claim, so it
          stays empty until the data is real.
        </p>
      </div>

      <h3>What is sitting there right now</h3>
      <div className="grid">
        <Stat label="Unowned leads" metric={l.awaitingAcknowledgement} />
        <Stat label="Escalated" metric={l.escalated} />
        <Stat label="Front-desk review backlog" metric={l.frontDeskBacklog} />
        <Stat label="Complaints" metric={l.complaints} />
      </div>

      <h3>Cost</h3>
      <p>
        Cost per booked consultation is the headline: it is the number that decides whether
        this is worth running. It needs real voice minutes and real model usage, so it is
        blank.
      </p>
      <div className="grid">
        <Stat label="Per call" metric={l.costPerCall} />
        <Stat label="Per qualified lead" metric={l.costPerQualifiedLead} />
        <Stat label="Per booked consultation" metric={l.costPerBookedConsultation} />
        <Stat label="This month, total" metric={l.monthlyCost} />
        <Stat label="Pipeline value generated" metric={l.pipelineValue} />
      </div>

      <h3>Was forwarding the doubtful ones right?</h3>
      <p>
        The system deliberately forwards borderline leads rather than holding them back. That
        is a bet, and it should be judged on evidence: how many were forwarded, and how many
        of those turned into work.
      </p>
      <div className="grid">
        <Stat label="Forwarded as borderline" metric={l.borderlineForwarded} />
        <Stat label="Of those, later won" metric={l.borderlineLaterWon} />
      </div>

      {/* ------------------------------------------------------------------ */}
      <h2>September, replayed through the finished system</h2>
      <p>
        These are measured, not projected: 20 real enquiries from the case material, each put
        through the engine that exists today. It is the closest thing to a forecast that is
        honest.
      </p>

      <div className="grid">
        <Stat label="Enquiries" metric={s.calls} />
        <Stat label="A person answered" metric={s.answeredByAHuman} />
        <Stat label="Nobody answered" metric={s.missedEntirely} note="one missed call, 10:47pm" />
        <Stat label="Outside office hours" metric={outOfHoursPct} />
        <Stat
          label="Would now go unanswered"
          metric={s.wouldGoUnanswered}
          note="the agent picks up at ring four, at any hour"
        />
        <Stat label="Median call length" metric={s.medianCallLengthMin} />
      </div>

      <h3>Where the 20 would have gone</h3>
      <div className="grid">
        <Stat label="Straight to a designer" metric={s.reachAnDesigner} note={`${render(reachPct)} of enquiries`} />
        <Stat label="Of those, flagged borderline" metric={s.flaggedBorderline} note={`${render(borderlinePct)} of bookings`} />
        <Stat label="One question asked, then decided" metric={s.oneQuestionAsked} />
        <Stat label="To a person at the front desk" metric={s.needAHuman} note={`${render(humanPct)} of enquiries`} />
        <Stat label="Politely declined by the agent" metric={s.declinedByTheAgent} />
        <Stat label="Waiting on a decision from Nikhil" metric={s.blockedOnADecision} />
      </div>

      <h3>Two things in this data worth his attention</h3>
      <p>
        <strong>Nothing parks.</strong> The rules have five possible outcomes and one never
        fires. A single failed criterion goes to the front desk, an unclear answer earns one
        question, and a repeat caller is never held overnight. The &quot;park until
        tomorrow&quot; queue would sit empty.
      </p>
      <p>
        <strong>Most bookings arrive flagged, for one reason.</strong> Where a booking is
        marked borderline it is nearly always the same criterion: nobody said who decides.
        Callers say &quot;we have a 3BHK&quot;; they do not say &quot;I am the owner and I
        decide&quot;. The rubric handles that correctly — do not push, forward it, note it —
        but a flag that fires this often stops being a signal.
      </p>

      <h3>The month, call by call</h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Call</th>
              <th>Date</th>
              <th>Time</th>
              <th>Length</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => {
              const row = dashboardData().rows.find((r) => r.id === f.id);
              return (
                <tr key={f.id}>
                  <td>
                    <code>{f.id}</code>
                  </td>
                  <td>{f.dateKey.slice(8)} Sep</td>
                  <td>
                    {f.clockTime}
                    {f.outOfHours ? ' · out of hours' : ''}
                  </td>
                  <td>
                    {f.durationSec === null
                      ? f.missed
                        ? 'missed'
                        : '—'
                      : `${Math.round(f.durationSec / 60)} min`}
                  </td>
                  <td className={`o-${row?.outcome ?? 'review'}`}>
                    {(row?.outcome ?? '').replace(/_/g, ' ')}
                    {row?.borderline ? ' (borderline)' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 28 }}>
        <a href="/results">See why the engine decided each one →</a>
      </p>
    </>
  );
}
