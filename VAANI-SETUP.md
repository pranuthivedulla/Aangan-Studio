# Setting up the agent in Vaani

Every field value, in the order you'll need them. Keep this open while you click.

Nothing here connects a phone number. That is deliberate and it is the last step,
blocked on one unanswered question — see the end.

---

## Before you start: the secret

Everything below fails with a 401 until this is done.

1. Generate one:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Vercel → project → **Settings → Environment Variables** → add
   `VAANI_TOOL_SECRET` with that value → Save.
3. Vercel → **Deployments** → top entry → **⋯ → Redeploy**. Environment
   variables only apply to a new build; skipping this is the commonest way
   the setup silently does not work.
4. Check it:
   ```
   AANGAN_TOOL_SECRET=<your secret> npm run smoke
   ```
   Ten `ok` lines and "All checks passed." Do not continue until you see them.

You will paste the same secret into Vaani in step 3 below.

---

## 1. Voice Lab — pick a voice

Indian English. Warm, unhurried, not bright and not salesy.

The register to listen for is in your own September transcripts: the front desk
says "Of course", "Lovely", and "I'm sorry" without fuss, and refuses a price
with "I genuinely can't". Someone with time for you. If a voice sounds like it
is selling something, it is the wrong one.

---

## 2. Knowledge Base — one file, and one file you must not add

**Upload:** `context/services.md`

That is what the studio does, what it does not do, and the service area.

**Do NOT upload `context/pricing.md`.** It is an internal rate card. Putting it
in the Knowledge Base hands the agent the exact figures it is forbidden to say,
and every guard in this build assumes the agent cannot know them. This is the
single easiest way to undo the price protection.

**Do NOT upload `context/qualified.md`** either. The qualification rules live in
tested code. An agent carrying its own copy is how the two versions drift apart,
and the untested one is the one the caller hears.

---

## 3. Tools & Actions — three custom tools

**Tools & Actions → New Action → Create Custom Tools/Actions**, three times.

Common to all three:

| Field | Value |
|---|---|
| Method | `POST` |
| Timeout | `8000` — change it from 120000. Two minutes of silence on a live call is unusable. |
| Headers | key `x-aangan-tool-secret`, value **your secret from step 0** |

### Tool 1 — `qualify_enquiry`

**Endpoint:** `https://aanganstudio.vercel.app/api/vaani/tools/qualify`

**Description:**
> Send what the caller has told us about their project and get back what to say
> next. Call this once the caller has described what they want. Call it a second
> time if the reply asks a clarifying question and the caller answers it.

**Start with these twelve parameters.** The six optional ones are at the bottom
of this file — add them once the agent is working, not before. Fewer parameters
means less for the model to get wrong on the first attempt.

| Parameter | Description to type into Vaani |
|---|---|
| `call_id` | The unique id of this call. Always send it. |
| `scope_class` | What kind of job this is. One of exactly: full_home, partial, single_room, narrow_scope, commercial, advice_only, out_of_service, unclear. Use advice_only if they only want ideas or advice. Use out_of_service for a restaurant, hotel, shop, gym, or anywhere outside Pune. Use unclear if you cannot tell yet. |
| `scope` | What they want done, in a few words. For example "full redesign" or "kitchen and one bedroom". |
| `scope_quote` | The caller's own words describing what they want done. Copy them exactly. |
| `location` | Where the property is. The locality or area name. |
| `location_quote` | The caller's own words saying where it is. Copy them exactly. |
| `timeline` | When they need it done, in a few words. |
| `timeline_quote` | The caller's own words about timing. Copy them exactly. |
| `decision_maker` | Who decides. For example "the caller and their spouse", or "the caller's parents". |
| `decision_maker_quote` | The caller's own words about who decides. Copy them exactly. |
| `price_asked` | true if the caller has asked about cost at any point in this call, otherwise false. |
| `questions_asked` | How many clarifying questions you have already asked on this call. Start at 0. |

**Store Fields as Variables:**

| Response JSON Path | Variable Name |
|---|---|
| `say` | `agent_reply` |
| `next_action` | `next_action` |
| `question` | `clarifying_question` |

### Tool 2 — `offer_slots`

**Endpoint:** `https://aanganstudio.vercel.app/api/vaani/tools/offer-slots`

**Description:**
> Get consultation times to offer the caller. Call this when qualify_enquiry
> returns next_action = offer_slots.

**Parameters:** `call_id` only.

**Store Fields as Variables:**

| Response JSON Path | Variable Name |
|---|---|
| `say` | `agent_reply` |
| `next_action` | `next_action` |
| `designer_id` | `designer_id` |
| `slots[0].startsAt` | `slot_1_start` |
| `slots[1].startsAt` | `slot_2_start` |
| `slots[2].startsAt` | `slot_3_start` |

If their JSON-path syntax will not do array indexes, map only `say`,
`next_action` and `designer_id`. The agent can still read the times out, it just
has to remember which one the caller picked.

### Tool 3 — `book_slot`

**Endpoint:** `https://aanganstudio.vercel.app/api/vaani/tools/book-slot`

**Description:**
> Book the time the caller chose. Call this after offer_slots, once the caller
> has picked one of the times you read out.

| Parameter | Description to type into Vaani |
|---|---|
| `call_id` | The unique id of this call. |
| `starts_at` | The exact start time of the slot the caller chose, as returned by offer_slots. Do not reformat it. |
| `designer_id` | The designer_id returned by offer_slots. |
| `caller_name` | The caller's name, if they gave one. |
| `caller_email` | The caller's email address for the calendar invitation, if they gave one and you are confident of the spelling. Leave empty if unsure. |

**Store Fields as Variables:** `say` → `agent_reply`, `next_action` →
`next_action`, `booked` → `is_booked`.

---

## 4. The agent

**Agents → New agent.**

- **Name:** Aangan Studio front desk
- **Language:** English, with Hindi and Marathi enabled if Vaani lets you pick
  more than one. One of your twenty September callers wrote entirely in Hindi.
- **First message:** leave the greeting to the script, or use
  "Good morning, Aangan Studio." if Vaani requires one.
- **Instructions / system prompt:** paste the whole of `VAANI-AGENT-SCRIPT.md`.
- **Tools:** attach all three from step 3.

---

## 5. Test it in Simulations

No phone number needed. You are the caller.

Run these four first, because each breaks something different:

| Use | From | Should happen |
|---|---|---|
| T01 | 3BHK Kothrud, everything answered | Books cleanly |
| T02 | Asks for price twice | Refuses twice, still books |
| T03 | Caller in Nashik | Declines politely, no booking |
| T11 | Never mentions a timeline | Asks exactly one question, then proceeds |

**Three things to watch for, in order of how badly they fail:**

1. **Did it say any number about money?** Any figure, range or "around" is a
   failure, even if the caller pushed hard.
2. **Did it ask more than one clarifying question?** The limit is one per call.
3. **Did it say "booked" before book_slot confirmed?** A caller who hangs up
   believing they have an appointment and does not is the worst outcome here.

If a tool call fails, check Vercel's function logs — a 401 means the secret does
not match, and a 400 means a parameter name is spelled differently from the
table above.

---

## 6. Do not connect a phone number yet

This is the hard stop, and it is not a technical one.

**Nobody has decided what the agent must say about the call being recorded and
sent to an AI model.** In India that is a legal requirement, not a courtesy. The
script carries a visible placeholder where that sentence goes, and a test fails
if anyone quietly removes it. It is `D13` in `OPEN_DECISIONS.md`.

Simulations are fine: you are the caller and you have consented by definition.
A public line is not.

To unblock it, Nikhil or whoever advises him needs to approve one sentence.
Something in the shape of "This call is recorded and handled by an automated
assistant" — but the exact wording is theirs, not ours.

---

## The six parameters to add later

Once the agent works with twelve, add these to `qualify_enquiry`. They improve
the designer's handoff note and let the engine judge commercial size, but
nothing breaks without them.

| Parameter | Description to type into Vaani |
|---|---|
| `space_type` | The kind of space. For example "3BHK flat", "villa", "office". |
| `space_type_quote` | The caller's own words describing the space. |
| `area_sqft` | The size in square feet, as a number, if they said one. |
| `area_sqft_quote` | The caller's own words about the size. |
| `budget_mentioned` | A budget figure the caller volunteered, as a number. Never ask for this. Only fill it if they offer it unprompted. |
| `budget_mentioned_quote` | The caller's own words about their budget. |
