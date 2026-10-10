/**
 * Guards on the config layer and the fixture set.
 *
 * These are the tests that catch Phase 1 rotting: a fixture that stops parsing,
 * a scope class that quietly starts declining people, a budget floor invented
 * by a later session, Nikhil ending up on the rota as a designer.
 */

import { describe, expect, it } from 'vitest';
import { PHONE_FIXTURES, loadPhoneTranscripts } from '../fixtures/phone-transcripts';
import { SCOPE_CLASSES, declinesOnScope, scopeById, COMMERCIAL_MIN_SQFT, COMMERCIAL_MAX_SQFT } from '@config/scope';
import { BUDGET_FLOORS, floorsAreConfigured, floorFor } from '@config/budget-floor';
import { DESIGNERS, ROTA, eligibleDesignerIds, onDuty } from '@config/rota';
import { resolveArea, KNOWN_GAPS, EXCLUDED_PLACES } from '@config/localities';
import { OPEN_DECISIONS, blockingDecisions, decisionById } from '@config/open-decisions';

describe('the 20 phone transcripts parse out of the source file', () => {
  const parsed = loadPhoneTranscripts();

  it('finds all 20', () => {
    expect([...parsed.keys()].sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('has a fixture row for each', () => {
    expect(PHONE_FIXTURES.map((f) => f.id).sort()).toEqual([...parsed.keys()].sort());
  });

  it.each([...parsed.values()].map((t) => [t.id, t] as const))(
    '%s has a non-trivial body',
    (_id, t) => {
      expect(t.body.length).toBeGreaterThan(40);
    },
  );

  it('T08 is the missed call with no dialogue', () => {
    expect(parsed.get('T08')?.body).toContain('Missed call');
  });

  it('T17 contains both legs of the dropped-and-recalled conversation', () => {
    const body = parsed.get('T17')?.body ?? '';
    expect(body).toContain('First call');
    expect(body).toContain('Second call');
  });

  it('does not bleed WhatsApp or web-form records into the phone set', () => {
    for (const t of parsed.values()) {
      expect(t.body).not.toContain('WhatsApp');
      expect(t.body).not.toContain('Web Form');
    }
  });
});

describe('pending-ruling fixtures are exactly those with no defensible answer', () => {
  const pending = PHONE_FIXTURES.filter((f) => f.expected === 'pending-ruling');

  it('there are three of them', () => {
    // T16 left this list on 10 Oct 2026: D22's never-park default is now
    // implemented, so the repeat caller decides cleanly instead of waiting on
    // a ruling.
    expect(pending.map((f) => f.id)).toEqual(['T10', 'T14', 'T18']);
  });

  it('each names an open decision that exists and is blocking', () => {
    for (const f of pending) {
      expect(f.pendingDecision).toBeTruthy();
      const d = decisionById(f.pendingDecision as string);
      expect(d.status).toBe('blocking');
    }
  });

  it('every other fixture has a real outcome', () => {
    for (const f of PHONE_FIXTURES.filter((x) => x.expected !== 'pending-ruling')) {
      expect(['book', 'ask_one', 'decline', 'review', 'park', 'complaint']).toContain(f.expected);
    }
  });
});

describe('scope classes', () => {
  it('only out-of-service and advice-only decline', () => {
    const declining = SCOPE_CLASSES.filter((s) => s.routing === 'decline').map((s) => s.id);
    expect(declining.sort()).toEqual(['advice_only', 'out_of_service']);
  });

  it('advice_only declines, per the D26 ruling', () => {
    expect(declinesOnScope('advice_only')).toBe(true);
  });

  it('an undocumented commercial minimum goes to review, never a decline', () => {
    expect(declinesOnScope('commercial_below_min')).toBe(false);
    expect(scopeById('commercial_below_min').routing).toBe('review');
    expect(scopeById('commercial_below_min').pendingDecision).toContain('D2');
  });

  it('an unclear scope never declines on its own', () => {
    expect(declinesOnScope('unclear')).toBe(false);
  });

  it('has no commercial minimum, because no context file states one', () => {
    expect(COMMERCIAL_MIN_SQFT).toBeNull();
    expect(COMMERCIAL_MAX_SQFT).toBe(3000);
  });

  it('every class cites a source', () => {
    for (const s of SCOPE_CLASSES) expect(s.basis.length).toBeGreaterThan(20);
  });
});

describe('budget floors are not invented', () => {
  it('no floor is set yet', () => {
    expect(floorsAreConfigured()).toBe(false);
    for (const v of Object.values(BUDGET_FLOORS)) expect(v).toBeNull();
  });

  it('floorFor returns null, so criterion 4 cannot fail anyone yet', () => {
    expect(floorFor('full_home')).toBeNull();
    expect(floorFor('partial')).toBeNull();
  });

  it('D20 is still blocking', () => {
    expect(decisionById('D20').status).toBe('blocking');
  });
});

describe('service area resolution', () => {
  it('recognises served Pune and PCMC localities', () => {
    expect(resolveArea('Kothrud - Dahanukar Colony')).toBe('in_area');
    expect(resolveArea('Pimple Saudagar')).toBe('in_area');
    expect(resolveArea('Hinjewadi Phase 1, Pune')).toBe('in_area');
  });

  it('fails only the explicitly excluded places', () => {
    for (const place of EXCLUDED_PLACES) expect(resolveArea(place)).toBe('excluded');
    expect(resolveArea('Talegaon Dabhade, near Pune')).toBe('excluded');
    expect(resolveArea('I am in Nashik')).toBe('excluded');
  });

  it('returns unknown, never excluded, for a Pune locality that is not on the list', () => {
    // The whole point: a wrong decline on criterion 2 is unrecoverable.
    for (const gap of KNOWN_GAPS) expect(resolveArea(gap.place)).toBe('unknown');
    expect(resolveArea('Kharadi')).toBe('unknown');
    expect(resolveArea(null)).toBe('unknown');
    expect(resolveArea('')).toBe('unknown');
  });

  it('accepts bare Pune or PCMC', () => {
    expect(resolveArea('Pune')).toBe('in_area');
    expect(resolveArea('PCMC')).toBe('in_area');
  });
});

describe('rota: Nikhil is never a designer and never a backup', () => {
  it('the founder is not eligible', () => {
    expect(eligibleDesignerIds()).not.toContain('nikhil');
  });

  it('he is on no rota row, as primary or backup', () => {
    for (const row of ROTA) {
      expect(row.primaryDesignerIds).not.toContain('nikhil');
      expect(row.backupDesignerId).not.toBe('nikhil');
    }
  });

  it('every rota id is a real designer and eligible', () => {
    const eligible = new Set(eligibleDesignerIds());
    for (const row of ROTA) {
      for (const id of [...row.primaryDesignerIds, row.backupDesignerId]) {
        expect(eligible.has(id), `${id} is on the rota but not eligible`).toBe(true);
      }
    }
  });

  it('has a date with nobody on duty, to exercise the fallback', () => {
    expect(onDuty('2026-10-14')).toBeNull();
  });

  it('is clearly labelled seed data', () => {
    for (const d of DESIGNERS) {
      if (d.id === 'nikhil') continue;
      expect(d.name).toContain('Seed');
      expect(d.email).toContain('example.invalid');
    }
  });
});

describe('open decisions', () => {
  it('ids are unique', () => {
    const ids = OPEN_DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every decision states what the code does today', () => {
    for (const d of OPEN_DECISIONS) expect(d.currentDefault.length).toBeGreaterThan(10);
  });

  it('every ruled decision records the ruling', () => {
    for (const d of OPEN_DECISIONS.filter((x) => x.status === 'ruled')) {
      expect(d.ruling, `${d.id} is ruled but records no ruling`).toBeTruthy();
    }
  });

  it('the blocking set is the five I cannot proceed past', () => {
    expect(blockingDecisions().map((d) => d.id).sort()).toEqual([
      'D13',
      'D2',
      'D20',
      'D21',
      'D27',
    ]);
  });

  it('records the three rulings of 10 Oct 2026', () => {
    expect(decisionById('D24').status).toBe('ruled');
    expect(decisionById('D24').currentDefault).toContain('2');
    expect(decisionById('D25').status).toBe('ruled');
    expect(decisionById('D26').status).toBe('ruled');
  });
});
