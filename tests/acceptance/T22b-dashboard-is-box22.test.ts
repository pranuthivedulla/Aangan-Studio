/**
 * T22 — the dashboard reads only through adapters, and shows box 22's four
 * things: funnel, queues, cost, complaint count.
 *
 * The failure this guards against is a dashboard that shows 0 where it means
 * "never measured". Zero is a measurement: it says the thing happened no
 * times. "No calls have been taken" is not zero, and conflating them is how
 * a founder concludes his agent is answering nobody when it has never been
 * switched on.
 */

import { describe, expect, it } from 'vitest';
import { loadLiveSnapshot } from '@/dashboard/source';
import { buildAdapters, mockAdapters, mockCrm, mockStore } from '@/adapters';
import { render } from '@/dashboard/metrics';
import type { Lead } from '@/types';

function lead(over: Partial<Lead>): Lead {
  return {
    id: 'l1', enquiryId: 'e1', clientId: '+919876543210', state: 'received',
    outcome: null, scores: [], scopeClass: 'full_home', intent: 'new_enquiry',
    borderline: false, priorityScore: 0, assignedDesignerId: null,
    backupDesignerId: null, qualifiedBy: null, askedQuestionCount: 0,
    createdAt: '2026-10-12T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z',
    ...over,
  };
}

describe('the dashboard reads through adapters and nothing else', () => {
  it('builds with no credentials at all', async () => {
    const live = await loadLiveSnapshot(buildAdapters({}));
    expect(live.callsTaken.value).toBe(0);
  });

  it('reflects what the store holds, rather than anything hard-coded', async () => {
    const store = mockStore();
    await store.saveLead(lead({ id: 'a', outcome: 'book', state: 'booked' }));
    await store.saveLead(lead({ id: 'b', outcome: 'book', state: 'handed_off' }));
    await store.saveLead(lead({ id: 'c', outcome: 'review', state: 'review' }));
    await store.saveLead(lead({ id: 'd', intent: 'complaint', state: 'review' }));

    const live = await loadLiveSnapshot({ ...mockAdapters(), store, crm: mockCrm() });
    expect(live.callsTaken.value).toBe(4);
    expect(live.qualified.value).toBe(2);
    expect(live.booked.value).toBe(2);
    expect(live.awaitingAcknowledgement.value).toBe(1);
    expect(live.frontDeskBacklog.value).toBe(2);
    expect(live.complaints.value).toBe(1);
  });

  it('counts borderline leads, because the bet is judged on them', async () => {
    const store = mockStore();
    await store.saveLead(lead({ id: 'a', borderline: true, outcome: 'book', state: 'booked' }));
    await store.saveLead(lead({ id: 'b', outcome: 'book', state: 'booked' }));
    const live = await loadLiveSnapshot({ ...mockAdapters(), store, crm: mockCrm() });
    expect(live.borderlineForwarded.value).toBe(1);
  });
});

describe('absent is not zero', () => {
  it('says why, for everything that needs the system to be live', async () => {
    const live = await loadLiveSnapshot(mockAdapters());
    for (const [name, m] of [
      ['consulted', live.consulted],
      ['won', live.won],
      ['answered within 5 minutes', live.answeredWithinFiveMinutes],
      ['cost per booked consultation', live.costPerBookedConsultation],
      ['pipeline value', live.pipelineValue],
    ] as const) {
      expect(m.value, name).toBeNull();
      expect(m.absent?.length ?? 0, name).toBeGreaterThan(8);
      expect(render(m), name).toBe('—');
    }
  });

  it('shows a real zero only where zero is the measurement', async () => {
    const live = await loadLiveSnapshot(mockAdapters());
    // Nothing is queued because nothing has arrived. That IS zero.
    expect(live.awaitingAcknowledgement.value).toBe(0);
    expect(live.escalated.value).toBe(0);
    expect(live.complaints.value).toBe(0);
  });

  it('never invents a cost, even once calls exist', async () => {
    const store = mockStore();
    await store.saveLead(lead({ id: 'a', outcome: 'book', state: 'booked' }));
    const live = await loadLiveSnapshot({ ...mockAdapters(), store, crm: mockCrm() });
    expect(live.callsTaken.value).toBe(1);
    // Costs need recorded usage, which a lead alone does not provide.
    expect(live.costPerCall.value).toBeNull();
  });

  it('won stays absent rather than zero, because nobody has been asked yet', async () => {
    const live = await loadLiveSnapshot(mockAdapters());
    expect(live.won.value).toBeNull();
    expect(live.won.absent).toContain('HubSpot');
  });
});
