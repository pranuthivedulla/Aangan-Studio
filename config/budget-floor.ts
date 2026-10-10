/**
 * Criterion 4 — "Right budget band (broadly)".
 *
 * THIS FILE CONTAINS NO FIGURES, AND THAT IS DELIBERATE.
 *
 * Two constraints collide here:
 *
 *   1. Criterion 4 fails a caller who "volunteers a number that is clearly
 *      below what any project of their described scope would cost". Deciding
 *      that needs a floor per scope.
 *   2. Non-negotiable 1 restricts context/pricing.md to tests only. Reading its
 *      ranges at runtime would put quotable figures in the request path, one
 *      refactor away from a leak.
 *
 * So the floors live here, set by Nikhil, and `pricing.md` stays test-only.
 * Until he sets them, `floorFor()` returns null and the scorer must return
 * `unclear` rather than `fail` — the agent does not invent a threshold. See
 * OPEN_DECISIONS D20.
 *
 * Consequence, recorded honestly: T10 (₹1–1.5 lakh for a kitchen and a
 * bedroom) cannot currently be failed by this engine. Its fixture is marked
 * pending-ruling.
 */

import type { ScopeClass } from '@/types';

export const BUDGET_FLOOR_STATUS = 'NEEDS_NIKHIL_APPROVAL' as const;

/**
 * Minimum volunteered budget, in rupees, below which a caller's number is
 * "clearly below" for that scope. null = not set by Nikhil yet.
 */
export const BUDGET_FLOORS: Readonly<Record<ScopeClass, number | null>> = {
  full_home: null,
  partial: null,
  single_room: null,
  commercial: null,
  commercial_below_min: null,
  narrow_scope: null,
  advice_only: null,
  out_of_service: null,
  unclear: null,
};

/**
 * The one worked example qualified.md actually gives, kept as evidence rather
 * than converted into a threshold. Quoting it here lets Nikhil see what he
 * already committed to in writing when he sets the floors.
 */
export const DOCUMENTED_EXAMPLES: readonly { scope: ScopeClass; quote: string }[] = [
  {
    scope: 'full_home',
    quote:
      'if a caller volunteers a number that is clearly below what any project of their ' +
      'described scope would cost — for example, ₹1–1.5 lakh for a full flat redesign',
  },
] as const;

export function floorFor(scope: ScopeClass): number | null {
  return BUDGET_FLOORS[scope];
}

export function floorsAreConfigured(): boolean {
  return Object.values(BUDGET_FLOORS).some((v) => v !== null);
}
