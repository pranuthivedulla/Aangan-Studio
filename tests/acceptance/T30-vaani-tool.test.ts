/**
 * The mid-call tool: the engine, reached from a phone call.
 *
 * What these protect: a caller is on the line. Every failure mode has to end
 * in a sentence a person could have said, and no failure may end in a price.
 */

import { describe, expect, it } from 'vitest';
import { ToolRequestSchema, normaliseToolBody } from '@/vaani/tool-contract';
import { SayLeakError, qualifyForCall, toExtraction } from '@/vaani/qualify';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { containsNoPriceFigure, containsNoPriceLanguage } from '@config/price-language';

const s = DEFAULT_SETTINGS;

const observed = (value: string | null, quote: string | null = null) => ({ value, quote });

function request(over: Record<string, unknown> = {}) {
  return ToolRequestSchema.parse({ call_id: 'call-1', ...over });
}

/** A caller who has answered everything, as T01 did. */
const complete = () =>
  request({
    space_type: observed('3BHK', 'We have a 3BHK in Kothrud'),
    area_sqft: observed('1400', 'About 1,400 sq ft carpet'),
    scope: observed('full redesign', 'We want to redo the whole thing'),
    timeline: observed('March', 'done by March'),
    decision_maker: observed('owner and husband', 'myself and my husband'),
    location: observed('Kothrud', 'We have a 3BHK in Kothrud'),
    scope_class: 'full_home',
  });

describe('the contract tolerates a half-finished conversation', () => {
  it('accepts a call where nothing has been said yet', () => {
    const r = ToolRequestSchema.safeParse({ call_id: 'c1' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.timeline.value).toBeNull();
  });

  it('refuses a call with no id, because nothing could be correlated later', () => {
    expect(ToolRequestSchema.safeParse({}).success).toBe(false);
  });

  it('refuses unknown fields rather than silently ignoring them', () => {
    expect(ToolRequestSchema.safeParse({ call_id: 'c1', surprise: 1 }).success).toBe(false);
  });
});

describe('the agent reports; the code decides', () => {
  it('the agent never supplies a pass or a fail', () => {
    const extraction = toExtraction(complete());
    // Everything the agent observed arrives as a candidate, with its quote.
    for (const c of extraction.criteria) {
      expect(['pass', 'unclear']).toContain(c.result);
    }
    expect(extraction.criteria.some((c) => c.result === 'fail')).toBe(false);
  });

  it('an out-of-area location still fails, whatever the agent reported', () => {
    const result = qualifyForCall(
      request({
        scope: observed('home office', 'I want to redo my home office and study'),
        location: observed('Nashik', "I'm in Nashik"),
      }),
      s,
    );
    expect(result.outcome).not.toBe('book');
  });

  it('a complete, in-area enquiry gets offered slots', () => {
    const result = qualifyForCall(complete(), s);
    expect(result.outcome).toBe('book');
    expect(result.next_action).toBe('offer_slots');
  });

  it('a missing timeline asks exactly one question, in Nikhil’s own words', () => {
    const result = qualifyForCall(
      request({
        scope: observed('full redesign', 'We want to redo the whole thing'),
        location: observed('Baner', 'a 2BHK in Baner'),
        scope_class: 'full_home',
      }),
      s,
    );
    expect(result.next_action).toBe('ask_question');
    expect(result.question).toBe('When would you need the project complete?');
    expect(result.say).toBe(result.question);
  });

  it('does not ask a second time once the budget is spent', () => {
    const result = qualifyForCall(
      request({
        scope: observed('full redesign', 'We want to redo the whole thing'),
        location: observed('Baner', 'a 2BHK in Baner'),
        scope_class: 'full_home',
        questions_asked: 1,
      }),
      s,
    );
    expect(result.next_action).not.toBe('ask_question');
  });

  it('an unverifiable quote cannot make a criterion pass', () => {
    // The value is supplied but the quote is absent, so the evidence check
    // downgrades it and the agent cannot talk its way to a booking.
    const result = qualifyForCall(
      request({
        scope: observed('full redesign', null),
        location: observed('Kothrud', null),
        timeline: observed('March', null),
        decision_maker: observed('owner', null),
        scope_class: 'full_home',
      }),
      s,
    );
    expect(result.outcome).not.toBe('book');
  });
});

describe('nothing the caller hears can carry a price', () => {
  it('every spoken line passes the figure guard', () => {
    const cases = [
      complete(),
      request({ scope: observed('ideas', 'just want suggestions on colours'), scope_class: 'advice_only' }),
      request({ location: observed('Nashik', "I'm in Nashik") }),
      request({}),
    ];
    for (const r of cases) {
      const result = qualifyForCall(r, s);
      expect(containsNoPriceFigure(result.say).ok, result.say).toBe(true);
    }
  });

  it('a price question gets the approved sentence, verbatim and first', () => {
    const result = qualifyForCall(request({ ...complete(), price_asked: true }), s);
    expect(result.say.startsWith('Pricing depends on the site')).toBe(true);
    expect(containsNoPriceFigure(result.say).ok).toBe(true);
  });

  it('the approved sentence itself still contains no digit at all', () => {
    const result = qualifyForCall(request({ call_id: 'c1', price_asked: true }), s);
    const spoken = result.say.split('.')[0] ?? '';
    expect(containsNoPriceLanguage(spoken).ok).toBe(true);
  });

  it('refuses to speak rather than leak, if a future change regresses', () => {
    const poisoned = {
      ...DEFAULT_SETTINGS,
      APPROVED_PRICE_SENTENCE: 'It is about 2,000 per sq ft.',
    };
    expect(() => qualifyForCall(request({ call_id: 'c1', price_asked: true }), poisoned)).toThrow(
      SayLeakError,
    );
  });
});

describe('a caller never hears a dead end', () => {
  it('every outcome produces something sayable', () => {
    for (const r of [complete(), request({}), request({ location: observed('Nashik', "I'm in Nashik") })]) {
      const result = qualifyForCall(r, s);
      expect(result.say.length).toBeGreaterThan(20);
      expect(result.say).toMatch(/[.?]$/);
    }
  });

  it('a lead the agent may not turn away is handed to a person, not declined', () => {
    const result = qualifyForCall(request({}), s);
    expect(['review', 'park', 'ask_one']).toContain(result.outcome);
    expect(result.say.toLowerCase()).not.toContain('not the right fit');
  });

  it('carries the call id back so the post-call webhook can be matched to it', () => {
    expect(qualifyForCall(request({ call_id: 'abc-123' }), s).reference).toBe('abc-123');
  });
});

describe('the form can send flat parameters, which is how Vaani defines them', () => {
  it('folds timeline + timeline_quote into the shape the engine reads', () => {
    const body = normaliseToolBody({
      call_id: 'c1',
      scope_class: 'full_home',
      scope: 'full redesign',
      scope_quote: 'We want to redo the whole thing',
      location: 'Kothrud',
      location_quote: 'We have a 3BHK in Kothrud',
      timeline: 'March',
      timeline_quote: 'done by March',
      decision_maker: 'owner',
      decision_maker_quote: 'myself and my husband',
      area_sqft: 1400,
      area_sqft_quote: 'About 1,400 sq ft carpet',
    });
    const parsed = ToolRequestSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.timeline).toEqual({ value: 'March', quote: 'done by March' });
      expect(parsed.data.area_sqft.value).toBe('1400');
      expect(qualifyForCall(parsed.data, s).outcome).toBe('book');
    }
  });

  it('leaves a nested body untouched', () => {
    const nested = { call_id: 'c1', timeline: { value: 'March', quote: 'done by March' } };
    const parsed = ToolRequestSchema.safeParse(normaliseToolBody(nested));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.timeline.quote).toBe('done by March');
  });

  it('a flat value with no quote still cannot pass a criterion', () => {
    const body = normaliseToolBody({ call_id: 'c1', scope_class: 'full_home', timeline: 'March' });
    const parsed = ToolRequestSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(qualifyForCall(parsed.data, s).outcome).not.toBe('book');
  });
});
