/**
 * Duty rota and the designer roster.
 *
 * NO REAL DATA HAS BEEN SUPPLIED. The brief says 14 designers; no names,
 * calendars, Telegram bindings or shifts were given. Everything below is SEED
 * data for the mock adapters and the tests, and it is labelled as such so it
 * can never be mistaken for the studio's real rota. Phase 7 replaces it from
 * Supabase.
 *
 * The one rule that is real, and is enforced in code and asserted by test T10:
 * Nikhil is never assigned as a designer and never as a backup (brief §2.2,
 * §6). He is in the roster only so that rule has something to exclude.
 */

export interface DesignerSeed {
  readonly id: string;
  readonly name: string;
  /** false for the founder. Assignment and escalation both filter on this. */
  readonly eligibleAsDesigner: boolean;
  /** Drives the Resend fallback path (box 25, D6). */
  readonly telegramBound: boolean;
  readonly email: string;
}

export const IS_SEED_DATA = true;

export const DESIGNERS: readonly DesignerSeed[] = [
  { id: 'd1', name: 'Seed Designer One', eligibleAsDesigner: true, telegramBound: true, email: 'd1@example.invalid' },
  { id: 'd2', name: 'Seed Designer Two', eligibleAsDesigner: true, telegramBound: true, email: 'd2@example.invalid' },
  { id: 'd3', name: 'Seed Designer Three', eligibleAsDesigner: true, telegramBound: false, email: 'd3@example.invalid' },
  { id: 'd4', name: 'Seed Designer Four', eligibleAsDesigner: true, telegramBound: true, email: 'd4@example.invalid' },
  { id: 'nikhil', name: 'Nikhil Deshpande', eligibleAsDesigner: false, telegramBound: true, email: 'founder@example.invalid' },
] as const;

export const FRONT_DESK_LEAD_ID = 'fd_lead';

export interface RotaEntrySeed {
  /** ISO date, yyyy-mm-dd. */
  readonly date: string;
  readonly primaryDesignerIds: readonly string[];
  readonly backupDesignerId: string;
}

/**
 * Deliberately tiny. Enough to test determinism, the never-Nikhil rule and the
 * no-designer-on-duty path (brief §6) and nothing more.
 */
export const ROTA: readonly RotaEntrySeed[] = [
  { date: '2026-10-12', primaryDesignerIds: ['d1', 'd2'], backupDesignerId: 'd3' },
  { date: '2026-10-13', primaryDesignerIds: ['d2', 'd3'], backupDesignerId: 'd4' },
  // 14 Oct deliberately has nobody on duty, to exercise `no_designer_on_duty`.
] as const;

export function designerById(id: string): DesignerSeed {
  const found = DESIGNERS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown designer id: ${id}`);
  return found;
}

export function onDuty(date: string): RotaEntrySeed | null {
  return ROTA.find((r) => r.date === date) ?? null;
}

export function eligibleDesignerIds(): readonly string[] {
  return DESIGNERS.filter((d) => d.eligibleAsDesigner).map((d) => d.id);
}
