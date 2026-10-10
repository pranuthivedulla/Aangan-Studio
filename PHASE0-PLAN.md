# Aangan Studio enquiry agent — Phase 0: plan, evidence, open decisions

No code written. Nothing committed. Nothing built.

Context read: `services.md`, `pricing.md`, `qualified.md`, `Aangan_Sep 2026_Enquiries.pdf`
(40 records), `components-map.svg`, `aangan-build-prompt.md`.

**Not supplied, and I did not invent them:** `qualification-logic.md` (box A, the Claude
Chat spec), `criteria-extra.md`, `acceptance-tests.md`, the duty rota, the designer list,
the holiday calendar. Per §5.2 of your brief I proceed on `qualified.md` alone and flag
every place the missing spec would have decided something.

---

## 0. Four things to settle before Phase 1

### 0.1 Pricing — RULED 10 Oct 2026

§1's *"a pricing quote from the system"* is a slip. **The system never emits a figure.**
Callers get the approved sentence from `pricing.md`, verbatim, marked
`NEEDS_NIKHIL_APPROVAL`, then a booking offer. `pricing.md` is read by tests only, and T01
— every figure and range in it asserted absent from every outbound surface, the handoff
note included — is a hard gate on every phase.

### 0.2 Qualification has to run *inside* the call, and the brief's pipeline assumes it does not

Map box 12 — *"offers slots, reads back"* — and the one-question rule (box 10 → 12 → 3)
both happen while the caller is on the line. So `extract → score → decide → assign →
offerSlots` must complete between caller turns, in roughly a second or two, two or three
times per call. The brief's `ingest → ... → log` reads like a post-call batch.

This is the largest build risk and it is not addressed anywhere in the brief.

Proposal: keep the brief's pipeline as pure functions exactly as specified, and add one
layer it does not have — `src/call/` — a mid-call turn state machine that Vaani calls per
turn and that invokes those pure functions. The pipeline stays testable in isolation; the
real-time concern lives in one place. `handoff → log` runs after the call ends.

Whether Vaani Labs can call a webhook per turn and wait for a structured reply, and what
its latency budget is, is `[verify]` with Vaani. If it cannot, the one-question rule and
in-call booking both have to change, and I would rather find that out in Phase 1 than
Phase 5. I have not verified any Vaani capability and will not assume one.

### 0.3 The budget criterion cannot be implemented from `pricing.md`

Criterion 4 turns on a caller's number being *"clearly below what any project of their
described scope would cost"*. The only figures that could decide that live in `pricing.md`,
which §2.1 restricts to **tests only**.

So the runtime check needs its own threshold table in `config/budget-floor.ts` — a
scope→floor map Nikhil signs off — and `pricing.md` stays test-only as specified. I will
not derive the floor from `pricing.md` at runtime; that would put quotable figures in the
request path. Open decision D20 below.

### 0.4 Repo location — RESOLVED 10 Oct 2026

Repo root is this folder: `...\Desktop\Term 1\Nikhil_Interior Designer`. It was added to
the session as a working directory and is now the primary one. The earlier recommendation
of an `aangan-studio/` subfolder is dropped in favour of this.

`context/` has been created and populated from the supplied files — `services.md`,
`pricing.md`, `qualified.md`, `components-map.svg`, and `enquiries/` holding the September
PDF plus a text extraction of it. No git repository exists here yet; `git init`, the
`.gitignore` (excluding the source zip and `stack.jpeg`) and the GitHub remote are Phase 1.

D25 is closed.

---

## 1. Digest

### 1.1 What Aangan does (`services.md`)

End-to-end interior design — design **and** execution — for residential and small
commercial spaces in Pune city and PCMC.

In scope: space planning; material selection; furniture design and curation; lighting;
kitchen and wardrobe design; execution supervision with their own contractors.
Residential: apartments, houses, villas — full home (2BHK up), a full floor, 2+ rooms, or
a single room, always *with execution*. Commercial: offices, clinics, studios to ~3,000 sq ft.

Out of scope, explicitly: architecture and structural work (no wall-moving, no permits);
decor or styling advice only; standalone furniture sourcing; standalone Vastu consultation;
restaurants, hotels, retail, gyms; anywhere outside Pune/PCMC (Talegaon, Lonavala, Nashik,
Mumbai named).

Timelines: design 3–4 weeks from first consultation; execution 8–16 weeks; *"we cannot
begin execution on a project that needs to be ready in under 6 weeks from today."*

### 1.2 The five criteria, verbatim from `qualified.md`

Gate framing, verbatim: *"An enquiry reaches a designer when it passes all five criteria
below. If any one is unclear, ask one direct question. If it fails one, close gracefully —
don't forward an incomplete lead."*

**1. Real project — not just advice**
*"The person wants design and execution, not a consultation or a second opinion. Red flags:
"just looking for ideas," "can you come and advise," "I'll do the execution myself." Our
minimum engagement is a room redesign with full execution."*

**2. In our service area**
*"Pune city or PCMC. If the site is in Talegaon, Nashik, Mumbai, or anywhere outside our
area — decline politely. We don't have the vendor network outside Pune."*

**3. Realistic timeline**
*"The site must be available for execution within 8–10 weeks of the consultation. If someone
needs it done in 3 weeks, we cannot serve them well. Ask: "When would you need the project
complete?" — if the answer makes execution impossible, say so honestly."*

**4. Right budget band (broadly)**
*"Don't quote. Don't probe. But if a caller volunteers a number that is clearly below what
any project of their described scope would cost — for example, ₹1–1.5 lakh for a full flat
redesign — address the misalignment on the call. It's kinder than discovering it at
consultation. If budget is not mentioned, treat as qualified."*

**5. Decision-maker on the call (or represented)**
*"The person should be the one who decides, or calling on behalf of someone who has
authorised them to move forward. "My spouse wants to do this but they're not available" is
fine if the caller confirms they're authorised. "I'm just doing initial research for my
in-laws" is not sufficient on its own."*

Boundary rules, verbatim: *"Unclear on 1, 2, or 3: ask one direct question. Unclear on 4 or
5: do not push. Treat as qualified and note the uncertainty in the handoff note. Two or more
criteria fail: decline gracefully."*

Does **not** disqualify, verbatim: not knowing exactly what they want; calling outside
office hours; asking for pricing; uncertainty about materials, style or layout; a single
room project; a rented apartment with no structural changes.

### 1.3 The approved price sentence

`pricing.md` already supplies one, verbatim: *"Pricing depends on the site, the materials
you choose, and the scope — your designer will walk you through it in detail at the
consultation. I can book that for you right now if you'd like."*

I will put exactly this in `config/approved-phrases.ts` marked `NEEDS_NIKHIL_APPROVAL`,
rather than drafting a new one. It is his wording, and T02/T13 show the desk already
paraphrasing it successfully.

---

## 2. All 40 records assessed against the five criteria

`P` pass · `U` unclear · `F` fail. Outcome vocabulary from §5.4.
Phone records (T01–T20) become test fixtures. W and F records are **language examples only**
— phone is the only MVP channel — and are assessed here to find criteria edge cases, not to
be built against.

### 2.1 Phone — the 20 fixtures

| ID | 1 | 2 | 3 | 4 | 5 | scope_class | Proposed outcome | Evidence / why |
|---|---|---|---|---|---|---|---|---|
| T01 | P | P | P | P | P | full_home | **book** | *"redo the whole thing"*; Kothrud; *"done by March"*; *"myself and my husband... happy to go ahead"* |
| T02 | P | P | P | P | U→P | full_home | **book**, note DM | *"Full redesign"*; Wakad; Nov move / Oct design; price asked twice → approved sentence. Never says who decides; an unclear criterion 5 is forwarded per the boundary rule |
| T03 | P | **F** | — | — | — | out_of_service | **decline** | *"I'm in Nashik"*; `services.md` names Nashik as excluded |
| T04 | **F** | P | U | P | U | advice_only | **decline** | *"Just want suggestions on colours, furniture arrangement"*; *"we're just exploring"* — criterion 1's exact red flag |
| T05 | P | P | P | P | P | full_home | **book**, high priority | 4BHK Koregaon Park 2,400 sq ft; *"We've already moved out"*; February; referral via Nikhil's friend |
| T06 | P | P | P | P | P | commercial | **book** | 800 sq ft Baner, bare shell, under the ~3,000 cap; *"I'm the founder"* |
| T07 | P | P | **F**→P | P | U | partial | **ask_one → park** | *"before Diwali... about three weeks"* fails criterion 3; caller then offers *"start after Diwali"*, which passes, but ends *"Let me think and call back"* — no commitment. Fixture for the re-score path and for park-on-no-commitment |
| T08 | — | — | — | — | — | n/a | **park** (structural) | Missed call, 10:47pm, no voicemail, no transcript. Under the new system Vaani answers this at ring 4 — this record is the T24 fixture, not a qualification fixture |
| T09 | — | — | — | — | — | n/a | **complaint** → front desk | *"My project has been going for three months and my designer hasn't replied in five days"*. Existing client. Caller demands Nikhil — see C7 |
| T10 | P | P | P | **F** | P | partial | **decline** | *"My budget is 1 to 1.5 lakh maximum"* for kitchen + bedroom — criterion 4's own worked example |
| T11 | P | P | **U** | P | P | partial | **ask_one → book** | *"design the living room, bedroom, and kitchen -- no structural changes"*; rented with landlord consent (explicitly not disqualifying); **no timeline stated anywhere** → one question, then book |
| T12 | P | P | P | P | P | full_home | **book**, high priority | 5,500 sq ft villa Kalyani Nagar; *"New construction... Completely empty"*; *"March next year"*; named decision-maker |
| T13 | P | P | **U** | P | U | partial | **ask_one → book** borderline | Aundh 3BHK; kitchen + wardrobes + living; price pressed twice → approved sentence; no timeline, no DM stated. One question on timeline; the unclear 5 is forwarded with a note |
| T14 | P | P | U | P | **U** | full_home | **book** borderline — *contested* | *"I'm doing the initial checking"* is criterion 5's stated red flag; but *"Yes, they would come"* and *"Decision with parents"*. The boundary rule says forward an unclear 5. Needs your ruling — C6 |
| T15 | P | P | P | P | P | full_home | **book** | Undri 2BHK 875 sq ft; possession in six weeks, site accessible now; *"He said to go ahead and book"* |
| T16 | U | P | U | P | U | unclear | **review** — *contested* | Repeat caller, lead lost: *"It's been two days"*, *"not a good sign if you forget"*. Three unclear criteria exceed `MAX_UNCLEAR_FORWARD=1` → park, which is the wrong answer for a hot frustrated lead the desk booked on the spot. See F1 |
| T17 | P | P | P | P | U | full_home | **book** borderline | Two calls two minutes apart, first dropped. Pimple Saudagar 3BHK 1,050 sq ft; *"Ideally done by March"*; *"We"* but no explicit DM. Fixture for T09 dedupe: one client, two calls |
| T18 | P | P | U | P | P | commercial_below_min | **review** — *contested* | *"a 180 sq ft pod"*. The desk declined citing a 500 sq ft minimum that appears in **no** context file. With no documented rule the agent must not decline — C2 / D2 |
| T19 | P | P | P | P | P | out_of_service | **decline** | *"open a restaurant"*; `services.md` excludes restaurants and hospitality |
| T20 | P | P | P | P | P | full_home | **book** | Magarpatta 2BHK 900 sq ft; *"January start"*; *"my husband and I. We both want to be at the consultation"* |

Totals: book 10, book-borderline 3 (T13, T14, T17), decline 4, ask_one-then-park 1,
complaint 1, review 2, structural 1.

### 2.2 WhatsApp — language examples only (not built)

| ID | Criteria | Would be | Why it matters |
|---|---|---|---|
| W01 | all P | book, high | Referral, 4BHK Viman Nagar 1,800 sq ft. Lost ~17 hours to after-hours silence — the exact gap Vaani closes |
| W02 | all U | park | *"how much do you charge per sq ft"* and nothing else. Price-only enquiry with no project data |
| W03 | all P | book | Hindi throughout: *"Interior design karwana hai poora ghar."* Direct evidence for D14 — the agent will meet Hindi and Marathi |
| W04 | all P | book | Commercial Chinchwad 1,200 sq ft bare shell, January |
| W05 | 1,3,5 U | park | 2BHK Baner, no detail, two follow-ups ignored. Lead lost |
| W06 | all P | book | Referral, 3BHK Koregaon Park, possession 15 Oct |
| W07 | out_of_service | decline | *"opening a gym"* — `services.md` excludes gyms |
| W08 | all P | book + service_failure | *"I messaged 4 days ago... Is anyone monitoring this number?"* Second instance of a **pre-sale response failure**, which is not a project complaint and has no class in the brief |
| W09 | all P | book | Living + dining + maybe kitchen, Aundh; *"Full execution"* confirmed only after being asked. Tests the advice-vs-execution question |
| W10 | 1 U/F | park | *"still early stage -- just exploring"* — borderline against criterion 1 |

### 2.3 Web form — language examples only (not built)

| ID | Criteria | Would be | Why it matters |
|---|---|---|---|
| F01 | all P | book | Clean full-home lead, both decision-makers attending |
| F02 | 3 U | ask_one → book | *"No specific deadline"* — the absence of a deadline is not a timeline failure, but the engine must not read null as fail |
| F03 | 2 **F** | decline | *"Talegaon Dabhade, near Pune"* — named exclusion; *"wanted to check if you can still take up"* |
| F04 | all U | park / callback | *"I want to know the cost"*, *"Budget: reasonable"*, *"please call me"*. Near-zero data. Tests the no-data path |
| F05 | all P | book, highest | Commercial Hinjewadi 2,200 sq ft, Jan 15, ₹60–80 lakh volunteered, CEO referral, ops head calling. Budget well above any floor → criterion 4 pass |
| F06 | 4 **borderline P** | book | ₹35–40 lakh for 1,950 sq ft, *"Not flexible upward"*. Not *clearly* below → pass. The case that proves criterion 4 needs a configurable floor, not a judgement |
| F07 | all U | decline / park | *"just wanted to know your per sq ft rate... email me the price list"*, no phone number. Tests both the price guard and D16 (no phone = no unique ID) |
| F08 | 3 **F**, 4 **F** | decline | *"3 weeks maximum"*, *"4-5 lakh"*. The only record where **two** criteria fail — the sole case matching `qualified.md`'s "two or more" rule |
| F09 | all P | book | Full home Kondhwa, March 2027, builder referral, *"Ready to book"* |
| F10 | all P | book | Aundh 1,300 sq ft, immediate start, ₹18–22 lakh |

---

## 3. Conflicts, gaps and findings

### Conflicts inside the context files

**C1. One fail or two? — RULED 10 Oct 2026, against my recommendation**
`qualified.md` says both *"If it fails one, close gracefully"* and *"Two or more criteria
fail: decline gracefully"*. Ruling: **`GATE_FAIL_THRESHOLD = 2`** — two or more gate fails
decline; a single gate fail goes to **front-desk review**.

I recommended 1, because your brief's §5.4 says *"any gate criterion = fail ... decline"*
and because the desk declined T03, T04 and T10 on one fail each. The ruling overrides both.
Recorded here so the reasoning is not lost: the cost is front-desk volume, the benefit is
that no lead is auto-declined on a single criterion.

**Consequence, and it is narrower than it sounds.** Out-of-service is assessed separately
from the five criteria (§5.4, C11), and it declines on its own regardless of the threshold.
So of the four phone declines in §2.1:

- T03 (Nashik) and T19 (restaurant) still **decline** — `out_of_service` by `services.md`.
- T04 (*"just want suggestions on colours"*) still **declines** if `advice_only` is treated
  as an out-of-service class, which `services.md` supports: *"Decor and styling only ... we
  are not the right fit."* → D26.
- T10 (₹1–1.5 lakh volunteered) moves from decline to **front-desk review**. This is the
  real change, and it is the one the ruling was probably aimed at.

The live effect, then: a lone fail on criterion 3, 4 or 5 reaches a human instead of being
declined by the agent. A lone fail on 1 or 2 usually also trips an out-of-service rule and
still declines. T03, T04, T10 and T19 all stay as written in §2.1 **except T10**, which
becomes `review`.

**C2. The commercial minimum does not exist in writing [Certain]** T18: *"Our commercial
projects are typically 500 sq ft or more."* `services.md` states only the ~3,000 sq ft
ceiling. An agent built from the context files cannot decline T18. Default: `review` to the
front desk. → D2.

**C3. Two different timeline clocks [Certain]** `services.md`: cannot begin execution on a
project that must be *ready* in under 6 weeks. `qualified.md`: the *site* must be available
for execution within 8–10 weeks of the consultation. These measure different things and can
disagree — T15 (possession in six weeks, site accessible now) passes one reading and strains
the other. One rule needed. → D1.

**C4. Criterion 4 asks for three different responses [Certain]** *"address the misalignment
on the call"*, then *"do not forward"*, then the boundary rule *"Unclear on 4 or 5... Treat
as qualified"*. T10 shows the real answer: a volunteered, clearly-low number is a **fail**,
handled kindly on the call. Implementing that reading — but under the C1 ruling a lone
budget fail now routes to front-desk review rather than a decline, so the kind handling on
the call has to stop short of closing the lead.

**C5. The floor has no number.** See §0.3. → D20.

**C6. T14 is criterion 5 arguing with itself [Certain]** *"I'm just doing initial research
for my in-laws"* is named insufficient; T14 is almost exactly that, except the owners will
attend. The boundary rule then says forward it. Needs a rule: does "the owner attends the
consultation" convert an unclear 5 into a pass? → D21.

**C7. Complaints and Nikhil [Certain]** T09: *"I want it from Nikhil or a senior person."*
Non-negotiable 7 and map box 21 route complaints to the front desk; Nikhil is never paged
and sees a count only. The system will therefore promise less than T09's caller demanded.
Defensible, but it is a deliberate product choice, not an oversight — confirm.

**C8. Two complaint classes, one slot [Certain]** T09 is an existing-project complaint.
T16 and W08 are *pre-sale response failures* from people who are still prospects. Routing
them to the complaint queue loses a live lead; routing them as new enquiries loses the
apology. Proposal: a second class `service_failure` — front-desk queue, high priority,
same-day callback, lead still created. → D22.

**C9. "Narrow scope" is never defined [Certain]** Your §5.4 says *"kitchen-only,
wardrobe-only, and similar"* → review; `qualified.md` says a single room with full execution
is fine → book. T10 is kitchen + one bedroom; W09 is living + dining + maybe kitchen.
`services.md`'s own line — *"a full floor, or 2+ rooms"* — suggests the real boundary is
room count, not room type. The list has to come from you, as data in `config/scope.ts`. → D23.

**C10. The locality list is incomplete, and a false decline is unrecoverable [Certain]**
`services.md` enumerates areas "and adjoining areas". Kharadi (T10) and Nanded City (T08)
appear in the transcripts and in neither list. Hinjewadi is listed. An unlisted Pune
locality must score **unclear**, never fail — a wrong decline on criterion 2 is a lost
project with no human in the loop. Data table, plus explicit exclusions, plus an unclear
default.

**C11. Out-of-service is broader than criterion 2.** `services.md` excludes whole *kinds*
of work — architecture, structural change, Vastu-only, standalone furniture, retail,
hospitality, gyms. T19 and W07 fail on type, not geography. These belong in `scope_class =
out_of_service`, assessed separately from the five criteria, exactly as your §5.4 has it.

### Findings worth acting on

**F1. `MAX_UNCLEAR_FORWARD = 1` parks your hottest lead.** T16 is a repeat caller whose
first enquiry was lost — frustrated, ready to book — and carries three unclear criteria. The
default rule parks him until the next working day; the desk booked him immediately and was
right to. Proposal: repeat callers and `service_failure` cases are never parked — one
question, then forward, or a same-day front-desk callback. → D22.

**F2. Price-only enquiries are a distinct intent.** W02, F04, F07 and the openings of T02
and T13 all lead with price. The approved sentence plus an immediate booking offer is the
whole answer, and T02/T13 show it converts after a second refusal. Worth its own
`intent = price_enquiry` so the dashboard can count how often it converts.

**F3. Ten of twenty phone records are clean books.** The other half need a human, a question
or a ruling, and the front desk's judgement diverges from my reading of the criteria on
three records (T16, T18, arguably T07). That divergence rate is the honest argument for the
front-desk review queue being real work, not a safety valve.

**F4. The transcript goes to Google.** Extraction requires sending the call transcript to
Gemini Flash. Gemini is in the approved stack, so this is inside your privacy rule — but
combined with D13 (recording consent under Indian law) it needs wording the caller hears.
`[verify with Nikhil and counsel]`.

### Unverifiable or unsupplied

- `qualification-logic.md`, `criteria-extra.md`, `acceptance-tests.md` — missing. The engine
  is built criteria-as-data so the extras drop in without pipeline change (§5.3).
- Duty rota, 14 designers, calendars, Telegram bindings, holidays — missing. Phase 1 seeds
  mocks; real data in Phase 7.
- Vaani Labs: per-turn webhooks, latency, conditional forwarding on 4 rings, ring-to-seconds
  mapping, language support — all `[verify]`, none assumed. §0.2 depends on this.
- HubSpot free-tier webhooks and custom-property limits — `[verify]`; polling planned as the
  fallback.
- Vercel cron frequency on the relevant plan — `[verify]`. If it cannot run every few
  minutes, the 30-working-minute acknowledgement clock needs Supabase `pg_cron` or an
  external pinger. I will propose Supabase, with reasons, in Phase 3.
- Whether 4 rings is enough for a two-person desk to reach the phone — D19, measurable only
  after go-live.

### Open decisions

Your D1–D19 stand as written. Added:

- **D20** Scope→budget-floor table for criterion 4 (`config/budget-floor.ts`), since
  `pricing.md` is test-only.
- **D21** Does "the owner will attend the consultation" convert an unclear criterion 5 to
  pass? (T14)
- **D22** `service_failure` as a class: queue, priority, never-park rule. (T16, W08)
- **D23** The narrow-scope list, as data. (C9)
- ~~**D24** Confirm `GATE_FAIL_THRESHOLD`.~~ — closed 10 Oct 2026: **2**, see C1.
- **D26** Does `advice_only` decline as an out-of-service class, independently of the
  gate threshold? Default yes, per `services.md`. If no, every *"just exploring"* caller
  (T04, W10, and a good share of W02/F04/F07) lands in the front-desk queue. (C1)
- ~~**D25** Repo path and directory access.~~ — closed 10 Oct 2026, see §0.4.

---

## 4. Architecture

Stack as specified — TypeScript, Next.js on Vercel, Supabase, Zod, Vitest, GitHub Actions —
with no substitutions. Two reservations, stated rather than acted on: Vercel cron frequency
(above), and the possibility that Vaani runs its own turn-level model, in which case Gemini
Flash's in-call role may be partly duplicated and should shrink to extraction and the notes.

```
aangan-studio/
  context/              services.md pricing.md qualified.md enquiries/ components-map.svg
  config/               criteria.ts scope.ts budget-floor.ts rota.ts priority.ts
                        approved-phrases.ts open-decisions.ts settings-schema.ts
  src/
    types/              Enquiry (channel-agnostic) Channel Lead Criterion Outcome Call
    adapters/           voice/ llm/ calendar/ crm/ notify/ email/ store/
                          each: index.ts (interface) real.ts mock.ts   mock is default
    pipeline/           ingest loadContext extract score decide assign offerSlots
                        book handoff log        pure functions, no I/O
    call/               turn state machine — the in-call orchestration layer (§0.2)
    state/              lead state machine; illegal transitions throw
    settings/           Supabase-backed runtime settings, Zod-validated, cached, audited
    jobs/               working-minute clock, acknowledgement and escalation chain
  app/                  Next.js: /api/webhooks/* (voice telegram calendar hubspot)
                        /dashboard (Nikhil, read-only)  /admin (settings, role-gated)
  tests/
    fixtures/           T01..T20 as typed fixtures, expected outcome per row
    unit/ integration/ acceptance/     acceptance mirrors T01..T29, one file per test
  supabase/migrations/
  .github/workflows/ci.yml
  OPEN_DECISIONS.md README.md RUNBOOK.md EXTENDING.md CLAUDE.md .env.example
```

Load-bearing choices: criteria, scope classes, budget floors and localities are **data**, so
D20–D23 become edits, not rewrites. The model never emits an outcome — only fields, evidence
quotes and per-criterion results, Zod-validated, with every `evidence_quote` checked as a
literal substring of the transcript before it counts. One retry, then `review`. Outcome,
priority, assignment, routing and escalation are plain functions with a test per rule row.
Every adapter ships mock-first; the full pipeline runs with zero credentials.

## 5. Phases

Your §10 phase list, unchanged, with one addition: the `src/call/` turn machine and the
Vaani per-turn `[verify]` move **into Phase 1** rather than Phase 5, because if Vaani cannot
support it the whole in-call design changes, and I would rather know that in week one.

Checkpoint after each phase: REASONING block, what was built, real test output, anything
`[Guessing]`, decisions needed. Small commits, one PR per phase, CI green before the ask.
Phase 1 does not start until §0 is answered.

## 6. Test strategy

- **Fixtures.** T01–T20 as typed fixtures with the expected outcome from §2.1. The three
  contested rows (T14, T16, T18) are marked `pending-ruling` and will fail loudly until you
  decide, rather than being quietly encoded to my reading.
- **Traceability.** One file per acceptance test, named T01–T29, each asserting the brief's
  wording. A table in CI output maps test → requirement → result.
- **Price guard.** Every figure and range in `pricing.md` extracted by regex and asserted
  absent from every outbound surface — voice lines, Telegram, calendar, HubSpot, email,
  handoff note. This is the one place `pricing.md` is read.
- **Privacy.** Log-capture assertions: no transcript fragment and no secret in any log line
  (T18). Role-matrix tests for every cell in §7's table (T15, T16).
- **Determinism.** Same inputs → same designer, and Nikhil never a backup, asserted over the
  seeded rota (T10).
- **Adversarial.** Fabricated evidence quote → downgrade to unclear (T04). Invalid JSON →
  one retry → review (T05). Webhook replay → no duplicate (T17). Double-booking race (T12).
- **No live third-party calls in CI.** Mocks only; real adapters smoke-tested by hand in
  Phase 7, after credentials.

---

## Done | Tested | Broken | Next | Decisions needed

**Rulings so far** — §0.1 pricing: guard, no figures ever. §0.4 repo: this folder.
C1 / D24: `GATE_FAIL_THRESHOLD = 2`, one fail goes to review.

**Done** — Context read in full. 40 records assessed with evidence. 11 conflicts, 4 findings,
6 new open decisions, architecture, repo layout, phases, test strategy.
**Tested** — Nothing. No code exists. No claim here has been run.
**Broken** — Nothing built to break. Three qualification rows have no defensible answer from
the context files and are blocked on your ruling.
**Next** — Phase 1, after approval: repo, types, Zod schemas, state machine, config, mock
adapters, Supabase migrations, CI, and the Vaani per-turn verification.
**Decisions needed** — D26 (new, from the C1 ruling) · D20 budget floor · D21 T14 decision-maker · D22 `service_failure` · D23 narrow-scope list.
The rest of D1–D19 can run on defaults for now; these cannot.
