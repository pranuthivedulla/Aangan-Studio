/**
 * Every business rule that is NOT backed by a context file, with the safe
 * default the code actually runs (brief §0, §12).
 *
 * Rule: if it is not in /context, it is in here. Nothing is silently chosen.
 * OPEN_DECISIONS.md is generated from this array, so edit this file, not the
 * markdown.
 */

export type DecisionStatus = 'open' | 'ruled' | 'blocking';

export interface OpenDecision {
  readonly id: string;
  readonly question: string;
  /** What the code does today. */
  readonly currentDefault: string;
  readonly status: DecisionStatus;
  /** For a ruled decision: what was decided, by whom, when. */
  readonly ruling?: string;
  /** Which phase stops if this stays open. null = nothing blocked yet. */
  readonly blocks: string | null;
}

export const OPEN_DECISIONS: readonly OpenDecision[] = [
  {
    id: 'D1',
    question: 'Timeline rule for urgent versus long-range leads. services.md counts weeks to READY; qualified.md counts weeks to SITE AVAILABLE. Which clock decides criterion 3?',
    currentDefault: 'Site-available clock, 8–10 weeks from consultation, per qualified.md (the rubric Nikhil wrote to decide with).',
    status: 'open',
    blocks: 'Phase 2 — the criterion 3 scorer',
  },
  {
    id: 'D2',
    question: 'Commercial minimum size or value. The front desk cited 500 sq ft on T18; no context file states one.',
    currentDefault: 'No minimum enforced. Anything under a stated minimum is scope_class commercial_below_min → front-desk review, never an agent decline.',
    status: 'blocking',
    blocks: 'Phase 2 — T18 fixture is pending-ruling',
  },
  {
    id: 'D3',
    question: 'Priority for front-desk-qualified leads and for borderline leads.',
    currentDefault: 'Front-desk-qualified: same scale, no penalty (the brief\'s own proposal). Borderline: −2, still forwarded.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D4',
    question: 'After-hours complaint handling: wait until opening, or auto-reply with a callback time?',
    currentDefault: 'Wait for opening (the brief\'s stated default), as setting AFTER_HOURS_COMPLAINT_BEHAVIOUR.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D5',
    question: 'Working days and holidays for the working-minute clock.',
    currentDefault: 'Mon–Sat, 10:00–19:00 IST, no holidays loaded. Every one is a runtime setting.',
    status: 'open',
    blocks: 'Phase 3 — the escalation clock is only as right as this',
  },
  {
    id: 'D6',
    question: 'A designer with no Telegram binding.',
    currentDefault: 'Resend email with the same summary and link, never the full note (box 25). Setting RESEND_FALLBACK_ENABLED.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D7',
    question: 'The exact field-visibility matrix.',
    currentDefault: 'The brief\'s §7 table, enforced in code as written.',
    status: 'open',
    blocks: 'Phase 4 — role tests encode whatever this says',
  },
  {
    id: 'D8',
    question: 'Slot window and buffer between consultations.',
    currentDefault: '3 slots, 5 working days ahead, 30-minute buffer, 60-minute consultation.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D9',
    question: 'Repeat-caller window.',
    currentDefault: '30 days, as runtime setting REPEAT_CALLER_WINDOW_DAYS.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D10',
    question: 'Extra qualification criteria (criteria-extra.md).',
    currentDefault: 'Not supplied. The five only. Criteria are data, so adding them needs no pipeline change.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D11',
    question: 'The approved price sentence.',
    currentDefault: 'pricing.md\'s own sentence, verbatim, marked NEEDS_NIKHIL_APPROVAL.',
    status: 'open',
    blocks: 'Phase 5 — the caller hears this',
  },
  {
    id: 'D12',
    question: 'What "won" means and who records it.',
    currentDefault: 'Designer-entered in HubSpot; the dashboard reads it. No definition encoded.',
    status: 'open',
    blocks: 'Phase 6 — the funnel\'s last step',
  },
  {
    id: 'D13',
    question: 'Call recording and consent wording required by Indian law and Aangan\'s policy. The transcript is also sent to Gemini.',
    currentDefault: 'None. No consent line is spoken, because inventing one would be worse than having none.',
    status: 'blocking',
    blocks: 'Phase 7 — do not take a real call without this',
  },
  {
    id: 'D14',
    question: 'Languages the voice agent must handle. W03 is entirely in Hindi.',
    currentDefault: 'English, with Hindi and Marathi assumed necessary. Vaani claims 40+ languages [verify].',
    status: 'open',
    blocks: 'Phase 5 — the call flow is written per language',
  },
  {
    id: 'D15',
    question: 'Behaviour when Vaani or the calendar is down.',
    currentDefault: 'Voice agent says a human will call back; lead logged as park.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D16',
    question: 'Fields needed for a unique client ID beyond the phone number (shared family numbers; F07 had no phone at all).',
    currentDefault: 'E.164 phone only, as the brief specifies.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D17',
    question: 'Transfer to a human when a caller asks for one during front-desk hours.',
    currentDefault: 'Offer a transfer if someone is free, otherwise a booked callback.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D18',
    question: 'The exact MAX_UNCLEAR_FORWARD value, and whether borderline leads are capped per designer per day.',
    currentDefault: '1, uncapped.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D19',
    question: 'Is 4 rings enough for a two-person desk to reach the phone, and should the threshold differ out of hours?',
    currentDefault: '4 everywhere. Measurable only after go-live; the dashboard shows human-vs-Vaani answering so it can be judged.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D20',
    question: 'The scope→budget-floor table for criterion 4. pricing.md is test-only, so the floor cannot come from it.',
    currentDefault: 'No floors set. Criterion 4 can return pass or unclear, never fail. T10 is pending-ruling.',
    status: 'blocking',
    blocks: 'Phase 2 — criterion 4 cannot fail anyone until this exists',
  },
  {
    id: 'D21',
    question: 'Does "the owner will attend the consultation" turn an unclear criterion 5 into a pass? T14 is criterion 5\'s own red flag, except the owners are attending.',
    currentDefault: 'Unclear, forwarded with a note, per qualified.md\'s boundary rule. T14 is pending-ruling.',
    status: 'blocking',
    blocks: 'Phase 2 — T14 fixture',
  },
  {
    id: 'D22',
    question: 'service_failure as its own class: a pre-sale response failure (T16, W08) is neither a project complaint nor a clean new enquiry. Queue, priority, and the never-park rule.',
    currentDefault: 'Implemented: intent service_failure routes to front-desk review, never parked (setting NEVER_PARK_REPEAT_OR_SERVICE_FAILURE), and a repeat caller is reviewed rather than parked however much is unclear. T16 decides cleanly on this default.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D23',
    question: 'The narrow-scope list. "kitchen-only, wardrobe-only, and similar" needs enumerating; services.md suggests the real line is room count, not room type.',
    currentDefault: 'narrow_scope exists and routes to review, but nothing classifies into it yet.',
    status: 'open',
    blocks: 'Phase 2 — the scope classifier',
  },
  {
    id: 'D24',
    question: 'GATE_FAIL_THRESHOLD: does one gate fail decline, or two?',
    currentDefault: '2. One gate fail goes to front-desk review.',
    status: 'ruled',
    ruling: 'Ruled 2 by the founder\'s office, 10 Oct 2026, against my recommendation of 1 (brief §5.4 and the desk\'s own behaviour on T03/T04/T10). Out-of-service scope still declines independently.',
    blocks: null,
  },
  {
    id: 'D25',
    question: 'Repo path and directory access.',
    currentDefault: 'This folder is the repo root.',
    status: 'ruled',
    ruling: 'Settled 10 Oct 2026.',
    blocks: null,
  },
  {
    id: 'D26',
    question: 'Does advice_only decline as an out-of-service class, independently of the gate threshold?',
    currentDefault: 'Yes. scope_class advice_only routes to decline.',
    status: 'ruled',
    ruling: 'Ruled yes, 10 Oct 2026. services.md\'s "Decor and styling only ... we are not the right fit" supports it, and it keeps every "just exploring" caller (T04, W10) out of the front-desk queue.',
    blocks: null,
  },
  {
    id: 'D27',
    question: 'Vaani Labs: can the platform call a webhook mid-call and WAIT for a structured JSON reply that drives the next thing the agent says? Box 12 (offer slots, read back) and the one-question rule both need it.',
    currentDefault: 'Unknown. The voice adapter supports both a per-turn mode and a post-call-only mode so either answer is buildable. Docs at vaanilabs.in were not reachable; the public listing claims signed webhooks and REST APIs but documents no in-call tool calling.',
    status: 'blocking',
    blocks: 'Phase 5 — and the whole in-call design if the answer is no',
  },
  {
    id: 'D28',
    question: 'Acceptance test T03 ("every gate fail -> decline") contradicts the D24 ruling that one gate fail goes to front-desk review. Which wins?',
    currentDefault: 'T03 reworded, per the ruling below. The engine implements the D24 threshold.',
    status: 'ruled',
    ruling: 'Ruled 10 Oct 2026: reword T03 to "a lead with any failed criterion never reaches a designer without a human deciding first". The original wording was aimed at stopping bad leads reaching designers, which the review threshold still prevents; only the wording broke.',
    blocks: null,
  },
  {
    id: 'D29',
    question: 'The model vocabulary in brief section 5.1 omits scope classes and intents that the 10 Oct rulings depend on. Widen it, or derive the extra classes in code?',
    currentDefault: 'Widened. The model may now emit partial and advice_only scope classes, and service_failure and price_enquiry intents. commercial_below_min stays derived-only, unreachable until D2.',
    status: 'ruled',
    ruling: 'Ruled 10 Oct 2026. Without advice_only the D26 ruling was unimplementable and five partial-home fixtures unreachable; without the two intents, D22 and finding F2 had nowhere to land. All four are plainly observable in a transcript, so the model is the right place for them. Declared deviation from brief section 5.1.',
    blocks: null,
  },
  {
    id: 'D30',
    question: 'services.md caps commercial work at "up to approximately 3,000 sq ft". What happens at 3,500 — decline, or review?',
    currentDefault: 'Neither. It stays scope_class commercial and is flagged, because "approximately" makes a hard cut wrong and nothing documents where the real line is.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D31',
    question: 'Brief section 5.5 makes priority a function of timeline urgency and source, and neither is observable in the current data model. How should the agent record them?',
    currentDefault: 'Neither is used. Their weights exist in config/priority.ts and are deliberately unread, and prioritise() reports them as unavailable rather than inferring them from transcript keywords.',
    status: 'open',
    blocks: 'Phase 6 - the dashboard cannot show conversion by source until source exists',
  },
  {
    id: 'D32',
    question: "Section 5.6 says the handoff note contains no price figures. May it state a budget the CALLER volunteered, in the caller's own words? T10 said '1 to 1.5 lakh maximum', which is material to whoever meets them.",
    currentDefault: 'Excluded. The note carries no figure at all, per the brief as written, so a designer currently learns a volunteered budget only by opening the transcript.',
    status: 'open',
    blocks: null,
  },
  {
    id: 'D33',
    question:
      'Box 21 of the components map gives the front desk real work — reviewing declines, parks, narrow scope and complaints — and names no tool for it. Do we build them a view?',
    currentDefault:
      'No. Ruled out of scope 11 Oct 2026. The front desk works from the Telegram front-desk chat (brief section 7: one bot, two chats) and the phone, as they do today. Four of the twenty September calls route to them, so this only holds while that Telegram chat exists — without it those leads would be silently dropped, against non-negotiable 7.',
    status: 'ruled',
    ruling:
      'Ruled out of scope by the founder\'s office, 11 Oct 2026. Recorded because the map leaves the front desk a queue with nowhere to work, and the Telegram chat is now load-bearing rather than a convenience: Phase 7 must not treat it as optional.',
    blocks: null,
  },
  {
    id: 'D34',
    question:
      'Should designers log into this app with their own code and see their own leads, with Nikhil able to open each of their views?',
    currentDefault:
      'No. The components map is the specification and it is explicit: boxes 16, 18 and 19 put the designer in HubSpot with a Telegram alert, and box D names the one dashboard as "Nikhil\'s dashboard". There is no login anywhere in the map.',
    status: 'ruled',
    ruling:
      'Raised by the founder\'s office on 10 Oct 2026, then withdrawn on 11 Oct 2026: the build is judged against the submitted map, so where the map is explicit we follow it. Recorded because it was a real proposal and the reasoning for dropping it matters — building designer views here would duplicate HubSpot, move caller personal data into a second system, and give the founder a door into individual leads that the map deliberately withholds.',
    blocks: null,
  },
  {
    id: 'D35',
    question:
      'The map shows no login anywhere, yet box 22 is a dashboard of the studio\'s funnel, queues and costs. Who can open it, and how is that enforced?',
    currentDefault:
      'Nothing. The deployed site is public, so anyone with the URL can read the dashboard. Acceptable while every figure is either case material or empty; not acceptable once real call data flows.',
    status: 'blocking',
    blocks: 'Phase 7 — do not point this at live data while the page is open to anyone',
  },
] as const;

export function decisionById(id: string): OpenDecision {
  const found = OPEN_DECISIONS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown decision id: ${id}`);
  return found;
}

export function blockingDecisions(): readonly OpenDecision[] {
  return OPEN_DECISIONS.filter((d) => d.status === 'blocking');
}
