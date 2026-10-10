/**
 * T22 (adapted) — the deployed page renders from the engine via adapters, and
 * leaks nothing.
 *
 * The deployment is PUBLIC, because the repository is open for coursework
 * assessment. That makes the results page an outbound surface, so it gets the
 * same treatment as Telegram and email: no caller speech, no transcript, no
 * names, no phone numbers, no price figures.
 *
 * `runAllCalls` is the only data the page receives, so asserting on its output
 * is asserting on the page.
 */

import { describe, expect, it } from 'vitest';
import { CALL_IDS, outcomeCounts, runAllCalls, runOneCall } from '@/demo/run-calls';
import { transcriptFor } from '@/demo/transcripts';
import { readingFor } from '@/demo/readings';
import { containsNoPriceFigure } from '@config/price-language';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { PHONE_FIXTURES } from '../fixtures/phone-transcripts';

const ROWS = runAllCalls();
const SERIALISED = JSON.stringify(ROWS);

describe('the page renders all twenty calls', () => {
  it('has a row per call', () => {
    expect(ROWS).toHaveLength(20);
    expect(ROWS.map((r) => r.id)).toEqual([...CALL_IDS]);
  });

  it('agrees with the test suite, because it is the same code', () => {
    for (const fixture of PHONE_FIXTURES) {
      if (fixture.expected === 'pending-ruling') continue;
      const row = ROWS.find((r) => r.id === fixture.id);
      expect(row?.outcome, fixture.id).toBe(fixture.expected);
    }
  });

  it('is deterministic — the same build renders the same table', () => {
    expect(JSON.stringify(runAllCalls())).toBe(SERIALISED);
  });

  it('counts outcomes the way the page displays them', () => {
    const counts = outcomeCounts(ROWS);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(20);
    expect(counts['park']).toBeUndefined();
  });
});

describe('T22 the public page leaks no caller speech', () => {
  it('contains no evidence quote from any reading', () => {
    for (const id of CALL_IDS) {
      for (const judgement of readingFor(id).criteria) {
        const quote = judgement.evidence_quote;
        if (quote === null || quote.length < 12) continue;
        expect(SERIALISED, `${id} quote leaked`).not.toContain(quote);
      }
    }
  });

  it('contains no sentence from any transcript', () => {
    for (const id of CALL_IDS) {
      const sentences = transcriptFor(id)
        .body.split(/[.?]\s+/)
        .map((x) => x.replace(/^(Caller|Front Desk):\s*/, '').trim())
        .filter((x) => x.length > 25);
      for (const sentence of sentences) {
        expect(SERIALISED, `${id}: "${sentence.slice(0, 40)}…"`).not.toContain(sentence);
      }
    }
  });

  it('contains none of the caller names from the September set', () => {
    for (const name of [
      'Priya', 'Aarti', 'Mehta', 'Sheetal', 'Deshpande', 'Anand', 'Sharma', 'Girish',
      'Nair', 'Ritu', 'Kapoor', 'Smita', 'Pooja', 'Suresh', 'Patil', 'Vikram', 'Agarwal',
    ]) {
      expect(SERIALISED, name).not.toContain(name);
    }
  });

  it('contains no locality detail beyond what the scope class says', () => {
    for (const place of ['Dahanukar', 'Cybercity', 'Sunderban', 'Nanded City']) {
      expect(SERIALISED, place).not.toContain(place);
    }
  });

  it('contains no phone number or email', () => {
    expect(SERIALISED).not.toMatch(/\+91\d{8,}/);
    expect(SERIALISED).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
  });

  it('contains no price figure', () => {
    expect(containsNoPriceFigure(SERIALISED).ok).toBe(true);
  });

  it('publishes only the fields the page needs', () => {
    const allowed = new Set([
      'id', 'results', 'scopeClass', 'intent', 'outcome', 'rule', 'borderline',
      'questionCriterionId', 'blockedBy', 'downgrades', 'rationale', 'reachesDesigner',
      'priorityScore', 'priorityBand',
    ]);
    for (const row of ROWS) {
      for (const key of Object.keys(row)) expect(allowed.has(key), key).toBe(true);
    }
  });
});

describe('the page reflects settings rather than hard-coding them', () => {
  it('a different gate threshold changes the published table', () => {
    const strict = runOneCall('T07', { ...DEFAULT_SETTINGS, GATE_FAIL_THRESHOLD: 1 });
    expect(runOneCall('T07').outcome).toBe('review');
    expect(strict.outcome).toBe('decline');
  });

  it('the kill switch sends every call to the front desk', () => {
    const killed = runAllCalls({
      ...DEFAULT_SETTINGS,
      KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK: true,
    });
    expect(new Set(killed.map((r) => r.outcome))).toEqual(new Set(['review']));
  });
});
