/**
 * Pipeline stage signatures (brief §8):
 *
 *   ingest → loadContext → extract → score → decide → assign → offerSlots →
 *   book → handoff → log
 *
 * Phase 1 defines the types only. Implementations land in Phase 2 (extract,
 * score, decide), Phase 3 (assign, offerSlots, book) and Phase 4 (handoff,
 * log). Typing them now is what makes them independently testable later, and
 * what keeps the in-call layer (src/call/) from reaching into their internals.
 *
 * Every stage is a pure function: typed data in, typed data out, no I/O. I/O
 * goes through adapters, which are passed in. That is what lets the whole
 * pipeline run with no credentials (T19).
 */

import type {
  CallRecord,
  CriterionScore,
  Enquiry,
  Intent,
  Lead,
  Outcome,
  ScopeClass,
  Slot,
} from '@/types';
import type { Adapters } from '@/adapters/types';
import type { Settings } from '@config/settings-schema';
import type { Extraction } from '@/schemas/extraction';

/** Everything a stage is allowed to see. No globals, no ambient clock. */
export interface PipelineContext {
  readonly adapters: Adapters;
  readonly settings: Settings;
  /** ISO-8601. Passed in so time-dependent stages are testable. */
  readonly now: string;
}

export interface IngestResult {
  readonly enquiry: Enquiry;
  readonly call: CallRecord;
}

export interface LoadedContext {
  /** Prior leads for this phone number. Drives repeat-caller handling (T09). */
  readonly priorLeads: readonly Lead[];
  readonly isExistingClient: boolean;
  readonly isRepeatCaller: boolean;
}

export interface ExtractResult {
  readonly extraction: Extraction | null;
  /** Set when parsing failed twice and the lead must go to review (T05). */
  readonly failureReason: string | null;
  readonly attempts: number;
}

export interface ScoreResult {
  readonly scores: readonly CriterionScore[];
  readonly scopeClass: ScopeClass;
  readonly intent: Intent;
  readonly priceAsked: boolean;
}

export interface DecideResult {
  readonly outcome: Outcome;
  readonly borderline: boolean;
  /** The criterion to name at the top of the prep summary (T25). */
  readonly borderlineCriterionId: string | null;
  /** The single question to ask, when outcome is ask_one (T06). */
  readonly question: string | null;
  readonly priorityScore: number;
  /** Why, in one line, for the audit trail and the front-desk queue. */
  readonly rationale: string;
}

export interface AssignResult {
  readonly designerId: string | null;
  readonly backupDesignerId: string | null;
  readonly noDesignerOnDuty: boolean;
  readonly ownerIdIfNoDesigner: string | null;
}

export interface OfferSlotsResult {
  readonly slots: readonly Slot[];
  /** True when there is nothing to offer and a human must follow up (T11). */
  readonly noSlotsAvailable: boolean;
}

export interface BookResult {
  readonly eventId: string | null;
  /** True when the slot was taken between offer and insert (T12). */
  readonly lostRace: boolean;
}

export interface HandoffResult {
  readonly prepSummary: string;
  /** Designer-only, HubSpot-only. Never in Telegram or email (T15, T21). */
  readonly handoffNote: string;
  readonly crmRecordUrl: string | null;
}

export type Ingest = (ctx: PipelineContext, callId: string) => Promise<IngestResult>;
export type LoadContext = (ctx: PipelineContext, enquiry: Enquiry) => Promise<LoadedContext>;
export type Extract = (ctx: PipelineContext, enquiry: Enquiry) => Promise<ExtractResult>;
export type Score = (
  ctx: PipelineContext,
  enquiry: Enquiry,
  extraction: Extraction,
) => ScoreResult;
export type Decide = (
  ctx: PipelineContext,
  score: ScoreResult,
  loaded: LoadedContext,
  askedQuestionCount: number,
) => DecideResult;
export type Assign = (ctx: PipelineContext, decide: DecideResult) => Promise<AssignResult>;
export type OfferSlots = (
  ctx: PipelineContext,
  assign: AssignResult,
) => Promise<OfferSlotsResult>;
export type Book = (ctx: PipelineContext, slot: Slot, lead: Lead) => Promise<BookResult>;
export type Handoff = (ctx: PipelineContext, lead: Lead, enquiry: Enquiry) => Promise<HandoffResult>;
export type Log = (ctx: PipelineContext, lead: Lead, call: CallRecord) => Promise<void>;
