/**
 * Prepared readings of the 20 September phone calls.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT.
 *
 * This is the AI's job, done by hand. For each call it records the facts, the
 * scope, the intent and a per-criterion judgement with a quote — exactly the
 * shape Gemini Flash is asked to return. The judge then decides from it.
 *
 * So a green test run here proves the DECISION RULES are right. It does not
 * prove the AI reads calls correctly; only running the real model does that,
 * and it is the deliberate next step. Approved on 10 Oct 2026 as the free
 * first pass.
 *
 * Every quote below is copied from `context/enquiries/`, and the evidence
 * verifier checks each one is present AND was spoken by the caller. A quote I
 * paraphrased or attributed to the receptionist by mistake does not quietly
 * pass — it downgrades that criterion and shows up in the results table. That
 * is the safeguard against this file becoming my opinion dressed as data.
 *
 * Where a criterion is genuinely absent from a call, the reading says
 * `unclear` with a null quote. That is the honest answer and it is what the
 * caller actually left us with.
 */

import type { Extraction } from '@/schemas/extraction';

type Judgement = Extraction['criteria'][number];

const j = (
  id: string,
  result: Judgement['result'],
  evidence_quote: string | null,
  reasoning: string,
): Judgement => ({ id, result, evidence_quote, reasoning });

/** Criterion 4 when no budget was mentioned. Code turns this into a pass. */
const noBudget = (): Judgement =>
  j('budget_band', 'unclear', null, 'budget never mentioned on the call');

function reading(args: {
  fields: Extraction['fields'];
  criteria: readonly Judgement[];
  scope_class: Extraction['scope_class'];
  intent?: Extraction['intent'];
  price_asked?: boolean;
  confidence?: number;
}): Extraction {
  return {
    fields: args.fields,
    criteria: [...args.criteria],
    scope_class: args.scope_class,
    intent: args.intent ?? 'new_enquiry',
    price_asked: args.price_asked ?? false,
    confidence: args.confidence ?? 0.8,
  };
}

const empty: Extraction['fields'] = {
  space_type: null,
  area_sqft: null,
  scope: null,
  timeline: null,
  decision_maker: null,
  location: null,
  budget_mentioned: null,
  language: 'en',
};

export const READINGS: Readonly<Record<string, Extraction>> = {
  T01: reading({
    fields: { ...empty, space_type: '3BHK', area_sqft: 1400, scope: 'full redesign', timeline: 'by March', decision_maker: 'caller and husband', location: 'Kothrud' },
    criteria: [
      j('real_project', 'pass', 'We want to redo the whole thing', 'full redesign with execution'),
      j('service_area', 'pass', 'We have a 3BHK in Kothrud', 'Kothrud'),
      j('timeline', 'pass', 'done by March', 'roughly six months out'),
      noBudget(),
      j('decision_maker', 'pass', 'myself and my husband', 'owners, spouse aware and agreeing'),
    ],
    scope_class: 'full_home',
  }),

  T02: reading({
    fields: { ...empty, space_type: '2BHK', area_sqft: 950, scope: 'full redesign', timeline: 'design from October, moving in November', location: 'Wakad' },
    criteria: [
      j('real_project', 'pass', 'Full redesign', 'modular kitchen, wardrobes, living room, bedrooms'),
      j('service_area', 'pass', 'I have a 2BHK in Wakad', 'Wakad'),
      j('timeline', 'pass', 'We move in November', 'site free, design starting October'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'never says who decides'),
    ],
    scope_class: 'full_home',
    price_asked: true,
  }),

  T03: reading({
    fields: { ...empty, scope: 'home office and study', location: 'Nashik' },
    criteria: [
      j('real_project', 'pass', 'I want to redo my home office and study', 'a real project'),
      j('service_area', 'fail', 'I\'m in Nashik', 'outside Pune and PCMC'),
      j('timeline', 'unclear', null, 'no timeline given'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'not established'),
    ],
    scope_class: 'out_of_service',
  }),

  T04: reading({
    fields: { ...empty, scope: 'ideas for the living room' },
    criteria: [
      j('real_project', 'fail', 'Just want suggestions on colours, furniture arrangement, what to change', 'advice only, criterion 1 red flag'),
      j('service_area', 'unclear', null, 'no location given'),
      j('timeline', 'unclear', null, 'no timeline'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'not established'),
    ],
    scope_class: 'advice_only',
  }),

  T05: reading({
    fields: { ...empty, space_type: '4BHK', area_sqft: 2400, scope: 'complete redesign', timeline: 'move back in by February', location: 'Koregaon Park' },
    criteria: [
      j('real_project', 'pass', 'Complete redesign', 'flooring, kitchen, all four bedrooms'),
      j('service_area', 'pass', 'We have a 4BHK in Koregaon Park', 'Koregaon Park'),
      j('timeline', 'pass', 'We want to move back in by February', 'about four months, site already empty'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'speaks as owner but never confirms who decides'),
    ],
    scope_class: 'full_home',
  }),

  T06: reading({
    fields: { ...empty, space_type: 'office', area_sqft: 800, scope: 'bare shell fitout', timeline: 'operational by December', decision_maker: 'founder', location: 'Baner' },
    criteria: [
      j('real_project', 'pass', 'We need workstations for 20 people', 'full fitout from bare shell'),
      j('service_area', 'pass', 'our first proper office space in Baner', 'Baner'),
      j('timeline', 'pass', 'We want to be operational by December', 'achievable'),
      noBudget(),
      j('decision_maker', 'pass', 'Yes, I\'m the founder', 'decision maker on the call'),
    ],
    scope_class: 'commercial',
  }),

  T07: reading({
    fields: { ...empty, scope: 'living room and kitchen', timeline: 'before Diwali, about three weeks' },
    criteria: [
      j('real_project', 'pass', 'I want to redo my living room and kitchen', 'two rooms with execution'),
      j('service_area', 'unclear', null, 'no location given anywhere on the call'),
      j('timeline', 'fail', 'before Diwali', 'three weeks; design alone is 3-4 weeks'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'not established'),
    ],
    scope_class: 'partial',
  }),

  // The missed call. No dialogue at all, so there is nothing to read.
  T08: reading({
    fields: { ...empty, language: null },
    criteria: [
      j('real_project', 'unclear', null, 'no conversation took place'),
      j('service_area', 'unclear', null, 'number associated with a Pune area, nothing stated'),
      j('timeline', 'unclear', null, 'no conversation took place'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'no conversation took place'),
    ],
    scope_class: 'unclear',
    intent: 'other',
    confidence: 0.1,
  }),

  T09: reading({
    fields: { ...empty, space_type: '2BHK', location: 'Viman Nagar' },
    criteria: [
      j('real_project', 'unclear', null, 'existing project, not a new enquiry'),
      j('service_area', 'pass', 'Flat in Viman Nagar', 'Viman Nagar'),
      j('timeline', 'unclear', null, 'not a new enquiry'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'not a new enquiry'),
    ],
    scope_class: 'unclear',
    intent: 'complaint',
  }),

  T10: reading({
    fields: { ...empty, space_type: '1BHK', area_sqft: 550, scope: 'kitchen and one bedroom', budget_mentioned: 150_000, location: 'Kharadi' },
    criteria: [
      j('real_project', 'pass', 'I want to do the kitchen and one bedroom', 'two rooms with execution'),
      j('service_area', 'unclear', 'I have a 1BHK in Kharadi', 'Kharadi is in Pune but not on the services.md list'),
      j('timeline', 'unclear', null, 'no timeline given'),
      j('budget_band', 'fail', 'My budget is 1 to 1.5 lakh maximum for everything', 'volunteered figure, far below the described scope'),
      j('decision_maker', 'unclear', null, 'not established'),
    ],
    scope_class: 'partial',
  }),

  T11: reading({
    fields: { ...empty, space_type: '2BHK', scope: 'living room, bedroom and kitchen, no structural work', location: 'Baner' },
    criteria: [
      j('real_project', 'pass', 'I want to properly design the living room, bedroom, and kitchen', 'three rooms with execution, rented but no structural change'),
      j('service_area', 'pass', 'It\'s a 2BHK in Baner', 'Baner'),
      j('timeline', 'unclear', null, 'no timeline mentioned on the call'),
      noBudget(),
      j('decision_maker', 'unclear', 'they\'re fine with it as long as we don\'t break walls', 'landlord consent confirmed; the caller\'s own authority is not'),
    ],
    scope_class: 'partial',
  }),

  T12: reading({
    fields: { ...empty, space_type: 'villa, ground plus two floors', area_sqft: 5500, scope: 'full end-to-end design', timeline: 'March next year', location: 'Kalyani Nagar' },
    criteria: [
      j('real_project', 'pass', 'Full end-to-end design', 'new construction, completely empty'),
      j('service_area', 'pass', 'a villa project in Kalyani Nagar', 'Kalyani Nagar'),
      j('timeline', 'pass', 'March next year to move in', 'no rush, ample lead time'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'names himself but never confirms he decides'),
    ],
    scope_class: 'full_home',
  }),

  T13: reading({
    fields: { ...empty, space_type: '3BHK', area_sqft: 1100, scope: 'kitchen, wardrobes, living room', location: 'Aundh' },
    criteria: [
      j('real_project', 'pass', 'Kitchen, wardrobes in both bedrooms, living room', 'multi-room with execution'),
      j('service_area', 'pass', 'I want to redo my flat in Aundh', 'Aundh'),
      j('timeline', 'unclear', null, 'no timeline mentioned'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'not established'),
    ],
    scope_class: 'partial',
    price_asked: true,
  }),

  T14: reading({
    fields: { ...empty, space_type: '3BHK', scope: 'proper design, new possession', decision_maker: 'the parents', location: 'Hadapsar' },
    criteria: [
      j('real_project', 'pass', 'They want a proper design', 'full-home design for a new possession'),
      j('service_area', 'pass', 'They have a 3BHK in Hadapsar', 'Hadapsar'),
      j('timeline', 'unclear', null, 'new possession, but no timeline stated'),
      noBudget(),
      j('decision_maker', 'unclear', 'I\'m doing the initial checking', 'criterion 5\'s stated red flag, but the owners will attend and decide'),
    ],
    scope_class: 'full_home',
  }),

  T15: reading({
    fields: { ...empty, space_type: '2BHK', area_sqft: 875, scope: 'full home', timeline: 'possession in about six weeks', decision_maker: 'caller and husband', location: 'Undri' },
    criteria: [
      j('real_project', 'pass', 'Full home -- kitchen, wardrobes, living room', 'the full package with execution'),
      j('service_area', 'pass', 'getting possession of my flat in Undri', 'Undri'),
      j('timeline', 'pass', 'in about six weeks', 'site accessible now, possession in six weeks'),
      noBudget(),
      j('decision_maker', 'pass', 'He said to go ahead and book the consultation', 'spouse has authorised'),
    ],
    scope_class: 'full_home',
  }),

  T16: reading({
    fields: { ...empty, space_type: '3BHK', location: 'Viman Nagar' },
    criteria: [
      j('real_project', 'unclear', null, 'said only that he called about a project'),
      j('service_area', 'pass', 'my 3BHK in Viman Nagar', 'Viman Nagar'),
      j('timeline', 'unclear', null, 'nothing said'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'nothing said'),
    ],
    scope_class: 'unclear',
    intent: 'service_failure',
  }),

  T17: reading({
    fields: { ...empty, space_type: '3BHK', area_sqft: 1050, scope: 'kitchen, wardrobes, living room', timeline: 'done by March', location: 'Pimple Saudagar' },
    criteria: [
      j('real_project', 'pass', 'Kitchen, wardrobes, living room', 'full-home scope, builder furniture being replaced'),
      j('service_area', 'pass', 'I\'m Ritu Kapoor from Pimple Saudagar', 'Pimple Saudagar'),
      j('timeline', 'pass', 'Ideally done by March', 'plenty of time'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'speaks as "we" but never confirms who decides'),
    ],
    scope_class: 'full_home',
  }),

  T18: reading({
    fields: { ...empty, space_type: 'coworking pod', area_sqft: 180, scope: 'lighting, desk, storage' },
    criteria: [
      j('real_project', 'pass', 'I have a 180 sq ft pod I want to make look really nice', 'wants it designed and built, not advised on'),
      j('service_area', 'unclear', null, 'never says where the coworking space is'),
      j('timeline', 'unclear', null, 'no timeline given'),
      noBudget(),
      j('decision_maker', 'pass', 'I run a small coworking space', 'runs the business'),
    ],
    scope_class: 'commercial',
  }),

  T19: reading({
    fields: { ...empty, space_type: 'restaurant', scope: 'restaurant interiors', location: 'Koregaon Park' },
    criteria: [
      j('real_project', 'pass', 'I\'m planning to open a restaurant in Koregaon Park', 'a real project, but hospitality'),
      j('service_area', 'pass', 'a restaurant in Koregaon Park', 'Koregaon Park'),
      j('timeline', 'unclear', null, 'no timeline given'),
      noBudget(),
      j('decision_maker', 'unclear', null, 'not established'),
    ],
    scope_class: 'out_of_service',
  }),

  T20: reading({
    fields: { ...empty, space_type: '2BHK', area_sqft: 900, scope: 'kitchen, both bedrooms, living room', timeline: 'January start for execution', decision_maker: 'caller and husband', location: 'Magarpatta' },
    criteria: [
      j('real_project', 'pass', 'Kitchen, both bedrooms, living room', 'full-home scope with execution'),
      j('service_area', 'pass', 'I have a 2BHK in Magarpatta', 'Magarpatta'),
      j('timeline', 'pass', 'a January start for execution would be ideal', 'flexible, well inside the window'),
      noBudget(),
      j('decision_maker', 'pass', 'my husband and I. We both want to be at the consultation', 'both owners, both attending'),
    ],
    scope_class: 'full_home',
  }),
};

export function readingFor(id: string): Extraction {
  const found = READINGS[id];
  if (!found) throw new Error(`No prepared reading for ${id}`);
  return found;
}
