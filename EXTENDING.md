# Extending

## Adding a channel (WhatsApp, the web form, anything else)

WhatsApp and the web form are **out of scope** and not built. The September
records include ten of each, used only as evidence of how callers write — W03 is
entirely in Hindi, W08 is a response-failure complaint, F07 has no phone number
at all. They shaped the types; they are not wired to anything.

The seams that make a new channel cheap:

1. `Channel` in `src/types/index.ts` already has `'whatsapp'` and `'web_form'`
   members, and the Supabase `enquiries.channel` check constraint accepts them.
   No migration needed.
2. `Enquiry` is channel-agnostic: an id, a channel, a timestamp, a caller id, and
   a text blob. A WhatsApp thread and a web-form submission both flatten into
   that `transcript` field. The qualification engine never asks which channel it
   is looking at.
3. Write one ingest function that produces an `Enquiry`. Everything from
   `loadContext` onwards is unchanged.

What will **not** transfer, and needs a decision before you build it:

- **The one-question rule.** On a call, "ask one question" is a turn. On
  WhatsApp it is a message that may be answered in two days, or never — W05 and
  W10 both died that way. The `ask_one` outcome needs a timeout and a parked
  state per channel.
- **In-call booking.** There is no call. The caller gets a link or a slot list,
  which means a held slot, which the phone flow deliberately avoids.
- **The unique client key.** Phone is the key (D16). A web form with no phone
  (F07) has no key, and a WhatsApp number may not match the phone the same
  person calls from.
- **Working hours.** Non-negotiable 11 only answers the *phone* at any hour.
  Whether WhatsApp is answered at 2am is a new decision.

## Swapping a provider

Every integration sits behind an interface in `src/adapters/types.ts` with a
mock in `src/adapters/mocks.ts`. Swapping one means writing a second
implementation of the same interface and selecting it with
`ADAPTER_MODE_<NAME>`. Pipeline code never imports a vendor SDK.

**Calendar** is the one the brief explicitly expects to move: Google Calendar,
Cal.com and Calendly all satisfy `CalendarAdapter`. The `provider` field exists
so a swap is visible in logs and tests — `tests/acceptance/T19-mocks-no-credentials.test.ts`
asserts three different providers satisfy the interface with no pipeline change.

**Store** can move from Supabase to Neon behind `StoreAdapter`. The migration
SQL is plain Postgres with no Supabase-specific features except the RLS
statements at the bottom, which you would drop or rewrite.

**Voice** is the hard one, and not because of the interface. `VoiceAdapter`
declares `orchestration: 'per_turn' | 'post_call_only'`, because whether a
platform can call us mid-call and wait for a structured reply is the thing that
decides whether in-call qualification is possible at all (D27). A platform
without it is not a swap — it is a different product.

## Adding a qualification criterion

Criteria are data, not code (the brief's §5.3). Add an entry to `CRITERIA` in
`config/criteria.ts` with an id, Nikhil's verbatim wording, a role
(`gate` / `rank` / `prep`) and what an `unclear` on it does. The classifier
prompt, the stored scores and the outcome function all read the list.

Two things will fail immediately, on purpose:

- `tests/unit/criteria-verbatim.test.ts` asserts the wording appears verbatim in
  `context/qualified.md`. Add the criterion to that file first.
- The same test asserts there are exactly five. Update the count when the
  founder's office actually supplies `criteria-extra.md` (D10) — not before.

## Adding an outbound surface

Anything the system can say to anyone outside the studio goes in
`OUTBOUND_SURFACES` in `tests/acceptance/T01-no-price-leak.test.ts`. A surface
that is not in that list is not swept for price figures, which is exactly how a
leak happens. The test asserts the list is non-empty and covers every approved
phrase; extend both together.
