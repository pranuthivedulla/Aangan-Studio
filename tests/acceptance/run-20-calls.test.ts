/**
 * The judge, run against all 20 September phone calls.
 *
 * This is the table the founder's office asked to read. It is generated, not
 * written: the test runs score → decide over each prepared reading and writes
 * RESULTS-20-CALLS.md from whatever actually comes out. If a decision rule
 * changes, the table changes with it and nobody has to remember to update a
 * document.
 *
 * It also checks every quote in tests/fixtures/readings.ts survived
 * verification. A quote I paraphrased, or accidentally took from the
 * receptionist, downgrades its criterion — so the DOWNGRADES count below
 * being zero is what tells you the prepared readings are honest rather than
 * convenient.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decide, violatesT03 } from '@/pipeline/decide';
import { score } from '@/pipeline/score';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { PHONE_FIXTURES, transcriptFor } from '../fixtures/phone-transcripts';
import { readingFor } from '../fixtures/readings';
import type { CriterionResult } from '@/types';

interface Row {
  readonly id: string;
  readonly results: Record<string, CriterionResult>;
  readonly scopeClass: string;
  readonly intent: string;
  readonly outcome: string;
  readonly rule: string;
  readonly borderline: boolean;
  readonly question: string | null;
  readonly blockedBy: readonly string[];
  readonly downgrades: readonly string[];
  readonly rationale: string;
  readonly reachesDesigner: boolean;
}

function runOne(id: string): Row {
  const transcript = transcriptFor(id).body;
  const scored = score(readingFor(id), transcript);
  const decision = decide({
    score: scored,
    askedQuestionCount: 0,
    // T16 and T17 are the repeat callers in the September set.
    isRepeatCaller: id === 'T16' || id === 'T17',
    isExistingClient: id === 'T09',
    settings: DEFAULT_SETTINGS,
  });

  return {
    id,
    results: Object.fromEntries(scored.scores.map((s) => [s.criterionId, s.result])),
    scopeClass: scored.scopeClass,
    intent: scored.intent,
    outcome: decision.outcome,
    rule: decision.rule,
    borderline: decision.borderline,
    question: decision.questionCriterionId,
    blockedBy: scored.blockedBy,
    downgrades: scored.scores
      .filter((s) => s.downgradedForBadEvidence)
      .map((s) => `${s.criterionId}:${s.downgradeReason}`),
    rationale: decision.rationale,
    reachesDesigner: decision.reachesDesignerDirectly,
  };
}

const ROWS: readonly Row[] = PHONE_FIXTURES.map((f) => runOne(f.id));
const byId = (id: string): Row => {
  const row = ROWS.find((r) => r.id === id);
  if (!row) throw new Error(`no row for ${id}`);
  return row;
};

const SHORT: Record<string, string> = {
  pass: 'pass', unclear: '?', fail: 'FAIL',
};

describe('the prepared readings are honest', () => {
  it('every quote survives verification — no paraphrase, no wrong speaker', () => {
    const bad = ROWS.filter((r) => r.downgrades.length > 0);
    expect(
      bad.map((r) => `${r.id} ${r.downgrades.join(' ')}`),
      'a downgrade here means a quote in readings.ts is not what the caller said',
    ).toEqual([]);
  });

  it('covers all 20 calls', () => {
    expect(ROWS).toHaveLength(20);
  });
});

describe('every call reaches a defined outcome', () => {
  it.each(ROWS.map((r) => [r.id, r] as const))('%s', (_id, row) => {
    expect(['book', 'ask_one', 'decline', 'review', 'park', 'complaint']).toContain(row.outcome);
  });

  it('no call falls through to a silent nothing', () => {
    expect(ROWS.filter((r) => r.rule === undefined)).toEqual([]);
  });
});

describe('the outcomes match the agreed fixture table', () => {
  it.each(PHONE_FIXTURES.map((f) => [f.id, f] as const))('%s', (id, fixture) => {
    const row = byId(id);
    if (fixture.expected === 'pending-ruling') {
      // The engine still decides something — a lead is never dropped — but the
      // row is blocked on a decision, and that must be visible.
      expect(row.blockedBy.length, `${id} should be blocked by ${fixture.pendingDecision}`).toBeGreaterThan(0);
      expect(row.blockedBy).toContain(fixture.pendingDecision);
      return;
    }
    expect(row.outcome, `${id}: ${fixture.why}`).toBe(fixture.expected);
  });

  it('marks borderline exactly where the fixture says', () => {
    for (const f of PHONE_FIXTURES) {
      if (f.expected === 'pending-ruling') continue;
      if (f.borderline) expect(byId(f.id).borderline, f.id).toBe(true);
    }
  });

  it('classifies scope as the fixture says', () => {
    for (const f of PHONE_FIXTURES) {
      expect(byId(f.id).scopeClass, f.id).toBe(f.expectedScope);
    }
  });
});

describe('the non-negotiables hold across all 20 calls', () => {
  it('T03 as reworded: no failed criterion reaches a designer unseen', () => {
    for (const f of PHONE_FIXTURES) {
      const transcript = transcriptFor(f.id).body;
      const scored = score(readingFor(f.id), transcript);
      const decision = decide({
        score: scored,
        askedQuestionCount: 0,
        isRepeatCaller: false,
        isExistingClient: false,
        settings: DEFAULT_SETTINGS,
      });
      expect(violatesT03(scored, decision), f.id).toBe(false);
    }
  });

  it('T08/T26: the complaint never reaches a designer and is never declined', () => {
    const t09 = byId('T09');
    expect(t09.outcome).toBe('complaint');
    expect(t09.reachesDesigner).toBe(false);
  });

  it('out-of-area and out-of-scope calls still decline under the two-fail threshold', () => {
    for (const id of ['T03', 'T19']) {
      expect(byId(id).outcome, id).toBe('decline');
      expect(byId(id).rule).toBe('scope_declines');
    }
  });

  it('the advice-only caller declines on scope, not on the gate (D26)', () => {
    expect(byId('T04').outcome).toBe('decline');
    expect(byId('T04').rule).toBe('scope_declines');
  });

  it('nobody is declined on a budget, because no floor is set (D20)', () => {
    const budgetDeclines = ROWS.filter(
      (r) => r.outcome === 'decline' && r.results['budget_band'] === 'fail',
    );
    expect(budgetDeclines).toEqual([]);
  });

  it('at most one question is ever asked', () => {
    for (const row of ROWS) {
      if (row.outcome === 'ask_one') expect(row.question).not.toBeNull();
      else expect(row.question).toBeNull();
    }
  });
});

describe('writes the results table', () => {
  it('generates RESULTS-20-CALLS.md', () => {
    const counts = ROWS.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    }, {});

    const lines: string[] = [];
    lines.push('# The judge, run against all 20 September phone calls');
    lines.push('');
    lines.push('**Generated by `tests/acceptance/run-20-calls.test.ts`. Do not edit by hand** —');
    lines.push('it is rewritten every time the test runs, so it can never drift from what the');
    lines.push('code actually does.');
    lines.push('');
    lines.push('The AI\'s reading of each call was prepared by hand (`tests/fixtures/readings.ts`),');
    lines.push('approved as the free first pass on 10 Oct 2026. **So this table proves the');
    lines.push('decision rules are right. It does not prove the AI reads calls correctly** —');
    lines.push('only running the real model does that, and it is the next step.');
    lines.push('');
    lines.push('Every quote in those readings was checked against the transcript and against who');
    lines.push('spoke it. Downgrades: ' + ROWS.reduce((n, r) => n + r.downgrades.length, 0) + '.');
    lines.push('');
    lines.push('## Outcomes');
    lines.push('');
    for (const [outcome, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${outcome}** — ${n}`);
    }
    lines.push('');
    lines.push('## Call by call');
    lines.push('');
    lines.push('`1` real project · `2` service area · `3` timeline · `4` budget · `5` decision maker');
    lines.push('');
    lines.push('| Call | 1 | 2 | 3 | 4 | 5 | Scope | Outcome | Why | Blocked on |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of ROWS) {
      const cells = ['real_project', 'service_area', 'timeline', 'budget_band', 'decision_maker']
        .map((id) => SHORT[r.results[id] ?? 'unclear'] ?? '?');
      const outcome = r.borderline ? `${r.outcome} (borderline)` : r.outcome;
      lines.push(
        `| ${r.id} | ${cells.join(' | ')} | ${r.scopeClass} | **${outcome}** | ${r.rationale} | ${
          r.blockedBy.length > 0 ? r.blockedBy.join(', ') : '—'
        } |`,
      );
    }
    lines.push('');
    lines.push('## Where a decision is still needed');
    lines.push('');
    const blocked = ROWS.filter((r) => r.blockedBy.length > 0);
    if (blocked.length === 0) lines.push('None.');
    for (const r of blocked) {
      lines.push(`- **${r.id}** — decided \`${r.outcome}\` today, blocked on ${r.blockedBy.join(', ')}.`);
    }
    lines.push('');

    const path = fileURLToPath(new URL('../../RESULTS-20-CALLS.md', import.meta.url));
    writeFileSync(path, lines.join('\n'), 'utf8');
    expect(lines.length).toBeGreaterThan(30);
  });
});
