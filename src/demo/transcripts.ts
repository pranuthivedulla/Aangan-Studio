/**
 * The September phone transcripts, parsed from the embedded source text.
 *
 * This lives in `src/` rather than `tests/` because the deployed results page
 * and the test suite must run the SAME data through the SAME engine. If the
 * page had its own copy, the published table could agree with nothing.
 *
 * The text is EMBEDDED rather than read from disk. `fileURLToPath(new URL(...,
 * import.meta.url))` breaks once webpack bundles it, and a public page that
 * depends on its working directory is a page that breaks in a way nobody
 * notices. See scripts/generate-transcripts.mjs.
 *
 * The test EXPECTATIONS stay in `tests/fixtures/phone-transcripts.ts`.
 */

import { ENQUIRY_DOCUMENT_TEXT } from './transcripts.generated';

export interface ParsedTranscript {
  readonly id: string;
  readonly header: string;
  readonly body: string;
}

/**
 * Split the extracted text into T-records. The PDF extraction mangles the
 * separator character between header fields, so the header is matched on the
 * record id alone and everything up to the next id is the body.
 */
export function loadPhoneTranscripts(): Map<string, ParsedTranscript> {
  const lines = ENQUIRY_DOCUMENT_TEXT.split(/\r?\n/);

  const out = new Map<string, ParsedTranscript>();
  let current: { id: string; header: string; body: string[] } | null = null;

  const flush = (): void => {
    if (!current) return;
    out.set(current.id, {
      id: current.id,
      header: current.header,
      body: current.body.join('\n').trim(),
    });
    current = null;
  };

  for (const rawLine of lines) {
    // pdftotext prefixes the first line of each PDF page with a form feed, so
    // "\fT12 — Phone — ..." and "\fSECTION 2 — WHATSAPP" do not match a
    // start-anchored pattern. Stripping it is what makes T12 parse at all, and
    // what stops the WhatsApp section bleeding into T20.
    const line = rawLine.replace(/^[\f\u000b\s]+/, '');
    const startsRecord = /^(T\d{2})\s/.exec(line);
    const startsOtherSection = /^(SECTION|W\d{2}\s|F\d{2}\s)/.test(line);
    if (startsRecord?.[1]) {
      flush();
      current = { id: startsRecord[1], header: line.trim(), body: [] };
      continue;
    }
    if (startsOtherSection) {
      flush();
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();

  return out;
}

export function transcriptFor(id: string): ParsedTranscript {
  const found = loadPhoneTranscripts().get(id);
  if (!found) throw new Error(`No transcript parsed for ${id}`);
  return found;
}
