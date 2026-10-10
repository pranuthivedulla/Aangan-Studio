/**
 * T01, second half — the price guard holds at RUNTIME, not just in the repo.
 *
 * The defect this closes, found in the Phase 1 review: the sentence the agent
 * speaks about price is a runtime setting. The committed phrases were swept for
 * price figures; the setting was a plain string. So non-negotiable 1 — the
 * first rule in the brief — could be defeated from the admin page, with no
 * deploy and no code review.
 */

import { describe, expect, it } from 'vitest';
import { containsNoPriceLanguage } from '@config/price-language';
import { validateSetting } from '@config/settings-schema';
import { ALL_OUTBOUND_PHRASES, PRICE_DEFLECTION } from '@config/approved-phrases';
import { mockStore } from '@/adapters/mocks';
import { SettingsService } from '@/settings';

const REJECTED: readonly [string, string][] = [
  ['a per-sq-ft rate', 'For a 2BHK it is typically Rs 1,800 per sq ft.'],
  ['a bare figure', 'It will be about 1800 a square foot.'],
  ['a rupee amount', 'Projects start from ₹20,00,000.'],
  ['lakhs in words', 'A single room is usually a few lakh all in.'],
  ['number words, no digits', 'Expect roughly eighteen hundred per square foot.'],
  ['a promise to quote', 'Our rates start at a competitive level.'],
  ['a ballpark offer', 'I can give you a rough ballpark on the call.'],
  ['a price list offer', 'I will email you our price list.'],
  ['an estimate offer', 'I can share an estimate right now.'],
  ['a cost hedge', "It'll cost around the market average."],
];

describe('T01b the approved price sentence cannot carry a price', () => {
  it.each(REJECTED)('rejects %s', (_label, text) => {
    const verdict = containsNoPriceLanguage(text);
    expect(verdict.ok).toBe(false);
  });

  it.each(REJECTED)('the settings page rejects %s too', (_label, text) => {
    const result = validateSetting('APPROVED_PRICE_SENTENCE', text);
    expect(result.ok).toBe(false);
  });

  it('gives a reason a non-technical person can act on', () => {
    const verdict = containsNoPriceLanguage('Around 2,000 per sq ft.');
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('no digits');
  });

  it('accepts the approved sentence itself', () => {
    expect(containsNoPriceLanguage(PRICE_DEFLECTION).ok).toBe(true);
    expect(validateSetting('APPROVED_PRICE_SENTENCE', PRICE_DEFLECTION).ok).toBe(true);
  });

  it('accepts every committed outbound phrase', () => {
    for (const phrase of ALL_OUTBOUND_PHRASES) {
      expect(containsNoPriceLanguage(phrase).ok, phrase).toBe(true);
    }
  });

  it('accepts a legitimate reworded deflection', () => {
    expect(
      containsNoPriceLanguage(
        'That depends entirely on your site and the materials you pick — the designer will ' +
          'take you through all of it at the consultation, which I can book now.',
      ).ok,
    ).toBe(true);
  });

  it('allows the setting to be cleared back to the default', () => {
    expect(validateSetting('APPROVED_PRICE_SENTENCE', null).ok).toBe(true);
  });

  it('a bad value is not saved, and the old one still stands', async () => {
    const store = mockStore();
    const svc = new SettingsService(store, { now: () => 0 });

    const result = await svc.set({
      key: 'APPROVED_PRICE_SENTENCE',
      value: 'Roughly 2,400 per sq ft for premium.',
      changedBy: 'front_desk_lead',
    });

    expect(result.ok).toBe(false);
    expect((await svc.get()).APPROVED_PRICE_SENTENCE).toBeNull();
    expect(await store.settingsAudit()).toHaveLength(0);
  });

  it('a clean rewording does save, and is audited', async () => {
    const store = mockStore();
    const svc = new SettingsService(store, { now: () => 0 });
    const clean = 'Pricing depends on your site and materials; your designer will explain it all.';

    expect((await svc.set({ key: 'APPROVED_PRICE_SENTENCE', value: clean, changedBy: 'nikhil' })).ok).toBe(true);
    expect((await svc.get()).APPROVED_PRICE_SENTENCE).toBe(clean);
    expect((await store.settingsAudit())[0]).toMatchObject({ key: 'APPROVED_PRICE_SENTENCE', changedBy: 'nikhil' });
  });
});
