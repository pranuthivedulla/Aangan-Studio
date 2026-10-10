/**
 * T19 — The whole pipeline runs with mocks and no credentials.
 * T16 (part) — A designer cannot write a field they do not own.
 * T12 (part) — The double-booking race is prevented at the adapter boundary.
 * T17 (part) — A replayed notification is a no-op.
 * T23 — Swapping the calendar provider changes no pipeline code.
 *
 * Phase 1 can only test the adapter boundary; the pipeline stages themselves
 * land in Phases 2–4 and these tests grow with them. What IS provable today is
 * that nothing reaches for a credential, and that asking for a real adapter
 * fails loudly instead of quietly running a stub.
 */

import { describe, expect, it } from 'vitest';
import {
  AdapterNotConfiguredError,
  FieldOwnershipError,
  buildAdapters,
  mockCalendar,
  mockCrm,
  mockEmail,
  mockNotify,
  mockStore,
  mockVoice,
  resolveMode,
} from '@/adapters';
import type { Slot } from '@/types';

describe('T19 everything defaults to mock and needs no credentials', () => {
  it('builds a full adapter stack from an empty environment', () => {
    const adapters = buildAdapters({});
    expect(Object.keys(adapters).sort()).toEqual([
      'calendar',
      'crm',
      'email',
      'llm',
      'notify',
      'store',
      'voice',
    ]);
    for (const a of Object.values(adapters)) expect(a.mode).toBe('mock');
  });

  it('reads settings with no database', async () => {
    const adapters = buildAdapters({});
    const settings = await adapters.store.readSettings();
    expect(settings.RING_THRESHOLD).toBe(4);
  });

  it('treats anything other than "real" as mock, so a typo cannot go live', () => {
    expect(resolveMode('crm', { ADAPTER_MODE: 'reall' })).toBe('mock');
    expect(resolveMode('crm', { ADAPTER_MODE: 'REAL' })).toBe('mock');
    expect(resolveMode('crm', {})).toBe('mock');
    expect(resolveMode('crm', { ADAPTER_MODE: 'real' })).toBe('real');
  });

  it('per-adapter mode overrides the global one', () => {
    expect(resolveMode('crm', { ADAPTER_MODE: 'real', ADAPTER_MODE_CRM: 'mock' })).toBe('mock');
    expect(resolveMode('crm', { ADAPTER_MODE: 'mock', ADAPTER_MODE_CRM: 'real' })).toBe('real');
  });

  it('refuses a real adapter with no credentials, naming what is missing', () => {
    expect(() => buildAdapters({ ADAPTER_MODE_CRM: 'real' })).toThrow(AdapterNotConfiguredError);
    try {
      buildAdapters({ ADAPTER_MODE_CRM: 'real' });
    } catch (e) {
      expect((e as Error).message).toContain('HUBSPOT_PRIVATE_APP_TOKEN');
    }
  });

  it('refuses a real adapter even WITH credentials, because it is not built yet', () => {
    // The honest failure. A real adapter that has never been smoke-tested must
    // not be reachable just because a key is present.
    expect(() =>
      buildAdapters({ ADAPTER_MODE_CRM: 'real', HUBSPOT_PRIVATE_APP_TOKEN: 'x' }),
    ).toThrow(/not built yet/);
  });
});

describe('T16 field ownership is enforced at the CRM boundary', () => {
  it('lets the system write system fields', async () => {
    const crm = mockCrm();
    await crm.upsertClient('+919876543210', {});
    await expect(
      crm.writeFields({ clientId: '+919876543210', actor: 'system', fields: { status: 'booked' } }),
    ).resolves.toBeUndefined();
  });

  it('stops a designer writing a system field', async () => {
    const crm = mockCrm();
    await crm.upsertClient('+919876543210', {});
    await expect(
      crm.writeFields({ clientId: '+919876543210', actor: 'designer', fields: { criteria_scores: {} } }),
    ).rejects.toThrow(FieldOwnershipError);
  });

  it('stops the front desk writing designer fields', async () => {
    const crm = mockCrm();
    await crm.upsertClient('+919876543210', {});
    await expect(
      crm.writeFields({ clientId: '+919876543210', actor: 'front_desk', fields: { budget: 1 } }),
    ).rejects.toThrow(FieldOwnershipError);
  });

  it('lets a designer write their own fields', async () => {
    const crm = mockCrm();
    await crm.upsertClient('+919876543210', {});
    await expect(
      crm.writeFields({
        clientId: '+919876543210',
        actor: 'designer',
        fields: { budget: 1200000, granola_notes: 'n' },
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects an unknown field rather than storing it', async () => {
    const crm = mockCrm();
    await crm.upsertClient('+919876543210', {});
    await expect(
      crm.writeFields({ clientId: '+919876543210', actor: 'system', fields: { whatever: 1 } }),
    ).rejects.toThrow(/Unknown CRM field/);
  });
});

describe('T09 one client record, however many calls', () => {
  it('upserting the same phone twice keeps one record', async () => {
    const crm = mockCrm();
    await crm.upsertClient('+919876543210', { name: 'Ritu' });
    await crm.upsertClient('+919876543210', { location: 'Pimple Saudagar' });
    expect(crm.clients.size).toBe(1);
    expect(crm.clients.get('+919876543210')).toMatchObject({
      name: 'Ritu',
      location: 'Pimple Saudagar',
    });
  });
});

describe('T12 double booking is prevented at the insert', () => {
  const slot: Slot = {
    startsAt: '2026-10-12T11:00:00+05:30',
    endsAt: '2026-10-12T12:00:00+05:30',
    designerId: 'd1',
  };
  const args = {
    slot,
    designerEmail: 'd1@example.invalid',
    clientEmail: null,
    summary: 'Consultation',
    description: 'no price here',
    idempotencyKey: 'k1',
  };

  it('inserts once', async () => {
    const cal = mockCalendar();
    expect(await cal.createEvent(args)).not.toBeNull();
  });

  it('returns null rather than double-booking the same slot', async () => {
    const cal = mockCalendar();
    await cal.createEvent(args);
    expect(await cal.createEvent({ ...args, idempotencyKey: 'k2' })).toBeNull();
    expect(cal.events).toHaveLength(1);
  });

  it('returns null when the slot is taken between offer and insert', async () => {
    const cal = mockCalendar({ stealSlotOnInsert: true });
    expect(await cal.createEvent(args)).toBeNull();
  });
});

describe('T23 the calendar provider is swappable', () => {
  it('a different provider satisfies the same interface', async () => {
    for (const provider of ['mock-google', 'mock-calcom', 'mock-calendly']) {
      const cal = mockCalendar({ provider });
      expect(cal.provider).toBe(provider);
      expect(await cal.freeBusy('d1', '2026-10-12T00:00:00+05:30', '2026-10-13T00:00:00+05:30')).toEqual([]);
    }
  });
});

describe('T17 replays do not duplicate', () => {
  it('the same notification key sends once', async () => {
    const notify = mockNotify();
    await notify.send({ chat: 'designers', text: 'lead', idempotencyKey: 'dup' });
    await notify.send({ chat: 'designers', text: 'lead', idempotencyKey: 'dup' });
    expect(notify.sent).toHaveLength(1);
  });

  it('the same email key sends once', async () => {
    const email = mockEmail();
    await email.send({ to: 'd3@example.invalid', subject: 's', body: 'b', idempotencyKey: 'dup' });
    await email.send({ to: 'd3@example.invalid', subject: 's', body: 'b', idempotencyKey: 'dup' });
    expect(email.sent).toHaveLength(1);
  });

  it('the store remembers keys it has seen', async () => {
    const store = mockStore();
    expect(await store.seenIdempotencyKey('w1')).toBe(false);
    await store.recordIdempotencyKey('w1');
    expect(await store.seenIdempotencyKey('w1')).toBe(true);
  });
});

describe('D27 the voice adapter declares which orchestration it has', () => {
  it('per-turn mode can reply mid-call', async () => {
    const voice = mockVoice({ orchestration: 'per_turn' });
    await voice.replyToTurn(
      { callId: 'c1', turnIndex: 0, callerUtterance: 'hi', transcriptSoFar: 'hi' },
      { say: 'Good morning, Aangan Studio.' },
    );
    expect(voice.turnReplies).toHaveLength(1);
  });

  it('post-call-only mode refuses, instead of pretending mid-call works', async () => {
    const voice = mockVoice({ orchestration: 'post_call_only' });
    await expect(
      voice.replyToTurn(
        { callId: 'c1', turnIndex: 0, callerUtterance: 'hi', transcriptSoFar: 'hi' },
        { say: 'x' },
      ),
    ).rejects.toThrow(/post_call_only/);
  });

  it('only trusts a correctly signed webhook', () => {
    const voice = mockVoice();
    expect(voice.verifyWebhook('{}', 'mock-valid-signature')).toBe(true);
    expect(voice.verifyWebhook('{}', 'anything-else')).toBe(false);
  });
});
