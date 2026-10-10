# Open decisions

Every business rule that is **not** backed by a file in `/context`, with the safe
default the code actually runs today. Nothing here was silently chosen.

Generated from `config/open-decisions.ts` — edit that file, not this one. Tests
assert every ruled decision records its ruling and every entry states a default.

Status key: **blocking** = a phase stops here · **open** = running on a default ·
**ruled** = settled, kept for the record.

## Blocking — these stop work

| ID | Question | What the code does today | Blocks |
|---|---|---|---|
| **D2** | Commercial minimum size or value. The front desk cited 500 sq ft on T18; no context file states one. | No minimum. Anything below goes to `commercial_below_min` → front-desk review, never an agent decline. | Phase 2 — T18 fixture |
| **D13** | Call-recording and consent wording required by Indian law and Aangan's policy. The transcript is also sent to Gemini. | Nothing. No consent line is spoken, because inventing one would be worse than having none. | Phase 7 — do not take a real call without this |
| **D20** | The scope→budget-floor table for criterion 4. `pricing.md` is test-only, so the floor cannot come from it. | No floors set. Criterion 4 returns pass or unclear, never fail. | Phase 2 — criterion 4 cannot fail anyone |
| **D21** | Does "the owner will attend the consultation" turn an unclear criterion 5 into a pass? T14 is criterion 5's own red flag, except the owners are attending. | Unclear, forwarded with a note, per `qualified.md`'s boundary rule. | Phase 2 — T14 fixture |
| **D22** | `service_failure` as its own class. A pre-sale response failure (T16, W08) is neither a project complaint nor a clean new enquiry. | Class exists; front-desk queue, high priority, never parked. | Phase 2 — T16 fixture |
| **D27** | **Vaani Labs: can the platform call a webhook mid-call and wait for a structured JSON reply?** Box 12 and the one-question rule both need it. | Unknown. The voice adapter declares `per_turn` or `post_call_only` so either answer is buildable. | Phase 5 — and the whole in-call design if the answer is no |

## Open — running on a default

| ID | Question | Default |
|---|---|---|
| D1 | Timeline rule. `services.md` counts weeks to READY; `qualified.md` counts weeks to SITE AVAILABLE. | The site-available clock, 8–10 weeks from consultation, per the rubric Nikhil wrote to decide with. |
| D3 | Priority for front-desk-qualified and borderline leads. | Front-desk-qualified: same scale, no penalty. Borderline: −2, still forwarded. |
| D4 | After-hours complaints. | Wait for opening. Setting `AFTER_HOURS_COMPLAINT_BEHAVIOUR`. |
| D5 | Working days and holidays. | Mon–Sat, 10:00–19:00 IST, no holidays loaded. All runtime settings. |
| D6 | A designer with no Telegram binding. | Resend email, same summary and link, never the full note. |
| D7 | The field-visibility matrix. | The brief's §7 table, enforced in code as written. |
| D8 | Slot window and buffer. | 3 slots, 5 working days ahead, 30-minute buffer, 60-minute consultation. |
| D9 | Repeat-caller window. | 30 days. |
| D10 | Extra criteria (`criteria-extra.md`). | Not supplied. The five only; criteria are data so adding them needs no pipeline change. |
| D11 | The approved price sentence. | `pricing.md`'s own sentence, verbatim, marked `NEEDS_NIKHIL_APPROVAL`. |
| D12 | What "won" means and who records it. | Designer-entered in HubSpot. No definition encoded. |
| D14 | Languages. W03 is entirely in Hindi. | English, with Hindi and Marathi assumed necessary. Vaani claims 40+ `[verify]`. |
| D15 | Vaani or the calendar being down. | Voice agent says a human will call back; lead logged as `park`. |
| D16 | Unique client ID beyond the phone number (shared family numbers; F07 had no phone at all). | E.164 phone only. |
| D17 | Caller asks for a human during desk hours. | Offer a transfer if someone is free, otherwise a booked callback. |
| D18 | `MAX_UNCLEAR_FORWARD`, and a per-designer daily cap on borderline leads. | 1, uncapped. |
| D19 | Is 4 rings enough, and should it differ out of hours? | 4 everywhere. Measurable only after go-live. |
| D23 | The narrow-scope list. `services.md` suggests the real line is room count, not room type. | `narrow_scope` exists and routes to review, but nothing classifies into it yet. |

## Ruled

| ID | Question | Ruling |
|---|---|---|
| D24 | One gate fail or two? | **2**, 10 Oct 2026. A single gate fail goes to front-desk review. Ruled against my recommendation of 1 (the brief's §5.4, and the desk's own behaviour on T03, T04 and T10). Out-of-service scope still declines independently, which is why T03 and T19 are unaffected and T10 moves to review. |
| D25 | Repo path. | This folder, 10 Oct 2026. |
| D26 | Does `advice_only` decline as an out-of-service class, independently of the gate threshold? | **Yes**, 10 Oct 2026. `services.md`'s "Decor and styling only ... we are not the right fit" supports it, and it keeps every "just exploring" caller out of the front-desk queue. |

## Also unresolved, and not a business decision

`[verify]` items with third parties, none of them assumed in code:

- **Vaani Labs** — per-turn webhooks (D27), latency budget, conditional
  forwarding after 4 unanswered rings, how a ring count maps to seconds,
  language coverage. `vaanilabs.in` docs were not reachable on 10 Oct 2026.
- **HubSpot** — free-tier webhook availability and custom-property limits.
  Polling is planned as the fallback.
- **Vercel** — cron frequency on the intended plan. The 30-working-minute
  acknowledgement clock needs minute-level granularity; if cron cannot, the
  clock moves to Supabase `pg_cron` or an external pinger.

## Not supplied

`qualification-logic.md` (the Claude Chat spec, box A), `criteria-extra.md`,
`acceptance-tests.md`, the duty rota, the designer roster, the holiday calendar.
Per the brief's §5.2, the engine proceeds on `qualified.md` alone. `config/rota.ts`
holds clearly-labelled seed data.
