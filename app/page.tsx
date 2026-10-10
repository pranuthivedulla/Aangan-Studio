import { blockingDecisions, OPEN_DECISIONS } from '@config/open-decisions';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { outcomeCounts, runAllCalls } from '@/demo/run-calls';

export const dynamic = 'force-static';

export default function Overview() {
  const rows = runAllCalls();
  const counts = outcomeCounts(rows);
  const blocking = blockingDecisions();

  return (
    <>
      <h1>Aangan Studio — phone enquiry agent</h1>
      <p className="lede">
        Answers the studio line when the front desk does not, at any hour. Qualifies the
        enquiry against the five criteria Nikhil wrote, books a designer consultation inside
        the call, and routes everything else to a person. It never quotes a price.
      </p>

      <div className="card warn">
        <strong>What this deployment is.</strong> A working engine with no telephony attached.
        Every integration — Vaani, Gemini, Google Calendar, HubSpot, Telegram, Resend,
        Supabase — is a mock, and asking for a real one throws rather than running a stub. No
        call has ever been taken. The table below is the real decision engine run over the 20
        anonymised September calls supplied as case material.
      </div>

      <h2>What it decides</h2>
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
      <p>
        <a href="/results">See every call, and why</a>. Nothing parks: one failed criterion
        goes to the front desk, an unclear answer gets one question, and a repeat caller is
        never held overnight — so the park queue stays empty on last month&apos;s evidence.
      </p>

      <h2>The two rules everything else follows</h2>
      <h3>The system never quotes a price</h3>
      <p>
        Not the model, not a template, not the designer&apos;s note. The internal pricing guide
        is read by the test suite only, to prove no figure in it ever reaches an outbound
        surface. When a caller asks, the agent says one approved sentence — the studio&apos;s own
        wording — and offers a consultation. The sentence is editable at runtime and the
        editor refuses anything containing a digit.
      </p>
      <h3>The AI proposes; code decides</h3>
      <p>
        Gemini extracts facts and judges each criterion, with a verbatim quote for every
        judgement. The code then checks the quote is really in the transcript{' '}
        <em>and that the caller said it, not the receptionist</em>. A quote that fails either
        check downgrades that criterion, whichever way the model leaned. Outcome, priority,
        assignment and escalation are plain TypeScript with a test per rule.
      </p>

      <h2>Where a human still decides</h2>
      <p>
        {OPEN_DECISIONS.length} business rules are not answered by the supplied documents.
        Each one has a safe default the code runs today, and {blocking.length} of them block
        work until the founder&apos;s office rules:
      </p>
      <ul>
        {blocking.map((d) => (
          <li key={d.id}>
            <strong>{d.id}</strong> — {d.question}
          </li>
        ))}
      </ul>

      <h2>Settings that change behaviour with no deploy</h2>
      <p>
        Everything the founder&apos;s office will want to tune after go-live is a stored,
        validated setting, including a kill switch that sends every call to the front desk.
        A bad value is rejected with a reason and never saved.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Setting</th>
              <th>Running value</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                'RING_THRESHOLD',
                'GATE_FAIL_THRESHOLD',
                'MAX_UNCLEAR_FORWARD',
                'ACK_WINDOW_WORKING_MIN',
                'WORKING_HOURS_START',
                'WORKING_HOURS_END',
                'SLOT_COUNT_OFFERED',
                'NEVER_PARK_REPEAT_OR_SERVICE_FAILURE',
                'KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK',
              ] as const
            ).map((key) => (
              <tr key={key}>
                <td>
                  <code>{key}</code>
                </td>
                <td>
                  <code>{JSON.stringify(DEFAULT_SETTINGS[key])}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
