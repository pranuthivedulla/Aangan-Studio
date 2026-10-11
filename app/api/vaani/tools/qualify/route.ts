import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { ToolRequestSchema } from '@/vaani/tool-contract';
import { SayLeakError, qualifyForCall } from '@/vaani/qualify';
import { DEFAULT_SETTINGS } from '@config/settings-schema';
import { log } from '@/logging';

/**
 * The endpoint Vaani's custom tool calls, mid-call.
 *
 * Configured in Vaani as: POST to this URL, with the caller's answers as
 * Parameters and our JSON mapped back through "Store Fields as Variables".
 *
 * AUTHENTICATION. Unlike the webhook, Vaani does not sign tool calls — it
 * sends whatever Headers you configure. So the shared secret goes in a header
 * and is compared in constant time. Without it this is an open endpoint that
 * will qualify leads for anyone who finds the URL, on a public repository
 * that names the URL.
 *
 * WHAT A CALLER HEARS IF THIS FAILS. Never an error. A caller on the line
 * gets a human-shaped sentence and the lead goes to a person: a 500 would
 * leave the agent improvising, which is the one thing the price guard cannot
 * survive.
 */

export const dynamic = 'force-dynamic';

const SECRET_HEADER = 'x-aangan-tool-secret';

function secretOk(given: string | null): boolean {
  const expected = process.env['VAANI_TOOL_SECRET'];
  if (!expected) return false;
  if (!given) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The safe answer whenever we cannot decide. A person picks it up. */
function handOver(reason: string, status = 200): NextResponse {
  log('warn', 'vaani.tool.handover', { reason });
  return NextResponse.json(
    {
      say: 'Thank you — let me take your details and someone from the studio will call you back shortly.',
      outcome: 'review',
      next_action: 'take_details',
      question: null,
      borderline: false,
      reference: null,
    },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!secretOk(request.headers.get(SECRET_HEADER))) {
    log('warn', 'vaani.tool.unauthorised', {});
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return handOver('body was not JSON');
  }

  const parsed = ToolRequestSchema.safeParse(body);
  if (!parsed.success) {
    // The reason names the field, never its contents.
    const first = parsed.error.issues[0];
    return handOver(`invalid tool request: ${first ? first.path.join('.') : 'unknown field'}`);
  }

  try {
    const result = qualifyForCall(parsed.data, DEFAULT_SETTINGS);
    log('info', 'vaani.tool.qualified', {
      outcome: result.outcome,
      next: result.next_action,
      borderline: result.borderline,
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof SayLeakError) return handOver('spoken line failed the price guard');
    return handOver('qualification threw');
  }
}

export function GET(): NextResponse {
  return NextResponse.json(
    {
      tool: 'qualify',
      method: 'POST',
      authentication: `header ${SECRET_HEADER}`,
      message: 'Vaani custom tool endpoint. POST only; see README.',
    },
    { status: 405, headers: { 'cache-control': 'no-store' } },
  );
}
