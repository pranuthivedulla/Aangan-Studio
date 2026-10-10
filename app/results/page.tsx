import { CRITERIA } from '@config/criteria';
import { decisionById } from '@config/open-decisions';
import { outcomeCounts, runAllCalls } from '@/demo/run-calls';

export const dynamic = 'force-static';

const MARK: Record<string, { text: string; cls: string }> = {
  pass: { text: '✓', cls: 'pass' },
  unclear: { text: '?', cls: 'unclear' },
  fail: { text: '✕', cls: 'fail' },
};

export default function Results() {
  const rows = runAllCalls();
  const counts = outcomeCounts(rows);
  const downgrades = rows.reduce((n, r) => n + r.downgrades.length, 0);
  const blocked = rows.filter((r) => r.blockedBy.length > 0);

  return (
    <>
      <h1>The 20 September phone calls</h1>
      <p className="lede">
        The real decision engine, run over the anonymised calls supplied as case material.
        Rendered from the same code the test suite runs, so this page cannot disagree with it.
      </p>

      <div className="card warn">
        <strong>What this proves, and what it does not.</strong> The AI&apos;s reading of each
        call was prepared by hand, approved as the free first pass. So this table proves the{' '}
        <em>decision rules</em> are right. It does not prove the AI reads calls correctly —
        only running the real model over these transcripts does that, and it is the next step.
        <br />
        <br />
        All {rows.length * CRITERIA.length} quotes behind these verdicts were checked against
        the transcript and against who spoke them. Evidence rejected:{' '}
        <strong>{downgrades}</strong>.
      </div>

      <div className="grid">
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([outcome, n]) => (
            <div className="card" key={outcome}>
              <div className={`stat o-${outcome}`}>{n}</div>
              <div className="label">{outcome.replace(/_/g, ' ')}</div>
            </div>
          ))}
      </div>

      <h2>Call by call</h2>
      <p>
        Criteria in Nikhil&apos;s order: <strong>1</strong> real project · <strong>2</strong>{' '}
        service area · <strong>3</strong> timeline · <strong>4</strong> budget ·{' '}
        <strong>5</strong> decision-maker. No caller words appear on this page — the
        repository is public, so only verdicts and the engine&apos;s own reasoning are
        published.
      </p>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Call</th>
              {CRITERIA.map((_, i) => (
                <th key={i} style={{ textAlign: 'center' }}>
                  {i + 1}
                </th>
              ))}
              <th>Scope</th>
              <th>Outcome</th>
              <th>Why</th>
              <th>Blocked on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <code>{r.id}</code>
                </td>
                {CRITERIA.map((c) => {
                  const mark = MARK[r.results[c.id] ?? 'unclear'] ?? MARK['unclear'];
                  return (
                    <td className={`c ${mark?.cls ?? ''}`} key={c.id} title={c.label}>
                      {mark?.text}
                    </td>
                  );
                })}
                <td>{r.scopeClass.replace(/_/g, ' ')}</td>
                <td className={`o-${r.outcome}`}>
                  {r.outcome.replace(/_/g, ' ')}
                  {r.borderline ? ' (borderline)' : ''}
                </td>
                <td>{r.rationale}</td>
                <td>{r.blockedBy.length > 0 ? r.blockedBy.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Where a decision is still needed</h2>
      {blocked.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul>
          {blocked.map((r) => (
            <li key={r.id}>
              <strong>{r.id}</strong> — decided <code>{r.outcome}</code> today, blocked on{' '}
              {r.blockedBy.map((id) => decisionById(id).question).join(' Also: ')}
            </li>
          ))}
        </ul>
      )}

      <h2>Two things worth noticing</h2>
      <p>
        <strong>Nothing parks.</strong> Five outcomes exist and one never fires. A single
        failed criterion goes to the front desk, an unclear answer earns one question, and a
        repeat caller is never held overnight — so &quot;park until tomorrow&quot; is squeezed
        out from every side. Defensible, but the queue would sit empty.
      </p>
      <p>
        <strong>Half the bookings arrive flagged, for one reason.</strong> Where a booking is
        marked borderline it is almost always criterion 5: callers say &quot;we have a
        3BHK&quot; and never say &quot;I am the owner and I decide&quot;. The rubric handles
        that correctly — do not push, forward it, note it — but a flag that fires half the
        time stops being a signal.
      </p>
    </>
  );
}
