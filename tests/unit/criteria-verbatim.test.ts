/**
 * Rule: the five criteria are verbatim from context/qualified.md (brief §5.2).
 *
 * This test is the enforcement. If someone "tidies up" Nikhil's wording in
 * config/criteria.ts, or edits qualified.md without updating the config, this
 * fails. Whitespace is normalised because the config wraps lines; nothing else
 * is.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CRITERIA, GATE_CRITERION_IDS, NON_DISQUALIFIERS } from '@config/criteria';

const QUALIFIED_MD = readFileSync(
  fileURLToPath(new URL('../../context/qualified.md', import.meta.url)),
  'utf8',
);

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

describe('the five criteria are verbatim from qualified.md', () => {
  const haystack = collapse(QUALIFIED_MD);

  it('has exactly five criteria', () => {
    expect(CRITERIA).toHaveLength(5);
  });

  it.each(CRITERIA.map((c) => [c.id, c] as const))(
    '%s body appears verbatim in qualified.md',
    (_id, criterion) => {
      expect(haystack).toContain(collapse(criterion.text));
    },
  );

  it.each(CRITERIA.map((c) => [c.id, c] as const))(
    '%s label appears verbatim in qualified.md',
    (_id, criterion) => {
      expect(haystack).toContain(collapse(criterion.label));
    },
  );

  it('all five are gate criteria', () => {
    expect(GATE_CRITERION_IDS).toHaveLength(5);
  });

  it('encodes the boundary rule: unclear on 1-3 asks, unclear on 4-5 forwards', () => {
    // qualified.md: "Unclear on 1, 2, or 3: ask one direct question."
    //               "Unclear on 4 or 5: do not push. Treat as qualified..."
    expect(CRITERIA.map((c) => c.onUnclear)).toEqual([
      'ask_one',
      'ask_one',
      'ask_one',
      'forward_with_note',
      'forward_with_note',
    ]);
  });

  it('every non-disqualifier is listed in qualified.md', () => {
    for (const item of NON_DISQUALIFIERS) {
      expect(haystack).toContain(collapse(item));
    }
  });

  it('criterion ids are unique and stable-looking', () => {
    const ids = CRITERIA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z_]+$/);
  });
});
