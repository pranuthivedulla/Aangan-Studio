import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Aangan Studio — enquiry agent',
  description:
    'A phone enquiry agent that qualifies calls, books designer consultations and never quotes a price.',
};

/**
 * The shell: a fixed sidebar and a content column, in the shape of the
 * dashboard reference the founder's office supplied.
 *
 * Taken from that reference: the sidebar, the card grammar, the density, the
 * muted label under a large figure.
 *
 * NOT taken, deliberately: the reference shows a table of clients with names,
 * emails and phone numbers, and a revenue figure with a trend arrow. Nikhil's
 * view is aggregates only — a non-negotiable, not a layout choice — and there
 * is no revenue data, so such a card could only be invented. A dashboard that
 * looks finished because its numbers are made up is worse than one that
 * admits what it does not know.
 *
 * One stylesheet, inline, no framework: about 200 lines a reviewer can read.
 */
const css = `
  :root {
    --ink: #e8edf4; --muted: #8b97a8; --dim: #5d6878;
    --line: #232c38; --line-soft: #1b222c;
    --bg: #0e1319; --panel: #141a22; --panel-2: #192029;
    --accent: #5b8def;
    --ok: #4aa96c; --warn: #c9a227; --bad: #d4664f; --info: #5a9ec9; --plum: #a872b8;
    --radius: 12px;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --ink: #16202b; --muted: #5c6878; --dim: #8a94a2;
      --line: #e2e7ee; --line-soft: #eef1f6;
      --bg: #f6f8fb; --panel: #ffffff; --panel-2: #fbfcfe;
      --accent: #2f6fe0;
      --ok: #2f7d47; --warn: #8a6d12; --bad: #b24a33; --info: #2d6f96; --plum: #7c4a8c;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--ink);
    font: 15px/1.6 Figtree, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; }

  .shell { display: flex; min-height: 100vh; }

  .side {
    width: 232px; flex: 0 0 232px; background: var(--panel);
    border-right: 1px solid var(--line); padding: 20px 14px;
    display: flex; flex-direction: column; gap: 26px;
    position: sticky; top: 0; height: 100vh;
  }
  .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
  .brand-mark {
    width: 32px; height: 32px; border-radius: 9px; flex: 0 0 32px;
    background: var(--accent); color: #fff; display: grid; place-items: center;
    font-weight: 700; font-size: 14px;
  }
  .brand-name { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
  .brand-sub { color: var(--dim); font-size: 11px; margin-top: 1px; }

  .nav-group { display: flex; flex-direction: column; gap: 2px; }
  .nav-title {
    color: var(--dim); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase;
    padding: 0 8px; margin-bottom: 6px; font-weight: 600;
  }
  .side a.nav-item {
    display: flex; align-items: center; gap: 10px; padding: 9px 10px;
    border-radius: 9px; text-decoration: none; color: var(--muted); font-size: 14px;
  }
  .side a.nav-item:hover { background: var(--panel-2); color: var(--ink); }
  .nav-item svg { width: 17px; height: 17px; flex: 0 0 17px; opacity: 0.85; }

  .side-foot { margin-top: auto; }
  .capacity {
    background: var(--panel-2); border: 1px solid var(--line-soft);
    border-radius: 10px; padding: 12px 13px;
  }
  .capacity .label { margin: 0 0 8px; }
  .bar { height: 5px; border-radius: 99px; background: var(--line); overflow: hidden; }
  .bar > span { display: block; height: 100%; background: var(--accent); }

  .main { flex: 1 1 auto; min-width: 0; }
  .topbar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 16px 28px; border-bottom: 1px solid var(--line);
    position: sticky; top: 0; background: var(--bg); z-index: 5;
  }
  .topbar h2 { margin: 0; font-size: 15px; font-weight: 600; }
  .chip {
    display: inline-flex; align-items: center; gap: 7px; font-size: 12px;
    color: var(--muted); border: 1px solid var(--line); border-radius: 99px;
    padding: 5px 11px; white-space: nowrap;
  }
  .dot { width: 7px; height: 7px; border-radius: 99px; background: var(--warn); flex: 0 0 7px; }
  main.content { padding: 28px; max-width: 1180px; }

  h1 { font-size: 27px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.02em; }
  h2 { font-size: 17px; margin: 38px 0 4px; letter-spacing: -0.01em; }
  h3 { font-size: 14px; margin: 26px 0 8px; }
  p { margin: 0 0 14px; max-width: 70ch; color: var(--muted); }
  .lede { font-size: 16px; max-width: 66ch; }
  ul { margin: 0 0 14px; padding-left: 20px; max-width: 70ch; color: var(--muted); }
  li { margin-bottom: 5px; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em;
    background: var(--panel-2); border: 1px solid var(--line-soft);
    padding: 1px 5px; border-radius: 5px;
  }

  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 16px 18px;
  }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(188px, 1fr)); }
  .stat { font-size: 27px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
  .stat-lg { font-size: 33px; }
  .stat.muted { color: var(--dim); font-weight: 400; }
  .label {
    color: var(--muted); font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.07em; font-weight: 600; margin-top: 7px;
  }
  .absent { color: var(--dim); font-size: 11.5px; margin-top: 7px; line-height: 1.45; }
  .warn { border-left: 3px solid var(--warn); }
  .stat-card { display: flex; flex-direction: column; }

  /* Five steps and four arrows have to survive a narrow content column, so
     the steps shrink before the row wraps. */
  .funnel { display: flex; align-items: stretch; gap: 7px; flex-wrap: wrap; margin: 16px 0; }
  .funnel-step {
    flex: 1 1 104px; min-width: 104px; background: var(--panel);
    border: 1px solid var(--line); border-radius: var(--radius); padding: 14px;
  }
  .funnel-step .stat-lg { font-size: 28px; }
  .funnel-step .label { font-size: 10px; letter-spacing: 0.05em; }
  .funnel-arrow { align-self: center; color: var(--dim); font-size: 15px; flex: 0 0 auto; }

  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
  th {
    color: var(--muted); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: 0.07em; font-weight: 600; border-bottom-color: var(--line);
  }
  td.c { text-align: center; font-variant-numeric: tabular-nums; }
  tbody tr:hover { background: var(--panel-2); }

  .pass { color: var(--ok); } .unclear { color: var(--warn); } .fail { color: var(--bad); font-weight: 700; }
  .o-book { color: var(--ok); } .o-ask_one { color: var(--warn); }
  .o-decline { color: var(--bad); } .o-review { color: var(--info); }
  .o-park { color: var(--muted); } .o-complaint { color: var(--plum); }
  td .o-book, td .o-ask_one, td .o-decline, td .o-review, td .o-park, td .o-complaint,
  .stat.o-book, .stat.o-ask_one, .stat.o-decline, .stat.o-review, .stat.o-park, .stat.o-complaint {
    font-weight: 700;
  }

  /* Queues on the left, activity on the right, as in the reference. */
  .cols { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) 300px; align-items: start; margin: 16px 0; }
  .feed { padding: 15px 17px; }
  .feed-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .feed-head strong { font-size: 13.5px; }
  .feed-list { list-style: none; margin: 12px 0 0; padding: 0; }
  .feed-item {
    display: flex; gap: 10px; align-items: flex-start; font-size: 13px;
    color: var(--muted); padding: 8px 0; border-top: 1px solid var(--line-soft);
  }
  .feed-item:first-child { border-top: none; }
  .feed-item.ghost { color: var(--dim); }
  .feed-dot {
    width: 6px; height: 6px; border-radius: 99px; background: var(--line);
    flex: 0 0 6px; margin-top: 7px;
  }
  .feed-dot.live { background: var(--accent); }
  .feed-when { color: var(--dim); font-size: 11.5px; margin-left: 8px; }
  /* Beside the feed the four queue cards sit as a tidy 2x2; left to its own
     auto-fit they wrap 3 + 1 and leave a hole next to the fourth. */
  @media (min-width: 1041px) { .cols .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 1040px) { .cols { grid-template-columns: 1fr; } }

  .footnote {
    color: var(--dim); font-size: 12.5px; margin-top: 34px; padding-top: 16px;
    border-top: 1px solid var(--line); max-width: 74ch;
  }

  @media (max-width: 860px) {
    .shell { flex-direction: column; }
    .side {
      width: auto; flex: none; height: auto; position: static;
      flex-direction: row; align-items: center; gap: 14px; overflow-x: auto;
      border-right: none; border-bottom: 1px solid var(--line); padding: 12px 16px;
    }
    .side-foot, .nav-title, .capacity, .brand-sub { display: none; }
    .nav-group { flex-direction: row; gap: 4px; }
    main.content { padding: 20px 16px 64px; }
    .topbar { padding: 14px 16px; }
    .funnel-arrow { display: none; }
    .funnel-step { flex: 1 1 calc(50% - 10px); }
    /* The nav is a scrolling row here; without this "The 20 calls" breaks
       across three lines and the row grows taller than the page header. */
    .nav-item { white-space: nowrap; }
  }

  /* On a phone the title and the status chip cannot share a row: side by side
     they squeeze the title into a column one word wide. Stack them. */
  @media (max-width: 640px) {
    .topbar { flex-direction: column; align-items: flex-start; gap: 8px; }
    .topbar h2 { font-size: 14px; }
    .chip { font-size: 11.5px; }
  }
`;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  gauge: 'M12 20a8 8 0 1 1 8-8M12 12l4-3',
  list: 'M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  pulse: 'M3 12h4l2-7 4 14 2-7h6',
  code: 'M9 18l-6-6 6-6M15 6l6 6-6 6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <div className="shell">
          <aside className="side">
            <div className="brand">
              <div className="brand-mark">A</div>
              <div>
                <div className="brand-name">Aangan Studio</div>
                <div className="brand-sub">Enquiry agent</div>
              </div>
            </div>

            <nav className="nav-group">
              <div className="nav-title">Studio</div>
              <a className="nav-item" href="/dashboard"><Icon d={ICONS.gauge} /> Dashboard</a>
              <a className="nav-item" href="/results"><Icon d={ICONS.list} /> The 20 calls</a>
              <a className="nav-item" href="/"><Icon d={ICONS.grid} /> How it works</a>
            </nav>

            <nav className="nav-group">
              <div className="nav-title">Build</div>
              <a className="nav-item" href="/api/health"><Icon d={ICONS.pulse} /> Health</a>
              <a className="nav-item" href="https://github.com/pranuthivedulla/Aangan-Studio"><Icon d={ICONS.code} /> Source</a>
            </nav>

            <div className="side-foot">
              <div className="capacity">
                <div className="label">Build progress</div>
                <div className="bar"><span style={{ width: '62%' }} /></div>
                <div className="absent">
                  Phases 0–4 and 6 done. Call flow, real integrations and hardening to come.
                </div>
              </div>
            </div>
          </aside>

          <div className="main">
            <header className="topbar">
              <h2>Aangan Studio — phone enquiry agent</h2>
              <span className="chip"><span className="dot" /> No calls taken · every integration mocked</span>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
