/**
 * Runtime settings access (brief §8A).
 *
 * Read at call time through the store adapter, validated, cached for a few
 * seconds so a call does not make seven database round trips, and invalidated
 * on write so a change takes effect on the next call with no deploy
 * (acceptance test T29).
 *
 * The cache TTL is the one place a stale setting could survive a change. It is
 * deliberately short and the write path clears it, so the worst case is a
 * handful of seconds, not a deploy.
 */

import type { StoreAdapter } from '@/adapters/types';
import { DEFAULT_SETTINGS, type Settings } from '@config/settings-schema';

export const CACHE_TTL_MS = 5_000;

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class SettingsService {
  private cached: Settings | null = null;
  private cachedAt = 0;

  constructor(
    private readonly store: StoreAdapter,
    private readonly clock: Clock = systemClock,
  ) {}

  async get(): Promise<Settings> {
    const now = this.clock.now();
    if (this.cached && now - this.cachedAt < CACHE_TTL_MS) return this.cached;
    const fresh = await this.store.readSettings();
    this.cached = fresh;
    this.cachedAt = now;
    return fresh;
  }

  /**
   * Write one setting. Returns the store's verdict; an invalid value is
   * rejected with a reason and nothing is saved or cached.
   */
  async set(args: {
    key: string;
    value: unknown;
    changedBy: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const result = await this.store.writeSetting(args);
    if (result.ok) this.invalidate();
    return result;
  }

  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }

  /** Escape hatch for tests and for the kill-switch check on a cold start. */
  static defaults(): Settings {
    return DEFAULT_SETTINGS;
  }
}

/**
 * The kill switch is checked before anything else in the call path: every call
 * goes to the front desk, and the agent books nobody and declines nobody.
 */
export function killSwitchOn(settings: Settings): boolean {
  return settings.KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK;
}
