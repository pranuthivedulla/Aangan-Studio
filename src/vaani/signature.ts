/**
 * Verifying that a webhook really came from Vaani.
 *
 * From their OpenAPI spec, quoted:
 *
 *   "Verify the `X-VaaniVoice-Signature` header — it is `sha256=` followed by
 *    the lowercase hex HMAC-SHA256 of the exact raw body bytes, keyed with the
 *    `vv_whk_...` secret shown once at registration. Compare in constant time."
 *
 * Two details are load-bearing and easy to get wrong:
 *
 *   RAW BYTES. The signature covers the body exactly as sent. Parsing the JSON
 *   and re-serialising it changes key order and whitespace, and the signature
 *   stops matching — or worse, someone "fixes" that by skipping verification.
 *   So the route must read the body as text and verify before parsing.
 *
 *   CONSTANT TIME. A normal string compare returns as soon as two bytes
 *   differ, and the time it took leaks how much of the signature was right.
 *   Guess a byte at a time and a forged signature is minutes of work, not
 *   centuries. `timingSafeEqual` takes the same time whatever the input.
 *
 * This endpoint is public and the payload concerns real callers. An
 * unverified webhook is an open write.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-vaanivoice-signature';

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'mismatch' | 'no_secret' };

/** Compute what the signature should be. Exported so tests can sign fixtures. */
export function signBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function verifySignature(
  rawBody: string,
  headerValue: string | null | undefined,
  secret: string | undefined,
): SignatureVerdict {
  // No secret configured means we cannot verify, so we must not accept. The
  // tempting failure here is to wave it through in development.
  if (!secret) return { ok: false, reason: 'no_secret' };
  if (!headerValue) return { ok: false, reason: 'missing' };
  if (!/^sha256=[0-9a-f]{64}$/.test(headerValue)) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(signBody(rawBody, secret), 'utf8');
  const given = Buffer.from(headerValue, 'utf8');
  if (expected.length !== given.length) return { ok: false, reason: 'mismatch' };
  return timingSafeEqual(expected, given) ? { ok: true } : { ok: false, reason: 'mismatch' };
}
