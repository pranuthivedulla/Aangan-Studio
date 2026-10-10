# CLAUDE CODE BUILD PROMPT: Aangan Studio Enquiry Agent (phone only)

Paste this whole file as your first message. Put `services.md`, `pricing.md`, `qualified.md`, the 40 enquiry transcripts, `components-map.svg`, the Claude Chat qualification spec (`qualification-logic.md`, see section 3A) and (when supplied) `criteria-extra.md` in `/context/` before you start.

---

## 0. HOW YOU MUST WORK (read first)

You are the lead engineer building a production-minded prototype for a non-engineer founder's office. Work in **reasoned steps, in the open**. Do not jump to code.

**Reasoning protocol, mandatory before every phase and every non-trivial decision.** Write a block headed `REASONING` containing, in this order:
1. **Goal:** what this phase must make true, in one sentence.
2. **Evidence:** what in `/context/`, this prompt, or the code already supports it. Quote file names and lines. If the evidence is not there, say "no evidence".
3. **Options:** at least two ways to do it, and what each costs.
4. **Choice and why:** pick one. State what would make you change your mind.
5. **Risks:** what could fail silently (wrong data, missed lead, leaked data, runaway cost).
6. **Check:** the exact test or command that proves it works.

Then code. After code, run the check and report the real result. Never claim something works that you have not run.

**Plan gate.** Your first output is a plan, not code: the REASONING block for the whole build, the repo layout, the phase list, and the questions you cannot answer from the context. **Stop and wait for my approval.**

**Never invent facts.** Business rules (criteria, prices, services, thresholds) come from `/context/` files only. If a rule is missing, put it in `config/open-decisions.ts` with a safe default, list it in `OPEN_DECISIONS.md`, and keep going. Do not silently choose.

**Tag your claims** in notes and PR descriptions as `[Certain]` (verified by running or reading), `[Likely]` (strong inference) or `[Guessing]`. Anything about third-party limits (HubSpot webhooks, Vercel cron, Vaani features, Telegram limits) is `[verify]` until you have checked the current docs.

**Push checkpoint after every phase.** Commit small, push to GitHub, and end each phase with a 5-line status: done, tested, broken, next, decisions needed.

---

## 1. THE CASE IN ONE PARAGRAPH

Aangan Studio (Pune): interior design for homes and small offices, 60 staff, 14 designers, 2-person front desk working 10am to 7pm. About 200 enquiries a month. About 33% arrive outside hours. About 48% get no response within 48 hours. An enquiry answered within 1 hour converts about 4x better than one answered next day. Average project value is ₹8–14 lakh. The founder, Nikhil, wants every enquiry answered in 5 minutes, day or night, the worthwhile ones to reach designers with everything already asked, and a pricing quote from the system.

**Scope: incoming phone calls only.** WhatsApp and the web form are out of scope. Do not build them. Design the code so a new channel could be added later (a `Channel` type and a channel-agnostic `Enquiry`), and write a short `EXTENDING.md` saying how.

**The goal is conversion, not call answering.** Every design choice is judged by whether it gets a qualified lead to a designer with context, fast. Measure it (see section 9).

---

## 2. NON-NEGOTIABLES (the Cut and the boundaries)

1. **The system never quotes a price.** No per-sq-ft figure, range or estimate, from the AI, the code or any template. The pricing guide says "indicative only, varies by site", which is exactly why. When a caller asks about price, the voice agent says one **approved sentence** from `config/approved-phrases.ts` (draft it from `pricing.md`'s caveat, and mark it `NEEDS_NIKHIL_APPROVAL`) and moves on to booking a designer conversation. `pricing.md` is read by tests only, to check that no figure from it ever appears in any outbound text.
2. **The AI never assigns a designer.** Assignment is deterministic code from the duty rota (section 6).
3. **The AI proposes, code decides.** The model extracts and scores with evidence. Outcome, priority, routing, assignment and escalation are plain TypeScript functions with unit tests. The model cannot change an outcome by what it writes.
4. **Single writer per field.** Every field has exactly one owner (section 7). Code rejects writes from the wrong actor.
5. **Handoff note is designer-only.** It is stored on the client's HubSpot record and nowhere else. Telegram carries only a short summary and a link, never the full note. The front desk and Nikhil do not see it.
6. **No bots messaging callers on Telegram.** Callers hear the voice agent and receive the calendar invite email. That is all.
7. **Human in the loop where it matters.** Unclear, declined, parked, narrow-scope and complaint cases go to a person. Nothing is silently dropped.
8. **Privacy.** Phone number is the unique client ID. Transcripts are sensitive: never log them to console or error trackers, never send them to a service not in the stack, and restrict them by role (section 7).
9. **Cost is a first-class output.** Log the cost of every call (voice minutes, model tokens) and show it.
10. **Every external system sits behind an adapter with a mock.** The whole pipeline must run end to end with zero credentials.
11. **No call goes unanswered: Vaani picks up after 4 rings.** The studio line rings the front desk first. If nobody answers within 4 rings, the call goes to Vaani. This covers out of hours, a busy desk and a missed call alike, and it applies at all hours. There is no queue and no voicemail. The ring count is config (`RING_THRESHOLD=4`). Telephony routing (conditional forwarding on no answer, and how a ring count maps to seconds) is a Vaani/carrier setting: mark it `[verify]` with Vaani Labs and write it up in `RUNBOOK.md`. Measure and show "answered by a human", "answered by Vaani" and "time to answer" on the dashboard.
12. **Bias toward forwarding.** When in doubt, send the lead to a designer. A wasted designer call costs less than a lost ₹8–14 lakh project. The bias is bounded: it applies only to borderline leads (section 5.4), never to a gate-criterion `fail`, an out-of-service request or a complaint. Narrow-scope requests (kitchen-only, wardrobe-only and similar) are the one explicit exception: they go to the front desk for review, because the founder's office ruled so.

---

## 3A. THE STACK (use all of it; each tool has one job)

| Tool | Job | Layer |
|---|---|---|
| Claude Chat | Designs the qualification logic in plain language, no code, **before** anything else. Output: `qualification-logic.md`, which you implement but do not rewrite | Build time |
| Claude Code (you) | Builds the whole app end to end from the map | Build time |
| GitHub | Saves progress between every session: repo, branches, CI, one PR per phase | Build time |
| Vercel | Hosts the Next.js app (API routes, webhooks, cron) and Nikhil's dashboard | Runtime |
| Vaani Labs | Voice synthesis, telephony and call orchestration in one platform | Runtime |
| Gemini Flash | Cheap, fast classification and extraction, plus the 2-line prep summary and handoff note. No judgement calls | Runtime |
| Google Calendar | Free/busy and event creation. **Cal.com or Calendly** are drop-in alternatives behind the same `calendar` adapter | Runtime |
| HubSpot | CRM: client record, handoff note, designer fields, front-desk review section. Qualified calls become deals. Free tier limits are `[verify]` | Runtime |
| Telegram | Alerts: designer summary + link; front-desk non-qualified lead | Runtime |
| Resend | Email fallback for a designer who has not bound Telegram, and for escalation if Telegram fails | Runtime |
| Supabase | Call log, cost, lead state, acknowledgement clock, rules, roster, duty rota. **Neon** is an acceptable swap behind the `store` adapter | Runtime |

If you think any tool is the wrong choice for its job, say so in the plan with evidence. Do not drop one silently.

---

## 3. THE COMPONENTS MAP (build exactly this)

Stages: Trigger → Input → Context → Processing → AI → Output. Numbers match `components-map.svg`. Build-time boxes are lettered A–D.

| # | Stage | Actor | What happens |
|---|---|---|---|
| 1 | Trigger | Caller | Calls the studio line |
| 2 | Trigger | Voice agent (Vaani) | Picks up after 4 unanswered rings, at any hour. Front desk rings first |
| 3 | Input | Caller | Answers: space, area, size, scope, timeline, who decides |
| 4 | Input | Voice agent | Records caller ID, live transcript, timestamp |
| A | Build | Claude Chat | Designs the qualification logic; feeds the rules in box 5 |
| B | Build | Claude Code | Builds the app from this map |
| C | Build | GitHub | Saves progress between every session |
| D | Build | Vercel | Hosts the app and Nikhil's dashboard |
| 5 | Context | System (Vercel app) | Loads the rules and this caller's history from the database |
| 24 | Context | Supabase | Holds rules (services, five criteria, price guard), lead log, client roster, duty rota |
| 6 | Context | Calendar | Designer free/busy (Google Calendar; Cal.com or Calendly swap in) |
| 7 | AI | Gemini Flash | Extracts fields; classifies intent and scope |
| 8 | Processing | System | Existing client? Repeat caller? Complaint goes to 21 (front desk) |
| 9 | Processing | System | Scores five criteria and scope: pass / unclear / fail |
| 10 | Processing | System | Outcome: book / ask one question / decline / review / park. Sets priority flag |
| 11 | Processing | System | Picks designer from duty rota; finds 2–3 free slots |
| 12 | Output | Voice agent | Talks to caller; price gets the approved sentence; offers slots; reads back |
| 13 | AI | Gemini Flash | Writes a 2-line prep summary and the handoff note |
| 14 | Output | Calendar | Booked inside the call: event created; designer and client invited |
| 15 | Output | Caller | Hears the confirmed slot; invite arrives. Or a polite decline |
| 16 | Output | HubSpot + Telegram | HubSpot record with prep note; Telegram alert (summary + link) |
| 17 | Output | System | Logs call, cost, outcome; starts the acknowledgement clock |
| 23 | Output | Supabase | Stores call log, cost, lead state, acknowledgement clock |
| 25 | Output | Resend | Email fallback alert for a designer without Telegram |
| 18 | Output | Designer | Acknowledges, reads the prep note, runs the consultation |
| 19 | Output | Designer | Adds budget, insights, notes in HubSpot (Granola notes pasted in manually) |
| 20 | Output | Escalation | No acknowledgement in 30 working minutes: backup designer, then front-desk lead |
| 21 | Output | Front desk | Reviews declines, parks, narrow scope, complaints; calls back; qualified leads go to 18 |
| 22 | Output | Nikhil | Vercel dashboard, read-only: funnel, queues, cost, complaint count. Fed by 23 and 19 |

Branches: ask-one-question loops back to the caller via the voice agent (12); decline, review and park go to 21; complaint goes to 21 (not Nikhil).

---

## 4. PHASE 0: READ THE CONTEXT, THEN REASON (no code)

Read every file in `/context/`. Then produce, with the REASONING protocol:
- A one-page digest of `services.md` (what Aangan does and does not do) and `qualified.md` (the five criteria exactly as Nikhil wrote them, quoted).
- A table of the 40 transcripts: channel, outcome you would give it under the five criteria, and why. Use the **phone-style** ones as test fixtures; use the others only as extra examples of caller language.
- A list of **ambiguities** you found between `qualified.md`, `services.md` and the transcripts. These become tests and open decisions.

---

## 5. QUALIFICATION LOGIC (gate, priority, prep are three separate things)

**Gate** decides what happens to the lead. **Priority** decides the order of work. **Prep** is the note for the designer. Never mix them in one score.

### 5.1 Chain-of-thought inside the product (evidence first, verdict second)

The Gemini Flash classifier must **reason before it answers**, and the code must not trust the verdict without the evidence. Use this JSON shape, validated with Zod; reject and retry once on any invalid output, then fall back to `review`:

```json
{
  "fields": { "space_type": null, "area_sqft": null, "scope": null, "timeline": null, "decision_maker": null, "location": null, "budget_mentioned": null, "language": null },
  "criteria": [
    { "id": "<from qualified.md>", "evidence_quote": "<verbatim from transcript or null>", "reasoning": "<2 sentences max>", "result": "pass | unclear | fail" }
  ],
  "scope_class": "full_home | single_room | narrow_scope | commercial | out_of_service | unclear",
  "intent": "new_enquiry | existing_client | complaint | other",
  "price_asked": false,
  "confidence": 0.0
}
```

Rules: `evidence_quote` must be a substring of the transcript (code checks it; a quote that is not present downgrades that criterion to `unclear`). Order of keys matters: evidence and reasoning come before `result`. Never ask the model to output a final outcome.

### 5.2 The five criteria
Take them **verbatim from `qualified.md`**. Do not paraphrase or add. Each is scored `pass | unclear | fail`. The Claude Chat spec `qualification-logic.md` (box A) is the design source for how they combine; if it conflicts with `qualified.md`, stop and ask. If the spec is missing, say so in the plan and proceed with `qualified.md` alone.

### 5.3 Extra criteria (pending)
The founder's office will supply `criteria-extra.md` (additional criteria and their gate / ranking / prep role). Build the engine so criteria are **data, not code**: `config/criteria.ts` holds `{id, label, role: gate|rank|prep, rule}`. Adding a criterion must need no change to the pipeline. Until the file arrives, ship the five only and list "extra criteria" in `OPEN_DECISIONS.md`.

### 5.4 Outcome function (deterministic, unit-tested)
`decideOutcome(scores, scope_class, intent, repeat_caller) → book | ask_one | decline | review | park | complaint`

Default mapping, **each row a test; put any rule not backed by the context in open decisions**:
- intent = complaint → `complaint` (routes to front desk)
- any gate criterion = fail, or `out_of_service` → `decline` (polite, human reviews next day)
- all gate criteria pass, scope in `full_home | single_room | commercial` → `book`
- gate criteria pass but `narrow_scope` (kitchen-only, wardrobe-only, and similar) → `review` (front desk decides)
- one or two `unclear` and an answer is plausible in the same call → `ask_one` (**one** question only, then re-score once)
- still unclear after the one question, **no fail**, and at most `MAX_UNCLEAR_FORWARD` unclear criteria (default 1) → `book` as a **borderline** lead: forwarded to a designer with `borderline: true`, the unclear criterion named at the top of the prep summary, and a note that the caller was not able to confirm it (bias toward forwarding)
- still unclear on more than `MAX_UNCLEAR_FORWARD` criteria, or the caller will not engage, or the call drops → `park` (front desk follows up the next working day)
- repeat caller within the window → attach to the existing lead, do not duplicate

### 5.5 Priority flag
`priority = f(timeline urgency, scope size, decision-maker present, source)`. Borderline leads get a lower default priority than clean ones but are still forwarded, never held back. with weights in `config/priority.ts`. It orders queues and sets backup timing. Leads qualified by the front desk after review enter the designer queue with a flag `qualified_by: front_desk`; their default priority is an **open decision** (propose: same scale, not auto-lower).

### 5.6 Prep summary and handoff note (AI, designer-only)
Two lines for Telegram. The longer note stored in HubSpot: who, what space, size, scope, timeline, who decides, what the caller already told us (so the designer does **not** re-ask), objections or hesitations quoted, and what price answer was given. The note contains **no price figures**.

---

## 6. ASSIGNMENT, SLOTS, ESCALATION

**Assignment (deterministic).** Input: duty rota (`config/rota.ts`, who is on duty by date and shift), designer calendars, existing load. Output: one primary designer and one backup (never Nikhil). Rule order is yours to propose in the plan; it must be explainable in one sentence and tested. If nobody is on duty, assign to the front-desk lead as owner and flag `no_designer_on_duty`.

**Slots.** Read free/busy for the primary designer, offer 2–3 slots within the next working days, hold none until the caller confirms, then create one calendar event inviting designer and caller (email invite is the caller's only written confirmation). Handle: no slots, caller declines all, double-booking race (re-check free/busy before insert).

**Working-minute clock.** `workingMinutes()` counts only 10:00–19:00 Mon–Sat IST [open decision: confirm days and holidays]. After-hours leads start the clock at next opening.

**Escalation chain (step 20).** Acknowledgement window 30 working minutes → notify backup designer → if still none, notify front-desk lead. Nikhil is never paged; he sees an unowned-lead count on his dashboard only. Each step is a logged event; acknowledging stops the chain.

**Complaints.** Go to the front desk queue. **Open decision:** after-hours complaints wait until opening (default) or get an auto-reply with a callback time. Implement the default, make it a config flag.

---

## 7. DATA OWNERSHIP AND VISIBILITY

**HubSpot client record** (unique key = caller phone number, E.164): name, five-criteria scores, budget (designer), phone, transcript (system), Granola notes (designer, manual paste), insights: buying signals and objections (designer), location, additional notes (designer), handoff note (system, designer-only), status, assigned designer, qualified_by.

| Field group | Writer | Designer | Front desk | Nikhil |
|---|---|---|---|---|
| Name, phone, location (from call) | System | read | read | aggregate only |
| Five-criteria scores | System | read | read | aggregate only |
| Transcript | System | read (own leads) | read (non-qualified queue) | no |
| Handoff note | System | read (own leads) | **no** | no |
| Budget, insights, Granola notes, additional notes | Designer | read/write (own) | **no** | no |
| Status, assignment | System | read | read | aggregate only |
| Review decision (front desk) | Front desk | read | read/write | aggregate only |

Treat this matrix as the **proposed default**; enforce it in code and list it in `OPEN_DECISIONS.md` for Nikhil to confirm. Nikhil's dashboard shows counts and rates, never individual transcripts.

**Telegram.** One bot, two chats: designers (summary + HubSpot link) and front desk (non-qualified lead: name, transcript, timestamp, contact). Bind each designer to their Telegram account through a deep-link `/start <token>` flow; verify webhooks with `secret_token`. A designer who has not bound gets the same summary and link by **Resend** email (box 25) [Guessing: confirm with Nikhil]. The full handoff note is still never in the email body; it links to HubSpot. Do **not** put the full handoff note in Telegram.

---

## 8. ARCHITECTURE

- TypeScript, Next.js on Vercel, Supabase (Postgres), Zod, Vitest, GitHub Actions for CI. Ask me in the plan if you want to change any of this and say why.
- **Adapters** in `src/adapters/`, each with a `real` and a `mock`: `voice` (Vaani Labs), `llm` (Gemini Flash), `calendar` (Google Calendar; Cal.com and Calendly as alternates), `crm` (HubSpot), `notify` (Telegram), `email` (Resend), `store` (Supabase; Neon as an alternate). Selected by env var; the default is mock.
- **Pipeline** in `src/pipeline/` as pure functions: `ingest → loadContext → extract → score → decide → assign → offerSlots → book → handoff → log`. Each step takes and returns typed data and can be tested alone.
- **State machine** for a lead: `received → qualified | unclear | declined | parked | review → booked → handed_off → acknowledged → consulted`, plus `escalated`. Illegal transitions throw.
- **Idempotency.** Every webhook (voice, Telegram, calendar, HubSpot) carries an id; replays must not duplicate leads, events or alerts.
- **Background jobs** for clocks and polling. Vercel Hobby cron is limited [verify]; if it cannot run every few minutes, say so in the plan and propose an alternative (Supabase scheduled function or an external pinger). HubSpot webhooks may need a paid tier [verify]; plan polling as the fallback.
- **Secrets** only in env vars; commit `.env.example`; never log secrets or full transcripts.

---

## 8A. RUNTIME SETTINGS (everything we are unsure about must be changeable after build)

Several numbers are guesses and the founder's office will tune them after go-live. None may be hard-coded or need a redeploy to change. Store them in a Supabase `settings` table with a typed, validated schema (Zod), read at call time with a short cache, and edit them from a small role-gated admin page in the Vercel app (front-desk lead and Nikhil only). Every change is logged (who, when, old value, new value) and shown on the dashboard. A bad value must be rejected with a clear message, never saved.

Initial settings and defaults:
- `RING_THRESHOLD = 4` (rings before Vaani picks up; optional separate value for out of hours)
- `MAX_UNCLEAR_FORWARD = 1` (borderline forwarding limit); optional per-designer daily cap
- `ACK_WINDOW_WORKING_MIN = 30`; backup and front-desk-lead escalation delays
- `WORKING_HOURS`, `WORKING_DAYS`, holidays
- `SLOT_COUNT_OFFERED = 3`, slot window in days, buffer between consultations
- `REPEAT_CALLER_WINDOW`
- Priority weights (section 5.5) and the criteria list in `config/criteria.ts` (section 5.3)
- After-hours complaint behaviour; Resend fallback on or off
- Approved price sentence text (changes need Nikhil's sign-off recorded in the log)
- **Kill switch**: one toggle that sends every call to the front desk and stops the agent from booking or declining anyone

Test: T29 changing each setting in the admin page changes behaviour on the next call with no deploy, and an invalid value is rejected.

---

## 9. DASHBOARD (Nikhil, read-only) and COST

Replace Nikhil's manual monthly pull. Show:
- **Funnel:** calls → answered → qualified → booked → consulted → won (won is entered by the designer in HubSpot).
- **Speed:** time to first response; share answered within 5 minutes; share within 1 hour; after-hours share of calls.
- **Conversion** by response-time bucket, so he can verify the "4x" claim himself.
- **Queues:** unowned leads, awaiting acknowledgement, escalated, front-desk review backlog, complaint count.
- **Cost:** per call (voice minutes + tokens), per qualified lead, per booked consultation, monthly total, next to the pipeline value it generated. Cost-per-booked-consultation is the headline.

The dashboard runs on Vercel and reads from Supabase (box 23), plus won/lost from HubSpot (box 19). Designer and front-desk views live in HubSpot (custom properties, views and a note), not in this app. Build only what HubSpot cannot do.

---

## 10. PHASES (stop at each checkpoint)

0. Read context, plan, open questions. **Wait for approval.**
1. GitHub repo, branch protection, one PR per phase, config, types, Zod schemas, state machine, `OPEN_DECISIONS.md`, mock adapters (including `email`), CI (lint, typecheck, test), Vercel project with preview deploys, Supabase schema and migrations.
2. Qualification engine: classifier with evidence check, five criteria from `qualified.md`, `decideOutcome`, priority. Run against all 40 transcripts; output a results table. Unit-test every outcome rule.
3. Assignment, slots, calendar adapter (mock first), working-minute clock, escalation chain.
4. Handoff: HubSpot record + note + Telegram alert + Resend fallback (mocks), field-ownership enforcement, visibility checks.
5. Voice flow script for Vaani: opening, questions, one-question rule, price sentence, slot offer, read-back, decline wording, complaint handling. Provide as config the founder can edit. Text-only test harness that simulates a call end to end.
6. Dashboard on Vercel reading Supabase, plus cost logging.
7. Real adapters one by one behind flags, each with a smoke test, only after I supply credentials.
8. Hardening: idempotency, retries, rate limits, error handling, `README.md`, `RUNBOOK.md`, `EXTENDING.md`.

---

## 11. ACCEPTANCE TESTS (all must pass; report as a table)

- T01 No outbound text (voice, Telegram, calendar, HubSpot, email) ever contains a price figure from `pricing.md`.
- T02 Caller asks "how much per sq ft": the approved sentence only, then a booking offer.
- T03 Every gate criterion `fail` → `decline`, never `book`.
- T04 A quote not in the transcript downgrades that criterion to `unclear`.
- T05 Invalid model JSON → one retry → `review`, no crash.
- T06 `ask_one` asks exactly one question, then scores once more.
- T07 Narrow-scope enquiry → `review`, visible to the front desk.
- T08 Complaint → front-desk queue, not Nikhil.
- T09 Same phone number calling twice → one client record, two calls.
- T10 Assignment is deterministic: same inputs, same designer; backup is never Nikhil.
- T11 No free slot → graceful path to the front desk, no dead end for the caller.
- T12 Double-booking race is prevented.
- T13 After-hours lead: clock starts at next opening.
- T14 No acknowledgement in 30 working minutes → backup; then → front-desk lead; Nikhil never paged.
- T15 Handoff note is absent from Telegram and from front-desk and Nikhil views.
- T16 A designer cannot write a field they do not own; the front desk cannot write designer fields.
- T17 Replayed webhooks create no duplicates.
- T18 No transcript or secret appears in logs.
- T19 Whole pipeline runs with mocks and no credentials.
- T20 Dashboard cost figures equal the sum of logged call costs.
- T21 Designer with no Telegram binding receives the Resend email with summary and link, and no full note.
- T22 Dashboard reads only from Supabase and HubSpot via adapters; with mocks it renders seeded data.
- T23 Swapping the calendar adapter to a mock Cal.com or Calendly changes no pipeline code.
- T24 Call at 03:00 → Vaani picks up after 4 rings. Call at 14:00 answered by the front desk within 4 rings → Vaani never joins. Call at 14:00 unanswered for 4 rings → Vaani picks up. No queue or voicemail in any case. `RING_THRESHOLD` is config.
- T25 Lead with exactly one `unclear` criterion after the one question and no fail → forwarded to a designer with `borderline: true` and the unclear criterion in the first line of the summary.
- T26 Lead with a gate `fail`, an out-of-service request, a complaint or a narrow-scope request is **never** forwarded to a designer by the bias rule (it goes to decline or the front desk).
- T27 `MAX_UNCLEAR_FORWARD` is config: raising or lowering it changes routing with no code change.
- T29 (see 8A) Runtime settings change behaviour without a deploy; invalid values are rejected; every change is logged.
- T28 Dashboard shows the share of calls answered by a human versus Vaani, time to answer, and the share forwarded as borderline, with their later conversion, so the bias can be judged on evidence.

---

## 12. OPEN DECISIONS (do not guess; default, flag, continue)

D1 timeline rule for urgent versus long-range leads. D2 commercial minimum size or value. D3 priority for front-desk-qualified leads and for borderline leads. D4 after-hours complaint handling. D5 working days and holidays. D6 designer without Telegram (default: Resend email). D7 exact visibility matrix. D8 slot window and buffer between consultations. D9 repeat-caller window. D10 extra qualification criteria (`criteria-extra.md`). D11 approved price sentence. D12 what "won" means and who records it. D13 call recording and consent wording required by Indian law and Aangan's policy [verify with Nikhil]. D14 languages the voice agent must handle (callers may use Hindi or Marathi). D15 behaviour when Vaani or the calendar is down (default: voice agent says a human will call back, lead logged as `park`). D16 fields that need a unique client ID beyond the phone number (shared family numbers). D17 transfer to a human when a caller asks for one during front-desk hours (default: Vaani offers a transfer if someone is free, otherwise a booked callback). D19 whether 4 rings is enough time for a desk member to reach the phone, and whether the threshold should differ in and out of hours. D18 the exact `MAX_UNCLEAR_FORWARD` value and whether borderline leads should be capped per designer per day.

---

## 13. WHAT TO SEND ME AT EACH CHECKPOINT

1. The `REASONING` block for the phase.
2. What you built, as a short list.
3. Test results (pass/fail table, real output).
4. Anything you guessed, tagged `[Guessing]`.
5. Decisions I need to make.

Start now with Phase 0, and **stop after the plan**.

---

## APPENDIX: `CLAUDE.md` snippet to commit in the repo

```
# Aangan enquiry agent
- Phone only. Never quote a price. AI proposes, code decides.
- Front desk rings first; Vaani picks up after 4 rings, any hour. When in doubt, forward to a designer (borderline), except gate fails, out-of-service, complaints and narrow scope.
- Business rules live in /context and /config, never inline.
- Single writer per field. Handoff note is designer-only.
- Before each phase, write a REASONING block (goal, evidence, options, choice, risks, check). Run checks; report real results.
- Tag claims [Certain]/[Likely]/[Guessing]. Third-party limits are [verify].
- All integrations behind adapters with mocks; the app must run with no credentials.
- Stack: Vaani Labs (voice), Gemini Flash (extract, summarise), Google Calendar (Cal.com/Calendly swap), HubSpot (CRM), Telegram + Resend (alerts), Supabase (state), Vercel (hosting, dashboard), GitHub (progress). Use all of it.
```
