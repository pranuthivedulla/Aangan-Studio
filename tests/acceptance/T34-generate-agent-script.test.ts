/**
 * Renders VAANI-AGENT-SCRIPT.md from the committed config.
 *
 * Generated rather than written, for the same reason RESULTS-20-CALLS.md is:
 * the document somebody pastes into Vaani and the config the tests guard must
 * be the same thing. A hand-maintained copy would drift, and the drift would
 * be invisible until a caller heard the wrong sentence.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONSENT_LINE_PLACEHOLDER,
  SCRIPT,
  SCRIPT_STATUS,
  THINGS_TO_FIND_OUT,
} from '@config/call-script';

describe('the pasteable agent script', () => {
  it('writes VAANI-AGENT-SCRIPT.md', () => {
    const out: string[] = [];

    out.push('# Aangan Studio — agent script for Vaani');
    out.push('');
    out.push('**Generated from `config/call-script.ts` by the test suite. Do not edit by hand** —');
    out.push('it is rewritten on every run, and the config is what the tests guard.');
    out.push('');
    out.push(`Status: **${SCRIPT_STATUS}**.`);
    out.push('');
    out.push('Paste the sections below into the Vaani agent. The three tools it refers to —');
    out.push('`qualify_enquiry`, `offer_slots` and `book_slot` — must exist in Tools & Actions');
    out.push('first, and `VAANI_TOOL_SECRET` must be set in Vercel, or every tool call returns 401.');
    out.push('');
    out.push('> **This script is not ready to take a live call.** The opening still carries a');
    out.push('> consent placeholder: nobody has decided what the agent must say about the call');
    out.push('> being recorded and sent to a model, and in India that is a legal question rather');
    out.push('> than a style one. See `OPEN_DECISIONS.md` D13.');
    out.push('');

    out.push('## The one rule behind all of it');
    out.push('');
    out.push('The agent **gathers**; the tools **decide**. There is no sentence anywhere below');
    out.push('that tells the agent whether a caller is suitable, because that judgement lives in');
    out.push('tested code. If a qualification rule is ever added here it will exist twice, the');
    out.push('two copies will drift, and the untested one is the one the caller hears.');
    out.push('');

    for (const section of SCRIPT) {
      out.push(`## ${section.title}`);
      out.push('');
      for (const line of section.lines) out.push(line.startsWith('  ') ? line : `${line}`);
      if (section.prohibitions && section.prohibitions.length > 0) {
        out.push('');
        for (const p of section.prohibitions) out.push(`- **${p}**`);
      }
      if (section.note) {
        out.push('');
        out.push(`*Why: ${section.note}*`);
      }
      out.push('');
    }

    out.push('## The six things to find out, and what each decides');
    out.push('');
    out.push('| Ask | Feeds |');
    out.push('|---|---|');
    for (const thing of THINGS_TO_FIND_OUT) {
      out.push(`| ${thing.ask} | ${thing.why} |`);
    }
    out.push('');
    out.push('Pass the caller’s own words alongside each answer. The engine checks every');
    out.push('judgement against what the caller actually said, so a paraphrase is thrown away.');
    out.push('');

    const path = fileURLToPath(new URL('../../VAANI-AGENT-SCRIPT.md', import.meta.url));
    writeFileSync(path, out.join('\n'), 'utf8');

    expect(out.length).toBeGreaterThan(50);
    expect(out.join('\n')).toContain(CONSENT_LINE_PLACEHOLDER);
  });
});
