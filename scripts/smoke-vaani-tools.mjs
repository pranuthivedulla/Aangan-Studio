/**
 * Smoke-test the three Vaani tool endpoints against a running deployment.
 *
 * Run this after setting VAANI_TOOL_SECRET in Vercel and redeploying. It
 * walks a whole call — a caller describes a project, the agent asks for
 * times, the caller picks one — and prints what the agent would say at each
 * step, which is the part worth reading.
 *
 * The secret is read from the environment and never printed, so it stays out
 * of your shell history and out of any transcript.
 *
 *   AANGAN_TOOL_SECRET=... node scripts/smoke-vaani-tools.mjs
 *   AANGAN_TOOL_SECRET=... BASE_URL=http://localhost:3100 node scripts/smoke-vaani-tools.mjs
 *
 * Exits non-zero if any step fails, so CI could run it against a preview
 * deployment later.
 */

const BASE = process.env.BASE_URL ?? 'https://aanganstudio.vercel.app';
const SECRET = process.env.AANGAN_TOOL_SECRET;

let failures = 0;

async function call(tool, body) {
  const res = await fetch(`${BASE}/api/vaani/tools/${tool}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aangan-tool-secret': SECRET },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* left null; the caller reports the status instead */
  }
  return { status: res.status, json };
}

function report(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`Smoke-testing ${BASE}\n`);

  // 1. Authentication, before anything else is worth testing.
  const unauth = await fetch(`${BASE}/api/vaani/tools/qualify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call_id: 'smoke' }),
  });
  report('refuses a request with no secret', unauth.status === 401, `got ${unauth.status}`);

  // 2. A caller who has answered everything.
  const qualify = await call('qualify', {
    call_id: 'smoke-1',
    scope_class: 'full_home',
    scope: 'full redesign',
    scope_quote: 'We want to redo the whole thing',
    location: 'Kothrud',
    location_quote: 'We have a 3BHK in Kothrud',
    timeline: 'March',
    timeline_quote: 'done by March',
    decision_maker: 'owner',
    decision_maker_quote: 'myself and my husband',
  });

  if (qualify.status === 401) {
    console.error('\n  The secret was rejected. Check that VAANI_TOOL_SECRET in Vercel matches');
    console.error('  AANGAN_TOOL_SECRET here, and that you redeployed after setting it.');
    return 1;
  }

  report('qualify accepts the secret', qualify.status === 200, `got ${qualify.status}`);
  report('qualify decides to book', qualify.json?.outcome === 'book', qualify.json?.outcome);
  report('qualify asks for slots next', qualify.json?.next_action === 'offer_slots');
  console.log(`\n  AGENT SAYS: ${qualify.json?.say}\n`);

  // 3. Times to offer.
  const slots = await call('offer-slots', { call_id: 'smoke-1' });
  report('offer_slots responds', slots.status === 200, `got ${slots.status}`);
  const offered = slots.json?.slots ?? [];
  report('offer_slots returns times', offered.length > 0, `${offered.length} slots`);
  console.log(`\n  AGENT SAYS: ${slots.json?.say}\n`);

  if (offered.length === 0) {
    console.error('  No slots. On a Sunday that is still wrong — the agent should offer Monday.');
    console.error('  Check the duty rota and the working-hours settings.');
    return 1;
  }

  // 4. The caller picks one.
  const chosen = offered[Math.min(1, offered.length - 1)];
  const booked = await call('book-slot', {
    call_id: `smoke-${Date.now()}`,
    starts_at: chosen.startsAt,
    designer_id: slots.json.designer_id,
    caller_name: 'Smoke Test',
    caller_email: 'smoke@example.invalid',
  });
  report('book_slot responds', booked.status === 200, `got ${booked.status}`);
  report('book_slot confirms', booked.json?.booked === true);
  report('book_slot returns an event id', Boolean(booked.json?.event_id));
  console.log(`\n  AGENT SAYS: ${booked.json?.say}\n`);

  // 5. Nothing the caller hears may carry a price.
  const spoken = [qualify.json?.say, slots.json?.say, booked.json?.say].join(' ');
  const priceish = /(₹|\brs\.?\b|\binr\b|\brupees?\b|\blakhs?\b|\bcrores?\b|per\s*sq)/i;
  report('no price language in anything spoken', !priceish.test(spoken));

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  return failures === 0 ? 0 : 1;
}

if (!SECRET) {
  console.error('AANGAN_TOOL_SECRET is not set.');
  console.error('Use the same value you put in Vercel, e.g.');
  console.error('  AANGAN_TOOL_SECRET=xxxx node scripts/smoke-vaani-tools.mjs');
  process.exitCode = 2;
} else {
  // Set the code rather than calling process.exit: exiting while a fetch is
  // still in flight trips a libuv assertion on Windows and loses the real
  // status.
  process.exitCode = await main();
}
