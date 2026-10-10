/**
 * The logging boundary (non-negotiable 8, acceptance test T18).
 *
 * Transcripts are sensitive. Before 10 Oct 2026 the only protection was an
 * eslint rule banning `console`, which stops a careless `console.log` and
 * nothing else — an exception carrying an `Enquiry`, or a future error
 * reporter serialising a lead, would have put a full call transcript into a log
 * sink with nobody the wiser.
 *
 * So nothing in this system logs directly. Everything goes through `log()`,
 * which redacts before it emits. The redaction is by KEY NAME, not by value,
 * because the value is exactly what must not be inspected or echoed.
 *
 * The design rule: a new sensitive field is protected by adding its name here.
 * If you add a field holding caller speech and do not add it to SENSITIVE_KEYS,
 * the test in tests/acceptance/T18-no-transcript-in-logs.test.ts is what should
 * catch you — it checks known transcript text never survives redaction.
 */

/** Field names whose VALUES never reach a log, in any casing or nesting. */
export const SENSITIVE_KEYS: readonly string[] = [
  // Caller speech, in every shape it takes through the pipeline.
  'transcript',
  'transcriptSoFar',
  'callerUtterance',
  'evidenceQuote',
  'evidence_quote',
  'say',
  'reasoning',
  // Designer-only prose (non-negotiable 5).
  'handoffNote',
  'handoff_note',
  'prepSummary',
  'granolaNotes',
  'granola_notes',
  'additionalNotes',
  'insights',
  // Personal data.
  'callerId',
  'phone',
  'clientId',
  'clientEmail',
  'email',
  'name',
] as const;

/** Any key that looks like a credential, matched rather than listed. */
const SECRET_KEY_PATTERN = /(secret|token|password|passwd|api[_-]?key|credential|authorization|auth|private[_-]?key|service[_-]?role)/i;

export const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  if (SECRET_KEY_PATTERN.test(key)) return true;
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((k) => k.toLowerCase() === lower);
}

/**
 * Deep-copy a value with every sensitive field replaced.
 *
 * Handles the shapes that actually turn up in a log line: plain objects,
 * arrays, Errors (whose `message` and attached properties are the usual leak),
 * Maps and Sets. Anything it does not recognise is replaced rather than
 * emitted, because an unknown object is an unknown risk.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t === 'function' || t === 'symbol') return `[${t}]`;

  if (value instanceof Error) {
    // The message may embed caller speech, so it is never passed through.
    return {
      name: value.name,
      message: redactFreeText(value.message),
      stack: value.stack ? value.stack.split('\n')[0] : undefined,
    };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([k, v]) => [
        String(k),
        isSensitiveKey(String(k)) ? REDACTED : redact(v, depth + 1),
      ]),
    );
  }
  if (value instanceof Set) return [...value].map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();

  if (t === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return '[UNKNOWN]';
}

/**
 * Free text that may contain anything — an exception message, a third-party
 * error string. There is no key to judge it by, so it is truncated hard. A log
 * line is for finding the code path, not for reading the content.
 */
export function redactFreeText(text: string, maxLength = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength)}…[TRUNCATED]`;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  readonly level: LogLevel;
  readonly event: string;
  readonly data: unknown;
}

export type LogSink = (record: LogRecord) => void;

/**
 * Where log records go. Default is a no-op: this project has no log
 * destination yet, and a default that printed would be a default that leaks.
 * Phase 8 wires a real sink; tests install a collector.
 */
let sink: LogSink = () => {};

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function resetLogSink(): void {
  sink = () => {};
}

/**
 * The only way anything in this system logs. `event` is a short stable name
 * ("lead.scored", "call.ingested") that must itself carry no caller data.
 */
export function log(level: LogLevel, event: string, data: unknown = {}): void {
  sink({ level, event, data: redact(data) });
}
