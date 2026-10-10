/**
 * Adapter selection. Mock is the default and the fallback; `real` is opt-in per
 * adapter via env (brief §8, Phase 7).
 *
 * The real implementations are deliberately NOT written yet. Each one needs
 * credentials and a live smoke test, which Phase 7 does one integration at a
 * time. A `real` adapter that exists but has never been run is worse than one
 * that refuses to start: it looks finished.
 *
 * So asking for `real` today throws AdapterNotConfiguredError with the name of
 * what is missing, instead of silently falling back to a mock — a silent
 * fallback in production would mean calls being qualified by a stub.
 */

import {
  AdapterNotConfiguredError,
  resolveMode,
  type AdapterName,
  type Adapters,
} from './types';
import { mockCalendar, mockCrm, mockEmail, mockLlm, mockNotify, mockStore, mockVoice } from './mocks';

export * from './types';
export * from './mocks';

const REQUIRED_ENV: Readonly<Record<AdapterName, readonly string[]>> = {
  voice: ['VAANI_API_KEY', 'VAANI_AGENT_ID', 'VAANI_WEBHOOK_SECRET'],
  llm: ['GEMINI_API_KEY'],
  calendar: ['GOOGLE_CALENDAR_CLIENT_EMAIL', 'GOOGLE_CALENDAR_PRIVATE_KEY'],
  crm: ['HUBSPOT_PRIVATE_APP_TOKEN'],
  notify: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_DESIGNER_CHAT_ID', 'TELEGRAM_FRONTDESK_CHAT_ID'],
  email: ['RESEND_API_KEY', 'RESEND_FROM_ADDRESS'],
  store: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
};

function assertRealIsImplemented(
  adapter: AdapterName,
  env: Record<string, string | undefined>,
): never {
  const missing = (REQUIRED_ENV[adapter] ?? []).filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new AdapterNotConfiguredError(adapter, missing.join(', '));
  }
  throw new Error(
    `${adapter} adapter: credentials are present but the real implementation is not built ` +
      `yet (Phase 7). Set ADAPTER_MODE_${adapter.toUpperCase()}=mock.`,
  );
}

export function buildAdapters(
  env: Record<string, string | undefined> = process.env,
): Adapters {
  const pick = <T>(name: AdapterName, makeMock: () => T): T => {
    if (resolveMode(name, env) === 'real') assertRealIsImplemented(name, env);
    return makeMock();
  };

  return {
    voice: pick('voice', () => mockVoice()),
    llm: pick('llm', () => mockLlm()),
    calendar: pick('calendar', () => mockCalendar()),
    crm: pick('crm', () => mockCrm()),
    notify: pick('notify', () => mockNotify()),
    email: pick('email', () => mockEmail()),
    store: pick('store', () => mockStore()),
  };
}
