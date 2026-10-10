import { NextResponse } from 'next/server';
import { resolveMode, type AdapterName } from '@/adapters/types';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { blockingDecisions, OPEN_DECISIONS } from '@config/open-decisions';

/**
 * Health and honesty endpoint.
 *
 * It reports which adapters are mocks, which open decisions are blocking, and
 * whether the kill switch is on. It reports NO secret, no credential, not even
 * whether a particular key is present — "mock" already tells you nothing is
 * configured, and a per-key presence map is a map of what to attack.
 */

const ADAPTERS: readonly AdapterName[] = [
  'voice',
  'llm',
  'calendar',
  'crm',
  'notify',
  'email',
  'store',
];

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const adapters = Object.fromEntries(ADAPTERS.map((a) => [a, resolveMode(a)]));
  const allMocked = Object.values(adapters).every((m) => m === 'mock');

  return NextResponse.json(
    {
      status: 'ok',
      service: 'aangan-enquiry-agent',
      phase: 'phases 0-4 complete; call flow (5), dashboard (6) and real integrations (7) not built',
      adapters,
      liveIntegrations: allMocked ? 'none' : 'some adapters are in real mode',
      callsTaken: 0,
      settings: {
        ringThreshold: DEFAULT_SETTINGS.RING_THRESHOLD,
        gateFailThreshold: DEFAULT_SETTINGS.GATE_FAIL_THRESHOLD,
        ackWindowWorkingMinutes: DEFAULT_SETTINGS.ACK_WINDOW_WORKING_MIN,
        workingHours: `${DEFAULT_SETTINGS.WORKING_HOURS_START}-${DEFAULT_SETTINGS.WORKING_HOURS_END}`,
        killSwitch: DEFAULT_SETTINGS.KILL_SWITCH_ALL_CALLS_TO_FRONT_DESK,
      },
      decisions: {
        total: OPEN_DECISIONS.length,
        blocking: blockingDecisions().map((d) => d.id),
      },
      source: 'https://github.com/pranuthivedulla/Aangan-Studio',
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
