/**
 * T18 — No transcript and no secret ever appears in a log.
 *
 * The gap this closes: until 10 Oct 2026 the only protection was eslint's
 * `no-console`, which stops a careless print and nothing else. These tests use
 * the REAL September transcripts, so they fail on actual caller speech rather
 * than on a placeholder string.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  REDACTED,
  log,
  redact,
  redactFreeText,
  resetLogSink,
  setLogSink,
  type LogRecord,
} from '@/logging';
import { transcriptFor } from '../fixtures/phone-transcripts';
import type { Enquiry } from '@/types';

const t01 = transcriptFor('T01').body;
/** A distinctive phrase from the real T01 call, used as the canary. */
const CANARY = 'Dahanukar Colony';

const enquiry: Enquiry = {
  id: 'enq-1',
  channel: 'phone',
  receivedAt: '2026-09-02T10:23:00+05:30',
  callerId: '+919876543210',
  transcript: t01,
};

let captured: LogRecord[] = [];

beforeEach(() => {
  captured = [];
  setLogSink((r) => captured.push(r));
});
afterEach(() => resetLogSink());

function serialised(): string {
  return JSON.stringify(captured);
}

describe('T18 a transcript cannot reach a log', () => {
  it('the canary really is in the transcript, so this test is not vacuous', () => {
    expect(t01).toContain(CANARY);
  });

  it('logging a whole enquiry emits no transcript', () => {
    log('info', 'call.ingested', { enquiry });
    expect(serialised()).not.toContain(CANARY);
    expect(serialised()).not.toContain('Dahanukar');
  });

  it('logging an enquiry emits no phone number either', () => {
    log('info', 'call.ingested', { enquiry });
    expect(serialised()).not.toContain('+919876543210');
  });

  it('still emits something useful', () => {
    log('info', 'call.ingested', { enquiry });
    const record = captured[0];
    expect(record?.event).toBe('call.ingested');
    const data = record?.data as { enquiry: Record<string, unknown> };
    expect(data.enquiry['id']).toBe('enq-1');
    expect(data.enquiry['channel']).toBe('phone');
    expect(data.enquiry['transcript']).toBe(REDACTED);
  });

  it('redacts a transcript nested deep inside other data', () => {
    log('info', 'pipeline.step', { a: { b: { c: [{ transcript: t01 }] } } });
    expect(serialised()).not.toContain(CANARY);
  });

  it('redacts an evidence quote, in either naming style', () => {
    log('info', 'lead.scored', {
      scores: [
        { criterionId: 'real_project', evidenceQuote: 'We want to redo the whole thing' },
        { id: 'timeline', evidence_quote: 'We would like to be done by March' },
      ],
    });
    expect(serialised()).not.toContain('redo the whole thing');
    expect(serialised()).not.toContain('done by March');
  });

  it('redacts the designer-only handoff note', () => {
    log('info', 'handoff.written', { handoffNote: 'Caller mentioned ' + CANARY, prepSummary: CANARY });
    expect(serialised()).not.toContain(CANARY);
  });

  it('redacts an exception that is carrying a transcript', () => {
    const err = new Error('failed to score') as Error & { enquiry?: Enquiry };
    err.enquiry = enquiry;
    log('error', 'pipeline.failed', { err });
    expect(serialised()).not.toContain(CANARY);
  });

  it('truncates an exception message, because free text cannot be judged by key', () => {
    log('error', 'pipeline.failed', { err: new Error(t01) });
    expect(serialised()).not.toContain(CANARY);
    expect(serialised()).toContain('TRUNCATED');
  });

  it('redactFreeText flattens and truncates', () => {
    expect(redactFreeText('a\n  b   c')).toBe('a b c');
    expect(redactFreeText('x'.repeat(500))).toContain('TRUNCATED');
    expect(redactFreeText('x'.repeat(500)).length).toBeLessThan(200);
  });
});

describe('T18 a secret cannot reach a log', () => {
  it.each([
    ['GEMINI_API_KEY', 'AIza-not-a-real-key'],
    ['apiKey', 'sk-live-xyz'],
    ['HUBSPOT_PRIVATE_APP_TOKEN', 'pat-na1-secret'],
    ['authorization', 'Bearer abc.def'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'service-role-jwt'],
    ['webhookSecret', 'whsec_123'],
    ['password', 'hunter2'],
  ])('redacts %s by name', (key, value) => {
    log('info', 'adapter.configured', { [key]: value });
    expect(serialised()).not.toContain(value);
    expect(serialised()).toContain(REDACTED);
  });

  it('redacts a secret nested in an env-shaped object', () => {
    log('info', 'boot', { env: { ADAPTER_MODE: 'mock', VAANI_API_KEY: 'live-key-abc' } });
    expect(serialised()).not.toContain('live-key-abc');
    expect((captured[0]?.data as { env: Record<string, unknown> }).env['ADAPTER_MODE']).toBe('mock');
  });
});

describe('redact handles the shapes that actually turn up', () => {
  it('passes primitives through', () => {
    expect(redact(1)).toBe(1);
    expect(redact('plain')).toBe('plain');
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('redacts inside Maps and Sets', () => {
    expect(redact(new Map([['transcript', t01]]))).toEqual({ transcript: REDACTED });
    expect(JSON.stringify(redact(new Set([{ transcript: t01 }])))).not.toContain(CANARY);
  });

  it('does not recurse forever', () => {
    const cyclic: Record<string, unknown> = { depth: 0 };
    let node = cyclic;
    for (let i = 1; i < 30; i++) {
      const next: Record<string, unknown> = { depth: i };
      node['child'] = next;
      node = next;
    }
    expect(() => redact(cyclic)).not.toThrow();
    expect(JSON.stringify(redact(cyclic))).toContain('TRUNCATED');
  });

  it('replaces an unrecognised object rather than emitting it', () => {
    class Weird {
      constructor(readonly transcript: string) {}
    }
    // A class instance is still a plain object to Object.entries, so the key
    // rule applies and the transcript is caught.
    expect(JSON.stringify(redact(new Weird(t01)))).not.toContain(CANARY);
  });

  it('the default sink emits nowhere, so an unconfigured app cannot leak', () => {
    resetLogSink();
    expect(() => log('error', 'x', { transcript: t01 })).not.toThrow();
    expect(captured).toHaveLength(0);
  });
});
