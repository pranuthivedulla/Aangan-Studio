/**
 * The handoff (brief §5.6, map boxes 13 and 16).
 *
 * Two artefacts, two audiences, and the difference between them is the whole
 * privacy design:
 *
 *   PREP SUMMARY — two lines. Goes to Telegram, and to email as a fallback.
 *                  Carries no caller quotes, no price answer, no transcript.
 *                  It exists to make a designer open the link.
 *   HANDOFF NOTE — the full brief. Stored on the HubSpot record and NOWHERE
 *                  else. Designer-only, own leads only. It carries what the
 *                  caller said so the designer does not re-ask, including what
 *                  they hesitated about — which is exactly why the front desk
 *                  and Nikhil never see it.
 *
 * DEVIATION FROM §5.6, DECLARED. The brief has Gemini Flash write both. I
 * compose them deterministically instead, because every field in them is
 * already structured data we extracted and verified: the space, the size, the
 * scope, the timeline, who decides, the quotes, the price answer given. Asking
 * a model to re-narrate verified facts adds a fabrication surface for no gain,
 * and non-negotiable 6 says never fabricate a figure, a quote or a person.
 * If Nikhil wants warmer prose, a model can polish a composed note later —
 * but then the note is already correct before it is pretty.
 */

import type { CrmAdapter, EmailAdapter, NotifyAdapter } from '@/adapters/types';
import type { CriterionScore, Lead, PhoneE164 } from '@/types';
import type { Settings } from '@config/settings-schema';
import type { ScoreResult } from './score';
import type { DecideResult } from './decide';
import { criterionById } from '@config/criteria';
import { containsNoPriceFigure } from '@config/price-language';
import { PRICE_DEFLECTION } from '@config/approved-phrases';
import { DESIGNERS, designerById } from '@config/rota';
import { log } from '@/logging';

export interface HandoffInput {
  readonly lead: Lead;
  readonly score: ScoreResult;
  readonly decision: DecideResult;
  readonly fields: {
    readonly space_type: string | null;
    readonly area_sqft: number | null;
    readonly scope: string | null;
    readonly timeline: string | null;
    readonly decision_maker: string | null;
    readonly location: string | null;
  };
  readonly callerName: string | null;
  readonly phone: PhoneE164;
  readonly priceAsked: boolean;
  readonly settings: Settings;
}

function line(label: string, value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  return `${label}: ${value}`;
}

/**
 * Two lines for Telegram. No quotes, no price talk, no transcript — a notified
 * designer should have to open the record to read anything personal.
 */
export function composePrepSummary(input: HandoffInput): string {
  const { fields, decision, score } = input;

  const what = [fields.space_type, fields.scope].filter(Boolean).join(', ');
  const where = fields.location ?? 'location not stated';

  const first = decision.borderline
    ? `BORDERLINE — ${criterionById(decision.borderlineCriterionId ?? 'decision_maker').label} unconfirmed.`
    : `New qualified lead.`;

  const second =
    `${what === '' ? 'Scope not stated' : what} in ${where}. ` +
    `Timeline: ${fields.timeline ?? 'not stated'}. ` +
    `${score.scopeClass.replace(/_/g, ' ')}.`;

  return `${first}\n${second}`;
}

/**
 * The designer's brief. Stored on the CRM record only.
 *
 * It names what is NOT known as plainly as what is, because the point is to
 * stop a designer re-asking what the caller already answered — and to stop
 * them assuming something was confirmed when it was not.
 */
export function composeHandoffNote(input: HandoffInput): string {
  const { fields, score, decision, settings } = input;

  const parts: string[] = [];

  parts.push('WHO');
  parts.push(
    [
      line('Caller', input.callerName),
      line('Decides', fields.decision_maker ?? null),
      line('Phone', 'on the CRM record'),
    ]
      .filter(Boolean)
      .join('\n'),
  );

  parts.push('\nTHE PROJECT');
  parts.push(
    [
      line('Space', fields.space_type),
      line('Size', fields.area_sqft === null ? null : `${fields.area_sqft} sq ft`),
      line('Scope', fields.scope),
      line('Location', fields.location),
      line('Timeline', fields.timeline),
      line('Classified as', score.scopeClass.replace(/_/g, ' ')),
    ]
      .filter(Boolean)
      .join('\n'),
  );

  parts.push('\nWHAT THEY TOLD US — do not ask these again');
  const quoted = score.scores.filter((s) => s.evidenceQuote !== null);
  parts.push(
    quoted.length === 0
      ? 'Nothing was quotable from the call.'
      : quoted
          .map((s) => `• ${criterionById(s.criterionId).label}: "${s.evidenceQuote}"`)
          .join('\n'),
  );

  const unresolved = score.scores.filter((s) => s.result === 'unclear');
  if (unresolved.length > 0) {
    parts.push('\nSTILL OPEN — establish these at the consultation');
    parts.push(
      unresolved
        .map((s) => `• ${criterionById(s.criterionId).label} — ${s.reasoning}`)
        .join('\n'),
    );
  }

  const overridden = score.scores.filter((s) => s.downgradedForBadEvidence);
  if (overridden.length > 0) {
    parts.push('\nTREAT WITH CARE');
    parts.push(
      overridden
        .map(
          (s) =>
            `• ${criterionById(s.criterionId).label} — the agent's reading was not supported ` +
            `by what the caller said (${s.downgradeReason}), so it is recorded as unclear.`,
        )
        .join('\n'),
    );
  }

  parts.push('\nPRICE');
  parts.push(
    input.priceAsked
      ? `They asked. They were told, verbatim: "${settings.APPROVED_PRICE_SENTENCE ?? PRICE_DEFLECTION}" ` +
        'No figure was given. You are the first person to discuss numbers with them.'
      : 'They did not ask about price.',
  );

  if (decision.borderline) {
    parts.push('\nWHY THIS IS FLAGGED');
    parts.push(
      `Forwarded with ${criterionById(decision.borderlineCriterionId ?? 'decision_maker').label} ` +
        'unconfirmed. The caller was not pushed on it, per the rubric.',
    );
  }

  if (score.blockedBy.length > 0) {
    parts.push('\nTHE AGENT COULD NOT JUDGE');
    parts.push(
      `Open decisions affecting this lead: ${score.blockedBy.join(', ')}. ` +
        'See OPEN_DECISIONS.md.',
    );
  }

  return parts.join('\n');
}

export class PriceLeakError extends Error {
  constructor(surface: string, reason: string) {
    super(`refused to send ${surface}: ${reason}`);
    this.name = 'PriceLeakError';
  }
}

export interface HandoffResult {
  readonly prepSummary: string;
  readonly handoffNote: string;
  readonly crmRecordUrl: string;
  readonly notifiedVia: 'telegram' | 'email';
  readonly notifiedId: string;
}

/**
 * Write the record, store the note, alert the designer.
 *
 * The outbound text is checked for price language before it leaves, every
 * time. Not because the composer is likely to produce one — it composes from
 * structured fields — but because this is the last line before a caller or a
 * client-visible surface, and a guard that only runs in tests is not a guard.
 */
export async function runHandoff(args: {
  input: HandoffInput;
  crm: CrmAdapter;
  notify: NotifyAdapter;
  email: EmailAdapter;
}): Promise<HandoffResult> {
  const { input, crm, notify, email } = args;
  const { lead, settings } = input;

  const prepSummary = composePrepSummary(input);
  const handoffNote = composeHandoffNote(input);

  for (const [surface, text] of [
    ['the Telegram summary', prepSummary],
    ['the handoff note', handoffNote],
  ] as const) {
    // The looser check: a note that cannot say "1,400 sq ft" is useless to a
    // designer, but it must never carry a rate, an amount or a lakh figure.
    const verdict = containsNoPriceFigure(text);
    if (!verdict.ok) throw new PriceLeakError(surface, verdict.reason);
  }

  await crm.upsertClient(input.phone, {});
  await crm.writeFields({
    clientId: input.phone,
    actor: 'system',
    fields: {
      name: input.callerName,
      location: input.fields.location,
      criteria_scores: summariseScores(input.score.scores),
      status: lead.state,
      assigned_designer: lead.assignedDesignerId,
      qualified_by: lead.qualifiedBy,
    },
  });
  // Designer-only, and the CRM is the only place it is ever written.
  await crm.storeHandoffNote(input.phone, handoffNote);
  const { recordUrl } = await crm.recordLead(lead);

  const designerId = lead.assignedDesignerId;
  if (designerId === null) throw new Error('runHandoff: no designer assigned');
  const designer = DESIGNERS.find((d) => d.id === designerId);
  const useEmail =
    designer !== undefined && !designer.telegramBound && settings.RESEND_FALLBACK_ENABLED;

  if (useEmail) {
    await email.send({
      to: designerById(designerId).email,
      subject: 'Aangan: new lead',
      // Summary and link. The note stays in the CRM (T21).
      body: `${prepSummary}\n\n${recordUrl}`,
      idempotencyKey: `handoff:${lead.id}`,
    });
  } else {
    await notify.send({
      chat: 'designers',
      text: prepSummary,
      linkUrl: recordUrl,
      idempotencyKey: `handoff:${lead.id}`,
    });
  }

  log('info', 'lead.handed_off', {
    leadId: lead.id,
    designerId,
    via: useEmail ? 'email' : 'telegram',
    borderline: input.decision.borderline,
  });

  return {
    prepSummary,
    handoffNote,
    crmRecordUrl: recordUrl,
    notifiedVia: useEmail ? 'email' : 'telegram',
    notifiedId: designerId,
  };
}

/** Pass/unclear/fail only. The reasoning and quotes stay in the note. */
function summariseScores(scores: readonly CriterionScore[]): Record<string, string> {
  return Object.fromEntries(scores.map((s) => [s.criterionId, s.result]));
}
