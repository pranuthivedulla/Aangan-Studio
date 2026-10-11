/**
 * The call script: what the agent says.
 *
 * Two things these tests exist to stop.
 *
 * A PRICE IN THE SCRIPT. The script is the one artefact a non-developer
 * edits, so it is the most likely place for a figure to appear — somebody
 * being helpful, adding "projects usually start around...". Every line is
 * swept.
 *
 * QUALIFICATION RULES IN THE SCRIPT. If the script starts saying "if they
 * are outside Pune, decline", the rule exists twice: here, untested, and in
 * decide.ts, tested. They will drift, and the untested copy is the one the
 * caller hears. The script gathers; the tools decide.
 */

import { describe, expect, it } from 'vitest';
import {
  CONSENT_LINE_PLACEHOLDER,
  SCRIPT,
  SCRIPT_STATUS,
  THINGS_TO_FIND_OUT,
  allProhibitions,
  allScriptLines,
  wholeScript,
} from '@config/call-script';
import { PRICE_DEFLECTION } from '@config/approved-phrases';
import { containsNoPriceFigure } from '@config/price-language';
import { decisionById } from '@config/open-decisions';

const LINES = allScriptLines();
const WHOLE = wholeScript();

describe('no price can reach a caller through the script', () => {
  it.each(LINES.map((l, i) => [i, l] as const))('line %i carries no figure', (_i, line) => {
    expect(containsNoPriceFigure(line).ok, line).toBe(true);
  });

  it('quotes the approved sentence verbatim, and only that', () => {
    const price = SCRIPT.find((s) => s.id === 'price');
    expect(price?.lines.join(' ')).toContain(PRICE_DEFLECTION);
  });

  it('forbids a figure in the plainest possible words', () => {
    const joined = allProhibitions().join(' ').toLowerCase();
    expect(joined).toContain('never give a figure');
    expect(joined).toContain('not even if they insist');
  });

  it('says asking about price is not a reason to end the call', () => {
    // qualified.md: "Asking for pricing (deflect, but do not disqualify)".
    expect(LINES.join(' ').toLowerCase()).toContain('never a reason to end the call');
  });

  it('the prohibitions exist, and are never swept because they name what they ban', () => {
    expect(allProhibitions().length).toBeGreaterThan(5);
    // Proof the separation is load-bearing rather than tidy-minded: this
    // line would fail the very sweep it exists to support.
    expect(containsNoPriceFigure(allProhibitions()[0] as string).ok).toBe(false);
  });
});

describe('the script gathers; it does not decide', () => {
  /**
   * Phrases that would mean a qualification rule had been written into the
   * script. Each is a real rule that lives in decide.ts and must stay there.
   */
  const DECISION_LANGUAGE: readonly RegExp[] = [
    /if .{0,40}\boutside\b.{0,30}\b(decline|refuse|say no)\b/i,
    /if .{0,40}\b(budget|too low|cheap)\b.{0,30}\b(decline|refuse|say no)\b/i,
    /if .{0,40}\b(nashik|mumbai|talegaon|lonavala)\b/i,
    /\b(decline|refuse) (them|the caller) if\b/i,
    /if .{0,40}\bweeks?\b.{0,30}\b(decline|refuse|say no|cannot help)\b/i,
    /\byou decide\b/i,
  ];

  it.each(DECISION_LANGUAGE.map((r, i) => [i, r] as const))(
    'contains no decision rule, pattern %i',
    (_i, pattern) => {
      const hit = WHOLE.find((l) => pattern.test(l));
      expect(hit, `script decides for itself: "${hit}"`).toBeUndefined();
    },
  );

  it('says outright that the tools decide', () => {
    const joined = WHOLE.join(' ').toLowerCase();
    expect(joined).toContain('never decide for yourself');
    expect(joined).toContain('the tools decide');
  });

  it('names no place from the service-area list, because that is the table’s job', () => {
    for (const place of ['Kothrud', 'Baner', 'Nashik', 'Talegaon', 'PCMC']) {
      expect(WHOLE.join(' '), place).not.toContain(place);
    }
  });

  it('never tells the agent to claim a booking before the tool confirms one', () => {
    expect(WHOLE.join(' ').toLowerCase()).toContain('never say a consultation is booked until');
  });
});

describe('box 3: the six things', () => {
  it('asks for all six', () => {
    expect(THINGS_TO_FIND_OUT).toHaveLength(6);
    expect(THINGS_TO_FIND_OUT.map((t) => t.id).sort()).toEqual([
      'area_sqft',
      'decision_maker',
      'location',
      'scope',
      'space_type',
      'timeline',
    ]);
  });

  it('uses Nikhil’s own wording for the timeline question', () => {
    // qualified.md: 'Ask: "When would you need the project complete?"'
    const timeline = THINGS_TO_FIND_OUT.find((t) => t.id === 'timeline');
    expect(timeline?.ask).toBe('When would you need the project complete?');
  });

  it('every question appears in the gathering section', () => {
    const gather = SCRIPT.find((s) => s.id === 'gather')?.lines.join(' ') ?? '';
    for (const thing of THINGS_TO_FIND_OUT) expect(gather, thing.id).toContain(thing.ask);
  });

  it('tells the agent to carry the caller’s own words, which the evidence check needs', () => {
    const gather = SCRIPT.find((s) => s.id === 'gather')?.lines.join(' ').toLowerCase() ?? '';
    expect(gather).toContain('own words');
  });

  it('forbids re-asking something already answered', () => {
    expect(WHOLE.join(' ').toLowerCase()).toContain('never ask it again');
  });
});

describe('the one-question rule reaches the script, not just the code', () => {
  it('states the limit in words the agent can follow', () => {
    expect(WHOLE.join(' ').toLowerCase()).toContain('never ask more than one clarifying question');
  });

  it('tells the agent to re-call the tool after the answer', () => {
    const qualify = SCRIPT.find((s) => s.id === 'qualify')?.lines.join(' ') ?? '';
    expect(qualify).toContain('once more with the answer');
  });

  it('covers all four next_action values the tool can return', () => {
    const qualify = SCRIPT.find((s) => s.id === 'qualify')?.lines.join(' ') ?? '';
    for (const action of ['offer_slots', 'ask_question', 'close_politely', 'take_details']) {
      expect(qualify, action).toContain(action);
    }
  });
});

describe('complaints and people', () => {
  it('stops qualifying a complaint and does not try to book them', () => {
    const complaint = SCRIPT.find((s) => s.id === 'complaint')?.lines.join(' ').toLowerCase() ?? '';
    expect(complaint).toContain('stop qualifying');
    expect(complaint).toContain('do not try to book');
    expect(complaint).toContain('apologise without excuses');
  });

  it('offers a human without arguing', () => {
    const human = SCRIPT.find((s) => s.id === 'human')?.lines.join(' ').toLowerCase() ?? '';
    expect(human).toContain('do not argue');
  });
});

describe('the script is not ready to take a call, and says so', () => {
  it('still carries the consent placeholder', () => {
    expect(SCRIPT.find((s) => s.id === 'opening')?.lines).toContain(CONSENT_LINE_PLACEHOLDER);
  });

  it('the placeholder is impossible to miss', () => {
    expect(CONSENT_LINE_PLACEHOLDER).toContain('CONSENT LINE NEEDED');
    expect(CONSENT_LINE_PLACEHOLDER).toContain('Do not take live calls');
  });

  it('D13 is still blocking, which is why the placeholder is there', () => {
    expect(decisionById('D13').status).toBe('blocking');
  });

  it('is marked as needing Nikhil’s approval', () => {
    expect(SCRIPT_STATUS).toBe('NEEDS_NIKHIL_APPROVAL');
  });
});
