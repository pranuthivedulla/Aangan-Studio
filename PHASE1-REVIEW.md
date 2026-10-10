# Phase 1 review — 10 Oct 2026

Self-review of commit `0d21d25` against the brief's §10 phase scope, §11
acceptance tests and `PHASE0-PLAN.md`. Eleven defects found and confirmed by
running code, not by reading it. None are fixed; this is the review, not the fix.

## Checks, as run

```
npm run check
  tsc --noEmit    clean
  eslint .        clean
  vitest run      132 passed (7 files)
```

Working tree clean, nothing uncommitted. The audit probes below were written as
throwaway tests, run, and deleted — they are not in the suite and not committed.

## Acceptance tests: 5 pass, 9 partial, 15 not tested

Phase 1 was never meant to satisfy most of these. What matters is which gaps are
**Phase 1's own responsibility** and which are correctly deferred. Two are mine.

| | Test | State | Note |
|---|---|---|---|
| T01 | No price figure in outbound text | **partial** | Sweeps the two config phrases. **Bypassable at runtime — see S1.** Other surfaces don't exist yet |
| T02 | Price question → approved sentence | **pass** | Verbatim from `pricing.md`, offers booking, flagged for approval |
| T03 | Every gate fail → decline, never book | **not tested** | **Contradicted by the D24 ruling — see C0** |
| T04 | Fabricated quote → unclear | **pass** | 11 assertions, incl. a fabricated `fail` and a quoteless `pass` |
| T05 | Invalid JSON → one retry → review | **partial** | Rejection tested five ways. The retry-once-then-review *loop* does not exist |
| T06 | `ask_one` asks exactly one question | not tested | Phase 2 |
| T07 | Narrow scope → review | **partial** | Routing asserted; nothing classifies into `narrow_scope` (D23) |
| T08 | Complaint → front desk, not Nikhil | not tested | Phase 2 |
| T09 | Same number twice → one client, two calls | **partial** | Upsert dedupe tested; the "two calls" side isn't modelled |
| T10 | Deterministic assignment, backup never Nikhil | **partial** | Rota data asserted five ways; `assign()` does not exist |
| T11 | No free slot → graceful path | not tested | Phase 3 |
| T12 | Double-booking prevented | **partial** | Adapter returns null on a stolen slot; no pipeline re-check |
| T13 | After-hours clock starts at next opening | not tested | Phase 3. No `workingMinutes()` yet |
| T14 | 30-min escalation, Nikhil never paged | not tested | Phase 3 |
| T15 | Handoff note absent from Telegram/desk/Nikhil | not tested | Phase 4 |
| T16 | Role write permissions | **pass (write side)** | Four assertions. **Read side not modelled at all** |
| T17 | Webhook replays create no duplicates | **partial** | Notify, email and store keys tested; no webhook handler exists |
| T18 | No transcript or secret in logs | **not tested** | **Phase 1's job. Only `no-console` guards it — see S3** |
| T19 | Whole pipeline runs with mocks, no credentials | **partial** | Adapters proven; there is no pipeline to run |
| T20 | Dashboard cost = sum of logged costs | not tested | Phase 6. `totalCostPaise()` exists, unexercised |
| T21 | Resend fallback carries no full note | not tested | Phase 4 |
| T22 | Dashboard reads only via adapters | not tested | Phase 6 |
| T23 | Calendar provider swap | **pass** | Three providers satisfy the interface |
| T24 | Ring behaviour at 03:00 and 14:00 | not tested | Phase 5, and gated on D27 |
| T25 | One unclear → borderline, named first | not tested | Phase 2 |
| T26 | Bias never forwards a fail/complaint/narrow | not tested | Phase 2 |
| T27 | `MAX_UNCLEAR_FORWARD` is config | **partial** | Setting exists and validates; no routing to change |
| T28 | Human-vs-Vaani answering, borderline conversion | not tested | Phase 6 |
| T29 | Runtime settings, rejection, audit | **pass** | 14 assertions incl. cache invalidation and a rejected write |

**T18 is the one I should have covered and did not.** Transcripts are
non-negotiable 8, Phase 1 built the types that carry them, and the only
protection shipped is an eslint rule that stops `console.log` and nothing else.

## C0 — The D24 ruling contradicts acceptance test T03

Your brief's T03 reads: *"Every gate criterion `fail` → `decline`, never `book`."*
The ruling of this morning sets `GATE_FAIL_THRESHOLD = 2`, so a single gate fail
goes to front-desk review. **T03 as written is now unsatisfiable** — not because
of a bug, but because the rule changed under it.

One of the two has to move. T03's real intent is probably "a gate fail never
*books*", which the ruling preserves — a single fail goes to review, never to a
designer. If that reading is right, T03 should be reworded to "never `book`"
rather than "→ `decline`", and I'll encode it that way in Phase 2. **Your call;
I am not quietly reinterpreting your acceptance criteria.**

## Correctness defects — 11, all confirmed by running code

**C1. The model cannot express three of the nine scope classes.** The Zod enum
in `src/schemas/extraction.ts` takes `scope_class` straight from your brief §5.1:
`full_home | single_room | narrow_scope | commercial | out_of_service | unclear`.
`ScopeClass` in `src/types` has three more: `partial`, `advice_only`,
`commercial_below_min`.

Consequences, both real:
- **This morning's D26 ruling is unimplementable as wired.** `advice_only` is how
  T04 declines. The model has no way to say it, so T04 would land as
  `out_of_service` or `unclear` instead.
- **Five fixtures expect `partial`** (T07, T10, T11, T13, and W09-style cases).
  The model cannot emit it.

Fix is a decision, not a patch: either widen the schema past your brief's stated
shape, or derive the extra classes in code from `scope` + `area_sqft`. I'd derive
them in code — it keeps the model's vocabulary small and keeps the classification
deterministic — but it changes §5.1, so it needs your nod.

**C2. Same bug, intents.** The schema allows `new_enquiry | existing_client |
complaint | other`. `Intent` adds `service_failure` and `price_enquiry`. So D22 —
the class I proposed for T16 and W08 — cannot be produced by the model either,
and finding F2 (price-only enquiries) has nowhere to land.

**C3. Evidence can be attributed to the wrong speaker.** `verifyEvidence` checks
a quote is *somewhere in the transcript*. It does not check **who said it**. A
front-desk line passes as caller evidence:

```
quote: "That works well. Shall I set up a consultation?"   ← the front desk
result: pass, downgradedForBadEvidence: false
```

This matters more than it looks. The criteria are about what the *caller* wants;
a model that cites the studio's own words has fabricated a judgement while
passing the anti-fabrication check. In the live product the agent is one of the
two speakers, so this is the agent citing itself.

**C4. Dash normalisation rejects legitimate quotes.** The normaliser maps every
dash in U+2010–U+2015 to a single hyphen. The UTF-8 transcript uses em dashes;
the earlier cp1252 extraction rendered them `--`. So:

```
"We move in November — so maybe..."    accepted
"We move in November -- so maybe..."   REJECTED  ← same sentence
"We move in November - so maybe..."    accepted
```

A model that renders an em dash as `--` has its evidence silently thrown away and
the criterion downgraded to `unclear`. That is a false negative on the core
mechanism: leads pushed to review or borderline for a punctuation mismatch. It is
also a sign the whole normaliser needs a property test rather than examples.

**C5. Duplicate and unknown criterion ids are accepted.** `parseExtraction`
happily takes `real_project` twice plus `not_a_criterion`. Nothing cross-checks
the ids against `CRITERIA`, so a model that renames a criterion gets a free
verdict, and a duplicate means the last one silently wins downstream.

**C6. The schema accepts fewer than five criteria.** `min(1)`. A model returning
one judgement passes validation; the gate would then be computed over a single
criterion. Should be exactly the configured criteria set, no more, no fewer.

**C7. Locality matching has no word boundaries.** `resolveArea('Banerjee Lane,
Kolkata')` → `in_area`, because "Baner" is a substring. The conservative default
protects against false declines but not against false *accepts*, which send a
designer out of area.

**C8. Settings audit timestamps are the epoch.** `mockStore` writes
`new Date(0).toISOString()`. T29 asserts who, what, from and to — never *when* —
so the test passes over a broken audit trail. §8A requires "who, when, old value,
new value".

**C9. `WORKING_HOURS_END` may precede `WORKING_HOURS_START`.** `19:00 → 10:00`
validates. Every working-minute calculation in Phase 3 would be built on it.

**C10. `ACK_WINDOW_WORKING_MIN` accepts 600** — more than a 9-hour working day,
so an "acknowledge within 30 minutes" guarantee can be set to a value that never
fires in a day. Needs a cross-field bound against working hours.

**C11. `enquiries-extracted.txt` is a committed build artefact.** It sits next to
the PDF that produced it, and I regenerated it mid-session with different
`pdftotext` flags — which changed every dash in the file. Every evidence test
depends on it. It should be produced by a committed script, not by hand, or the
fixtures are not reproducible.

## Security and privacy risks

**S1. The price guard is bypassable at runtime, with no deploy.** This is the
worst finding in the review. `APPROVED_PRICE_SENTENCE` is a `z.string().min(1)`
runtime setting, so:

```
validateSetting('APPROVED_PRICE_SENTENCE',
  'For a 2BHK it is typically Rs 1,800 per sq ft.')  →  ok: true
```

Non-negotiable 1 is defeated by an admin-page edit. The change is audited, which
means we would know afterwards. The content validation that should reject it —
the same sweep T01 runs against `pricing.md` — is not applied on write. §8A says
changes to this sentence need Nikhil's sign-off; nothing in code enforces that
either.

**S2. Database-level ownership is not enforced.** `0001_init.sql` enables RLS on
every table and writes **zero policies**. That fails safe for anon and
authenticated roles, but the app will connect with `SUPABASE_SERVICE_ROLE_KEY`,
which **bypasses RLS entirely**. So the single-writer rule and the visibility
matrix live only in application code — one direct query away from being nothing.
The admin page and the dashboard will need the same key, which widens it further.

**S3. Transcript handling has no abstraction, and T18 is untested.** There is no
logger, no redaction helper, no serialisation boundary. `no-console` catches the
obvious case and nothing else: an exception carrying an `Enquiry` would put a
full transcript into any error reporter, and `JSON.stringify(lead)` is harmless
today only because `Lead` happens not to embed the transcript.

**S4. No consent, and no minimisation, on what reaches Gemini.** The whole
transcript goes to the model. Gemini is in the approved stack so this is inside
your privacy rule, but D13 (recording and consent wording under Indian law) is
unanswered and blocking, and nothing trims the transcript to the fields the
classifier actually needs.

**S5. A foreign project's live credentials sit inside this folder.**
`Desktop/Term 1/Arjun_Hiring Application/kargo-shortlist` — 1.3 GB, its own
`.git`, its own `.env.local`. Git-ignored and eslint-ignored here, and I verified
nothing from it is staged. It is still on disk, inside a OneDrive-synced folder,
and inside the directory this session has write access to. Moving it out is
yours to do, not mine.

**S6. Phone numbers are unvalidated in TypeScript.** `PhoneE164 = string`. The
database has a regex check constraint; the type system has nothing. The unique
client key can be any string until Phase 7.

## Deviations from `PHASE0-PLAN.md`

| | Planned | Actual | Mine or environmental |
|---|---|---|---|
| D1 | `src/call/` turn machine **in Phase 1**, because D27 could reshape the design | Not built. Only the adapter's `orchestration` flag landed | **Mine.** The plan said Phase 1 and I did not do it |
| D2 | Acceptance tests "one file per test, named T01–T29" | Bundled four files covering nine T-numbers | **Mine.** Harder to see coverage at a glance, which is exactly what this review had to reconstruct by hand |
| D3 | "A table in CI output maps test → requirement → result" | Not built | **Mine** |
| D4 | `tests/integration/` | Does not exist | Mine, deferred with the pipeline |
| D5 | `src/adapters/<name>/{index,real,mock}.ts` | One file per adapter | Mine, declared in the code and in the Phase 1 report |
| D6 | `app/`, Next.js, Vercel project with preview deploys (brief §10.1) | None. Next.js not even installed | Declared in the report. Vercel needs credentials; Next.js was my call |
| D7 | GitHub repo, branch protection, one PR per phase | Local `main` only, one commit | Environmental — no `gh`, no remote |
| D8 | — | Two comments reference test files that do not exist: `tests/acceptance/T18-no-transcript-in-logs.test.ts`, `tests/unit/approved-phrase-verbatim.test.ts` | **Mine.** Comments describing protection that isn't there is the worst kind of wrong |

## What I would fix before Phase 2, in this order

1. **S1** — validate the price sentence on write with T01's own sweep. One
   function, and it closes a hole that defeats the first non-negotiable.
2. **C1, C2** — decide where the extra scope classes and intents come from.
   Blocks the D26 and D22 rulings from being implementable at all.
3. **C3, C4, C5, C6** — harden `verifyEvidence`: speaker attribution, dash
   handling, id cross-check against `CRITERIA`, exact criteria count. This is the
   anti-fabrication mechanism; it should be the most paranoid code in the repo.
4. **T18 + S3** — a logging boundary and a test that proves a transcript cannot
   reach it. Then delete the comment that claims the test exists.
5. **C0** — your ruling on T03's wording.
6. **C8, C9, C10** — audit timestamp and the two cross-field settings bounds.
7. **S2** — write RLS policies, or decide explicitly that ownership is
   app-enforced and record that as an open decision.

**C7, C11, S6 and the plan deviations** I would carry into Phase 2 rather than
stop for.

---

# Resolution — 10 Oct 2026, same day

Approved by the founder's office: reword promise T03, and fix the four Phase 1
debts before starting the judge. Done, in commit two of this phase.

**Fixed, and proven by re-running the original probes — six of the ten now fail,
which is what "the hole is closed" looks like:**

| | Was | Now |
|---|---|---|
| **S1** | A price figure could be typed into the admin page, no deploy, no review | `config/price-language.ts` is one shared verdict used by the settings schema AND the acceptance sweep, so the admin page and the test suite can never disagree. Digits, currency markers and rate language all refused. 27 assertions, including ten phrasings that are now rejected and four legitimate rewordings that still pass |
| **C1, C2** | The model had no word for `advice_only` or `partial`, or for the `service_failure` / `price_enquiry` intents — so the D26 and D22 rulings were unimplementable and five fixtures unreachable | Vocabulary widened. Declared deviation from brief §5.1, recorded as D29. `commercial_below_min` stays unreachable **by design** until D2 sets a minimum, and a test asserts it is the only one |
| **C3** | A quote the receptionist spoke was accepted as caller evidence — on a live call, the agent quoting itself as proof | Transcripts are split into speaker turns; a quote must sit inside a single **caller** turn. A quote straddling two speakers is refused. A transcript with no speaker labels (T08's missed call) falls back to presence only, so attribution does not become an automatic downgrade |
| **C4** | The same sentence written with `--` instead of an em dash was silently rejected, downgrading a sound criterion | Any run of dashes normalises to one. Four punctuations of the same real quote now all match, and genuinely different words still do not |
| **C5, C6** | Duplicate ids, unknown ids and short criteria sets were all accepted — the gate could be computed over whatever subset the model returned | The set must be exactly the configured five, each once. Enforced in `parseExtraction` by default; only a shape probe may opt out |
| **T18** | Untested. `no-console` was the only guard, and a comment pointed at a test file that did not exist | `src/logging/` is the only way anything logs, redacting by key name before emitting. 23 assertions against the real T01 transcript: whole enquiries, deep nesting, evidence quotes, handoff notes, exceptions carrying a transcript, seven secret shapes, and a default sink that emits nowhere so an unconfigured app cannot leak |
| **C0** | T03 contradicted the D24 ruling | T03 reworded to "a lead with any failed criterion never reaches a designer without a human deciding first". Recorded as D28 |

Checks after the fixes: `tsc` clean, `eslint` clean, **208 tests pass** (was 132).

**Deliberately not fixed, carried forward:**

- **C7** locality matching has no word boundaries — `"Banerjee Lane, Kolkata"`
  still resolves in-area. Phase 2, with the criterion 2 scorer.
- **C8** settings audit timestamps are still the epoch in the mock store. Needs
  a clock injected; Phase 2.
- ~~**C9, C10**~~ **FIXED in Phase 3, 10 Oct 2026.** Cross-field validation
  now rejects a close time at or before the open time, an acknowledgement
  window or escalation delay longer than a working day, and a consultation
  plus buffers that cannot fit in one. Six assertions in
  `tests/acceptance/T13-working-clock.test.ts`.
- **C11** `enquiries-extracted.txt` is still a hand-generated artefact. Should
  be produced by a committed script.
- **S2** RLS policies still unwritten; ownership is app-enforced only.
- **S6** phone numbers still unvalidated in TypeScript.
- The plan deviations D1–D8, including `src/call/` and the one-file-per-test
  layout.

Phase 2 not started. Awaiting approval.
