/**
 * Scope classification, as DATA.
 *
 * Scope is assessed SEPARATELY from the five criteria (brief §5.4). This
 * matters under the ruling of 10 Oct 2026 that GATE_FAIL_THRESHOLD = 2: a lone
 * gate fail now goes to front-desk review, but an out-of-service scope still
 * declines on its own. Without that separation a Nashik call or a restaurant
 * fitout would reach a designer.
 *
 * Source of truth: context/services.md ("What we don't do", "Typical project
 * scope") and context/qualified.md.
 */

import type { ScopeClass } from '@/types';

export interface ScopeDef {
  readonly id: ScopeClass;
  /** Why this class exists, traced to a context file. */
  readonly basis: string;
  /**
   * `decline`  — out of scope by services.md. Declines regardless of the gate
   *              threshold.
   * `review`   — front desk decides. Used where no documented rule exists, so
   *              the agent must not decline on its own.
   * `bookable` — eligible to reach a designer if the gate allows.
   */
  readonly routing: 'decline' | 'review' | 'bookable';
  /** Open decision this class is waiting on, if any. */
  readonly pendingDecision?: string;
}

export const SCOPE_CLASSES: readonly ScopeDef[] = [
  {
    id: 'full_home',
    basis: 'services.md: "Full home: 2BHK onwards. End-to-end design and execution."',
    routing: 'bookable',
  },
  {
    id: 'partial',
    basis: 'services.md: "Partial home: a full floor, or 2+ rooms with execution."',
    routing: 'bookable',
  },
  {
    id: 'single_room',
    basis:
      'services.md: "Single room: bedroom or living room — complete redesign with all ' +
      'materials, furniture, and execution included." qualified.md lists a single room ' +
      'project under "What does NOT disqualify".',
    routing: 'bookable',
  },
  {
    id: 'commercial',
    basis: 'services.md: "Office: up to ~3,000 sq ft." Clinics and studios included.',
    routing: 'bookable',
  },
  {
    id: 'narrow_scope',
    basis:
      'brief §5.4: "gate criteria pass but narrow_scope (kitchen-only, wardrobe-only, ' +
      'and similar) → review (front desk decides)". The founder\'s office ruled this.',
    routing: 'review',
    pendingDecision: 'D23 — the list of what counts as narrow has not been supplied',
  },
  {
    id: 'commercial_below_min',
    basis:
      'No context file states a commercial MINIMUM. services.md gives only the ~3,000 sq ' +
      'ft ceiling. T18 shows the front desk citing 500 sq ft, which appears nowhere in ' +
      'writing — so the agent must not decline on it.',
    routing: 'review',
    pendingDecision: 'D2 — commercial minimum size or value',
  },
  {
    id: 'advice_only',
    basis:
      'services.md "What we don\'t do": "Decor and styling only: if you want someone to ' +
      'advise on colours or rearrange furniture, we are not the right fit. Our minimum ' +
      'engagement is a room redesign with execution." Ruled 10 Oct 2026 (D26) to decline ' +
      'as an out-of-service class, independently of the gate threshold.',
    routing: 'decline',
  },
  {
    id: 'out_of_service',
    basis:
      'services.md "What we don\'t do" and "Service area": architecture/structural, ' +
      'standalone furniture sourcing, standalone Vastu, restaurants, hotels, retail, ' +
      'gyms, and anywhere outside Pune/PCMC.',
    routing: 'decline',
  },
  {
    id: 'unclear',
    basis: 'Not enough in the transcript to classify. Never declined on scope alone.',
    routing: 'review',
  },
] as const;

/**
 * Work types services.md refuses outright. A match here sets scope_class =
 * out_of_service, which declines whatever the five criteria say.
 */
export const OUT_OF_SERVICE_WORK_TYPES: readonly { id: string; quote: string }[] = [
  {
    id: 'architecture_structural',
    quote:
      'Architecture and structural work: we are interior designers, not architects. We do ' +
      'not move walls, modify the building structure, or handle permits for structural ' +
      'changes.',
  },
  {
    id: 'furniture_sourcing_only',
    quote:
      'Standalone furniture sourcing: we do not source or procure furniture without an ' +
      'associated design project.',
  },
  {
    id: 'vastu_only',
    quote:
      'Vastu consultation only: we incorporate Vastu requirements into our designs; we do ' +
      'not offer standalone Vastu advisory.',
  },
  {
    id: 'hospitality_retail_fitness',
    quote: 'Restaurants, hotels, retail stores, gyms: out of scope.',
  },
] as const;

/** services.md: "Commercial projects: offices, clinics, studios — up to approximately 3,000 sq ft." */
export const COMMERCIAL_MAX_SQFT = 3000;

/**
 * There is no documented commercial minimum. `null` is deliberate: see D2 and
 * the `commercial_below_min` class above. Do not fill this in from the T18
 * transcript — the front desk's 500 sq ft is not a written rule.
 */
export const COMMERCIAL_MIN_SQFT: number | null = null;

export function scopeById(id: ScopeClass): ScopeDef {
  const found = SCOPE_CLASSES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scope class: ${id}`);
  return found;
}

export function declinesOnScope(id: ScopeClass): boolean {
  return scopeById(id).routing === 'decline';
}
