/**
 * T15 — the handoff note is absent from Telegram, the front desk and Nikhil.
 * T16 — a role cannot write a field it does not own, or read one it may not.
 * T21 — a designer with no Telegram binding gets the email, with no full note.
 * T01 — the new outbound surfaces carry no price figure.
 *
 * These run on a real September call, so the thing being protected is actual
 * caller speech rather than a placeholder.
 */

import { describe, expect, it } from 'vitest';
import {
  PriceLeakError,
  composeHandoffNote,
  composePrepSummary,
  runHandoff,
  type HandoffInput,
} from '@/pipeline/handoff';
import { score } from '@/pipeline/score';
import { decide } from '@/pipeline/decide';
import { mockCrm, mockEmail, mockNotify, FieldOwnershipError } from '@/adapters/mocks';
import {
  FieldAccessError,
  ALL_FIELDS,
  canRead,
  canReadAggregate,
  canWrite,
  readableFields,
  type Role,
} from '@config/visibility';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { containsNoPriceFigure, containsNoPriceLanguage } from '@config/price-language';
import { readingFor } from '../fixtures/readings';
import { transcriptFor } from '../fixtures/phone-transcripts';
import type { Lead } from '@/types';

const settings = DEFAULT_SETTINGS;

function buildInput(id: string, designerId = 'd1'): HandoffInput {
  const transcript = transcriptFor(id).body;
  const reading = readingFor(id);
  const scored = score(reading, transcript);
  const decision = decide({
    score: scored,
    askedQuestionCount: 1,
    isRepeatCaller: false,
    isExistingClient: false,
    settings,
  });
  const lead: Lead = {
    id: `lead-${id}`,
    enquiryId: `enq-${id}`,
    clientId: '+919876543210',
    state: 'booked',
    outcome: decision.outcome,
    scores: scored.scores,
    scopeClass: scored.scopeClass,
    intent: scored.intent,
    borderline: decision.borderline,
    priorityScore: 4,
    assignedDesignerId: designerId,
    backupDesignerId: 'd2',
    qualifiedBy: 'agent',
    askedQuestionCount: 1,
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  };
  return {
    lead,
    score: scored,
    decision,
    fields: {
      space_type: reading.fields.space_type,
      area_sqft: reading.fields.area_sqft,
      scope: reading.fields.scope,
      timeline: reading.fields.timeline,
      decision_maker: reading.fields.decision_maker,
      location: reading.fields.location,
    },
    callerName: 'Priya',
    phone: '+919876543210',
    priceAsked: reading.price_asked,
    settings,
  };
}

// ---------------------------------------------------------------------------

describe('the two artefacts are genuinely different', () => {
  const input = buildInput('T01');

  it('the summary is two lines and the note is not', () => {
    expect(composePrepSummary(input).split('\n')).toHaveLength(2);
    expect(composeHandoffNote(input).split('\n').length).toBeGreaterThan(10);
  });

  it('the summary carries no caller quote', () => {
    const summary = composePrepSummary(input);
    expect(summary).not.toContain('redo the whole thing');
    expect(summary).not.toContain('"');
  });

  it('the note carries the quotes, so the designer does not re-ask', () => {
    const note = composeHandoffNote(input);
    expect(note).toContain('redo the whole thing');
    expect(note).toContain('do not ask these again');
  });

  it('the note names what is still unknown as plainly as what is known', () => {
    const borderline = buildInput('T02');
    const note = composeHandoffNote(borderline);
    expect(note).toContain('STILL OPEN');
    expect(note).toContain('Decision-maker');
  });

  it('a flagged lead says why it is flagged', () => {
    const note = composeHandoffNote(buildInput('T02'));
    expect(note).toContain('WHY THIS IS FLAGGED');
    expect(note).toContain('not pushed on it');
  });

  it('the summary leads with BORDERLINE when it is flagged (T25)', () => {
    expect(composePrepSummary(buildInput('T02')).startsWith('BORDERLINE')).toBe(true);
    expect(composePrepSummary(buildInput('T01')).startsWith('BORDERLINE')).toBe(false);
  });

  it('warns the designer where the agent overrode itself', () => {
    const input2 = buildInput('T01');
    const tampered: HandoffInput = {
      ...input2,
      score: {
        ...input2.score,
        scores: input2.score.scores.map((s) =>
          s.criterionId === 'timeline'
            ? { ...s, downgradedForBadEvidence: true, downgradeReason: 'quote_not_caller_speech' as const, result: 'unclear' as const }
            : s,
        ),
      },
    };
    const note = composeHandoffNote(tampered);
    expect(note).toContain('TREAT WITH CARE');
    expect(note).toContain('not supported');
  });
});

describe('T01 the price answer is recorded without a figure', () => {
  it('says what the caller was told, verbatim, and that no number was given', () => {
    // T02 and T13 are the callers who pushed twice on price.
    const note = composeHandoffNote(buildInput('T02'));
    expect(note).toContain('They asked');
    expect(note).toContain('No figure was given');
    expect(containsNoPriceFigure(note).ok).toBe(true);
  });

  it('says plainly when they did not ask', () => {
    expect(composeHandoffNote(buildInput('T01'))).toContain('did not ask about price');
  });

  it('every surface this phase adds is free of price figures', () => {
    for (const id of ['T01', 'T02', 'T05', 'T13', 'T17']) {
      const input = buildInput(id);
      expect(containsNoPriceFigure(composePrepSummary(input)).ok, id).toBe(true);
      expect(containsNoPriceFigure(composeHandoffNote(input)).ok, id).toBe(true);
    }
  });

  it('but the note CAN state the facts of the project, which is the point', () => {
    const note = composeHandoffNote(buildInput('T01'));
    expect(note).toContain('1400 sq ft');
    expect(note).toContain('3BHK');
    // And the strict spoken-sentence rule would reject it, correctly, because
    // it is a different kind of surface.
    expect(containsNoPriceLanguage(note).ok).toBe(false);
  });

  it('refuses to send rather than leaking, if a composer ever regresses', async () => {
    const input = buildInput('T01');
    const poisoned: HandoffInput = {
      ...input,
      fields: { ...input.fields, scope: 'full redesign at about 2,000 per sq ft' },
    };
    await expect(
      runHandoff({ input: poisoned, crm: mockCrm(), notify: mockNotify(), email: mockEmail() }),
    ).rejects.toThrow(PriceLeakError);
  });
});

describe('T15 the handoff note goes to the CRM and nowhere else', () => {
  it('is stored on the CRM record', async () => {
    const crm = mockCrm();
    const result = await runHandoff({ input: buildInput('T01'), crm, notify: mockNotify(), email: mockEmail() });
    expect(crm.handoffNotes.get('+919876543210')).toBe(result.handoffNote);
  });

  it('is absent from the Telegram message', async () => {
    const notify = mockNotify();
    const result = await runHandoff({ input: buildInput('T01'), crm: mockCrm(), notify, email: mockEmail() });
    const sent = JSON.stringify(notify.sent);
    expect(sent).not.toContain('do not ask these again');
    expect(sent).not.toContain('redo the whole thing');
    expect(sent).not.toContain(result.handoffNote);
  });

  it('is absent from the email body too', async () => {
    const email = mockEmail();
    // d3 has no Telegram binding.
    const result = await runHandoff({ input: buildInput('T01', 'd3'), crm: mockCrm(), notify: mockNotify(), email });
    expect(email.sent[0]?.body).not.toContain(result.handoffNote);
    expect(email.sent[0]?.body).not.toContain('do not ask these again');
  });

  it('the front desk may not read it', () => {
    expect(canRead('front_desk', 'handoff_note', { isOwnRecord: true })).toBe(false);
  });

  it('Nikhil may not read it, on any record, in aggregate or otherwise', () => {
    expect(canRead('nikhil', 'handoff_note', { isOwnRecord: true })).toBe(false);
    expect(canReadAggregate('nikhil', 'handoff_note')).toBe(false);
  });

  it('a designer may read it only on their own leads', () => {
    expect(canRead('designer', 'handoff_note', { isOwnRecord: true })).toBe(true);
    expect(canRead('designer', 'handoff_note', { isOwnRecord: false })).toBe(false);
  });
});

describe('T15 Nikhil sees counts, never a person', () => {
  it('cannot read a transcript at all', () => {
    expect(canRead('nikhil', 'transcript', { isOwnRecord: true })).toBe(false);
    expect(canReadAggregate('nikhil', 'transcript')).toBe(false);
  });

  it('cannot read the designer private notes', () => {
    for (const field of ['budget', 'insights', 'granola_notes', 'additional_notes']) {
      expect(canRead('nikhil', field, { isOwnRecord: true }), field).toBe(false);
      expect(canReadAggregate('nikhil', field), field).toBe(false);
    }
  });

  it('can read criteria scores in aggregate, which is his funnel', () => {
    expect(canReadAggregate('nikhil', 'criteria_scores')).toBe(true);
  });

  it('reads no individual record fields at all', () => {
    expect(readableFields('nikhil', { isOwnRecord: true })).toEqual([]);
  });
});

describe('T16 one writer per field', () => {
  it.each([
    ['system', 'status', true],
    ['system', 'budget', false],
    ['designer', 'budget', true],
    ['designer', 'criteria_scores', false],
    ['designer', 'handoff_note', false],
    ['front_desk', 'review_decision', true],
    ['front_desk', 'budget', false],
    ['front_desk', 'handoff_note', false],
    ['nikhil', 'status', false],
    ['nikhil', 'review_decision', false],
  ] as [Role, string, boolean][])('%s write %s = %s', (role, field, allowed) => {
    expect(canWrite(role, field)).toBe(allowed);
  });

  it('every field has exactly one owner', () => {
    for (const field of ALL_FIELDS) {
      const owners = (['system', 'designer', 'front_desk', 'nikhil'] as Role[]).filter((r) =>
        canWrite(r, field),
      );
      expect(owners, field).toHaveLength(1);
    }
  });

  it('Nikhil owns nothing — he is read-only by design', () => {
    for (const field of ALL_FIELDS) expect(canWrite('nikhil', field), field).toBe(false);
  });

  it('the CRM rejects a write from the wrong actor at runtime', async () => {
    const crm = mockCrm();
    await crm.upsertClient('+919876543210', {});
    await expect(
      crm.writeFields({ clientId: '+919876543210', actor: 'designer', fields: { status: 'booked' } }),
    ).rejects.toThrow(FieldOwnershipError);
  });

  it('an unknown field is refused, not stored', () => {
    expect(() => canWrite('system', 'nonexistent_field')).toThrow(/Unknown field/);
  });

  it('the error says who tried what', () => {
    expect(new FieldAccessError('front_desk', 'handoff_note', 'read').message).toContain(
      'front_desk may not read',
    );
  });
});

describe('T16 the front desk reads its queue, not the designers notes', () => {
  it('can read the call facts and the scores', () => {
    for (const field of ['name', 'location', 'criteria_scores', 'status']) {
      expect(canRead('front_desk', field), field).toBe(true);
    }
  });

  it('can read a transcript on a lead in its own queue, and not otherwise', () => {
    expect(canRead('front_desk', 'transcript', { isOwnRecord: true })).toBe(true);
    expect(canRead('front_desk', 'transcript', { isOwnRecord: false })).toBe(false);
  });

  it('cannot read the designer private fields', () => {
    for (const field of ['budget', 'insights', 'granola_notes', 'additional_notes']) {
      expect(canRead('front_desk', field, { isOwnRecord: true }), field).toBe(false);
    }
  });
});

describe('T21 the Resend fallback', () => {
  it('a designer with Telegram gets Telegram and no email', async () => {
    const notify = mockNotify();
    const email = mockEmail();
    const result = await runHandoff({ input: buildInput('T01', 'd1'), crm: mockCrm(), notify, email });
    expect(result.notifiedVia).toBe('telegram');
    expect(notify.sent).toHaveLength(1);
    expect(email.sent).toHaveLength(0);
  });

  it('a designer without Telegram gets the email instead', async () => {
    const notify = mockNotify();
    const email = mockEmail();
    const result = await runHandoff({ input: buildInput('T01', 'd3'), crm: mockCrm(), notify, email });
    expect(result.notifiedVia).toBe('email');
    expect(email.sent).toHaveLength(1);
    expect(notify.sent).toHaveLength(0);
    expect(email.sent[0]?.to).toBe('d3@example.invalid');
  });

  it('the email carries the summary and the link, and that is all', async () => {
    const email = mockEmail();
    await runHandoff({ input: buildInput('T01', 'd3'), crm: mockCrm(), notify: mockNotify(), email });
    const body = email.sent[0]?.body ?? '';
    expect(body).toContain('New qualified lead');
    expect(body).toContain('crm.invalid');
    expect(body.split('\n').length).toBeLessThan(6);
  });

  it('the fallback can be switched off at runtime, and then Telegram is used', async () => {
    const notify = mockNotify();
    const email = mockEmail();
    const input = buildInput('T01', 'd3');
    const result = await runHandoff({
      input: { ...input, settings: { ...settings, RESEND_FALLBACK_ENABLED: false } },
      crm: mockCrm(),
      notify,
      email,
    });
    expect(result.notifiedVia).toBe('telegram');
    expect(email.sent).toHaveLength(0);
  });

  it('T17 the same lead handed off twice alerts once', async () => {
    const notify = mockNotify();
    const crm = mockCrm();
    const input = buildInput('T01');
    await runHandoff({ input, crm, notify, email: mockEmail() });
    await runHandoff({ input, crm, notify, email: mockEmail() });
    expect(notify.sent).toHaveLength(1);
    expect(crm.clients.size).toBe(1);
  });
});

describe('T18 the handoff writes nothing sensitive to a log', () => {
  it('leaves no caller speech in the log data', async () => {
    const { setLogSink, resetLogSink } = await import('@/logging');
    const captured: unknown[] = [];
    setLogSink((r) => captured.push(r));
    try {
      await runHandoff({ input: buildInput('T01'), crm: mockCrm(), notify: mockNotify(), email: mockEmail() });
      const text = JSON.stringify(captured);
      expect(text).not.toContain('redo the whole thing');
      expect(text).not.toContain('Dahanukar');
      expect(text).not.toContain('+919876543210');
      expect(text).toContain('lead.handed_off');
    } finally {
      resetLogSink();
    }
  });
});
