/**
 * Core domain types.
 *
 * `Enquiry` is channel-agnostic on purpose (brief §2). Phone is the only MVP
 * channel; WhatsApp and the web form are NOT built. Adding one means adding a
 * `Channel` member and an ingest adapter — see EXTENDING.md.
 */

export type Channel = 'phone' | 'whatsapp' | 'web_form';

export type CriterionResult = 'pass' | 'unclear' | 'fail';
export type CriterionRole = 'gate' | 'rank' | 'prep';

/** What an `unclear` does, per qualified.md's "At the boundary" section. */
export type UnclearBehaviour = 'ask_one' | 'forward_with_note';

export type ScopeClass =
  | 'full_home'
  | 'partial'
  | 'single_room'
  | 'narrow_scope'
  | 'commercial'
  | 'commercial_below_min'
  | 'advice_only'
  | 'out_of_service'
  | 'unclear';

export type Intent =
  | 'new_enquiry'
  | 'existing_client'
  | 'complaint'
  /** Pre-sale response failure (T16, W08). D22. */
  | 'service_failure'
  /** Leads with price and nothing else (W02, F04, F07). Finding F2. */
  | 'price_enquiry'
  | 'other';

export type Outcome = 'book' | 'ask_one' | 'decline' | 'review' | 'park' | 'complaint';

export type LeadState =
  | 'received'
  | 'qualified'
  | 'unclear'
  | 'declined'
  | 'parked'
  | 'review'
  | 'booked'
  | 'handed_off'
  | 'acknowledged'
  | 'consulted'
  | 'escalated';

export type QualifiedBy = 'agent' | 'front_desk';

export type AnsweredBy = 'front_desk' | 'voice_agent';

/** E.164, e.g. +919876543210. The unique client key (brief §7). */
export type PhoneE164 = string;

export interface Enquiry {
  readonly id: string;
  readonly channel: Channel;
  /** ISO-8601 with offset. */
  readonly receivedAt: string;
  readonly callerId: PhoneE164 | null;
  /**
   * Sensitive (non-negotiable 8). Never logged, never sent outside the
   * approved stack, role-restricted at rest.
   */
  readonly transcript: string;
  readonly locale?: string;
}

export interface CallRecord {
  readonly id: string;
  readonly enquiryId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly ringsBeforeAnswer: number;
  readonly answeredBy: AnsweredBy;
  readonly durationSec: number | null;
  /** Populated per call; the dashboard's headline metric depends on it. */
  readonly cost: CallCost | null;
}

export interface CallCost {
  readonly voiceMinutes: number;
  readonly voicePaise: number;
  readonly modelInputTokens: number;
  readonly modelOutputTokens: number;
  readonly modelPaise: number;
  readonly totalPaise: number;
}

export interface CriterionScore {
  readonly criterionId: string;
  /** Verbatim from the transcript, or null. Verified as a substring. */
  readonly evidenceQuote: string | null;
  readonly reasoning: string;
  readonly result: CriterionResult;
  /**
   * True when the model supplied a quote that was NOT present in the
   * transcript and the code downgraded the result (acceptance test T04).
   */
  readonly downgradedForBadEvidence: boolean;
}

export interface Lead {
  readonly id: string;
  readonly enquiryId: string;
  readonly clientId: PhoneE164;
  readonly state: LeadState;
  readonly outcome: Outcome | null;
  readonly scores: readonly CriterionScore[];
  readonly scopeClass: ScopeClass;
  readonly intent: Intent;
  /** Forwarded with an unclear criterion named at the top of the summary. */
  readonly borderline: boolean;
  readonly priorityScore: number;
  readonly assignedDesignerId: string | null;
  readonly backupDesignerId: string | null;
  readonly qualifiedBy: QualifiedBy | null;
  readonly askedQuestionCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Slot {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly designerId: string;
}

export interface EscalationEvent {
  readonly id: string;
  readonly leadId: string;
  readonly step: 'backup_designer' | 'front_desk_lead';
  readonly firedAt: string;
  readonly notifiedId: string;
  readonly acknowledgedAt: string | null;
}
