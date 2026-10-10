/**
 * T29 — Runtime settings change behaviour without a deploy, invalid values are
 * rejected, and every change is logged (brief §8A).
 *
 * Also asserts the two rulings of 10 Oct 2026 are actually the defaults the
 * code runs with: GATE_FAIL_THRESHOLD = 2, and the kill switch off.
 */

import { describe, expect, it } from 'vitest';
import { mockStore } from '@/adapters/mocks';
import { SettingsService, killSwitchOn } from '@/settings';
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  SettingsSchema,
  validateSetting,
} from '@config/settings-schema';

class FakeClock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

describe('T29 settings are runtime, validated and audited', () => {
  it('a valid change takes effect on the next read, with no deploy', async () => {
    const store = mockStore();
    const clock = new FakeClock();
    const svc = new SettingsService(store, clock);

    expect((await svc.get()).MAX_UNCLEAR_FORWARD).toBe(1);

    const result = await svc.set({ key: 'MAX_UNCLEAR_FORWARD', value: 2, changedBy: 'nikhil' });
    expect(result.ok).toBe(true);

    // No clock advance, no restart: the write invalidated the cache.
    expect((await svc.get()).MAX_UNCLEAR_FORWARD).toBe(2);
  });

  it('rejects an invalid value with a reason and does not save it', async () => {
    const store = mockStore();
    const svc = new SettingsService(store, new FakeClock());

    const result = await svc.set({ key: 'RING_THRESHOLD', value: 99, changedBy: 'nikhil' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('RING_THRESHOLD');
    expect((await svc.get()).RING_THRESHOLD).toBe(4);
  });

  it('rejects a wrong-typed value', async () => {
    const store = mockStore();
    const svc = new SettingsService(store, new FakeClock());
    const result = await svc.set({ key: 'KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK', value: 'yes', changedBy: 'x' });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(validateSetting('NOT_A_SETTING', 1).ok).toBe(false);
  });

  it('rejects a malformed working-hours value', () => {
    expect(validateSetting('WORKING_HOURS_START', '25:00').ok).toBe(false);
    expect(validateSetting('WORKING_HOURS_START', '9am').ok).toBe(false);
    expect(validateSetting('WORKING_HOURS_START', '09:30').ok).toBe(true);
  });

  it('logs who changed what, from and to', async () => {
    const store = mockStore();
    const svc = new SettingsService(store, new FakeClock());
    await svc.set({ key: 'SLOT_COUNT_OFFERED', value: 2, changedBy: 'front_desk_lead' });

    const audit = await store.settingsAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      key: 'SLOT_COUNT_OFFERED',
      oldValue: 3,
      newValue: 2,
      changedBy: 'front_desk_lead',
    });
  });

  it('does not log a rejected change', async () => {
    const store = mockStore();
    const svc = new SettingsService(store, new FakeClock());
    await svc.set({ key: 'SLOT_COUNT_OFFERED', value: 50, changedBy: 'x' });
    expect(await store.settingsAudit()).toHaveLength(0);
  });

  it('caches for a few seconds and then re-reads', async () => {
    const store = mockStore();
    const clock = new FakeClock();
    const svc = new SettingsService(store, clock);

    await svc.get();
    // Change it behind the service's back, as another process would.
    await store.writeSetting({ key: 'SLOT_COUNT_OFFERED', value: 1, changedBy: 'other' });
    expect((await svc.get()).SLOT_COUNT_OFFERED).toBe(3); // still cached
    clock.advance(6_000);
    expect((await svc.get()).SLOT_COUNT_OFFERED).toBe(1); // re-read
  });

  it('rejects unknown keys at the schema level, so a typo cannot be stored', () => {
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, TYPO: 1 }).success).toBe(false);
  });

  it('every setting in the brief has a key', () => {
    for (const key of [
      'RING_THRESHOLD',
      'MAX_UNCLEAR_FORWARD',
      'ACK_WINDOW_WORKING_MIN',
      'WORKING_HOURS_START',
      'WORKING_DAYS',
      'HOLIDAYS',
      'SLOT_COUNT_OFFERED',
      'REPEAT_CALLER_WINDOW_DAYS',
      'AFTER_HOURS_COMPLAINT_BEHAVIOUR',
      'RESEND_FALLBACK_ENABLED',
      'APPROVED_PRICE_SENTENCE',
      'KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK',
    ]) {
      expect(SETTING_KEYS).toContain(key);
    }
  });
});

describe('the rulings of 10 Oct 2026 are the running defaults', () => {
  it('GATE_FAIL_THRESHOLD is 2 — one gate fail goes to review', () => {
    expect(DEFAULT_SETTINGS.GATE_FAIL_THRESHOLD).toBe(2);
  });

  it('the kill switch ships off', () => {
    expect(killSwitchOn(DEFAULT_SETTINGS)).toBe(false);
  });

  it('a repeat caller or service failure is never parked', () => {
    expect(DEFAULT_SETTINGS.NEVER_PARK_REPEAT_OR_SERVICE_FAILURE).toBe(true);
  });

  it('the kill switch can be thrown at runtime', async () => {
    const svc = new SettingsService(mockStore(), new FakeClock());
    await svc.set({ key: 'KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK', value: true, changedBy: 'nikhil' });
    expect(killSwitchOn(await svc.get())).toBe(true);
  });
});
