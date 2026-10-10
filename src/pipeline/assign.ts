/**
 * Assignment (brief §6, map box 11). Deterministic: the AI never picks a
 * designer.
 *
 * THE RULE, IN ONE SENTENCE, as the brief requires:
 *
 *   Among the designers on duty that day who are eligible, assign the one
 *   carrying the fewest leads today, breaking ties by their order on the rota.
 *
 * Fewest-leads-first because the point of the whole system is a fast response,
 * and the designer with four unacknowledged leads is not the one who will
 * answer in thirty minutes. Rota order as the tie-break because it is stable:
 * the same inputs must always give the same designer (acceptance test T10),
 * and anything involving a clock or a random pick would not.
 *
 * Nikhil is never a designer and never a backup. That is enforced here by
 * filtering on `eligibleAsDesigner`, in the database by the same column, and
 * asserted by test.
 */

import { DESIGNERS, FRONT_DESK_LEAD_ID, designerById, onDuty } from '@config/rota';

export interface AssignInput {
  /** yyyy-mm-dd, studio-local. Which rota day to assign from. */
  readonly dateKey: string;
  /** Leads already assigned today, by designer id. Missing means zero. */
  readonly loadToday?: Readonly<Record<string, number>>;
}

export interface AssignResult {
  readonly designerId: string | null;
  readonly backupDesignerId: string | null;
  readonly noDesignerOnDuty: boolean;
  /** Set when nobody is on duty: the front-desk lead owns the lead instead. */
  readonly ownerIdIfNoDesigner: string | null;
  /** Why this designer, in one line, for the audit trail. */
  readonly rationale: string;
}

export class FounderAssignedError extends Error {
  constructor(role: string) {
    super(`refused to assign the founder as ${role}. Nikhil is never a designer or a backup.`);
    this.name = 'FounderAssignedError';
  }
}

function assertNotFounder(id: string | null, role: string): void {
  if (id === null) return;
  const designer = DESIGNERS.find((d) => d.id === id);
  if (designer && !designer.eligibleAsDesigner) throw new FounderAssignedError(role);
}

export function assign(input: AssignInput): AssignResult {
  const rota = onDuty(input.dateKey);
  const load = input.loadToday ?? {};

  if (!rota) {
    return {
      designerId: null,
      backupDesignerId: null,
      noDesignerOnDuty: true,
      ownerIdIfNoDesigner: FRONT_DESK_LEAD_ID,
      rationale: `nobody on the rota for ${input.dateKey}; front-desk lead owns it`,
    };
  }

  // The rota is data and could name an ineligible designer by mistake. Filter
  // rather than trust, so the founder cannot be assigned by a bad rota row.
  const candidates = rota.primaryDesignerIds.filter((id) => {
    const designer = DESIGNERS.find((d) => d.id === id);
    return designer?.eligibleAsDesigner === true;
  });

  if (candidates.length === 0) {
    return {
      designerId: null,
      backupDesignerId: null,
      noDesignerOnDuty: true,
      ownerIdIfNoDesigner: FRONT_DESK_LEAD_ID,
      rationale: `no eligible designer on duty for ${input.dateKey}; front-desk lead owns it`,
    };
  }

  // Fewest leads today, ties broken by rota order. `candidates` is already in
  // rota order, and a stable sort on load alone preserves it.
  const chosen = [...candidates].sort((a, b) => (load[a] ?? 0) - (load[b] ?? 0))[0] as string;

  const backupFromRota = DESIGNERS.find(
    (d) => d.id === rota.backupDesignerId && d.eligibleAsDesigner && d.id !== chosen,
  )?.id;
  const backup =
    backupFromRota ??
    candidates.find((id) => id !== chosen) ??
    null;

  assertNotFounder(chosen, 'designer');
  assertNotFounder(backup, 'backup');

  return {
    designerId: chosen,
    backupDesignerId: backup,
    noDesignerOnDuty: false,
    ownerIdIfNoDesigner: null,
    rationale:
      `${designerById(chosen).name} has the fewest leads today ` +
      `(${load[chosen] ?? 0}) among those on duty; backup ${
        backup === null ? 'none available' : designerById(backup).name
      }`,
  };
}
