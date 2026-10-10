import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Aangan Studio — enquiry agent',
  description:
    'A phone enquiry agent that qualifies calls, books designer consultations and never quotes a price. Coursework build.',
};

/**
 * One stylesheet, inline, no framework.
 *
 * This page exists to show what the engine decides, honestly, to a grader and
 * to the founder's office. A design system would be more code to review and
 * nothing more to read.
 */
const css = `
  :root {
    --ink: #1b2430;
    --muted: #566274;
    --line: #d5dbe3;
    --bg: #f7f9fb;
    --card: #ffffff;
    --book: #2f7d32;
    --ask: #8a6100;
    --decline: #a33228;
    --review: #1f5e8a;
    --complaint: #7a2f6b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #e7ecf1; --muted: #9aa7b8; --line: #2c3644; --bg: #121820; --card: #1a222c;
      --book: #7cc47f; --ask: #e0b254; --decline: #e58a7f; --review: #7fb6dd; --complaint: #cf9ac2;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.6 Figtree, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 1060px; margin: 0 auto; padding: 48px 16px 96px; }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.01em; }
  h2 { font-size: 20px; margin: 40px 0 12px; }
  h3 { font-size: 16px; margin: 28px 0 8px; }
  p { margin: 0 0 14px; max-width: 68ch; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .lede { color: var(--muted); font-size: 18px; max-width: 64ch; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 18px 20px; margin: 18px 0;
  }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .stat { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
  .label { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  td.c { text-align: center; font-variant-numeric: tabular-nums; }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  .pass { color: var(--book); } .unclear { color: var(--ask); } .fail { color: var(--decline); font-weight: 700; }
  .o-book { color: var(--book); font-weight: 700; }
  .o-ask_one { color: var(--ask); font-weight: 700; }
  .o-decline { color: var(--decline); font-weight: 700; }
  .o-review { color: var(--review); font-weight: 700; }
  .o-park { color: var(--muted); font-weight: 700; }
  .o-complaint { color: var(--complaint); font-weight: 700; }
  .warn { border-left: 3px solid var(--ask); padding-left: 14px; }
  ul { margin: 0 0 14px; padding-left: 22px; max-width: 68ch; }
  li { margin-bottom: 6px; }
  nav { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 36px; font-size: 14px; }
  footer { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main>
          <nav>
            <a href="/">Overview</a>
            <a href="/results">The 20 calls</a>
            <a href="/api/health">Health (JSON)</a>
            <a href="https://github.com/pranuthivedulla/Aangan-Studio">Source</a>
          </nav>
          {children}
          <footer>
            Coursework build. Every integration is a mock — no call has been taken, no
            credential exists in this deployment.
          </footer>
        </main>
      </body>
    </html>
  );
}
