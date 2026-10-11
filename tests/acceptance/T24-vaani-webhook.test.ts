/**
 * The Vaani webhook: signed, defensively parsed, and safe to leave on a
 * public URL.
 *
 * Everything asserted here comes from Vaani's published OpenAPI spec
 * (/openapi/v1/vaanivoice.yaml), read on 11 Oct 2026, not from guesswork.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { signBody, verifySignature } from '@/vaani/signature';
import {
  VAANI_EVENT_TYPES,
  extractCallId,
  extractTranscript,
  parseVaaniEvent,
} from '@/vaani/events';
import { resetLogSink, setLogSink, type LogRecord } from '@/logging';

const SECRET = 'vv_whk_test_secret_value';
const body = (o: unknown): string => JSON.stringify(o);

describe('signature verification', () => {
  const raw = body({ type: 'call.completed', data: {} });

  it('accepts a correctly signed body', () => {
    expect(verifySignature(raw, signBody(raw, SECRET), SECRET).ok).toBe(true);
  });

  it('produces the shape their spec describes: sha256= plus 64 lowercase hex', () => {
    expect(signBody(raw, SECRET)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('rejects a body that was altered after signing', () => {
    const signature = signBody(raw, SECRET);
    const tampered = body({ type: 'call.completed', data: { injected: true } });
    expect(verifySignature(tampered, signature, SECRET).ok).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySignature(raw, signBody(raw, 'not-the-secret'), SECRET).ok).toBe(false);
  });

  it('rejects a missing signature', () => {
    const v = verifySignature(raw, null, SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('missing');
  });

  it('rejects a malformed signature without trying to compare it', () => {
    for (const bad of ['', 'sha256=', 'deadbeef', 'sha256=XYZ', `sha256=${'a'.repeat(63)}`]) {
      const v = verifySignature(raw, bad, SECRET);
      expect(v.ok, bad).toBe(false);
    }
  });

  it('rejects uppercase hex, because the spec says lowercase', () => {
    const upper = signBody(raw, SECRET).toUpperCase().replace('SHA256=', 'sha256=');
    expect(verifySignature(raw, upper, SECRET).ok).toBe(false);
  });

  it('refuses everything when no secret is configured, rather than waving it through', () => {
    const v = verifySignature(raw, signBody(raw, SECRET), undefined);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('no_secret');
  });

  it('is sensitive to whitespace, which is why the route must verify raw bytes', () => {
    const signature = signBody(raw, SECRET);
    const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
    expect(verifySignature(reserialised, signature, SECRET).ok).toBe(false);
  });
});

describe('event parsing is defensive, as their spec demands', () => {
  it('knows the event catalogue from the spec', () => {
    expect(VAANI_EVENT_TYPES).toContain('call.completed');
    expect(VAANI_EVENT_TYPES).toContain('call.failed');
    expect(VAANI_EVENT_TYPES).toContain('lead.created');
    expect(VAANI_EVENT_TYPES).toContain('webhook.ping');
    // The thing that is NOT there, and that the whole design hinged on.
    expect(VAANI_EVENT_TYPES.some((t) => t.includes('turn'))).toBe(false);
    expect(VAANI_EVENT_TYPES.some((t) => t.includes('tool'))).toBe(false);
  });

  it('accepts an envelope with only the guaranteed fields', () => {
    const r = parseVaaniEvent(body({ type: 'call.completed' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.data).toEqual({});
  });

  it('accepts an event type it has never seen, so the subscription is not disabled', () => {
    const r = parseVaaniEvent(body({ type: 'call.whispered', data: {} }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.known).toBe(false);
  });

  it('survives a payload where every sub-field is missing', () => {
    const r = parseVaaniEvent(body({ type: 'call.completed', data: {} }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(extractTranscript(r.event)).toBeNull();
      expect(extractCallId(r.event)).toBeNull();
    }
  });

  it('survives junk inside data without throwing', () => {
    const r = parseVaaniEvent(body({ type: 'call.completed', data: { transcript: 42, nested: { a: [1] } } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(extractTranscript(r.event)).toBeNull();
  });

  it('finds a transcript under any of the plausible keys', () => {
    for (const key of ['transcript', 'full_transcript', 'text', 'conversation']) {
      const r = parseVaaniEvent(body({ type: 'call.completed', data: { [key]: 'Caller: hello' } }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(extractTranscript(r.event), key).toBe('Caller: hello');
    }
  });

  it('rejects a body that is not JSON', () => {
    const r = parseVaaniEvent('not json at all');
    expect(r.ok).toBe(false);
  });

  it('rejects an envelope with no type', () => {
    expect(parseVaaniEvent(body({ data: {} })).ok).toBe(false);
  });
});

describe('nothing from an unverified or untrusted body reaches a log', () => {
  let captured: LogRecord[] = [];
  beforeEach(() => {
    captured = [];
    setLogSink((r) => captured.push(r));
  });
  afterEach(() => resetLogSink());

  it('the parse failure reason carries no payload content', () => {
    const r = parseVaaniEvent(body({ type: 123, data: { transcript: 'Caller: my name is Priya' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).not.toContain('Priya');
      expect(r.reason.length).toBeLessThan(80);
    }
  });

  it('a signature verdict reason is a fixed word, never the body', () => {
    const v = verifySignature(body({ secret: 'Caller: Priya' }), 'sha256=bad', SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(['missing', 'malformed', 'mismatch', 'no_secret']).toContain(v.reason);
  });
});
