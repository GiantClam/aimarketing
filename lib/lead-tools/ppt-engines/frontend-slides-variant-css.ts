import type { PptPreviewStyleArchetype, PptPreviewStyleKey } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { resolvePptPreviewStyleArchetype } from "@/lib/lead-tools/ppt-preview-data-fixed"
import type { FrontendSlidesTheme } from "@/lib/lead-tools/ppt-engines/frontend-slides-theme"

export function buildFrontendSlidesVariantCss(theme: FrontendSlidesTheme, styleKey: PptPreviewStyleKey) {
  const archetype = resolvePptPreviewStyleArchetype(styleKey)
  const sharedCss = `
  :root {
    --deck-bg: ${theme.background};
    --deck-fg: ${theme.foreground};
    --deck-accent: ${theme.accent};
    --deck-panel: ${theme.panel};
    --deck-border: ${theme.border};
    --deck-secondary: ${theme.secondary};
    --deck-glow: ${theme.glow};
    --font-title: ${theme.titleFont};
    --font-body: ${theme.bodyFont};
    --font-mono: ${theme.monoFont};
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    background:
      radial-gradient(circle at 12% 14%, var(--deck-glow), transparent 30%),
      radial-gradient(circle at 82% 18%, color-mix(in srgb, var(--deck-secondary) 26%, transparent), transparent 28%),
      linear-gradient(135deg, color-mix(in srgb, var(--deck-accent) 12%, transparent), transparent 52%);
    pointer-events: none;
  }

  .deck {
    position: relative;
    z-index: 1;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin: 0.85rem 0 1.25rem;
  }

  .chip, .metric-kicker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
    padding: 0 0.9rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--deck-accent) 18%, transparent);
    color: var(--deck-fg);
    font: 700 var(--small-size)/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cover-slide {
    gap: var(--content-gap);
  }

  .hero-grid {
    margin-top: 1rem;
  }

  .hero-card,
  .agenda-card,
  .compare-card,
  .timeline-card,
  .insight-side,
  .insight-primary {
    padding: clamp(1rem, 2vw, 1.5rem);
    backdrop-filter: blur(8px);
  }

  .card-index,
  .compare-label,
  .timeline-step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    background: var(--deck-accent);
    color: ${theme.background};
    font: 800 var(--small-size)/1 var(--font-mono);
    letter-spacing: 0.08em;
  }

  .agenda-grid {
    align-items: stretch;
  }

  .agenda-card h3,
  .compare-card h3 {
    margin: 0.8rem 0 0.45rem;
    font: 800 var(--h3-size)/1.05 var(--font-title);
  }

  .agenda-card p,
  .compare-card p,
  .timeline-card p,
  .hero-card p {
    margin: 0;
    font-size: var(--body-size);
    line-height: 1.45;
  }

  .insight-shell {
    align-items: stretch;
  }

  .insight-primary {
    display: grid;
    align-content: start;
    gap: 1rem;
    min-height: 0;
  }

  .insight-side {
    display: flex;
    align-items: center;
  }

  .bullet-list li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.8rem;
    align-items: start;
  }

  .bullet-list p {
    margin: 0;
    font-size: var(--body-size);
    line-height: 1.45;
  }

  .bullet-dot {
    width: 0.7rem;
    height: 0.7rem;
    margin-top: 0.5rem;
    border-radius: 999px;
    background: var(--deck-accent);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--deck-accent) 18%, transparent);
  }

  .compare-card.contrast {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--deck-accent) 16%, transparent), transparent 36%),
      var(--deck-panel);
  }

  .timeline-list {
    grid-template-columns: 1fr;
  }

  .timeline-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    align-items: center;
  }

  .workflow-image-figure {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    width: 100%;
  }

  .workflow-image-inline {
    margin-top: 1rem;
  }

  .workflow-image-frame {
    position: relative;
    overflow: hidden;
    width: 100%;
    min-height: 11rem;
    aspect-ratio: 16 / 9;
    border-radius: 1.1rem;
    border: 1px solid color-mix(in srgb, var(--deck-border) 88%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--deck-accent) 14%, transparent), transparent 45%),
      color-mix(in srgb, var(--deck-panel) 92%, white 8%);
    box-shadow: 0 22px 40px color-mix(in srgb, var(--deck-accent) 10%, transparent);
  }

  .workflow-image-cover .workflow-image-frame {
    min-height: 14rem;
    aspect-ratio: 4 / 3;
  }

  .workflow-image-frame img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .workflow-image-caption {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    align-items: center;
    color: var(--deck-secondary);
    font: 700 var(--small-size)/1.2 var(--font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .workflow-image-source {
    opacity: 0.88;
  }
  `

  const styleCss = {
    ppt169_brutalist_ai_newspaper_2026: `
      .long-table-shell { gap: 1rem; }
      .long-table-header, .ledger-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.8rem; }
      .table-caption, .ledger-row span, .kicker-tag {
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .ledger-grid { display: grid; grid-template-columns: 1.2fr 0.9fr; gap: clamp(1rem, 2vw, 2rem); align-items: stretch; }
      .long-table-cover-grid { align-items: end; }
      .cover-ed-row { display: flex; align-items: center; gap: 0.8rem; }
      .edition-badge {
        width: 2.5rem; height: 2.5rem; display: inline-flex; align-items: center; justify-content: center;
        border: 1.5px solid var(--deck-accent); border-radius: 999px; font: 700 var(--small-size)/1 var(--font-mono);
      }
      .edition-label, .big-edition-lab {
        font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em;
      }
      .ledger-hero { display: grid; gap: 1rem; border-top: 3px solid var(--deck-accent); border-bottom: 1px solid var(--deck-border); padding: 1rem 0; }
      .cover-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
      .action-pill {
        display: inline-flex; align-items: center; justify-content: center; padding: 0.55rem 1rem; border-radius: 999px;
        border: 1.5px solid var(--deck-accent); font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em;
      }
      .action-divider { font: 700 var(--body-size)/1 var(--font-body); }
      .cover-statline { display: grid; gap: 0.7rem; max-width: 42rem; }
      .stat-big { font: 800 clamp(1.3rem, 2.1vw, 2.3rem)/1.2 var(--font-body); }
      .edition-column { display: grid; align-content: end; gap: 0.85rem; }
      .big-edition { font: 800 clamp(4rem, 11vw, 9rem)/0.88 var(--font-title); text-transform: uppercase; letter-spacing: -0.03em; }
      .big-edition-meta { font-size: var(--body-size); line-height: 1.4; max-width: 26rem; }
      .committee-note { display: grid; gap: 1rem; align-content: start; border-radius: 1rem; padding: 1.1rem 1.15rem; }
      .committee-note h3 { margin: 0; font: 800 var(--h3-size)/1 var(--font-title); text-transform: uppercase; }
      .stake-meter-board { display: grid; gap: 0.6rem; }
      .stake-meter-row, .trend-row {
        display: grid; grid-template-columns: auto 1fr; gap: 0.85rem; align-items: center;
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;
      }
      .stake-meter-track, .trend-track {
        width: 100%; height: 0.58rem; border-radius: 999px; overflow: hidden;
        background: color-mix(in srgb, var(--deck-accent) 10%, transparent);
      }
      .stake-meter-track i, .trend-track i {
        display: block; height: 100%; border-radius: inherit; background: var(--deck-accent);
      }
      .ledger-row { border-top: 1px solid var(--deck-border); padding-top: 0.85rem; }
      .agenda-ledger { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
      .agenda-signal-line {
        display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.9rem; align-items: stretch;
      }
      .signal-node {
        display: grid; gap: 0.55rem; padding-top: 0.85rem; border-top: 2px solid var(--deck-border);
      }
      .signal-node span {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase;
      }
      .signal-node p { margin: 0; font-size: var(--small-size); line-height: 1.45; }
      .ledger-card { display: grid; align-content: start; gap: 0.65rem; border-radius: 1rem; padding: 1rem 1.05rem; }
      .desk-verdict { display: grid; gap: 1rem; border-left: 12px solid var(--deck-accent); padding: 1.05rem 1.15rem; }
      .supporting-minutes { border-top: 2px solid var(--deck-border); padding-top: 1rem; max-width: min(36rem, 54vw); }
      .decision-matrix { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
      .matrix-row, .schedule-step { display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: start; padding: 0.95rem 1rem; }
      .matrix-trend { display: grid; gap: 0.75rem; padding: 1rem 1.05rem; }
      .schedule-band { display: grid; gap: 0.85rem; }
      .long-table-quote {
        display: grid;
        gap: 1.2rem;
        align-content: center;
        min-height: 100%;
        text-align: center;
        padding: clamp(1rem, 3vh, 2rem) clamp(1rem, 4vw, 3rem);
      }
      .quote-kicker {
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
      .quote-body { max-width: 14ch; justify-self: center; }
      .quote-desc { max-width: 40rem; justify-self: center; }
      .quote-signoff {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.8rem;
        border-top: 1px solid var(--deck-border);
        padding-top: 1rem;
      }
      .quote-signoff span {
        font: 700 var(--small-size)/1.3 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .long-table-featured { display: grid; grid-template-columns: 1.1fr 0.95fr; gap: clamp(1rem, 2.4vw, 2rem); align-items: stretch; }
      .featured-left { display: grid; gap: 1rem; align-content: start; }
      .stats-line { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .featured-right { display: grid; gap: 0.9rem; padding: 1rem 1.05rem; }
      .info-row {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 1rem;
        align-items: start;
        padding-bottom: 0.8rem;
        border-bottom: 1px dashed color-mix(in srgb, var(--deck-accent) 32%, transparent);
      }
      .info-row:last-child { border-bottom: 0; padding-bottom: 0; }
      .info-key {
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .info-value { font-size: var(--body-size); line-height: 1.42; }
      .long-table-index { display: grid; gap: 1rem; }
      .long-table-index .topbar,
      .long-table-schedule .topbar {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 1rem;
        border-bottom: 1px solid var(--deck-border);
        padding-bottom: 0.8rem;
      }
      .index-title, .schedule-title { max-width: 14ch; }
      .index-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
      .index-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; }
      .index-card .card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px dashed color-mix(in srgb, var(--deck-accent) 32%, transparent);
      }
      .index-card h3 { margin: 0; font: 800 var(--h3-size)/1 var(--font-title); text-transform: uppercase; }
      .index-card p { margin: 0; font-size: var(--small-size); line-height: 1.42; }
      .long-table-schedule { display: grid; gap: 1rem; }
      .schedule-ledger { display: grid; gap: 0; }
      .schedule-row {
        display: grid;
        grid-template-columns: 70px 1fr 1.6fr auto;
        gap: 1rem;
        align-items: center;
        padding: 0.9rem 0;
        border-bottom: 1px solid color-mix(in srgb, var(--deck-accent) 24%, transparent);
      }
      .schedule-row.headrow {
        padding-top: 0;
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-bottom: 1px solid var(--deck-accent);
      }
      .city-tag { font: 800 var(--body-size)/1.15 var(--font-title); text-transform: uppercase; }
      .theme { font-size: var(--body-size); line-height: 1.42; }
      .seats-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.4rem 0.9rem;
        border: 1.5px solid var(--deck-accent);
        border-radius: 999px;
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
      }
      @media (max-width: 900px) {
        .ledger-grid, .agenda-ledger, .decision-matrix, .agenda-signal-line, .long-table-featured, .index-grid, .schedule-row { grid-template-columns: 1fr; }
        .supporting-minutes { max-width: none; }
        .long-table-index .topbar, .long-table-schedule .topbar { align-items: start; flex-direction: column; }
      }
    `,
    ppt169_sugar_rush_memphis: `
      .playful-shell { gap: 1rem; position: relative; }
      .playful-orbit {
        position: absolute; inset: 5% auto auto 4%; width: 24vw; height: 24vw; max-width: 260px; max-height: 260px;
        background: radial-gradient(circle at center, color-mix(in srgb, var(--deck-accent) 92%, white 8%) 0 38%, transparent 39%);
        border-radius: 50%;
        opacity: 0.92;
        box-shadow: 0 0 0 18px rgba(54, 201, 255, 0.12);
      }
      .playful-orbit-secondary {
        inset: auto 6% 18% auto; width: 18vw; height: 18vw; max-width: 200px; max-height: 200px;
        background: radial-gradient(circle at center, color-mix(in srgb, var(--deck-secondary) 82%, white 18%) 0 44%, transparent 45%);
      }
      .playful-date {
        position: absolute; left: 2.4rem; top: 4.6rem; font: 800 clamp(3.2rem, 9vw, 8rem)/0.9 var(--font-title);
        letter-spacing: -0.06em; z-index: 0; color: color-mix(in srgb, var(--deck-fg) 14%, transparent);
      }
      .brand-ribbon { display: flex; flex-wrap: wrap; gap: 0.75rem; position: relative; z-index: 1; }
      .brand-chip {
        display: inline-flex; align-items: center; padding: 0.58rem 0.95rem; border-radius: 1rem;
        background: color-mix(in srgb, white 90%, var(--deck-accent) 10%); color: #151312;
        border: 1.5px solid color-mix(in srgb, var(--deck-secondary) 38%, var(--deck-border) 62%);
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.05em; text-transform: uppercase;
      }
      .bubble-panel { display: grid; gap: 1rem; position: relative; z-index: 1; border-width: 3px; border-radius: 2rem; padding: 1.25rem 1.35rem 1.4rem; }
      .brand-signal-line { position: relative; height: 5rem; margin-top: 0.2rem; }
      .brand-signal-line svg { position: absolute; inset: 0; width: 100%; height: 100%; }
      .brand-signal-line path { fill: none; stroke: var(--deck-fg); stroke-width: 2.5; stroke-linecap: round; }
      .spark-point {
        position: absolute; width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center;
        border: 3px solid var(--deck-fg); border-radius: 999px; background: color-mix(in srgb, white 82%, var(--deck-accent) 18%);
        font: 700 var(--small-size)/1 var(--font-mono);
      }
      .spark-1 { left: 4%; top: 54%; }
      .spark-2 { left: 28%; top: 14%; }
      .spark-3 { left: 58%; top: 52%; }
      .spark-4 { right: 4%; top: 24%; }
      .play-card-grid, .play-note-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; position: relative; z-index: 1; }
      .playful-side-note {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase;
        opacity: 0.68; position: relative; z-index: 1;
      }
      .play-card, .play-note, .bounce-card, .ribbon-step { border-width: 3px; box-shadow: 10px 10px 0 rgba(0,0,0,0.12); border-radius: 1.6rem; padding: 1rem 1.05rem; }
      .play-note { display: grid; gap: 0.65rem; transform: none; }
      .play-note:nth-child(even) { transform: none; }
      .playful-vision-slide { justify-content: center; padding-top: 2rem; }
      .playful-vision-title { max-width: 15ch; }
      .playful-body-columns { display: grid; grid-template-columns: 1fr 0.95fr; gap: 2rem; max-width: 52rem; }
      .body-text { font-size: var(--body-size); line-height: 1.62; }
      .playful-vision-tags { display: flex; flex-wrap: wrap; gap: 0.8rem; align-content: start; }
      .brand-frame {
        position: absolute;
        right: 6%;
        top: 16%;
        width: 12rem;
        height: 15rem;
        border: 2px solid color-mix(in srgb, var(--deck-fg) 24%, transparent);
        border-radius: 1.8rem;
        background: linear-gradient(180deg, rgba(255,255,255,0.22), transparent);
      }
      .brand-frame::after {
        content: "";
        position: absolute;
        inset: 1rem;
        border-top: 2px solid color-mix(in srgb, var(--deck-fg) 22%, transparent);
        border-bottom: 2px solid color-mix(in srgb, var(--deck-fg) 22%, transparent);
      }
      .playful-comparison-slide { gap: 1rem; }
      .playful-services-collage {
        display: grid;
        grid-template-columns: 1.15fr 0.95fr 1fr 1fr;
        gap: 1rem;
        align-items: stretch;
      }
      .service-block {
        display: grid;
        gap: 0.7rem;
        align-content: start;
        border-width: 3px;
        border-radius: 1.6rem;
        box-shadow: 10px 10px 0 rgba(0,0,0,0.12);
        padding: 1.05rem 1.1rem;
      }
      .service-block.filled {
        background: var(--deck-fg);
        color: var(--deck-bg);
      }
      .service-block h3 { margin: 0; font: 800 var(--h3-size)/1 var(--font-title); }
      .service-block p { margin: 0; font-size: var(--small-size); line-height: 1.45; }
      .playful-stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; align-content: center; }
      .stat-item { display: grid; gap: 0.75rem; }
      .stat-num {
        font: 800 clamp(3rem, 7vw, 6rem)/0.92 var(--font-title);
        letter-spacing: -0.05em;
      }
      .stat-item p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .playful-chart-slide { gap: 1rem; }
      .playful-chart-header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 1.5rem;
      }
      .chart-title { max-width: 12ch; }
      .chart-legend { display: flex; flex-wrap: wrap; gap: 1rem; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; }
      .legend-dot {
        width: 0.85rem;
        height: 0.85rem;
        display: inline-block;
        margin-right: 0.45rem;
        background: var(--deck-fg);
      }
      .legend-dot.alt { background: transparent; border: 2px solid var(--deck-fg); }
      .playful-chart-area {
        position: relative;
        display: flex;
        align-items: end;
        gap: 1rem;
        min-height: 16rem;
      }
      .y-axis {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 1rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font: 700 var(--small-size)/1 var(--font-mono);
      }
      .chart-bars {
        display: flex;
        align-items: end;
        gap: 1rem;
        width: 100%;
        min-height: 14rem;
        margin-left: 2.5rem;
        padding-left: 1rem;
        padding-top: 1rem;
        padding-bottom: 1rem;
        border-left: 3px solid var(--deck-fg);
        border-bottom: 3px solid var(--deck-fg);
      }
      .bar-group { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; flex: 1; }
      .bar {
        width: 100%;
        max-width: 4rem;
        min-height: 3rem;
        background: var(--deck-fg);
      }
      .bar.alt { background: transparent; border: 3px solid var(--deck-fg); }
      .bar-label { font: 700 var(--small-size)/1 var(--font-mono); }
      .playful-process-slide { justify-content: center; }
      .timeline-title { max-width: 12ch; }
      .timeline-track {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 1rem;
        position: relative;
        padding-top: 1.5rem;
      }
      .timeline-track::before {
        content: "";
        position: absolute;
        top: 2.4rem;
        left: 6%;
        right: 6%;
        height: 3px;
        background: var(--deck-fg);
      }
      .timeline-step-card { display: grid; justify-items: center; text-align: center; gap: 0.55rem; flex: 1; position: relative; z-index: 1; }
      .step-node {
        width: 4rem;
        height: 4rem;
        border: 3px solid var(--deck-fg);
        border-radius: 50%;
        background: var(--deck-bg);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font: 800 var(--body-size)/1 var(--font-title);
      }
      .step-node.filled { background: var(--deck-fg); color: var(--deck-bg); }
      .step-title { margin: 0; font: 800 var(--h3-size)/1 var(--font-title); }
      .step-desc { margin: 0; font-size: var(--small-size); line-height: 1.45; max-width: 12rem; }
      .brand-flow {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.9rem; position: relative; z-index: 1;
      }
      .flow-node {
        display: grid; gap: 0.45rem; padding: 0.9rem 0.95rem; border: 3px solid var(--deck-fg); border-radius: 999px;
        background: color-mix(in srgb, white 78%, var(--deck-secondary) 22%);
      }
      .flow-node span { font: 700 var(--small-size)/1 var(--font-mono); }
      .flow-node p { margin: 0; font-size: var(--small-size); line-height: 1.35; }
      .play-spark { display: grid; gap: 1rem; border-width: 4px; border-radius: 2rem; padding: 1.15rem 1.2rem; }
      .insight-band { justify-content: center; }
      .bounce-compare { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.8rem; }
      .bounce-card.up { transform: translateY(-14px) rotate(-2deg); }
      .bounce-card.down { transform: translateY(14px) rotate(2deg); }
      .play-chart { display: grid; gap: 0.75rem; padding: 1rem 1.1rem; border-width: 3px; border-radius: 1.8rem; }
      .play-chart-row {
        display: grid; grid-template-columns: auto 1fr; gap: 0.8rem; align-items: center;
        font: 700 var(--small-size)/1 var(--font-mono);
      }
      .play-chart-track {
        width: 100%; height: 0.8rem; border: 2px solid var(--deck-fg); border-radius: 999px; overflow: hidden;
        background: color-mix(in srgb, white 72%, transparent);
      }
      .play-chart-track i {
        display: block; height: 100%; background: var(--deck-fg); border-radius: inherit;
      }
      .ribbon-timeline { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
      @media (max-width: 900px) {
        .play-card-grid, .play-note-grid, .bounce-compare, .ribbon-timeline, .brand-flow, .playful-body-columns, .playful-services-collage, .playful-stats-grid { grid-template-columns: 1fr; }
        .timeline-track { flex-direction: column; padding-top: 0; }
        .timeline-track::before, .brand-frame { display: none; }
        .playful-chart-header { flex-direction: column; }
        .chart-bars { margin-left: 0; }
        .y-axis { display: none; }
        .bounce-card.up, .bounce-card.down, .play-note, .brand-chip { transform: none; }
      }
    `,
    ppt169_pritzker_2026: `
      .broadside-shell { gap: 1.15rem; }
      .broadside-cover-page { background: var(--deck-accent); color: #121212; }
      .broadside-cover-page .eyebrow,
      .broadside-cover-page .title,
      .broadside-cover-page .subtitle,
      .broadside-cover-page .broadside-num,
      .broadside-cover-page .corner-label,
      .broadside-cover-page .cover-meta {
        color: #121212;
      }
      .broadside-cover-shell { justify-content: space-between; }
      .broadside-top-chrome,
      .cover-meta,
      .closing-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
      .cover-body,
      .statement-shell,
      .stat-highlight {
        display: grid;
        gap: 0.85rem;
      }
      .cover-signal-strip {
        display: flex; flex-wrap: wrap; gap: 0.6rem;
        font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em;
        opacity: 0.74;
      }
      .cover-signal-strip span {
        display: inline-flex; align-items: center; padding: 0.45rem 0.75rem; border: 1px solid rgba(17,17,17,0.18);
      }
      .cover-body { margin-top: auto; max-width: min(72rem, 92vw); }
      .broadside-h1 { max-width: min(14ch, 92vw); text-transform: lowercase; }
      .broadside-lead { max-width: min(48ch, 58vw); }
      .poster-columns {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.9rem;
      }
      .poster-slab,
      .contents-card,
      .stat-highlight,
      .market-barboard,
      .closing-pill {
        border: 1px solid var(--deck-border);
        background: var(--deck-panel);
      }
      .poster-slab {
        min-height: 0;
        display: flex;
        align-items: end;
        padding: 1rem 1.1rem;
        color: var(--deck-fg);
      }
      .poster-slab p,
      .contents-card p,
      .note-row p,
      .bar-copy p {
        margin: 0;
        font-size: var(--body-size);
        line-height: 1.42;
      }
      .contents-board {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }
      .contents-card {
        display: grid;
        gap: 0.7rem;
        padding: 1.05rem 1.1rem;
      }
      .contents-card h3 {
        margin: 0;
        font: 800 var(--h3-size)/1 var(--font-title);
        text-transform: lowercase;
      }
      .statement-shell {
        max-width: min(68rem, 90vw);
        padding: 1.2rem 0 0.4rem;
      }
      .kicker-line {
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }
      .broadside-rule {
        width: min(24rem, 32vw);
        height: 2px;
        background: var(--deck-accent);
      }
      .accent-ink { color: var(--deck-accent); }
      .broadside-notes {
        display: grid;
        gap: 0.7rem;
        max-width: min(44rem, 66vw);
        margin-top: auto;
      }
      .note-row {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.9rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--deck-border);
      }
      .note-row span,
      .bar-label,
      .stat-badge {
        font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
      .stats-grid-board {
        display: grid;
        grid-template-columns: 0.92fr 1.18fr;
        gap: 1rem;
        align-items: stretch;
      }
      .stat-highlight,
      .market-barboard {
        padding: 1.15rem 1.2rem;
      }
      .stat-big {
        margin-top: auto;
        font: 900 clamp(4rem, 10vw, 8rem)/0.9 var(--font-title);
        color: var(--deck-accent);
      }
      .market-barboard {
        display: grid;
        gap: 0.9rem;
      }
      .bar-row {
        display: grid;
        gap: 0.55rem;
        padding-top: 0.7rem;
        border-top: 1px solid var(--deck-border);
      }
      .bar-row:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .bar-copy {
        display: grid;
        gap: 0.3rem;
      }
      .bar-track {
        width: 100%;
        height: 0.72rem;
        background: color-mix(in srgb, var(--deck-fg) 12%, transparent);
        border-radius: 999px;
        overflow: hidden;
      }
      .bar-fill {
        display: block;
        height: 100%;
        background: var(--deck-accent);
        border-radius: inherit;
      }
      .broadside-closing-page {
        background:
          linear-gradient(180deg, rgba(232, 93, 38, 0.12), rgba(232, 93, 38, 0) 32%),
          var(--deck-bg);
      }
      .closing-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.85rem;
      }
      .closing-actions.closing-blocks {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }
      .closing-pill {
        display: inline-flex;
        align-items: center;
        min-height: 3.2rem;
        padding: 0.95rem 1.1rem;
        font: 700 var(--body-size)/1.3 var(--font-body);
      }
      .closing-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.9rem;
        align-items: start;
        padding: 1rem 1.1rem;
        border: 1px solid var(--deck-border);
        background: color-mix(in srgb, var(--deck-panel) 92%, transparent);
      }
      .closing-step {
        font: 700 var(--small-size)/1 var(--font-mono);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--deck-accent);
      }
      .closing-copy {
        display: grid;
        gap: 0.35rem;
      }
      .closing-copy strong {
        font-size: var(--h3-size);
      }
      .closing-copy p {
        margin: 0;
        font-size: var(--body-size);
        line-height: 1.45;
      }
      .muted { opacity: 0.68; }
      @media (max-width: 900px) {
        .poster-columns,
        .contents-board,
        .stats-grid-board {
          grid-template-columns: 1fr;
        }
        .closing-actions.closing-blocks {
          grid-template-columns: 1fr;
        }
        .broadside-lead,
        .broadside-notes {
          max-width: none;
        }
      }
    `,
    ppt169_swiss_grid_systems: `
      .neo-grid-shell { gap: 1rem; }
      .neo-grid-ruler, .module-row, .sequence-row {
        display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem;
        font: 700 var(--small-size)/1.2 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em;
      }
      .neo-grid-ruler { border-top: 2px solid var(--deck-accent); padding-top: 0.75rem; }
      .neo-grid-hero, .neo-insight-grid { display: grid; grid-template-columns: 1.25fr 0.95fr; gap: 1rem; align-items: stretch; }
      .neo-side-stack { display: grid; gap: 1rem; }
      .neo-cover-primary {
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--deck-accent) 32%, transparent), transparent 42%),
          var(--deck-panel);
      }
      .neo-cover-chip {
        display: inline-flex; align-items: center; justify-content: center; min-height: 2rem; width: fit-content;
        padding: 0 0.8rem; background: var(--deck-accent); font: 700 var(--small-size)/1 var(--font-mono);
        text-transform: uppercase; letter-spacing: 0.08em;
      }
      .neo-cover-tags { display: flex; flex-wrap: wrap; gap: 0.6rem; }
      .neo-cover-tags span {
        display: inline-flex; align-items: center; padding: 0.45rem 0.7rem; border: 1px solid var(--deck-border);
        font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em;
      }
      .neo-cover-code { display: grid; gap: 0.8rem; }
      .neo-qr-grid {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.3rem; width: 6.4rem;
      }
      .neo-qr-grid i { aspect-ratio: 1 / 1; background: var(--deck-fg); display: block; }
      .neo-qr-grid i.accent { background: var(--deck-accent); }
      .neo-cover-code-copy { display: grid; gap: 0.25rem; font: 700 var(--small-size)/1.2 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
      .neo-cover-code-copy p { margin: 0; font: 500 var(--small-size)/1.3 var(--font-mono); }
      .signal-grid-board {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; padding: 1rem;
      }
      .signal-cell {
        aspect-ratio: 1 / 1; border: 1px solid var(--deck-border); display: grid; align-content: center; justify-items: start;
        gap: 0.35rem; padding: 0.75rem; font: 700 var(--small-size)/1 var(--font-mono); background: color-mix(in srgb, var(--deck-fg) 3%, transparent);
      }
      .signal-cell.accent { background: var(--deck-accent); }
      .signal-cell p {
        margin: 0; font: 500 var(--small-size)/1.35 var(--font-body); text-transform: none; letter-spacing: normal;
      }
      .asym-panel { display: grid; gap: 1rem; padding: 1rem 4vw 1rem 1rem; }
      .module-strip, .grid-comparison-board, .asym-panel, .side-module, .neo-module {
        border: 1px solid var(--deck-border); background: var(--deck-panel); padding: clamp(0.95rem, 1.8vw, 1.35rem);
      }
      .module-strip { display: grid; gap: 0; }
      .module-row { grid-template-columns: auto 1fr; align-items: start; padding: 0.7rem 0; border-top: 1px solid var(--deck-border); }
      .module-row:first-child { border-top: 0; padding-top: 0; }
      .module-row p { margin: 0; font: 500 var(--body-size)/1.5 var(--font-body); text-transform: none; letter-spacing: normal; }
      .neo-module-rail { display: grid; grid-template-columns: repeat(var(--rail-cols, 3), minmax(0, 1fr)); gap: 0.75rem; grid-auto-rows: minmax(9rem, 1fr); }
      .neo-module { display: grid; gap: 0.65rem; align-content: start; min-height: 9rem; }
      .neo-module h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .neo-module p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .asym-panel { display: grid; gap: 1rem; }
      .side-module { display: flex; align-items: center; padding: 1rem 1.05rem; }
      .grid-comparison-shell { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 1rem; }
      .grid-comparison-shell.compact-shell { grid-template-columns: 1fr; }
      .signal-chart { display: grid; gap: 0.8rem; }
      .signal-chart.compact-chart { grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; }
      .signal-chart-row { display: grid; grid-template-columns: auto 1fr; gap: 0.8rem; align-items: center; }
      .signal-chart.compact-chart .signal-chart-row {
        grid-template-columns: 1fr; gap: 0.6rem; padding: 0.8rem; border: 1px solid var(--deck-border);
      }
      .signal-chart-track {
        width: 100%; height: 0.72rem; background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
        border-radius: 999px; overflow: hidden;
      }
      .signal-chart-track i {
        display: block; height: 100%; border-radius: inherit; background: var(--deck-accent);
      }
      .sequence-rail { display: grid; gap: 0.75rem; }
      .sequence-row { grid-template-columns: auto 1fr; border-top: 1px solid var(--deck-border); padding: 0.75rem 0 0; }
      .sequence-row p { margin: 0; font: 500 var(--body-size)/1.5 var(--font-body); text-transform: none; letter-spacing: normal; }
      .horizontal-sequence { grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; }
      .horizontal-sequence .sequence-row {
        grid-template-columns: 1fr; gap: 0.7rem; border-top: 0; border-left: 1px solid var(--deck-border); padding: 0 0 0 1rem; min-height: 9rem;
      }
      .horizontal-sequence .sequence-row:first-child { border-left: 0; padding-left: 0; }
      @media (max-width: 1100px) {
        .neo-module-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 900px) {
        .neo-grid-hero, .neo-insight-grid, .neo-module-rail, .grid-comparison-shell { grid-template-columns: 1fr; }
        .signal-chart.compact-chart, .horizontal-sequence { grid-template-columns: 1fr; }
        .horizontal-sequence .sequence-row { border-left: 0; border-top: 1px solid var(--deck-border); padding: 0.75rem 0 0; min-height: 0; }
      }
    `,
  } satisfies Record<PptPreviewStyleArchetype, string>

  const styleOverrideCss: Partial<Record<PptPreviewStyleKey, string>> = {
    ppt169_glassmorphism_demo: `
      .glass-shell { gap: 1rem; position: relative; }
      .glass-orb {
        position: absolute; border-radius: 50%; filter: blur(12px); pointer-events: none;
        background: radial-gradient(circle, color-mix(in srgb, var(--deck-accent) 46%, white 54%), transparent 72%);
        opacity: 0.7;
      }
      .glass-orb-a { width: 18rem; height: 18rem; top: 2%; left: 4%; }
      .glass-orb-b { width: 14rem; height: 14rem; right: 8%; bottom: 14%; }
      .glass-topbar, .glass-section-head { display: grid; gap: 0.7rem; position: relative; z-index: 1; }
      .glass-topbar { grid-template-columns: auto 1fr; align-items: center; }
      .glass-pill, .glass-meta, .glass-panel-card span, .glass-compare-card span, .glass-spotlight-card span, .glass-process-card span, .glass-caption-stack span, .glass-metric-value {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;
      }
      .glass-meta { justify-self: end; color: var(--deck-secondary); }
      .glass-hero-grid, .glass-split-view {
        display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 1rem; align-items: stretch;
      }
      .glass-hero-card, .glass-score-card, .glass-copy-panel, .glass-closing-panel {
        display: grid; gap: 1rem; padding: 1.15rem 1.2rem; backdrop-filter: blur(18px); background: color-mix(in srgb, var(--deck-panel) 74%, transparent);
      }
      .glass-chip-cloud, .glass-panel-grid, .glass-compare-grid, .glass-spotlight-strip, .glass-metric-board, .glass-process-lane {
        display: grid; gap: 0.9rem;
      }
      .glass-chip-cloud { display: flex; flex-wrap: wrap; }
      .glass-chip-cloud span {
        padding: 0.55rem 0.8rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--deck-border) 70%, white 30%);
        background: color-mix(in srgb, var(--deck-panel) 66%, transparent);
      }
      .glass-panel-grid, .glass-compare-grid, .glass-metric-board, .glass-process-lane { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .glass-panel-card, .glass-compare-card, .glass-spotlight-card, .glass-metric-card, .glass-process-card, .glass-chart-row {
        display: grid; gap: 0.7rem; padding: 1rem 1.05rem; backdrop-filter: blur(18px);
        background: color-mix(in srgb, var(--deck-panel) 74%, transparent);
      }
      .glass-panel-card h3, .glass-process-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .glass-panel-card p, .glass-compare-card p, .glass-spotlight-card p, .glass-metric-card p, .glass-process-card p, .glass-chart-copy p, .glass-caption-stack p, .glass-score-row p {
        margin: 0; font-size: var(--body-size); line-height: 1.45;
      }
      .glass-score-rows, .glass-chart-board, .glass-caption-stack { display: grid; gap: 0.8rem; }
      .glass-score-row, .glass-caption-stack div {
        display: grid; grid-template-columns: auto 1fr; gap: 0.8rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid color-mix(in srgb, var(--deck-border) 46%, transparent);
      }
      .glass-spotlight-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .glass-metric-value { font-size: clamp(2.2rem, 5vw, 4.6rem); letter-spacing: -0.04em; }
      .glass-chart-row { grid-template-columns: minmax(0, 1fr) 0.9fr; align-items: center; }
      .glass-chart-copy { display: grid; gap: 0.3rem; }
      .glass-chart-track {
        width: 100%; height: 0.78rem; border-radius: 999px; overflow: hidden;
        background: color-mix(in srgb, var(--deck-fg) 8%, transparent);
      }
      .glass-chart-track i {
        display: block; height: 100%; background: linear-gradient(90deg, color-mix(in srgb, var(--deck-accent) 72%, white 28%), var(--deck-accent));
      }
      @media (max-width: 900px) {
        .glass-hero-grid, .glass-split-view, .glass-panel-grid, .glass-compare-grid, .glass-metric-board, .glass-process-lane, .glass-chart-row, .glass-spotlight-strip { grid-template-columns: 1fr; }
      }
    `,
    ppt169_attention_is_all_you_need: `
      .paper-shell { gap: 1rem; }
      .paper-header, .paper-section { display: grid; gap: 0.7rem; }
      .paper-header { grid-template-columns: auto 1fr; align-items: center; }
      .paper-kicker, .paper-meta, .paper-section-id, .paper-outline-row span, .paper-proof-row span, .paper-process-card span, .paper-metric-row span {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase;
      }
      .paper-meta { justify-self: end; color: var(--deck-secondary); }
      .paper-abstract, .paper-conclusion {
        display: grid; gap: 1rem; padding: 1.1rem 1.15rem; border: 1px solid var(--deck-border); background: var(--deck-panel);
      }
      .paper-keywords { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .paper-keywords span {
        padding: 0.45rem 0.75rem; border: 1px solid var(--deck-border); border-radius: 999px;
      }
      .paper-outline-board, .paper-proof-column, .paper-chart-column, .paper-process-grid { display: grid; gap: 0.8rem; }
      .paper-outline-row, .paper-proof-row, .paper-metric-row, .paper-chart-row {
        display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.8rem; border-top: 1px solid var(--deck-border);
      }
      .paper-outline-row strong, .paper-proof-row strong, .paper-metric-row strong, .paper-chart-row strong {
        font: 800 var(--body-size)/1.2 var(--font-title);
      }
      .paper-outline-row p, .paper-proof-row p, .paper-metric-row p, .paper-chart-row p, .paper-table-cell p, .paper-process-card p {
        margin: 0; font-size: var(--body-size); line-height: 1.45;
      }
      .paper-two-column { display: grid; grid-template-columns: 1fr 0.95fr; gap: 1rem; align-items: stretch; }
      .paper-table-grid, .paper-process-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .paper-table-cell, .paper-process-card {
        display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel);
      }
      .paper-table-cell strong, .paper-process-card h3 { font: 800 var(--h3-size)/1.05 var(--font-title); margin: 0; }
      .paper-metric-table { display: grid; gap: 0; border-top: 1px solid var(--deck-border); }
      .paper-chart-row { grid-template-columns: minmax(0, 1fr) 0.9fr; align-items: center; }
      .paper-chart-track {
        width: 100%; height: 0.68rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
      }
      .paper-chart-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .paper-two-column, .paper-table-grid, .paper-process-grid, .paper-chart-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_indie_bookstore_zine_guide: `
      .zine-shell { gap: 1rem; }
      .zine-masthead, .zine-spread-head { display: grid; gap: 0.7rem; }
      .zine-masthead { grid-template-columns: auto 1fr; align-items: center; }
      .zine-tag, .zine-date, .zine-sticker-row span, .zine-index-card span, .zine-compare-card span, .zine-quote-card span, .zine-runway-card span, .zine-margin-notes span, .zine-number-value {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase;
      }
      .zine-date { justify-self: end; color: var(--deck-secondary); }
      .zine-cover-board, .zine-split-spread {
        display: grid; grid-template-columns: 1fr 0.92fr; gap: 1rem; align-items: stretch;
      }
      .zine-title-block, .zine-note-block, .zine-closing-block {
        display: grid; gap: 1rem;
      }
      .zine-sticker-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .zine-sticker-row span {
        padding: 0.55rem 0.75rem; border: 1px solid var(--deck-border); transform: rotate(-1deg); background: color-mix(in srgb, var(--deck-panel) 92%, transparent);
      }
      .zine-index-board, .zine-compare-board, .zine-quote-wall, .zine-number-row, .zine-runway-board { display: grid; gap: 0.9rem; }
      .zine-index-board, .zine-compare-board, .zine-runway-board { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .zine-index-card, .zine-compare-card, .zine-quote-card, .zine-number-card, .zine-runway-card, .zine-closing-block {
        display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel);
      }
      .zine-index-card h3, .zine-runway-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .zine-index-card p, .zine-compare-card p, .zine-quote-card p, .zine-number-card p, .zine-runway-card p, .zine-margin-notes p, .zine-ledger-row p {
        margin: 0; font-size: var(--body-size); line-height: 1.45;
      }
      .zine-margin-notes, .zine-ledger-list { display: grid; gap: 0.8rem; }
      .zine-margin-notes div, .zine-ledger-row {
        display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px dashed color-mix(in srgb, var(--deck-border) 70%, transparent);
      }
      .zine-number-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .zine-number-value { font-size: clamp(2.3rem, 5vw, 4.7rem); letter-spacing: -0.04em; }
      .zine-ledger-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .zine-ledger-track {
        width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
      }
      .zine-ledger-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .zine-cover-board, .zine-split-spread, .zine-index-board, .zine-compare-board, .zine-number-row, .zine-runway-board, .zine-ledger-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_global_ai_capital_2026: `
      .capital-shell { gap: 1rem; }
      .capital-masthead, .capital-section-head { display: grid; gap: 0.7rem; }
      .capital-masthead { grid-template-columns: auto 1fr; align-items: center; }
      .capital-chip, .capital-datestamp, .capital-signal-row span, .capital-brief-card span, .capital-compare-card span, .capital-evidence-row span, .capital-runway-card span, .capital-metric-value {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase;
      }
      .capital-datestamp { justify-self: end; color: var(--deck-secondary); }
      .capital-hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 1rem; align-items: stretch; }
      .capital-hero-copy, .capital-quote-panel, .capital-closing-board { display: grid; gap: 1rem; }
      .capital-signal-board, .capital-brief-card, .capital-compare-card, .capital-metric-card, .capital-runway-card, .capital-closing-board {
        padding: 1rem 1.05rem;
      }
      .capital-signal-board, .capital-market-bars, .capital-evidence-list { display: grid; gap: 0.8rem; }
      .capital-signal-row, .capital-evidence-row {
        display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border);
      }
      .capital-signal-row p, .capital-brief-card p, .capital-compare-card p, .capital-evidence-row p, .capital-metric-card p, .capital-market-row p, .capital-runway-card p {
        margin: 0; font-size: var(--body-size); line-height: 1.45;
      }
      .capital-brief-grid, .capital-compare-board, .capital-metric-strip, .capital-runway-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .capital-brief-card, .capital-compare-card, .capital-metric-card, .capital-runway-card {
        display: grid; gap: 0.7rem;
      }
      .capital-brief-card h3, .capital-runway-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .capital-compare-card strong, .capital-metric-card strong { font: 800 var(--body-size)/1.2 var(--font-title); }
      .capital-keyline { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .capital-keyline span {
        padding: 0.5rem 0.75rem; border: 1px solid var(--deck-border); border-radius: 999px;
      }
      .capital-metric-value { font-size: clamp(2.4rem, 5vw, 4.8rem); letter-spacing: -0.04em; }
      .capital-market-row {
        display: grid; grid-template-columns: minmax(0, 1fr) 0.95fr; gap: 1rem; align-items: center;
      }
      .capital-market-track {
        width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
      }
      .capital-market-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .capital-hero-grid, .capital-brief-grid, .capital-compare-board, .capital-metric-strip, .capital-runway-grid, .capital-market-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_home_design_trends_2026: `
      .home-shell { gap: 1rem; }
      .home-masthead, .home-section-head { display: grid; gap: 0.7rem; }
      .home-masthead { grid-template-columns: auto 1fr; align-items: center; }
      .home-badge, .home-date, .home-chip-row span, .home-tile-card span, .home-compare-card span, .home-curation-card span, .home-sequence-card span, .home-note-list span, .home-metric-value {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;
      }
      .home-date { justify-self: end; color: var(--deck-secondary); }
      .home-hero-spread, .home-story-spread { display: grid; grid-template-columns: 1fr 0.95fr; gap: 1rem; align-items: stretch; }
      .home-copy-card, .home-closing-card {
        display: grid; gap: 1rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel);
      }
      .home-chip-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .home-chip-row span {
        padding: 0.55rem 0.8rem; border-radius: 999px; background: color-mix(in srgb, var(--deck-panel) 92%, white 8%); border: 1px solid var(--deck-border);
      }
      .home-tile-grid, .home-compare-grid, .home-curation-strip, .home-metric-row, .home-sequence-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .home-tile-card, .home-compare-card, .home-curation-card, .home-metric-card, .home-sequence-card {
        display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: color-mix(in srgb, var(--deck-panel) 96%, transparent);
      }
      .home-tile-card h3, .home-sequence-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .home-tile-card p, .home-compare-card p, .home-curation-card p, .home-metric-card p, .home-sequence-card p, .home-trend-row p, .home-note-list p {
        margin: 0; font-size: var(--body-size); line-height: 1.45;
      }
      .home-compare-card strong, .home-curation-card strong, .home-metric-card strong { font: 800 var(--body-size)/1.2 var(--font-title); }
      .home-note-list, .home-trend-rows { display: grid; gap: 0.8rem; }
      .home-note-list div, .home-trend-row {
        display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border);
      }
      .home-metric-value { font-size: clamp(2.3rem, 5vw, 4.7rem); letter-spacing: -0.04em; }
      .home-trend-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .home-trend-track {
        width: 100%; height: 0.7rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
      }
      .home-trend-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .home-hero-spread, .home-story-spread, .home-tile-grid, .home-compare-grid, .home-curation-strip, .home-metric-row, .home-sequence-grid, .home-trend-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_lin_huiyin_architect: `
      .heritage-shell { gap: 1rem; }
      .heritage-masthead, .heritage-section-head { display: grid; gap: 0.7rem; }
      .heritage-masthead { grid-template-columns: auto 1fr; align-items: center; }
      .heritage-chip, .heritage-date, .heritage-quote-tags span, .heritage-index-row span, .heritage-compare-card span, .heritage-evidence-card span, .heritage-runway-card span, .heritage-note-list span, .heritage-metric-value {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase;
      }
      .heritage-date { justify-self: end; color: var(--deck-secondary); }
      .heritage-hero-spread, .heritage-story-board { display: grid; grid-template-columns: 1fr 0.95fr; gap: 1rem; align-items: stretch; }
      .heritage-title-card, .heritage-note-card, .heritage-closing-card {
        display: grid; gap: 1rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel);
      }
      .heritage-quote-tags { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .heritage-quote-tags span {
        padding: 0.55rem 0.8rem; border-top: 1px solid var(--deck-border); border-bottom: 1px solid var(--deck-border);
      }
      .heritage-index-columns, .heritage-evidence-stack, .heritage-ledger-lines, .heritage-note-list { display: grid; gap: 0.8rem; }
      .heritage-index-row, .heritage-evidence-card, .heritage-ledger-row, .heritage-note-list div {
        display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border);
      }
      .heritage-index-row p, .heritage-evidence-card p, .heritage-ledger-row p, .heritage-note-list p, .heritage-compare-card p, .heritage-metric-card p, .heritage-runway-card p {
        margin: 0; font-size: var(--body-size); line-height: 1.45;
      }
      .heritage-index-row strong, .heritage-evidence-card strong, .heritage-compare-card strong, .heritage-metric-card strong { font: 800 var(--body-size)/1.2 var(--font-title); }
      .heritage-compare-columns, .heritage-metric-columns, .heritage-runway-columns { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .heritage-compare-card, .heritage-metric-card, .heritage-runway-card {
        display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: color-mix(in srgb, var(--deck-panel) 96%, transparent);
      }
      .heritage-runway-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .heritage-metric-value { font-size: clamp(2.3rem, 5vw, 4.7rem); letter-spacing: -0.04em; }
      .heritage-ledger-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .heritage-ledger-track {
        width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
      }
      .heritage-ledger-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .heritage-hero-spread, .heritage-story-board, .heritage-compare-columns, .heritage-metric-columns, .heritage-runway-columns, .heritage-ledger-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_building_effective_agents: `
      .agents-shell { gap: 1rem; }
      .agents-ruler, .agents-section-head { display: grid; gap: 0.7rem; }
      .agents-ruler { grid-template-columns: auto 1fr; align-items: center; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
      .agents-ruler span:last-child { justify-self: end; color: var(--deck-secondary); }
      .agents-hero-grid, .agents-module-grid, .agents-compare-board, .agents-metric-grid, .agents-runway-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .agents-hero-grid { grid-template-columns: 1.05fr 0.95fr; align-items: stretch; }
      .agents-hero-card, .agents-capability-board, .agents-thesis-panel, .agents-closing-card, .agents-module-card, .agents-compare-card, .agents-metric-card, .agents-runway-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel); }
      .agents-token-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .agents-token-row span { padding: 0.5rem 0.75rem; border: 1px solid var(--deck-border); border-radius: 999px; font: 700 var(--small-size)/1 var(--font-mono); }
      .agents-capability-board, .agents-signal-lane, .agents-graph-stack, .agents-proof-list { display: grid; gap: 0.8rem; }
      .agents-capability-row, .agents-signal-card, .agents-graph-row, .agents-proof-list div { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border); }
      .agents-module-card span, .agents-compare-card span, .agents-metric-value, .agents-runway-card span, .agents-capability-row span, .agents-proof-list span { font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
      .agents-module-card h3, .agents-runway-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .agents-module-card p, .agents-compare-card p, .agents-metric-card p, .agents-runway-card p, .agents-graph-row p, .agents-signal-card p, .agents-proof-list p, .agents-capability-row p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .agents-metric-value { font-size: clamp(2.4rem, 5vw, 4.8rem); letter-spacing: -0.04em; }
      .agents-graph-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .agents-graph-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .agents-graph-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .agents-hero-grid, .agents-module-grid, .agents-compare-board, .agents-metric-grid, .agents-runway-grid, .agents-graph-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_cangzhuo: `
      .memo-shell { gap: 1rem; }
      .memo-header { display: grid; grid-template-columns: auto 1fr; gap: 0.7rem; align-items: center; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .memo-date { justify-self: end; color: var(--deck-secondary); }
      .memo-hero-card, .memo-decision-card, .memo-closing-card, .memo-compare-card, .memo-metric-card, .memo-action-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel); }
      .memo-bullet-strip { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .memo-bullet-strip span { padding: 0.5rem 0.75rem; border: 1px solid var(--deck-border); }
      .memo-list-board, .memo-risk-list, .memo-chart-list, .memo-note-stack { display: grid; gap: 0.8rem; }
      .memo-list-row, .memo-risk-row, .memo-chart-row, .memo-note-stack div { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border); }
      .memo-list-row span, .memo-compare-card span, .memo-risk-row span, .memo-metric-value, .memo-action-card span, .memo-note-stack span { font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .memo-list-row p, .memo-risk-row p, .memo-chart-row p, .memo-note-stack p, .memo-compare-card p, .memo-metric-card p, .memo-action-card p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .memo-compare-grid, .memo-metric-strip, .memo-action-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .memo-action-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .memo-metric-value { font-size: clamp(2.4rem, 5vw, 4.8rem); letter-spacing: -0.04em; }
      .memo-chart-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .memo-chart-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .memo-chart-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .memo-compare-grid, .memo-metric-strip, .memo-action-grid, .memo-chart-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_general_dark_tech_claude_code_auto_mode: `
      .darktech-shell { gap: 1rem; }
      .darktech-topbar { display: grid; grid-template-columns: auto 1fr; gap: 0.7rem; align-items: center; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .darktech-topbar span:last-child { justify-self: end; color: var(--deck-secondary); }
      .darktech-hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 1rem; }
      .darktech-hero-card, .darktech-status-card, .darktech-thesis-card, .darktech-close-card, .darktech-node-card, .darktech-compare-card, .darktech-metric-card, .darktech-run-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid color-mix(in srgb, var(--deck-accent) 24%, var(--deck-border) 76%); background: color-mix(in srgb, var(--deck-panel) 96%, black 4%); }
      .darktech-tag-strip { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .darktech-tag-strip span { padding: 0.5rem 0.75rem; border: 1px solid color-mix(in srgb, var(--deck-accent) 24%, var(--deck-border) 76%); border-radius: 999px; font: 700 var(--small-size)/1 var(--font-mono); }
      .darktech-status-card, .darktech-alert-lane, .darktech-scan-list, .darktech-proof-grid { display: grid; gap: 0.8rem; }
      .darktech-status-row, .darktech-alert-card, .darktech-scan-row, .darktech-proof-grid div { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid color-mix(in srgb, var(--deck-accent) 20%, var(--deck-border) 80%); }
      .darktech-node-grid, .darktech-compare-grid, .darktech-metric-grid, .darktech-run-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .darktech-node-card span, .darktech-compare-card span, .darktech-status-row span, .darktech-alert-card span, .darktech-run-card span, .darktech-proof-grid span, .darktech-metric-value { font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
      .darktech-node-card h3, .darktech-run-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .darktech-node-card p, .darktech-compare-card p, .darktech-status-row p, .darktech-alert-card p, .darktech-run-card p, .darktech-scan-row p, .darktech-proof-grid p, .darktech-metric-card p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .darktech-metric-value { font-size: clamp(2.4rem, 5vw, 4.8rem); letter-spacing: -0.04em; }
      .darktech-scan-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .darktech-scan-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .darktech-scan-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .darktech-hero-grid, .darktech-node-grid, .darktech-compare-grid, .darktech-metric-grid, .darktech-run-grid, .darktech-scan-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_high_rise_renewal: `
      .renewal-shell { gap: 1rem; }
      .renewal-topbar { display: grid; grid-template-columns: auto 1fr; gap: 0.7rem; align-items: center; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .renewal-topbar span:last-child { justify-self: end; color: var(--deck-secondary); }
      .renewal-hero-board { display: grid; grid-template-columns: 1fr 0.95fr; gap: 1rem; }
      .renewal-copy-card, .renewal-thesis-card, .renewal-closing-card, .renewal-plan-card, .renewal-material-card, .renewal-metric-card, .renewal-phase-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel); }
      .renewal-tagline { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .renewal-tagline span { padding: 0.5rem 0.75rem; border-top: 1px solid var(--deck-border); border-bottom: 1px solid var(--deck-border); font: 700 var(--small-size)/1 var(--font-mono); }
      .renewal-plan-grid, .renewal-material-grid, .renewal-metric-row, .renewal-phase-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .renewal-plan-card span, .renewal-material-card span, .renewal-phase-card span, .renewal-metric-value, .renewal-note-columns span, .renewal-evidence-card span { font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .renewal-plan-card h3, .renewal-phase-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .renewal-plan-card p, .renewal-material-card p, .renewal-phase-card p, .renewal-metric-card p, .renewal-note-columns p, .renewal-ledger-row p, .renewal-evidence-card p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .renewal-note-columns, .renewal-evidence-strip, .renewal-ledger-rows { display: grid; gap: 0.8rem; }
      .renewal-note-columns div, .renewal-evidence-card, .renewal-ledger-row { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border); }
      .renewal-metric-value { font-size: clamp(2.4rem, 5vw, 4.8rem); letter-spacing: -0.04em; }
      .renewal-ledger-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .renewal-ledger-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .renewal-ledger-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .renewal-hero-board, .renewal-plan-grid, .renewal-material-grid, .renewal-metric-row, .renewal-phase-grid, .renewal-ledger-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_kimsoong_loyalty_programme: `
      .loyalty-shell { gap: 1rem; }
      .loyalty-header { display: grid; grid-template-columns: auto 1fr; gap: 0.7rem; align-items: center; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .loyalty-header span:last-child { justify-self: end; color: var(--deck-secondary); }
      .loyalty-hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 1rem; }
      .loyalty-hero-card, .loyalty-benefit-card, .loyalty-story-card, .loyalty-closing-card, .loyalty-member-card, .loyalty-tier-card, .loyalty-metric-card, .loyalty-journey-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: var(--deck-panel); }
      .loyalty-chip-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .loyalty-chip-row span { padding: 0.55rem 0.8rem; border-radius: 999px; border: 1px solid var(--deck-border); font: 700 var(--small-size)/1 var(--font-mono); }
      .loyalty-benefit-card, .loyalty-proof-strip, .loyalty-chart-list, .loyalty-note-stack { display: grid; gap: 0.8rem; }
      .loyalty-benefit-row, .loyalty-proof-card, .loyalty-chart-row, .loyalty-note-stack div { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border); }
      .loyalty-member-grid, .loyalty-tier-grid, .loyalty-metric-row, .loyalty-journey-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .loyalty-member-card span, .loyalty-tier-card span, .loyalty-benefit-row span, .loyalty-proof-card span, .loyalty-journey-card span, .loyalty-note-stack span, .loyalty-metric-value { font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
      .loyalty-member-card h3, .loyalty-journey-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .loyalty-member-card p, .loyalty-tier-card p, .loyalty-benefit-row p, .loyalty-proof-card p, .loyalty-journey-card p, .loyalty-chart-row p, .loyalty-note-stack p, .loyalty-metric-card p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .loyalty-metric-value { font-size: clamp(2.4rem, 5vw, 4.8rem); letter-spacing: -0.04em; }
      .loyalty-chart-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .loyalty-chart-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .loyalty-chart-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .loyalty-hero-grid, .loyalty-member-grid, .loyalty-tier-grid, .loyalty-metric-row, .loyalty-journey-grid, .loyalty-chart-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_lin_huiyin_architect_revised: `
      .heritage-revised-shell { gap: 1rem; }
      .heritage-revised-masthead, .heritage-revised-section-head { display: grid; gap: 0.7rem; }
      .heritage-revised-masthead { grid-template-columns: auto 1fr; align-items: center; }
      .heritage-revised-chip, .heritage-revised-date, .heritage-revised-quote-tags span, .heritage-revised-index-row span, .heritage-revised-compare-card span, .heritage-revised-evidence-card span, .heritage-revised-runway-card span, .heritage-revised-note-list span, .heritage-revised-metric-value {
        font: 700 var(--small-size)/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase;
      }
      .heritage-revised-date { justify-self: end; color: var(--deck-secondary); }
      .heritage-revised-hero-spread, .heritage-revised-story-board { display: grid; grid-template-columns: 1fr 0.95fr; gap: 1rem; align-items: stretch; }
      .heritage-revised-title-card, .heritage-revised-note-card, .heritage-revised-closing-card, .heritage-revised-compare-card, .heritage-revised-metric-card, .heritage-revised-runway-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: color-mix(in srgb, var(--deck-panel) 96%, transparent); }
      .heritage-revised-quote-tags { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .heritage-revised-quote-tags span { padding: 0.55rem 0.8rem; border: 1px solid var(--deck-border); border-radius: 999px; }
      .heritage-revised-index-columns, .heritage-revised-evidence-stack, .heritage-revised-ledger-lines, .heritage-revised-note-list { display: grid; gap: 0.8rem; }
      .heritage-revised-index-row, .heritage-revised-evidence-card, .heritage-revised-ledger-row, .heritage-revised-note-list div { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border); }
      .heritage-revised-index-row p, .heritage-revised-evidence-card p, .heritage-revised-ledger-row p, .heritage-revised-note-list p, .heritage-revised-compare-card p, .heritage-revised-metric-card p, .heritage-revised-runway-card p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .heritage-revised-compare-columns, .heritage-revised-metric-columns, .heritage-revised-runway-columns { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .heritage-revised-runway-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .heritage-revised-metric-value { font-size: clamp(2.3rem, 5vw, 4.7rem); letter-spacing: -0.04em; }
      .heritage-revised-ledger-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .heritage-revised-ledger-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .heritage-revised-ledger-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .heritage-revised-hero-spread, .heritage-revised-story-board, .heritage-revised-compare-columns, .heritage-revised-metric-columns, .heritage-revised-runway-columns, .heritage-revised-ledger-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_liziqi_plant_dye_colors: `
      .dye-shell { gap: 1rem; }
      .dye-masthead { display: grid; grid-template-columns: auto 1fr; gap: 0.7rem; align-items: center; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .dye-masthead span:last-child { justify-self: end; color: var(--deck-secondary); }
      .dye-hero-board { display: grid; grid-template-columns: 1fr 0.95fr; gap: 1rem; }
      .dye-copy-card, .dye-story-card, .dye-closing-card, .dye-card, .dye-compare-card, .dye-metric-card, .dye-phase-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: color-mix(in srgb, var(--deck-panel) 96%, transparent); }
      .dye-chip-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .dye-chip-row span { padding: 0.55rem 0.8rem; border-radius: 999px; border: 1px solid var(--deck-border); font: 700 var(--small-size)/1 var(--font-mono); }
      .dye-card-grid, .dye-compare-grid, .dye-metric-row, .dye-phase-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .dye-card span, .dye-compare-card span, .dye-spotlight-card span, .dye-phase-card span, .dye-note-list span, .dye-metric-value { font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
      .dye-card h3, .dye-phase-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .dye-card p, .dye-compare-card p, .dye-spotlight-card p, .dye-phase-card p, .dye-note-list p, .dye-trend-row p, .dye-metric-card p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .dye-note-list, .dye-spotlight-strip, .dye-trend-list { display: grid; gap: 0.8rem; }
      .dye-note-list div, .dye-spotlight-card, .dye-trend-row { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border); }
      .dye-metric-value { font-size: clamp(2.3rem, 5vw, 4.7rem); letter-spacing: -0.04em; }
      .dye-trend-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .dye-trend-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .dye-trend-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .dye-hero-board, .dye-card-grid, .dye-compare-grid, .dye-metric-row, .dye-phase-grid, .dye-trend-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_lora_hu_2021: `
      .creator-shell { gap: 1rem; }
      .creator-masthead { display: grid; grid-template-columns: auto 1fr; gap: 0.7rem; align-items: center; font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; }
      .creator-masthead span:last-child { justify-self: end; color: var(--deck-secondary); }
      .creator-hero-spread { display: grid; grid-template-columns: 1fr 0.95fr; gap: 1rem; }
      .creator-copy-card, .creator-story-card, .creator-closing-card, .creator-sheet-card, .creator-compare-card, .creator-metric-card, .creator-sequence-card { display: grid; gap: 0.7rem; padding: 1rem 1.05rem; border: 1px solid var(--deck-border); background: color-mix(in srgb, var(--deck-panel) 96%, transparent); }
      .creator-chip-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
      .creator-chip-row span { padding: 0.55rem 0.8rem; border-radius: 999px; border: 1px solid var(--deck-border); font: 700 var(--small-size)/1 var(--font-mono); }
      .creator-sheet-grid, .creator-compare-grid, .creator-metric-row, .creator-sequence-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .creator-sheet-card span, .creator-compare-card span, .creator-showcase-card span, .creator-sequence-card span, .creator-note-list span, .creator-metric-value { font: 700 var(--small-size)/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
      .creator-sheet-card h3, .creator-sequence-card h3 { margin: 0; font: 800 var(--h3-size)/1.05 var(--font-title); }
      .creator-sheet-card p, .creator-compare-card p, .creator-showcase-card p, .creator-sequence-card p, .creator-note-list p, .creator-ledger-row p, .creator-metric-card p { margin: 0; font-size: var(--body-size); line-height: 1.45; }
      .creator-note-list, .creator-showcase-strip, .creator-ledger-list { display: grid; gap: 0.8rem; }
      .creator-note-list div, .creator-showcase-card, .creator-ledger-row { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: start; padding-top: 0.7rem; border-top: 1px solid var(--deck-border); }
      .creator-metric-value { font-size: clamp(2.3rem, 5vw, 4.7rem); letter-spacing: -0.04em; }
      .creator-ledger-row { grid-template-columns: minmax(0, 1fr) 0.95fr; align-items: center; }
      .creator-ledger-track { width: 100%; height: 0.72rem; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--deck-fg) 10%, transparent); }
      .creator-ledger-track i { display: block; height: 100%; background: var(--deck-accent); }
      @media (max-width: 900px) {
        .creator-hero-spread, .creator-sheet-grid, .creator-compare-grid, .creator-metric-row, .creator-sequence-grid, .creator-ledger-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_kubernetes_blueprint_2026: `
      .kube-shell { gap: 1rem; }
      .kube-topbar, .kube-section-head { display: grid; gap: 0.7rem; }
      .kube-topbar {
        grid-template-columns: auto 1fr;
        align-items: center;
        justify-content: space-between;
      }
      .kube-chip, .kube-meta, .kube-plane-label, .kube-module-index, .kube-compare-label, .kube-rollout-step {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2rem;
        padding: 0 0.8rem;
        border-radius: 999px;
        border: 1px solid var(--deck-border);
        font: 700 var(--small-size)/1 var(--font-mono);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .kube-meta { justify-self: end; background: color-mix(in srgb, var(--deck-panel) 88%, transparent); }
      .kube-cover-grid, .kube-blueprint-grid {
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 1rem;
        align-items: stretch;
      }
      .kube-cover-hero, .kube-control-plane, .kube-blueprint-primary {
        display: grid;
        gap: 1rem;
        padding: 1.15rem 1.2rem;
      }
      .kube-chip-row, .kube-lane { display: flex; flex-wrap: wrap; gap: 0.75rem; }
      .kube-node-matrix, .kube-metric-grid, .kube-rollout-board, .kube-module-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.85rem;
      }
      .kube-node-card, .kube-governance-card, .kube-metric-card, .kube-rollout-card, .kube-module-card, .kube-compare-card {
        border: 1px solid var(--deck-border);
        background: var(--deck-panel);
        padding: 1rem;
      }
      .kube-node-card {
        display: grid;
        gap: 0.5rem;
        min-height: 8rem;
        align-content: start;
      }
      .kube-node-card.active { background: color-mix(in srgb, var(--deck-accent) 14%, var(--deck-panel) 86%); }
      .kube-node-card span, .kube-governance-card span, .kube-sequence-row span, .kube-chart-copy span {
        font: 700 var(--small-size)/1 var(--font-mono);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .kube-node-card p, .kube-governance-card p, .kube-module-card p, .kube-rollout-card p, .kube-compare-card p, .kube-chart-copy p {
        margin: 0;
        font-size: var(--body-size);
        line-height: 1.45;
      }
      .kube-module-card, .kube-rollout-card, .kube-compare-card {
        display: grid;
        gap: 0.7rem;
      }
      .kube-module-card h3, .kube-rollout-card h3, .kube-compare-card h3 {
        margin: 0;
        font: 800 var(--h3-size)/1.05 var(--font-title);
      }
      .kube-lane-item {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.7rem;
        align-items: center;
        padding: 0.85rem 1rem;
        border: 1px dashed color-mix(in srgb, var(--deck-accent) 36%, var(--deck-border) 64%);
      }
      .kube-lane-item p { margin: 0; font-size: var(--small-size); line-height: 1.35; }
      .kube-sequence-stack, .kube-chart-stack {
        display: grid;
        gap: 0.8rem;
      }
      .kube-sequence-row {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.9rem;
        align-items: start;
        padding-top: 0.8rem;
        border-top: 1px solid var(--deck-border);
      }
      .kube-final-sequence { margin-top: auto; }
      .kube-chart-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 0.9fr;
        gap: 1rem;
        align-items: center;
      }
      .kube-chart-copy { display: grid; gap: 0.35rem; }
      .kube-chart-track {
        width: 100%;
        height: 0.8rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
        overflow: hidden;
      }
      .kube-chart-track i {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, var(--deck-accent), color-mix(in srgb, var(--deck-accent) 62%, white 38%));
      }
      .kube-governance-lane {
        display: grid;
        gap: 0.9rem;
      }
      .kube-governance-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.9rem;
        align-items: start;
      }
      .kube-governance-card strong { font: 800 var(--h3-size)/1.05 var(--font-title); }
      .kube-metric-card { display: grid; gap: 0.55rem; }
      .kube-metric-value {
        font: 800 clamp(2.4rem, 5vw, 4.8rem)/0.92 var(--font-title);
        letter-spacing: -0.04em;
      }
      @media (max-width: 900px) {
        .kube-cover-grid, .kube-blueprint-grid, .kube-module-grid, .kube-metric-grid, .kube-rollout-board, .kube-chart-row { grid-template-columns: 1fr; }
      }
    `,
    ppt169_image_text_showcase: `
      .showcase-shell { gap: 1rem; }
      .showcase-header { display: grid; gap: 0.7rem; }
      .showcase-meta {
        justify-self: start;
        font: 700 var(--small-size)/1 var(--font-mono);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--deck-secondary);
      }
      .showcase-hero-grid, .showcase-spread {
        display: grid;
        grid-template-columns: 0.95fr 1.05fr;
        gap: 1rem;
        align-items: stretch;
      }
      .showcase-spread.reverse { grid-template-columns: 1.05fr 0.95fr; }
      .showcase-copy, .showcase-editor-note, .showcase-comparison-stack {
        display: grid;
        gap: 1rem;
      }
      .showcase-caption-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
      }
      .showcase-caption-row span, .showcase-sheet-index, .showcase-metric-value {
        font: 700 var(--small-size)/1 var(--font-mono);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .showcase-caption-row span {
        padding-top: 0.8rem;
        border-top: 1px solid var(--deck-border);
      }
      .showcase-contact-sheet, .showcase-gallery-grid, .showcase-sequence-board, .showcase-metric-ribbon, .showcase-caption-board {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.9rem;
      }
      .showcase-sheet-card, .showcase-gallery-card, .showcase-sequence-card, .showcase-metric-tile, .showcase-caption-card, .showcase-editor-note, .showcase-comparison-stack {
        padding: 1rem 1.05rem;
      }
      .showcase-sheet-card, .showcase-gallery-card, .showcase-sequence-card, .showcase-metric-tile, .showcase-caption-card {
        display: grid;
        gap: 0.7rem;
      }
      .showcase-sheet-card h3, .showcase-sequence-card h3 {
        margin: 0;
        font: 800 var(--h3-size)/1.05 var(--font-title);
      }
      .showcase-sheet-card p, .showcase-gallery-card p, .showcase-sequence-card p, .showcase-metric-tile p, .showcase-caption-card p, .showcase-comparison-row p {
        margin: 0;
        font-size: var(--body-size);
        line-height: 1.45;
      }
      .showcase-comparison-row {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.9rem;
        align-items: start;
        padding-top: 0.8rem;
        border-top: 1px solid var(--deck-border);
      }
      .showcase-comparison-row span, .showcase-gallery-card span, .showcase-sequence-card span {
        font: 700 var(--small-size)/1 var(--font-mono);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .showcase-comparison-row strong, .showcase-gallery-card strong, .showcase-metric-tile strong, .showcase-caption-card strong {
        font: 800 var(--body-size)/1.2 var(--font-title);
      }
      .showcase-metric-value {
        font-size: clamp(2.4rem, 5vw, 4.8rem);
        letter-spacing: -0.04em;
      }
      .showcase-caption-track {
        width: 100%;
        height: 0.72rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
        overflow: hidden;
      }
      .showcase-caption-track i {
        display: block;
        height: 100%;
        background: var(--deck-accent);
      }
      .showcase-closing-list {
        display: grid;
        gap: 0.8rem;
      }
      @media (max-width: 900px) {
        .showcase-hero-grid, .showcase-spread, .showcase-spread.reverse, .showcase-contact-sheet, .showcase-gallery-grid, .showcase-sequence-board, .showcase-metric-ribbon, .showcase-caption-board { grid-template-columns: 1fr; }
      }
    `,
    ppt169_fashion_weekly_digest: `
      .digest-shell { gap: 1rem; }
      .digest-masthead, .digest-spread-head {
        display: grid;
        gap: 0.7rem;
      }
      .digest-masthead {
        grid-template-columns: auto 1fr;
        align-items: center;
      }
      .digest-issue-kicker, .digest-issue-meta, .digest-tag-ribbon span, .digest-spread-card span, .digest-editorial-card span, .digest-run-card span, .digest-column-notes span, .digest-metric-value {
        font: 700 var(--small-size)/1 var(--font-mono);
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .digest-issue-meta { justify-self: end; color: var(--deck-secondary); }
      .digest-cover-grid, .digest-column-layout {
        display: grid;
        grid-template-columns: 1fr 0.92fr;
        gap: 1rem;
        align-items: stretch;
      }
      .digest-headline-block, .digest-column-main {
        display: grid;
        gap: 1rem;
      }
      .digest-tag-ribbon {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
      }
      .digest-tag-ribbon span {
        padding: 0.55rem 0.75rem;
        border: 1px solid color-mix(in srgb, var(--deck-border) 88%, transparent);
      }
      .digest-spread-grid, .digest-compare-runway, .digest-editorial-strip, .digest-run-of-show {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.9rem;
      }
      .digest-spread-card, .digest-compare-card, .digest-editorial-card, .digest-run-card {
        display: grid;
        gap: 0.7rem;
        padding: 1rem 1.05rem;
      }
      .digest-spread-card h3, .digest-compare-card h3, .digest-run-card h3 {
        margin: 0;
        font: 800 var(--h3-size)/1.05 var(--font-title);
      }
      .digest-spread-card p, .digest-compare-card p, .digest-editorial-card p, .digest-run-card p, .digest-column-notes p, .digest-metric-row p, .digest-trend-copy p {
        margin: 0;
        font-size: var(--body-size);
        line-height: 1.45;
      }
      .digest-column-notes, .digest-metric-column, .digest-trend-board {
        display: grid;
        gap: 0.85rem;
      }
      .digest-column-notes div, .digest-metric-row, .digest-trend-row {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.9rem;
        align-items: start;
        padding-top: 0.8rem;
        border-top: 1px solid var(--deck-border);
      }
      .digest-metric-value {
        font-size: clamp(2.4rem, 5vw, 4.8rem);
        letter-spacing: -0.04em;
      }
      .digest-trend-row {
        grid-template-columns: minmax(0, 1fr) 0.95fr;
        align-items: center;
      }
      .digest-trend-copy {
        display: grid;
        gap: 0.3rem;
      }
      .digest-trend-track {
        width: 100%;
        height: 0.75rem;
        border-radius: 999px;
        overflow: hidden;
        background: color-mix(in srgb, var(--deck-fg) 10%, transparent);
      }
      .digest-trend-track i {
        display: block;
        height: 100%;
        background: var(--deck-accent);
      }
      @media (max-width: 900px) {
        .digest-cover-grid, .digest-column-layout, .digest-spread-grid, .digest-compare-runway, .digest-editorial-strip, .digest-run-of-show, .digest-trend-row { grid-template-columns: 1fr; }
      }
    `,
  }

  return `${sharedCss}\n${styleCss[archetype]}\n${styleOverrideCss[styleKey] ?? ""}`
}

