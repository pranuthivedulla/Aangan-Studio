# Runbook

How to operate this thing, and what still has to be confirmed before it can take
a real call.

As of 10 Oct 2026 there is nothing to operate: no deployment, no database, no
telephony. This file exists so Phase 7 has somewhere to land, and so the open
telephony questions are written down rather than remembered.

## Daily checks (once live)

1. **Kill switch** — `KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK` should be `false`. If
   it is `true`, every call is going to the front desk and the agent is booking
   and declining nobody. Check the settings audit log for who set it.
2. **Front-desk review queue** — declines, parks, narrow scope, complaints and
   service failures. Nothing should sit here overnight.
3. **Unacknowledged leads** — anything past 30 working minutes should already
   have escalated to a backup. If the count is rising, the clock job is not
   running.
4. **Cost per booked consultation** — the headline metric. A jump usually means
   calls are running long or the model is retrying.

## The kill switch

One toggle, in the admin page, changeable at runtime with no deploy. It sends
every call to the front desk and stops the agent booking or declining anyone.
Throw it if: the agent is mis-qualifying, a price figure is reported in anything
outbound, the calendar is double-booking, or Vaani is behaving oddly on live
calls.

It does not stop Vaani answering. The phone is still answered; the agent just
stops deciding.

## Escalation chain

Lead handed off → 30 working minutes with no acknowledgement → backup designer →
another 30 → front-desk lead. Nikhil is never paged; he sees an unowned-lead
count on his dashboard. Acknowledging stops the chain. Every step is logged in
`escalations`.

Working minutes count only 10:00–19:00 Mon–Sat IST. An after-hours lead starts
its clock at the next opening, so a 10:47pm call is not already 11 hours late by
morning.

## Turning a real integration on (Phase 7)

One at a time, each with a smoke test, in this order — cheapest blast radius
first:

1. `store` (Supabase) — run `supabase/migrations/0001_init.sql`, seed the real
   rota and designers.
2. `llm` (Gemini Flash) — run the extraction against the 20 September
   transcripts offline and compare to the fixture table before any live call.
3. `crm` (HubSpot) — custom properties, then the field-ownership tests against
   the real portal.
4. `calendar` (Google Calendar) — free/busy read first, event creation second.
5. `notify` / `email` (Telegram, Resend) — designer binding flow, then alerts.
6. `voice` (Vaani) — last, and only after D13 (consent) and D27 are answered.

Set `ADAPTER_MODE_<NAME>=real` per adapter. Anything other than exactly `real`
is treated as mock, so a typo cannot put a live integration in the call path.
A real adapter with no credentials throws and names what is missing.

## Vaani: what we still need to confirm

None of this is assumed anywhere in the code. `vaanilabs.in` documentation was
not reachable on 10 Oct 2026; a public directory listing claims signed webhooks,
REST APIs, 40+ languages and sub-second response times, which is not the same as
documentation.

Ask Vaani, in writing:

1. **Can the platform call our webhook mid-call and wait for a structured JSON
   reply that determines what the agent says next?** (D27.) If no, in-call
   booking and the one-question rule are both impossible as drawn, and the
   design changes: the agent takes a message, qualification happens after the
   call, and the caller gets a callback instead of a confirmed slot. This is the
   single most consequential unknown in the project.
2. What is the latency budget for such a webhook before the caller hears
   silence? Our `extract → score → decide → assign → offerSlots` has to fit
   inside it.
3. Does the platform support **conditional forwarding on no answer** — ring the
   front desk first, pick up after N unanswered rings — or does that have to be
   configured at the carrier? How does a ring count map to seconds?
4. Hindi and Marathi on inbound calls, including code-mixed speech (W03 is
   entirely in Hindi).
5. Webhook signing scheme and replay protection.
6. Per-minute cost and how to read usage per call, for the cost log.
7. Call recording: what is stored, where, and for how long — needed for D13.

## Incidents

**A price figure appeared in something outbound.** Throw the kill switch. The
sweep in `tests/acceptance/T01-no-price-leak.test.ts` should have caught it, so
the leak came from a surface not in `OUTBOUND_SURFACES`. Add it, reproduce the
failure, then fix.

**A transcript appeared in a log.** Throw the kill switch; transcripts are
sensitive. `no-console` is an eslint error, so the leak is from a logger or an
error reporter. Rotate nothing, but purge the log sink.

**Double booking.** `createEvent` re-checks free/busy and returns null if the
slot has gone. If a double booking happened anyway, the re-check is not running
or the calendar is eventually consistent — move to a held-slot model and tell
Nikhil the caller may have to be called back.

**No designer on duty.** The lead is assigned to the front-desk lead as owner
and flagged `no_designer_on_duty`. Fix the rota; the lead is not lost.
