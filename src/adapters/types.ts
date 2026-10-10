/**
 * Adapter interfaces (brief §8). Every external system sits behind one, each
 * with a real and a mock implementation, selected by env var, mock by default.
 * The whole pipeline runs with zero credentials (acceptance test T19).
 *
 * Deviation from the brief's layout, stated rather than smuggled: the brief
 * asks for `src/adapters/<name>/{index,real,mock}.ts`. Seven adapters that way
 * is 21 files of mostly imports at this stage, so each adapter is one file,
 * `src/adapters/<name>.ts`, exporting its interface, its mock and its real
 * stub. Splitting them later is mechanical. Say the word if you want the
 * three-file shape now.
 */

import type {
  CallCost,
  Enquiry,
  Lead,
  PhoneE164,
  Slot,
} from '@/types';
import type { Settings } from '@config/settings-schema';

export type AdapterName =
  | 'voice'
  | 'llm'
  | 'calendar'
  | 'crm'
  | 'notify'
  | 'email'
  | 'store';

export type AdapterMode = 'mock' | 'real';

export class AdapterNotConfiguredError extends Error {
  constructor(adapter: AdapterName, missing: string) {
    super(
      `${adapter} adapter is in "real" mode but ${missing} is not set. ` +
        `Set ADAPTER_MODE_${adapter.toUpperCase()}=mock or supply credentials.`,
    );
    this.name = 'AdapterNotConfiguredError';
  }
}

/**
 * Mode resolution: ADAPTER_MODE_<NAME> wins over ADAPTER_MODE, which defaults
 * to mock. Anything other than exactly "real" is mock — a typo must never
 * silently reach a real integration.
 */
export function resolveMode(
  adapter: AdapterName,
  env: Record<string, string | undefined> = process.env,
): AdapterMode {
  const specific = env[`ADAPTER_MODE_${adapter.toUpperCase()}`];
  const general = env['ADAPTER_MODE'];
  return (specific ?? general) === 'real' ? 'real' : 'mock';
}

// ---------------------------------------------------------------------------
// voice — Vaani Labs
// ---------------------------------------------------------------------------

/**
 * Whether the platform can call us mid-call and wait for a structured reply
 * (`per_turn`), or only hand us the finished call (`post_call_only`).
 *
 * This is D27, and it is unresolved. Box 12 of the components map — offer
 * slots, read back — and the one-question rule both need `per_turn`. The
 * adapter declares which it has so the pipeline can refuse to promise
 * in-call booking it cannot deliver, rather than failing in front of a caller.
 */
export type VoiceOrchestrationMode = 'per_turn' | 'post_call_only';

export interface VoiceTurn {
  readonly callId: string;
  readonly turnIndex: number;
  /** What the caller just said. Sensitive. */
  readonly callerUtterance: string;
  /** Everything said so far, including this turn. Sensitive. */
  readonly transcriptSoFar: string;
}

export interface VoiceReply {
  /** What the agent should say next. Must come from approved wording. */
  readonly say: string;
  /** Slots to read back, if any. */
  readonly offerSlots?: readonly Slot[];
  readonly endCall?: boolean;
}

export interface VoiceAdapter {
  readonly name: 'voice';
  readonly mode: AdapterMode;
  readonly orchestration: VoiceOrchestrationMode;
  /** Verify a signed webhook before trusting a word of it. */
  verifyWebhook(rawBody: string, signature: string): boolean;
  /** Pull the finished call. Available in both orchestration modes. */
  fetchCall(callId: string): Promise<{ enquiry: Enquiry; cost: CallCost }>;
  /** Only meaningful in `per_turn` mode; throws otherwise. */
  replyToTurn(turn: VoiceTurn, reply: VoiceReply): Promise<void>;
}

// ---------------------------------------------------------------------------
// llm — Gemini Flash
// ---------------------------------------------------------------------------

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmAdapter {
  readonly name: 'llm';
  readonly mode: AdapterMode;
  /** Returns raw text. Parsing and validation are the caller's job. */
  complete(prompt: string, input: string): Promise<{ text: string; usage: LlmUsage }>;
}

// ---------------------------------------------------------------------------
// calendar — Google Calendar, Cal.com or Calendly
// ---------------------------------------------------------------------------

export interface CalendarAdapter {
  readonly name: 'calendar';
  readonly mode: AdapterMode;
  /** Provider label, so swapping it is visible in logs and tests (T23). */
  readonly provider: string;
  freeBusy(designerId: string, fromIso: string, toIso: string): Promise<readonly Slot[]>;
  /**
   * Re-checks availability immediately before inserting, to prevent the
   * double-booking race (acceptance test T12). Returns null if the slot went.
   */
  createEvent(args: {
    slot: Slot;
    designerEmail: string;
    clientEmail: string | null;
    summary: string;
    /** Must contain no price figure and no full handoff note. */
    description: string;
    idempotencyKey: string;
  }): Promise<{ eventId: string } | null>;
}

// ---------------------------------------------------------------------------
// crm — HubSpot
// ---------------------------------------------------------------------------

export type FieldOwner = 'system' | 'designer' | 'front_desk';

export interface CrmAdapter {
  readonly name: 'crm';
  readonly mode: AdapterMode;
  /** Phone is the unique key (brief §7). Must not duplicate (T09). */
  upsertClient(phone: PhoneE164, fields: Record<string, unknown>): Promise<{ clientId: string }>;
  /** Writes are rejected when `actor` does not own the field (T16). */
  writeFields(args: {
    clientId: string;
    actor: FieldOwner;
    fields: Record<string, unknown>;
  }): Promise<void>;
  /** Designer-only. Never goes to Telegram, the front desk or Nikhil (T15). */
  storeHandoffNote(clientId: string, note: string): Promise<void>;
  recordLead(lead: Lead): Promise<{ recordUrl: string }>;
  /**
   * Won and lost, as the designer recorded them (map box 22 <- 19).
   * `won` is designer-entered, so it is null until someone has entered one;
   * zero would claim we asked and the answer was none.
   */
  wonLostCounts(): Promise<{ won: number | null; lost: number | null; pipelinePaise: number | null }>;
}

// ---------------------------------------------------------------------------
// notify — Telegram
// ---------------------------------------------------------------------------

export type NotifyChat = 'designers' | 'front_desk';

export interface NotifyAdapter {
  readonly name: 'notify';
  readonly mode: AdapterMode;
  /**
   * Summary plus link only. Passing a full handoff note here is a bug the
   * privacy tests catch; callers are never messaged (non-negotiable 6).
   */
  send(args: {
    chat: NotifyChat;
    text: string;
    linkUrl?: string;
    idempotencyKey: string;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// email — Resend
// ---------------------------------------------------------------------------

export interface EmailAdapter {
  readonly name: 'email';
  readonly mode: AdapterMode;
  send(args: {
    to: string;
    subject: string;
    /** Summary and link. Never the full note, never a price figure (T21). */
    body: string;
    idempotencyKey: string;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// store — Supabase (Neon as a swap)
// ---------------------------------------------------------------------------

export interface SettingsChange {
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly changedBy: string;
  readonly changedAt: string;
}

export interface StoreAdapter {
  readonly name: 'store';
  readonly mode: AdapterMode;
  readSettings(): Promise<Settings>;
  /** Validated before it is written; invalid values are rejected (T29). */
  writeSetting(args: {
    key: string;
    value: unknown;
    changedBy: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
  settingsAudit(): Promise<readonly SettingsChange[]>;
  /** Idempotency ledger. A replayed webhook is a no-op (T17). */
  seenIdempotencyKey(key: string): Promise<boolean>;
  recordIdempotencyKey(key: string): Promise<void>;
  saveLead(lead: Lead): Promise<void>;
  loadLeadsByClient(phone: PhoneE164): Promise<readonly Lead[]>;
  /** Every lead, for the dashboard's funnel and queues (map box 22 <- 23). */
  allLeads(): Promise<readonly Lead[]>;
  recordCost(callId: string, cost: CallCost): Promise<void>;
  totalCostPaise(): Promise<number>;
}

export interface Adapters {
  readonly voice: VoiceAdapter;
  readonly llm: LlmAdapter;
  readonly calendar: CalendarAdapter;
  readonly crm: CrmAdapter;
  readonly notify: NotifyAdapter;
  readonly email: EmailAdapter;
  readonly store: StoreAdapter;
}
