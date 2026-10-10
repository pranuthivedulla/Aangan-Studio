/**
 * The 20 September phone calls as test fixtures.
 *
 * The transcript TEXT is not copied into this file. It is parsed at test time
 * from context/enquiries/enquiries-extracted.txt, so a fixture can never drift
 * from the source material and no transcription error of mine can creep in.
 * Evidence-quote tests depend on that being the real text.
 *
 * `expected` is the outcome from PHASE0-PLAN.md §2.1. Four rows are
 * `pending-ruling`: the context files do not support any answer, so the test
 * asserts the engine REFUSES to decide rather than encoding my guess.
 */

import type { Outcome, ScopeClass } from '@/types';

export {
  loadPhoneTranscripts,
  transcriptFor,
  type ParsedTranscript,
} from '@/demo/transcripts';

export interface PhoneFixture {
  readonly id: string;
  readonly expected: Outcome | 'pending-ruling';
  readonly expectedScope: ScopeClass;
  /** Open decision this row waits on. Only set for pending-ruling rows. */
  readonly pendingDecision?: string;
  readonly borderline?: boolean;
  readonly priceAsked?: boolean;
  /** Short note on why, for the failure message when it breaks. */
  readonly why: string;
}

export const PHONE_FIXTURES: readonly PhoneFixture[] = [
  { id: 'T01', expected: 'book', expectedScope: 'full_home', why: 'all five pass; owner, March timeline, Kothrud' },
  { id: 'T02', expected: 'book', expectedScope: 'full_home', priceAsked: true, why: 'price asked twice then booked; DM unclear is forwarded with a note' },
  { id: 'T03', expected: 'decline', expectedScope: 'out_of_service', why: 'Nashik; services.md names it excluded' },
  { id: 'T04', expected: 'decline', expectedScope: 'advice_only', why: 'advice only; declines as out-of-service per D26' },
  { id: 'T05', expected: 'book', expectedScope: 'full_home', why: 'all five pass; referral, 2,400 sq ft, February' },
  { id: 'T06', expected: 'book', expectedScope: 'commercial', why: '800 sq ft office, under the 3,000 cap, founder calling' },
  { id: 'T07', expected: 'review', expectedScope: 'partial', why: 'timeline fails; under D24 one gate fail goes to the front desk, not a decline and not a park' },
  { id: 'T08', expected: 'review', expectedScope: 'unclear', why: 'missed call, nothing known; an unclear scope goes to the front desk for a callback, not a next-day park' },
  { id: 'T09', expected: 'complaint', expectedScope: 'unclear', why: 'existing-project complaint; front desk, never Nikhil' },
  {
    id: 'T10',
    expected: 'pending-ruling',
    expectedScope: 'partial',
    pendingDecision: 'D20',
    why: 'budget volunteered at 1-1.5 lakh, but no budget floor is configured, so criterion 4 cannot fail yet',
  },
  { id: 'T11', expected: 'ask_one', expectedScope: 'partial', why: 'no timeline anywhere; one question, then bookable' },
  { id: 'T12', expected: 'book', expectedScope: 'full_home', why: 'all five pass; 5,500 sq ft villa, named decision-maker' },
  { id: 'T13', expected: 'ask_one', expectedScope: 'partial', priceAsked: true, why: 'no timeline, so the one question fires first; the unclear decision maker only becomes borderline after it is answered' },
  {
    id: 'T14',
    expected: 'pending-ruling',
    expectedScope: 'full_home',
    pendingDecision: 'D21',
    why: 'son calling for parents is criterion 5\'s own red flag, except the owners will attend',
  },
  { id: 'T15', expected: 'book', expectedScope: 'full_home', why: 'possession in six weeks, site accessible now, spouse authorised' },
  {
    id: 'T16',
    expected: 'review',
    expectedScope: 'unclear',
    why: "repeat caller whose first enquiry was lost; D22's never-park rule sends him to the front desk for a same-day callback instead of parking a hot lead",
  },
  { id: 'T17', expected: 'book', expectedScope: 'full_home', borderline: true, why: 'dropped call then callback; one client, two calls; DM unclear' },
  {
    id: 'T18',
    expected: 'pending-ruling',
    expectedScope: 'commercial',
    pendingDecision: 'D2',
    why: '180 sq ft pod; the desk\'s 500 sq ft minimum is in no context file',
  },
  { id: 'T19', expected: 'decline', expectedScope: 'out_of_service', why: 'restaurant; services.md excludes hospitality' },
  { id: 'T20', expected: 'book', expectedScope: 'full_home', why: 'all five pass; both owners attending' },
] as const;

