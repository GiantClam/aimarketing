import { randomUUID } from "node:crypto"

import type {
  PptPreviewAsset,
  PptPreviewDeck,
  PptPreviewPageIntent,
  PptPreviewSlide,
  PptPreviewStyleKey,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { getPptPreviewTemplateSlotByLayout } from "@/lib/lead-tools/ppt-preview-data-fixed"
import type { LeadToolPptPreviewRuntime } from "@/lib/lead-tools/ppt-engines/preview-runtime-types"
import { storePptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"

const PREVIEW_WIDTH = 1600
const PREVIEW_HEIGHT = 900
const NINE_PAGE_PROGRESS = [12, 24, 36, 48, 60, 72, 84, 92, 100] as const

type FrontendSlidesTheme = {
  deckClass: string
  fontHref: string
  titleFont: string
  bodyFont: string
  monoFont: string
  background: string
  foreground: string
  accent: string
  panel: string
  border: string
  secondary: string
  glow: string
}

type ContentsRow = { index: string; title: string; detail: string }
type ComparisonRow = { label: string; title: string; detail: string }
type SpotlightRow = { title: string; detail: string }
type MetricRow = { value: string; label: string; note?: string }
type ChartRow = { label: string; value: number; detail: string }
type ProcessRow = { step: string; title: string; detail: string }
type ClosingRow = { label: string; detail: string }

const VIEWPORT_BASE_CSS = `
html, body {
  height: 100%;
  overflow-x: hidden;
  margin: 0;
}

html {
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
}

body {
  background: var(--deck-bg);
  color: var(--deck-fg);
  font-family: var(--font-body);
}

.slide {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  scroll-snap-align: start;
  display: grid;
  place-items: center;
  position: relative;
  box-sizing: border-box;
  padding: var(--viewport-frame);
}

.slide-content {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  width: min(
    calc(100vw - (var(--viewport-frame) * 2)),
    calc((100dvh - (var(--viewport-frame) * 2)) * 16 / 9)
  );
  height: min(
    calc(100dvh - (var(--viewport-frame) * 2)),
    calc((100vw - (var(--viewport-frame) * 2)) * 9 / 16)
  );
  aspect-ratio: 16 / 9;
  overflow: hidden;
  padding: var(--slide-padding);
  box-sizing: border-box;
  max-width: calc(100vw - (var(--viewport-frame) * 2));
  max-height: calc(100dvh - (var(--viewport-frame) * 2));
  margin: 0 auto;
  position: relative;
}

:root {
  --title-size: clamp(2.2rem, 5.8vw, 5.6rem);
  --h2-size: clamp(1.4rem, 3.5vw, 2.7rem);
  --h3-size: clamp(1rem, 2.3vw, 1.6rem);
  --body-size: clamp(0.88rem, 1.45vw, 1.1rem);
  --small-size: clamp(0.7rem, 0.95vw, 0.9rem);
  --slide-padding: clamp(1.4rem, 5vw, 4.8rem);
  --viewport-frame: clamp(0.65rem, 1.8vw, 1.4rem);
  --content-gap: clamp(1rem, 2.2vw, 2.4rem);
  --element-gap: clamp(0.45rem, 1.1vw, 1.1rem);
}

.deck {
  min-height: 100vh;
  min-height: 100dvh;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font: 700 var(--small-size)/1 var(--font-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.title {
  margin: 0;
  font: 900 var(--title-size)/0.98 var(--font-title);
  letter-spacing: -0.04em;
}

.subtitle {
  margin: 0;
  max-width: min(58ch, 68vw);
  font-size: var(--body-size);
  line-height: 1.45;
}

.chip-row,
.bullet-list,
.number-list,
.timeline-list {
  display: grid;
  gap: clamp(0.55rem, 1vw, 0.95rem);
}

.bullet-list,
.number-list,
.timeline-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.panel {
  border: 1px solid var(--deck-border);
  background: var(--deck-panel);
  border-radius: clamp(1rem, 2vw, 2rem);
  box-shadow: 0 20px 60px -34px rgba(0, 0, 0, 0.5);
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(0.75rem, 1.5vw, 1.5rem);
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(0.75rem, 1.5vw, 1.5rem);
}

.footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: auto;
  font: 600 var(--small-size)/1.2 var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.progress {
  width: min(28vw, 360px);
  height: 4px;
  background: color-mix(in srgb, var(--deck-fg) 12%, transparent);
  overflow: hidden;
  border-radius: 999px;
}

.progress > span {
  display: block;
  height: 100%;
  background: var(--deck-accent);
}

.nav {
  position: fixed;
  right: clamp(0.9rem, 2vw, 1.5rem);
  bottom: clamp(0.9rem, 2vw, 1.5rem);
  z-index: 10;
  display: inline-flex;
  gap: 0.55rem;
}

.nav button {
  border: 1px solid color-mix(in srgb, var(--deck-fg) 16%, transparent);
  background: color-mix(in srgb, var(--deck-panel) 88%, rgba(255, 255, 255, 0.06));
  color: var(--deck-fg);
  border-radius: 999px;
  padding: 0.6rem 0.85rem;
  font: 700 var(--small-size)/1 var(--font-mono);
  cursor: pointer;
}

@media (max-width: 900px) {
  .grid-2,
  .grid-4 {
    grid-template-columns: 1fr;
  }
}

@media (max-height: 700px) {
  :root {
    --viewport-frame: clamp(0.45rem, 1.4vw, 0.9rem);
    --slide-padding: clamp(0.8rem, 3vw, 2.2rem);
    --content-gap: clamp(0.45rem, 1.5vw, 1rem);
    --title-size: clamp(1.65rem, 4vw, 3rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.2s !important;
  }
  html {
    scroll-behavior: auto;
  }
}
`

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

function splitUnits(value: string) {
  if (/[\u4e00-\u9fff]/u.test(value)) {
    return Array.from(value)
  }

  return value.split(/(\s+)/).filter(Boolean)
}

function wrapUnits(value: string, maxUnitsPerLine: number, maxLines: number) {
  const units = splitUnits(value.trim())
  if (!units.length) {
    return []
  }

  const lines: string[] = []
  let current = ""

  for (const unit of units) {
    const next = `${current}${unit}`
    if (next.trim().length > maxUnitsPerLine && current.trim().length > 0) {
      lines.push(current.trim())
      current = unit.trimStart()
      if (lines.length === maxLines - 1) {
        break
      }
      continue
    }
    current = next
  }

  if (lines.length < maxLines && current.trim()) {
    lines.push(current.trim())
  }

  if (lines.length === maxLines && lines.join("").length < value.replace(/\s+/g, "").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.。,…:：;；-]*$/u, "")}…`
  }

  return lines
}

function getTheme(styleKey: PptPreviewStyleKey): FrontendSlidesTheme {
  switch (styleKey) {
    case "ppt169_brutalist_ai_newspaper_2026":
      return {
        deckClass: "long-table",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Fraunces:opsz,ital,wght@9..144,1,400;9..144,1,500;9..144,1,600&family=IBM+Plex+Mono:wght@500;700&display=swap",
        titleFont: "'Bricolage Grotesque', sans-serif",
        bodyFont: "'Fraunces', serif",
        monoFont: "'IBM Plex Mono', monospace",
        background: "#FAF1E2",
        foreground: "#B53D2A",
        accent: "#B53D2A",
        panel: "rgba(255,247,236,0.9)",
        border: "rgba(181,61,42,0.24)",
        secondary: "#8E2D1F",
        glow: "rgba(181,61,42,0.12)",
      }
    case "ppt169_sugar_rush_memphis":
      return {
        deckClass: "playful",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@500;700&display=swap",
        titleFont: "'Syne', sans-serif",
        bodyFont: "'Space Grotesk', sans-serif",
        monoFont: "'IBM Plex Mono', monospace",
        background: "#F0C8A0",
        foreground: "#1A1A1A",
        accent: "#1A1A1A",
        panel: "rgba(247,222,198,0.9)",
        border: "rgba(26,26,26,0.2)",
        secondary: "#E8B88E",
        glow: "rgba(26,26,26,0.08)",
      }
    case "ppt169_pritzker_2026":
      return {
        deckClass: "broadside",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;700;800;900&family=IBM+Plex+Mono:wght@500;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap",
        titleFont: "'Barlow', 'Noto Sans SC', sans-serif",
        bodyFont: "'Barlow', 'Noto Sans SC', sans-serif",
        monoFont: "'IBM Plex Mono', monospace",
        background: "#111111",
        foreground: "#F0ECE5",
        accent: "#E85D26",
        panel: "rgba(26,26,24,0.92)",
        border: "rgba(40,40,38,0.88)",
        secondary: "#888880",
        glow: "rgba(232,93,38,0.14)",
      }
    case "ppt169_swiss_grid_systems":
      return {
        deckClass: "neo-grid-bold",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap",
        titleFont: "'Space Grotesk', sans-serif",
        bodyFont: "'Space Grotesk', sans-serif",
        monoFont: "'JetBrains Mono', monospace",
        background: "#ECECE8",
        foreground: "#0A0A0A",
        accent: "#E6FF3D",
        panel: "rgba(245,244,239,0.92)",
        border: "rgba(138,138,133,0.24)",
        secondary: "#8A8A85",
        glow: "rgba(230,255,61,0.14)",
      }
  }
}

function buildHeadlineDeckLabel(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  return `${deck.scenario.replace(/-/g, " ")} / ${variant.name}`
}

function buildDeckIssueNumber(variant: PptPreviewVariant) {
  return String(variant.slides.length).padStart(2, "0")
}

function buildDeckDateStamp(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "00.00.00"
  }

  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
  const day = String(parsed.getUTCDate()).padStart(2, "0")
  const year = String(parsed.getUTCFullYear()).slice(-2)
  return `${month}.${day}.${year}`
}

function renderFooter(label: string, progressPercent: number) {
  return `
    <div class="footer-bar">
      <span>${escapeHtml(label)}</span>
      <div class="progress"><span style="width:${progressPercent}%"></span></div>
    </div>
  `
}

function renderBulletList(bullets: string[]) {
  return `
    <ul class="bullet-list">
      ${bullets
        .slice(0, 4)
        .map((bullet) => `<li><span class="bullet-dot"></span><p>${escapeHtml(bullet)}</p></li>`)
        .join("")}
    </ul>
  `
}

function renderContentsCards(
  items: Array<{ index: string; title: string; detail: string }>,
  className: string,
) {
  return items
    .slice(0, 9)
    .map(
      (item) => `
        <article class="${className}">
          <span class="card-index">${escapeHtml(item.index)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.detail)}</p>
        </article>`,
    )
    .join("")
}

function getVariantSlideByIntent(
  variant: PptPreviewVariant,
  intent: PptPreviewPageIntent,
  fallbackLayout: PptPreviewSlide["layout"],
) {
  return variant.slides.find((slide) => slide.intent === intent) ?? variant.slides.find((slide) => slide.layout === fallbackLayout)
}

function getVariantSlideByLayout(variant: PptPreviewVariant, layout: PptPreviewSlide["layout"]) {
  return variant.slides.find((slide) => slide.layout === layout)
}

function getComparisonRows(slide: PptPreviewSlide | undefined) {
  if (slide?.comparisonItems?.length) return slide.comparisonItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    label: String.fromCharCode(65 + index),
    title: `Track ${index + 1}`,
    detail,
  }))
}

function getContentsRows(slide: PptPreviewSlide | undefined, fallbackOutline: string[]) {
  if (slide?.contentsItems?.length) return slide.contentsItems.slice(0, 9)
  return fallbackOutline.slice(0, 9).map((title, index) => ({
    index: String(index + 1).padStart(2, "0"),
    title,
    detail: slide?.bullets?.[index] ?? slide?.body ?? title,
  }))
}

function getSpotlightRows(slide: PptPreviewSlide | undefined) {
  if (slide?.spotlightItems?.length) return slide.spotlightItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    title: index === 0 ? slide?.title ?? `Signal ${index + 1}` : `Signal ${index + 1}`,
    detail,
  }))
}

function getMetricRows(slide: PptPreviewSlide | undefined) {
  if (slide?.metricItems?.length) return slide.metricItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((label, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label,
    note: "",
  }))
}

function getChartRows(slide: PptPreviewSlide | undefined) {
  if (slide?.chartItems?.length) return slide.chartItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    label: String.fromCharCode(65 + index),
    value: Math.max(24, Math.min(96, detail.length * 4)),
    detail,
  }))
}

function getProcessRows(slide: PptPreviewSlide | undefined) {
  if (slide?.processItems?.length) return slide.processItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    step: String(index + 1).padStart(2, "0"),
    title: `Step ${index + 1}`,
    detail,
  }))
}

function getClosingRows(slide: PptPreviewSlide | undefined) {
  if (slide?.closingItems?.length) return slide.closingItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    label: String(index + 1).padStart(2, "0"),
    detail,
  }))
}

function getTemplateFallbackIntents(styleKey: PptPreviewStyleKey, layout: PptPreviewSlide["layout"]) {
  return getPptPreviewTemplateSlotByLayout(styleKey, layout)?.fallbackIntents ?? []
}

function deriveChartRowsFromTemplateFallbacks(params: {
  styleKey: PptPreviewStyleKey
  slide: PptPreviewSlide | undefined
  comparisonRows: ComparisonRow[]
  statsRows: MetricRow[]
  spotlightRows: SpotlightRow[]
}): ChartRow[] {
  if (params.slide?.chartItems?.length) return getChartRows(params.slide)

  for (const fallbackIntent of getTemplateFallbackIntents(params.styleKey, "chart")) {
    if (fallbackIntent === "comparison" && params.comparisonRows.length) {
      return params.comparisonRows.slice(0, 4).map((item, index) => ({
        label: /^[A-D]$/u.test(item.label.trim()) ? item.title : item.label || String.fromCharCode(65 + index),
        value: Math.max(42, Math.min(92, item.detail.length * 3 + item.title.length * 2)),
        detail: `${item.title} · ${item.detail}`,
      }))
    }

    if (fallbackIntent === "stats" && params.statsRows.length) {
      return params.statsRows.slice(0, 4).map((item, index) => ({
        label: item.label || String.fromCharCode(65 + index),
        value: Math.max(38, Math.min(90, `${item.value}${item.label}${item.note ?? ""}`.length * 2)),
        detail: item.note ? `${item.value} · ${item.note}` : item.value,
      }))
    }

    if (fallbackIntent === "spotlight" && params.spotlightRows.length) {
      return params.spotlightRows.slice(0, 4).map((item, index) => ({
        label: String.fromCharCode(65 + index),
        value: Math.max(40, Math.min(88, item.detail.length * 3)),
        detail: `${item.title} · ${item.detail}`,
      }))
    }
  }

  return getChartRows(params.slide)
}

function deriveProcessRowsFromTemplateFallbacks(params: {
  styleKey: PptPreviewStyleKey
  slide: PptPreviewSlide | undefined
  closingRows: ClosingRow[]
  agendaRows: ContentsRow[]
  spotlightRows: SpotlightRow[]
}): ProcessRow[] {
  if (params.slide?.processItems?.length) return getProcessRows(params.slide)

  for (const fallbackIntent of getTemplateFallbackIntents(params.styleKey, "process")) {
    if (fallbackIntent === "closing" && params.closingRows.length) {
      return params.closingRows.slice(0, 4).map((item, index) => ({
        step: String(index + 1).padStart(2, "0"),
        title: item.label,
        detail: item.detail,
      }))
    }

    if (fallbackIntent === "contents" && params.agendaRows.length) {
      return params.agendaRows.slice(0, 4).map((item, index) => ({
        step: item.index || String(index + 1).padStart(2, "0"),
        title: item.title,
        detail: item.detail,
      }))
    }

    if (fallbackIntent === "spotlight" && params.spotlightRows.length) {
      return params.spotlightRows.slice(0, 4).map((item, index) => ({
        step: String(index + 1).padStart(2, "0"),
        title: item.title,
        detail: item.detail,
      }))
    }
  }

  return getProcessRows(params.slide)
}

function partitionLongTableAgendaRows(rows: ContentsRow[]) {
  if (rows.length <= 6) {
    return {
      ledgerRows: rows,
      signalRows: rows,
    }
  }

  return {
    ledgerRows: rows.slice(0, 6),
    signalRows: rows.slice(6, 9),
  }
}

function repairStructuredSlideData(
  slide: PptPreviewSlide,
  field: "contentsItems" | "comparisonItems" | "spotlightItems" | "metricItems" | "chartItems" | "processItems" | "closingItems",
  value:
    | PptPreviewSlide["contentsItems"]
    | PptPreviewSlide["comparisonItems"]
    | PptPreviewSlide["spotlightItems"]
    | PptPreviewSlide["metricItems"]
    | PptPreviewSlide["chartItems"]
    | PptPreviewSlide["processItems"]
    | PptPreviewSlide["closingItems"],
) {
  if (slide[field]?.length || !value?.length) {
    return slide
  }

  return {
    ...slide,
    [field]: value,
  } as PptPreviewSlide
}

function repairVariantForRuntime(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const agenda = getVariantSlideByIntent(variant, "contents", "agenda")
  const comparison = getVariantSlideByIntent(variant, "comparison", "comparison")
  const evidence = getVariantSlideByIntent(variant, "spotlight", "evidence")
  const stats = getVariantSlideByIntent(variant, "stats", "stats")
  const chart = getVariantSlideByIntent(variant, "chart", "chart")
  const process = getVariantSlideByIntent(variant, "process", "process")
  const closing = getVariantSlideByIntent(variant, "closing", "timeline")

  const agendaRows = getContentsRows(agenda, variant.outline ?? deck.outline)
  const comparisonRows = getComparisonRows(comparison)
  const spotlightRows = getSpotlightRows(evidence)
  const statsRows = getMetricRows(stats)
  const closingRows = getClosingRows(closing)
  const chartRows = deriveChartRowsFromTemplateFallbacks({
    styleKey: variant.key,
    slide: chart,
    comparisonRows,
    statsRows,
    spotlightRows,
  })
  const processRows = deriveProcessRowsFromTemplateFallbacks({
    styleKey: variant.key,
    slide: process,
    closingRows,
    agendaRows,
    spotlightRows,
  })

  return {
    ...variant,
    slides: variant.slides.map((slide) => {
      switch (slide.intent ?? slide.layout) {
        case "contents":
        case "agenda":
          return repairStructuredSlideData(slide, "contentsItems", agendaRows)
        case "comparison":
          return repairStructuredSlideData(slide, "comparisonItems", comparisonRows)
        case "spotlight":
        case "evidence":
          return repairStructuredSlideData(slide, "spotlightItems", spotlightRows)
        case "stats":
          return repairStructuredSlideData(slide, "metricItems", statsRows)
        case "chart":
          return repairStructuredSlideData(slide, "chartItems", chartRows)
        case "process":
          return repairStructuredSlideData(slide, "processItems", processRows)
        case "closing":
        case "timeline":
          return repairStructuredSlideData(slide, "closingItems", closingRows)
        default:
          return slide
      }
    }),
  }
}

function deriveNeoGridChartRows(params: {
  chart: PptPreviewSlide | undefined
  comparisonRows: Array<{ label: string; title: string; detail: string }>
  statsRows: Array<{ value: string; label: string; note?: string }>
  spotlightRows: Array<{ title: string; detail: string }>
}) {
  return deriveChartRowsFromTemplateFallbacks({
    styleKey: "ppt169_swiss_grid_systems",
    slide: params.chart,
    comparisonRows: params.comparisonRows,
    statsRows: params.statsRows,
    spotlightRows: params.spotlightRows,
  })
}

function deriveNeoGridProcessRows(params: {
  process: PptPreviewSlide | undefined
  closingRows: Array<{ label: string; detail: string }>
  agendaRows: Array<{ index: string; title: string; detail: string }>
  spotlightRows: Array<{ title: string; detail: string }>
}) {
  return deriveProcessRowsFromTemplateFallbacks({
    styleKey: "ppt169_swiss_grid_systems",
    slide: params.process,
    closingRows: params.closingRows,
    agendaRows: params.agendaRows,
    spotlightRows: params.spotlightRows,
  })
}

function renderLongTableSlides(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const cover = getVariantSlideByIntent(variant, "cover", "cover")
  const agenda = getVariantSlideByIntent(variant, "contents", "agenda")
  const insight = getVariantSlideByIntent(variant, "statement", "insight")
  const comparison = getVariantSlideByIntent(variant, "comparison", "comparison")
  const evidence = getVariantSlideByIntent(variant, "spotlight", "evidence")
  const stats = getVariantSlideByIntent(variant, "stats", "stats")
  const chart = getVariantSlideByIntent(variant, "chart", "chart")
  const process = getVariantSlideByIntent(variant, "process", "process")
  const timeline = getVariantSlideByIntent(variant, "closing", "timeline")
  const variantOutline = variant.outline ?? deck.outline
  const coverPoints = (cover?.bullets ?? []).slice(0, 4)
  const agendaRows = getContentsRows(agenda, variantOutline)
  const { ledgerRows: longTableLedgerRows, signalRows: longTableSignalRows } = partitionLongTableAgendaRows(agendaRows)
  const insightPoints = (insight?.bullets ?? []).slice(0, 4)
  const comparisonRows = getComparisonRows(comparison)
  const spotlightRows = getSpotlightRows(evidence)
  const statsRows = getMetricRows(stats)
  const closingRows = getClosingRows(timeline)
  const chartRows = deriveChartRowsFromTemplateFallbacks({
    styleKey: "ppt169_brutalist_ai_newspaper_2026",
    slide: chart,
    comparisonRows,
    statsRows,
    spotlightRows,
  })
  const processRows = deriveProcessRowsFromTemplateFallbacks({
    styleKey: "ppt169_brutalist_ai_newspaper_2026",
    slide: process,
    closingRows,
    agendaRows,
    spotlightRows,
  })
  const issueNumber = buildDeckIssueNumber(variant)
  return [
    `
      <section class="slide long-table-cover">
        <div class="slide-content long-table-shell">
          <header class="long-table-header">
            <span class="eyebrow">${escapeHtml(cover?.kicker ?? "")}</span>
            <span class="table-caption">${escapeHtml(buildHeadlineDeckLabel(deck, variant))}</span>
          </header>
          <div class="ledger-grid long-table-cover-grid">
            <article class="ledger-hero">
              <div class="cover-ed-row">
                <span class="edition-badge">${issueNumber}</span>
                <span class="edition-label">briefing edition</span>
              </div>
              <h1 class="title">${escapeHtml(cover?.title ?? deck.title)}</h1>
              <div class="cover-actions">
                <span class="action-pill">${escapeHtml(deck.language)}</span>
                <span class="action-divider">|</span>
                <span class="action-pill">${escapeHtml(deck.scenario.replace(/-/g, " "))}</span>
              </div>
              <div class="cover-statline">
                <span class="stat-big">${escapeHtml(coverPoints[0] ?? cover?.kicker ?? "")}</span>
                <p class="subtitle">${escapeHtml(cover?.body ?? "")}</p>
              </div>
            </article>
            <div class="edition-column">
              <div class="big-edition">No. ${issueNumber}</div>
              <div class="big-edition-lab">${escapeHtml(buildDeckDateStamp(deck.generatedAt))} · ${escapeHtml(variant.name)}</div>
              <div class="big-edition-meta">${escapeHtml(variant.summary)}</div>
              <aside class="panel committee-note">
                <h3>Table Stakes</h3>
                ${renderBulletList(cover?.bullets ?? [])}
                <div class="stake-meter-board">
                  ${coverPoints
                    .map(
                      (bullet, index) => `
                        <div class="stake-meter-row">
                          <span>${String(index + 1).padStart(2, "0")}</span>
                          <div class="stake-meter-track"><i style="width:${Math.max(38, Math.min(94, bullet.length * 4))}%"></i></div>
                        </div>`,
                    )
                    .join("")}
                </div>
              </aside>
            </div>
          </div>
          <div class="ledger-row">
            ${(cover?.bullets ?? []).slice(0, 4).map((bullet) => `<span>${escapeHtml(bullet)}</span>`).join("")}
          </div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[0])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="eyebrow">${escapeHtml(agenda?.kicker ?? "")}</div>
          <div class="table-heading">
            <h2 class="title">${escapeHtml(agenda?.title ?? "")}</h2>
            <p class="subtitle">${escapeHtml(agenda?.body ?? "")}</p>
          </div>
          <div class="agenda-ledger">
            ${renderContentsCards(longTableLedgerRows, "panel ledger-card")}
          </div>
          <div class="agenda-signal-line">
            ${longTableSignalRows
              .map(
                (item) => `
                  <div class="signal-node">
                    <span>${escapeHtml(item.index)}</span>
                    <p>${escapeHtml(item.title)}</p>
                  </div>`,
              )
              .join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[1])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="long-table-quote">
            <span class="quote-kicker">${escapeHtml(insight?.kicker ?? "")}</span>
            <h2 class="title quote-body">${escapeHtml(insight?.title ?? "")}</h2>
            <p class="subtitle quote-desc">${escapeHtml(insight?.body ?? "")}</p>
            <div class="quote-signoff">
              ${insightPoints.map((bullet) => `<span>${escapeHtml(bullet)}</span>`).join("")}
            </div>
          </div>
          ${renderFooter(variant.name, NINE_PAGE_PROGRESS[2])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="long-table-featured">
            <div class="featured-left">
              <div class="cover-ed-row">
                <span class="edition-badge">04</span>
                <span class="edition-label">${escapeHtml(comparison?.kicker ?? "")}</span>
              </div>
              <h2 class="title">${escapeHtml(comparison?.title ?? "")}</h2>
              <p class="subtitle">${escapeHtml(comparison?.body ?? "")}</p>
              <div class="stats-line">
                ${comparisonRows.slice(0, 2).map((item) => `<span class="rect-tag">${escapeHtml(item.title)}</span>`).join("")}
              </div>
            </div>
            <div class="featured-right panel">
              ${comparisonRows
                .map(
                  (item) => `
                    <div class="info-row">
                      <span class="info-key">${escapeHtml(item.label)}</span>
                      <div class="info-value"><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.detail)}</div>
                    </div>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[3])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="eyebrow">${escapeHtml(evidence?.kicker ?? "")}</div>
          <article class="panel desk-verdict">
            <span class="metric-kicker">${escapeHtml(evidence?.kicker ?? "")}</span>
            <h2 class="title">${escapeHtml(evidence?.title ?? "")}</h2>
            <p class="subtitle">${escapeHtml(evidence?.body ?? "")}</p>
          </article>
          <div class="decision-matrix">
            ${spotlightRows
              .map(
                (item, index) => `
                  <article class="panel matrix-row">
                    <span class="compare-label">${String(index + 1).padStart(2, "0")}</span>
                    <p><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.detail)}</p>
                  </article>`,
              )
              .join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[4])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="eyebrow">${escapeHtml(stats?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(stats?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(stats?.body ?? "")}</p>
          <div class="decision-matrix">
            ${statsRows
              .slice(0, 3)
              .map(
                (item) => `
                  <article class="panel matrix-row">
                    <span class="compare-label">${escapeHtml(item.value)}</span>
                    <p><strong>${escapeHtml(item.label)}</strong>${item.note ? `<br />${escapeHtml(item.note)}` : ""}</p>
                  </article>`,
              )
              .join("")}
          </div>
          <div class="panel matrix-trend">
            ${statsRows
              .slice(0, 3)
              .map(
                (item) => `
                  <div class="trend-row">
                    <span>${escapeHtml(item.value)}</span>
                    <div class="trend-track"><i style="width:${Math.max(42, Math.min(96, item.label.length * 4))}%"></i></div>
                  </div>`,
              )
              .join("")}
          </div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[5])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="long-table-index">
            <div class="topbar">
              <h2 class="title index-title">${escapeHtml(chart?.title ?? "")}</h2>
              <span class="table-caption">${escapeHtml(chart?.kicker ?? "")}</span>
            </div>
            <p class="subtitle">${escapeHtml(chart?.body ?? "")}</p>
            <div class="index-grid">
              ${chartRows
                .map(
                  (item, index) => `
                    <article class="panel index-card">
                      <div class="card-top">
                        <span class="num-tag">${String(index + 1).padStart(2, "0")}</span>
                        <span class="city-tag">${escapeHtml(item.label)}</span>
                      </div>
                      <h3>${escapeHtml(variantOutline[index + 4] ?? item.label)}</h3>
                      <p>${escapeHtml(item.detail)}</p>
                    </article>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[6])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="long-table-schedule">
            <div class="topbar">
              <h2 class="title schedule-title">${escapeHtml(process?.title ?? "")}</h2>
              <span class="table-caption">${escapeHtml(process?.kicker ?? "")}</span>
            </div>
            <p class="subtitle">${escapeHtml(process?.body ?? "")}</p>
            <div class="schedule-ledger">
              <div class="schedule-row headrow">
                <div>Step</div>
                <div>Lane</div>
                <div>Action</div>
                <div>Signal</div>
              </div>
              ${processRows
                .map(
                  (item, index) => `
                    <div class="schedule-row">
                      <div class="num-tag">${escapeHtml(item.step)}</div>
                      <div class="city-tag">${escapeHtml(item.title)}</div>
                      <div class="theme">${escapeHtml(item.detail)}</div>
                      <div class="seats-pill">${escapeHtml(index === 0 ? "Now" : index === processRows.length - 1 ? "Ship" : "Next")}</div>
                    </div>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(variant.name, NINE_PAGE_PROGRESS[7])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content long-table-shell">
          <div class="eyebrow">${escapeHtml(timeline?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(timeline?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(timeline?.body ?? "")}</p>
          <ol class="timeline-list schedule-band">
            ${closingRows
              .map(
                (item) => `
                  <li class="panel schedule-step">
                    <span class="timeline-step">${escapeHtml(item.label)}</span>
                    <p>${escapeHtml(item.detail)}</p>
                  </li>`,
              )
              .join("")}
          </ol>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[8])}
        </div>
      </section>
    `,
  ].join("\n")
}

function renderPlayfulSlides(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const cover = getVariantSlideByIntent(variant, "cover", "cover")
  const agenda = getVariantSlideByIntent(variant, "contents", "agenda")
  const insight = getVariantSlideByIntent(variant, "statement", "insight")
  const comparison = getVariantSlideByIntent(variant, "comparison", "comparison")
  const evidence = getVariantSlideByIntent(variant, "spotlight", "evidence")
  const stats = getVariantSlideByIntent(variant, "stats", "stats")
  const chart = getVariantSlideByIntent(variant, "chart", "chart")
  const process = getVariantSlideByIntent(variant, "process", "process")
  const timeline = getVariantSlideByIntent(variant, "closing", "timeline")
  const variantOutline = variant.outline ?? deck.outline
  const coverPoints = (cover?.bullets ?? []).slice(0, 4)
  const agendaRows = getContentsRows(agenda, variantOutline)
  const insightPoints = (insight?.bullets ?? []).slice(0, 4)
  const comparisonRows = getComparisonRows(comparison)
  const spotlightRows = getSpotlightRows(evidence)
  const statsRows = getMetricRows(stats)
  const closingRows = getClosingRows(timeline)
  const chartRows = deriveNeoGridChartRows({
    chart,
    comparisonRows,
    statsRows,
    spotlightRows,
  })
  const processRows = deriveNeoGridProcessRows({
    process,
    closingRows,
    agendaRows,
    spotlightRows,
  })
  const coverDate = buildDeckDateStamp(deck.generatedAt)
  return [
    `
      <section class="slide playful-cover">
        <div class="slide-content playful-shell">
          <div class="playful-orbit"></div>
          <div class="playful-orbit playful-orbit-secondary"></div>
          <div class="playful-date">${escapeHtml(coverDate)}</div>
          <div class="brand-ribbon">
            <span class="brand-chip">${escapeHtml(cover?.kicker ?? "")}</span>
            <span class="brand-chip">${escapeHtml(deck.language)}</span>
            <span class="brand-chip">${escapeHtml(deck.scenario.replace(/-/g, " "))}</span>
          </div>
          <article class="panel bubble-panel">
            <h1 class="title">${escapeHtml(cover?.title ?? deck.title)}</h1>
            <p class="subtitle">${escapeHtml(cover?.body ?? "")}</p>
            <div class="brand-signal-line">
              ${coverPoints
                .map(
                  (bullet, index) => `
                    <div class="spark-point spark-${index + 1}">
                      <span>${String(index + 1).padStart(2, "0")}</span>
                    </div>`,
                )
                .join("")}
              <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2 20 C16 4, 28 24, 42 12 S70 6, 98 18"></path>
              </svg>
            </div>
          </article>
          <div class="play-card-grid">
            ${coverPoints
              .map(
                (bullet, index) => `
                  <article class="panel play-card">
                    <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
                    <p>${escapeHtml(bullet)}</p>
                  </article>`,
              )
              .join("")}
          </div>
          <div class="playful-side-note">BRAND STORY ARC</div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[0])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell">
          <div class="eyebrow">${escapeHtml(agenda?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(agenda?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(agenda?.body ?? "")}</p>
          <div class="play-note-grid">
            ${renderContentsCards(agendaRows, "panel play-note")}
          </div>
          <div class="brand-flow">
            ${agendaRows
              .map(
                (item) => `
                  <div class="flow-node">
                    <span>${escapeHtml(item.index)}</span>
                    <p>${escapeHtml(item.title)}</p>
                  </div>`,
              )
              .join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[1])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell playful-vision-slide">
          <div class="eyebrow">${escapeHtml(insight?.kicker ?? "")}</div>
          <h2 class="title playful-vision-title">${escapeHtml(insight?.title ?? "")}</h2>
          <div class="playful-body-columns">
            <p class="body-text">${escapeHtml(insight?.body ?? "")}</p>
            <div class="playful-vision-tags">
              ${insightPoints.map((bullet) => `<span class="brand-chip">${escapeHtml(bullet)}</span>`).join("")}
            </div>
          </div>
          <div class="brand-frame" aria-hidden="true"></div>
          ${renderFooter(variant.name, NINE_PAGE_PROGRESS[2])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell playful-comparison-slide">
          <div class="eyebrow">${escapeHtml(comparison?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(comparison?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(comparison?.body ?? "")}</p>
          <div class="playful-services-collage">
            ${comparisonRows.map(
              (item, index) => `
                <article class="panel service-block ${index === 0 ? "filled" : ""}">
                  <span class="compare-label">${escapeHtml(item.label)}</span>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.detail)}</p>
                </article>`,
            ).join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[3])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell">
          <div class="eyebrow">${escapeHtml(evidence?.kicker ?? "")}</div>
          <div class="play-spark panel">
            <span class="metric-kicker">${escapeHtml(evidence?.kicker ?? "")}</span>
            <h2 class="title">${escapeHtml(evidence?.title ?? "")}</h2>
            <p class="subtitle">${escapeHtml(evidence?.body ?? "")}</p>
          </div>
          <div class="brand-ribbon insight-band">
            ${spotlightRows.map((item) => `<span class="brand-chip">${escapeHtml(item.title)}</span>`).join("")}
          </div>
          <div class="play-card-grid">
            ${spotlightRows
              .map(
                (item, index) => `
                  <article class="panel play-card">
                    <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
                    <p><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.detail)}</p>
                  </article>`,
              )
              .join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[4])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell playful-stats-slide">
          <div class="eyebrow">${escapeHtml(stats?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(stats?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(stats?.body ?? "")}</p>
          <div class="playful-stats-grid">
            ${statsRows
              .slice(0, 3)
              .map(
                (item) => `
                  <article class="stat-item">
                    <div class="stat-num">${escapeHtml(item.value)}</div>
                    <p><strong>${escapeHtml(item.label)}</strong>${item.note ? `<br />${escapeHtml(item.note)}` : ""}</p>
                  </article>`,
              )
              .join("")}
          </div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[5])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell playful-chart-slide">
          <div class="eyebrow">${escapeHtml(chart?.kicker ?? "")}</div>
          <div class="playful-chart-header">
            <h2 class="title chart-title">${escapeHtml(chart?.title ?? "")}</h2>
            <div class="chart-legend">
              <span><i class="legend-dot"></i>${escapeHtml(chart?.kicker ?? "")}</span>
              <span><i class="legend-dot alt"></i>${escapeHtml(variant.name)}</span>
            </div>
          </div>
          <p class="subtitle">${escapeHtml(chart?.body ?? "")}</p>
          <div class="playful-chart-area">
            <div class="y-axis">
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>
            <div class="chart-bars">
              ${chartRows
                .map(
                  (item, index) => `
                    <div class="bar-group">
                      <div class="bar ${index % 2 === 1 ? "alt" : ""}" style="height:${Math.max(26, Math.min(88, item.value))}%"></div>
                      <span class="bar-label">${escapeHtml(item.label)}</span>
                    </div>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[6])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell playful-process-slide">
          <div class="eyebrow">${escapeHtml(process?.kicker ?? "")}</div>
          <h2 class="title timeline-title">${escapeHtml(process?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(process?.body ?? "")}</p>
          <div class="timeline-track">
            ${processRows
              .map(
                (item, index) => `
                  <article class="timeline-step-card">
                    <div class="step-node ${index % 2 === 0 ? "filled" : ""}">${escapeHtml(item.step)}</div>
                    <h3 class="step-title">${escapeHtml(item.title)}</h3>
                    <p class="step-desc">${escapeHtml(item.detail)}</p>
                  </article>`,
              )
              .join("")}
          </div>
          ${renderFooter(variant.name, NINE_PAGE_PROGRESS[7])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content playful-shell">
          <div class="eyebrow">${escapeHtml(timeline?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(timeline?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(timeline?.body ?? "")}</p>
          <ol class="timeline-list ribbon-timeline">
            ${closingRows
              .map(
                (item) => `
                  <li class="panel ribbon-step">
                    <span class="timeline-step">${escapeHtml(item.label)}</span>
                    <p>${escapeHtml(item.detail)}</p>
                  </li>`,
              )
              .join("")}
          </ol>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[8])}
        </div>
      </section>
    `,
  ].join("\n")
}

function renderBroadsideSlides(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const cover = getVariantSlideByLayout(variant, "cover")
  const agenda = getVariantSlideByLayout(variant, "agenda")
  const insight = getVariantSlideByLayout(variant, "insight")
  const comparison = getVariantSlideByLayout(variant, "comparison")
  const evidence = getVariantSlideByLayout(variant, "evidence")
  const stats = getVariantSlideByLayout(variant, "stats")
  const chart = getVariantSlideByLayout(variant, "chart")
  const process = getVariantSlideByLayout(variant, "process")
  const timeline = getVariantSlideByLayout(variant, "timeline")
  const variantOutline = variant.outline ?? deck.outline
  const coverPoints = (cover?.bullets ?? []).slice(0, 3)
  const agendaRows = getContentsRows(agenda, variantOutline)
  const comparisonRows = getComparisonRows(comparison)
  const spotlightRows = getSpotlightRows(evidence)
  const statsRows = getMetricRows(stats)
  const closingRows = getClosingRows(timeline)
  const chartRows = deriveChartRowsFromTemplateFallbacks({
    styleKey: "ppt169_pritzker_2026",
    slide: chart,
    comparisonRows,
    statsRows,
    spotlightRows,
  })
  const processRows = deriveProcessRowsFromTemplateFallbacks({
    styleKey: "ppt169_pritzker_2026",
    slide: process,
    closingRows,
    agendaRows,
    spotlightRows,
  })

  return [
    `
      <section class="slide broadside-cover-page">
        <div class="slide-content broadside-shell broadside-cover-shell">
          <div class="broadside-top-chrome">
            <span class="broadside-num">01</span>
            <span class="corner-label">${escapeHtml(variant.name)}</span>
          </div>
          <div class="cover-signal-strip">
            ${coverPoints.map((bullet) => `<span>${escapeHtml(bullet)}</span>`).join("")}
          </div>
          <div class="cover-body">
            <div class="eyebrow">${escapeHtml(cover?.kicker ?? "")}</div>
            <h1 class="title broadside-h1">${escapeHtml(cover?.title ?? deck.title)}</h1>
            <p class="subtitle broadside-lead">${escapeHtml(cover?.body ?? "")}</p>
          </div>
          <div class="cover-meta">
            <span>${escapeHtml(variant.summary)}</span>
            <span>${escapeHtml(deck.language)} / ${escapeHtml(deck.scenario.replace(/-/g, " "))}</span>
          </div>
          <aside class="poster-columns">
            ${coverPoints.map((bullet) => `<article class="poster-slab"><p>${escapeHtml(bullet)}</p></article>`).join("")}
          </aside>
        </div>
      </section>
    `,
    `
      <section class="slide broadside-contents-page">
        <div class="slide-content broadside-shell">
          <div class="broadside-top-chrome">
            <span class="broadside-num">02 / Contents</span>
            <span class="corner-label">${escapeHtml(agenda?.kicker ?? "")}</span>
          </div>
          <h2 class="title">${escapeHtml(agenda?.title ?? "")}</h2>
          <p class="subtitle broadside-lead">${escapeHtml(agenda?.body ?? "")}</p>
          <div class="contents-board broadside-contents-board">
            ${agendaRows
              .slice(0, 8)
              .map(
                (item) => `
                  <article class="contents-card">
                    <span class="card-index">${escapeHtml(item.index)}</span>
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.detail)}</p>
                  </article>`,
              )
              .join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[1])}
        </div>
      </section>
    `,
    `
      <section class="slide broadside-statement-page">
        <div class="slide-content broadside-shell">
          <div class="broadside-top-chrome">
            <span class="broadside-num">03</span>
            <span class="corner-label">${escapeHtml(insight?.kicker ?? "")}</span>
          </div>
          <div class="statement-shell">
            <span class="kicker-line">${escapeHtml(insight?.kicker ?? "")}</span>
            <div class="broadside-rule"></div>
            <h2 class="title broadside-h1 accent-ink">${escapeHtml(insight?.title ?? "")}</h2>
            <p class="subtitle broadside-lead">${escapeHtml(insight?.body ?? "")}</p>
          </div>
          <div class="broadside-notes">
            ${(insight?.bullets ?? [])
              .slice(0, 4)
              .map((bullet) => `<div class="note-row"><span>/</span><p>${escapeHtml(bullet)}</p></div>`)
              .join("")}
          </div>
          ${renderFooter(variant.name, NINE_PAGE_PROGRESS[2])}
        </div>
      </section>
    `,
    `
      <section class="slide broadside-statement-page">
        <div class="slide-content broadside-shell">
          <div class="broadside-top-chrome">
            <span class="broadside-num">04</span>
            <span class="corner-label">${escapeHtml(comparison?.kicker ?? "")}</span>
          </div>
          <div class="statement-shell">
            <span class="kicker-line">${escapeHtml(comparison?.kicker ?? "")}</span>
            <div class="broadside-rule"></div>
            <h2 class="title broadside-h1">${escapeHtml(comparison?.title ?? "")}</h2>
            <p class="subtitle broadside-lead">${escapeHtml(comparison?.body ?? "")}</p>
          </div>
          <div class="broadside-notes">
            ${comparisonRows.map((item) => `<div class="note-row"><span>${escapeHtml(item.label)}</span><p><strong>${escapeHtml(item.title)}</strong> ${escapeHtml(item.detail)}</p></div>`).join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[3])}
        </div>
      </section>
    `,
    `
      <section class="slide broadside-statement-page">
        <div class="slide-content broadside-shell">
          <div class="broadside-top-chrome">
            <span class="broadside-num">05</span>
            <span class="corner-label">${escapeHtml(evidence?.kicker ?? "")}</span>
          </div>
          <div class="statement-shell">
            <span class="kicker-line">${escapeHtml(evidence?.kicker ?? "")}</span>
            <div class="broadside-rule"></div>
            <h2 class="title broadside-h1 accent-ink">${escapeHtml(evidence?.title ?? "")}</h2>
            <p class="subtitle broadside-lead">${escapeHtml(evidence?.body ?? "")}</p>
          </div>
          <div class="broadside-notes">
            ${spotlightRows
              .map((item, index) => `<div class="note-row"><span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span><p><strong>${escapeHtml(item.title)}</strong> ${escapeHtml(item.detail)}</p></div>`)
              .join("")}
          </div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[4])}
        </div>
      </section>
    `,
    `
      <section class="slide broadside-stats-page">
        <div class="slide-content broadside-shell">
          <div class="broadside-top-chrome">
            <span class="broadside-num">06</span>
            <span class="corner-label">${escapeHtml(stats?.kicker ?? "")}</span>
          </div>
          <div class="stats-grid-board">
            <article class="stat-highlight">
              <span class="stat-badge">${escapeHtml(stats?.kicker ?? "")}</span>
              <h2 class="title">${escapeHtml(stats?.title ?? "")}</h2>
              <p class="subtitle">${escapeHtml(stats?.body ?? "")}</p>
              <div class="stat-big">${String(statsRows.length || 1).padStart(2, "0")}</div>
            </article>
            <div class="market-barboard">
              ${statsRows
                .map((item, index) => ({
                  label: item.label || variantOutline[index] || `Track ${index + 1}`,
                  body: item.note ? `${item.label} · ${item.note}` : item.label,
                  width: Math.max(36, Math.min(92, Math.round((item.label.length + item.value.length) * 2.2))),
                }))
                .map(
                  (item) => `
                    <article class="bar-row">
                      <div class="bar-copy">
                        <span class="bar-label">${escapeHtml(item.label)}</span>
                        <p>${escapeHtml(item.body)}</p>
                      </div>
                      <div class="bar-track"><span class="bar-fill" style="width:${item.width}%"></span></div>
                    </article>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[5])}
        </div>
      </section>
    `,
    `
      <section class="slide broadside-stats-page">
        <div class="slide-content broadside-shell">
          <div class="broadside-top-chrome">
            <span class="broadside-num">07</span>
            <span class="corner-label">${escapeHtml(chart?.kicker ?? "")}</span>
          </div>
          <div class="stats-grid-board">
            <article class="stat-highlight">
              <span class="stat-badge">${escapeHtml(chart?.kicker ?? "")}</span>
              <h2 class="title">${escapeHtml(chart?.title ?? "")}</h2>
              <p class="subtitle">${escapeHtml(chart?.body ?? "")}</p>
              <div class="stat-big">${String(chartRows.length || 1).padStart(2, "0")}</div>
            </article>
            <div class="market-barboard">
              ${chartRows
                .map((item, index) => ({
                  label: item.label || `Path ${index + 1}`,
                  body: item.detail,
                  width: Math.max(36, Math.min(92, Math.round(item.value))),
                }))
                .map(
                  (item) => `
                    <article class="bar-row">
                      <div class="bar-copy">
                        <span class="bar-label">${escapeHtml(item.label)}</span>
                        <p>${escapeHtml(item.body)}</p>
                      </div>
                      <div class="bar-track"><span class="bar-fill" style="width:${item.width}%"></span></div>
                    </article>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[6])}
        </div>
      </section>
    `,
    `
      <section class="slide broadside-closing-page">
        <div class="slide-content broadside-shell">
          <div class="closing-banner">
            <span class="broadside-num">08 / Process</span>
            <span class="corner-label">${escapeHtml(process?.kicker ?? "")}</span>
          </div>
          <h2 class="title broadside-h1">${escapeHtml(process?.title ?? "")}</h2>
          <p class="subtitle broadside-lead">${escapeHtml(process?.body ?? "")}</p>
          <div class="closing-actions closing-blocks">
            ${processRows
              .map(
                (item) => `
                  <article class="closing-card">
                    <span class="closing-step">${escapeHtml(item.step)}</span>
                    <div class="closing-copy">
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.detail)}</p>
                    </div>
                  </article>`,
              )
              .join("")}
          </div>
          <div class="cover-meta muted">
            <span>${escapeHtml(deck.title)}</span>
            <span>${escapeHtml(variant.name)}</span>
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[7])}
        </div>
      </section>
    `,
    `
      <section class="slide broadside-closing-page">
        <div class="slide-content broadside-shell">
          <div class="closing-banner">
            <span class="broadside-num">09 / Closing</span>
            <span class="corner-label">${escapeHtml(timeline?.kicker ?? "")}</span>
          </div>
          <h2 class="title broadside-h1">${escapeHtml(timeline?.title ?? "")}</h2>
          <p class="subtitle broadside-lead">${escapeHtml(timeline?.body ?? "")}</p>
          <div class="closing-actions closing-blocks">
            ${closingRows
              .map(
                (item) => `
                  <article class="closing-card">
                    <span class="closing-step">${escapeHtml(item.label)}</span>
                    <div class="closing-copy">
                      <strong>${escapeHtml(item.label)}</strong>
                      <p>${escapeHtml(item.detail)}</p>
                    </div>
                  </article>`,
              )
              .join("")}
          </div>
          <div class="cover-meta muted">
            <span>${escapeHtml(deck.title)}</span>
            <span>${escapeHtml(variant.name)}</span>
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[8])}
        </div>
      </section>
    `,
  ].join("\n")
}

function renderNeoGridBoldSlides(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const cover = getVariantSlideByIntent(variant, "cover", "cover")
  const agenda = getVariantSlideByIntent(variant, "contents", "agenda")
  const insight = getVariantSlideByIntent(variant, "statement", "insight")
  const comparison = getVariantSlideByIntent(variant, "comparison", "comparison")
  const evidence = getVariantSlideByIntent(variant, "spotlight", "evidence")
  const stats = getVariantSlideByIntent(variant, "stats", "stats")
  const chart = getVariantSlideByIntent(variant, "chart", "chart")
  const process = getVariantSlideByIntent(variant, "process", "process")
  const timeline = getVariantSlideByIntent(variant, "closing", "timeline")
  const variantOutline = variant.outline ?? deck.outline
  const coverPoints = (cover?.bullets ?? []).slice(0, 4)
  const agendaRows = getContentsRows(agenda, variantOutline)
  const insightPoints = (insight?.bullets ?? []).slice(0, 4)
  const comparisonRows = getComparisonRows(comparison)
  const spotlightRows = getSpotlightRows(evidence)
  const statsRows = getMetricRows(stats)
  const closingRows = getClosingRows(timeline)
  const chartRows = deriveNeoGridChartRows({
    chart,
    comparisonRows,
    statsRows,
    spotlightRows,
  })
  const processRows = deriveNeoGridProcessRows({
    process,
    closingRows,
    agendaRows,
    spotlightRows,
  })
  const issueNumber = buildDeckIssueNumber(variant)
  const agendaItems = agendaRows.map((item) => item.title)
  const agendaColumnCount = agendaItems.length >= 7 ? 3 : agendaItems.length >= 4 ? 2 : Math.max(1, agendaItems.length)
  const coverSignalCount = Math.max(4, coverPoints.length)
  const coverSignals = Array.from({ length: coverSignalCount }, (_, index) => coverPoints[index] ?? agendaItems[index] ?? "")
  const compactComparison = comparisonRows.length <= 3
  const compactProcess = processRows.length <= 3
  const compactSequence = closingRows.length <= 3
  const statCards = statsRows.map((item, index) => ({
    label: item.label || variantOutline[index + 1] || `Signal ${index + 1}`,
    body: item.note ? `${item.value} · ${item.note}` : item.value,
  }))
  const chartCards = chartRows.map((item, index) => ({
    label: item.label || `Path ${index + 1}`,
    body: item.detail,
    width: Math.max(34, Math.min(96, item.value)),
  }))

  return [
    `
      <section class="slide neo-grid-cover">
        <div class="slide-content neo-grid-shell">
          <div class="neo-grid-ruler">
            <span>${escapeHtml(deck.scenario.replace(/-/g, " "))}</span>
            <span>${escapeHtml(deck.language)}</span>
            <span>${escapeHtml(variant.name)}</span>
          </div>
          <div class="neo-grid-hero">
            <article class="asym-panel neo-cover-primary">
              <div class="neo-cover-chip">${escapeHtml(cover?.kicker ?? "")}</div>
              <div class="eyebrow">${escapeHtml(cover?.kicker ?? "")}</div>
              <h1 class="title">${escapeHtml(cover?.title ?? deck.title)}</h1>
              <p class="subtitle">${escapeHtml(cover?.body ?? "")}</p>
              <div class="neo-cover-tags">
                ${coverPoints.slice(0, 2).map((bullet) => `<span>${escapeHtml(bullet)}</span>`).join("")}
              </div>
            </article>
            <div class="neo-side-stack">
              <div class="neo-cover-code panel">
                <div class="neo-qr-grid">
                  ${Array.from({ length: 16 }, (_, index) => `<i class="${index % 3 === 0 ? "accent" : ""}"></i>`).join("")}
                </div>
                <div class="neo-cover-code-copy">
                  <span>Issue ${issueNumber}</span>
                  <p>${escapeHtml(buildDeckDateStamp(deck.generatedAt))}</p>
                </div>
              </div>
              <aside class="module-strip panel">
                ${coverPoints
                  .map(
                    (bullet, index) => `
                      <div class="module-row">
                        <span>${String(index + 1).padStart(2, "0")}</span>
                        <p>${escapeHtml(bullet)}</p>
                      </div>`,
                  )
                  .join("")}
              </aside>
              <div class="signal-grid-board panel">
                ${coverSignals
                  .map(
                    (signal, index) => `
                      <div class="signal-cell ${index % 2 === 0 ? "accent" : ""}">
                        <span>${String(index + 1).padStart(2, "0")}</span>
                        ${signal ? `<p>${escapeHtml(signal)}</p>` : ""}
                      </div>`,
                  )
                  .join("")}
              </div>
            </div>
          </div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[0])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="eyebrow">${escapeHtml(agenda?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(agenda?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(agenda?.body ?? "")}</p>
          <div class="neo-module-rail" style="--rail-cols:${agendaColumnCount}">
            ${renderContentsCards(agendaRows, "panel neo-module")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[1])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="neo-insight-grid">
            <article class="panel asym-panel">
              <span class="metric-kicker">${escapeHtml(insight?.kicker ?? "")}</span>
              <h2 class="title">${escapeHtml(insight?.title ?? "")}</h2>
              <p class="subtitle">${escapeHtml(insight?.body ?? "")}</p>
            </article>
            <aside class="panel side-module">
              ${renderBulletList(insightPoints)}
            </aside>
          </div>
          ${renderFooter(variant.name, NINE_PAGE_PROGRESS[2])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="eyebrow">${escapeHtml(comparison?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(comparison?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(comparison?.body ?? "")}</p>
          <div class="grid-comparison-shell ${compactComparison ? "compact-shell" : ""}">
            <div class="grid-comparison-board panel">
              ${comparisonRows
                .map(
                  (item) => `
                    <div class="module-row">
                      <span>${escapeHtml(item.label)}</span>
                      <p><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.detail)}</p>
                    </div>`,
                )
                .join("")}
            </div>
            <div class="panel signal-chart ${compactComparison ? "compact-chart" : ""}">
              ${comparisonRows
                .map(
                  (item) => `
                    <div class="signal-chart-row">
                      <span>${escapeHtml(item.label)}</span>
                      <div class="signal-chart-track"><i style="width:${Math.max(34, Math.min(96, item.detail.length * 4))}%"></i></div>
                    </div>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[3])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="neo-insight-grid">
            <article class="panel asym-panel">
              <span class="metric-kicker">${escapeHtml(evidence?.kicker ?? "")}</span>
              <h2 class="title">${escapeHtml(evidence?.title ?? "")}</h2>
              <p class="subtitle">${escapeHtml(evidence?.body ?? "")}</p>
            </article>
            <aside class="panel side-module">
              ${renderBulletList(spotlightRows.map((item) => `${item.title}: ${item.detail}`))}
            </aside>
          </div>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[4])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="eyebrow">${escapeHtml(stats?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(stats?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(stats?.body ?? "")}</p>
          <div class="neo-module-rail" style="--rail-cols:${Math.min(3, Math.max(2, statCards.length || 2))}">
            ${statCards
              .map(
                (item, index) => `
                  <article class="panel neo-module">
                    <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
                    <h3>${escapeHtml(item.label)}</h3>
                    <p>${escapeHtml(item.body)}</p>
                  </article>`,
              )
              .join("")}
          </div>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[5])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="eyebrow">${escapeHtml(chart?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(chart?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(chart?.body ?? "")}</p>
          <div class="grid-comparison-shell">
            <div class="panel signal-chart">
              ${chartCards
                .map(
                  (item) => `
                    <div class="signal-chart-row">
                      <span>${escapeHtml(item.label)}</span>
                      <div class="signal-chart-track"><i style="width:${item.width}%"></i></div>
                    </div>`,
                )
                .join("")}
            </div>
            <div class="signal-grid-board panel">
              ${chartCards
                .map(
                  (item, index) => `
                    <div class="signal-cell ${index % 2 === 0 ? "accent" : ""}">
                      <span>${String(index + 1).padStart(2, "0")}</span>
                      <p>${escapeHtml(item.body)}</p>
                    </div>`,
                )
                .join("")}
            </div>
          </div>
          ${renderFooter(variant.name, NINE_PAGE_PROGRESS[6])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="eyebrow">${escapeHtml(process?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(process?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(process?.body ?? "")}</p>
          <ol class="timeline-list sequence-rail ${compactProcess ? "horizontal-sequence" : ""}">
            ${processRows
              .map(
                (item) => `
                  <li class="sequence-row">
                    <span class="timeline-step">${escapeHtml(item.step)}</span>
                    <p><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.detail)}</p>
                  </li>`,
              )
              .join("")}
          </ol>
          ${renderFooter(deck.title, NINE_PAGE_PROGRESS[7])}
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-content neo-grid-shell">
          <div class="eyebrow">${escapeHtml(timeline?.kicker ?? "")}</div>
          <h2 class="title">${escapeHtml(timeline?.title ?? "")}</h2>
          <p class="subtitle">${escapeHtml(timeline?.body ?? "")}</p>
          <ol class="timeline-list sequence-rail ${compactSequence ? "horizontal-sequence" : ""}">
            ${closingRows
              .map(
                (item) => `
                  <li class="sequence-row">
                    <span class="timeline-step">${escapeHtml(item.label)}</span>
                    <p>${escapeHtml(item.detail)}</p>
                  </li>`,
              )
              .join("")}
          </ol>
          ${renderFooter(variant.summary, NINE_PAGE_PROGRESS[8])}
        </div>
      </section>
    `,
  ].join("\n")
}

function renderVariantSlides(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  switch (variant.key) {
    case "ppt169_brutalist_ai_newspaper_2026":
      return renderLongTableSlides(deck, variant)
    case "ppt169_sugar_rush_memphis":
      return renderPlayfulSlides(deck, variant)
    case "ppt169_pritzker_2026":
      return renderBroadsideSlides(deck, variant)
    case "ppt169_swiss_grid_systems":
      return renderNeoGridBoldSlides(deck, variant)
  }
}

function buildVariantSpecificCss(theme: FrontendSlidesTheme, styleKey: PptPreviewStyleKey) {
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
  } satisfies Record<PptPreviewStyleKey, string>

  return `${sharedCss}\n${styleCss[styleKey]}`
}

function buildControllerScript() {
  return `
  class PresentationController {
    constructor() {
      this.slides = Array.from(document.querySelectorAll('.slide'));
      this.current = 0;
      this.bind();
      this.observe();
    }

    bind() {
      window.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
          event.preventDefault();
          this.go(1);
        }
        if (event.key === 'ArrowUp' || event.key === 'PageUp') {
          event.preventDefault();
          this.go(-1);
        }
      });

      let touchStartY = 0;
      window.addEventListener('touchstart', (event) => {
        touchStartY = event.touches[0]?.clientY ?? 0;
      }, { passive: true });

      window.addEventListener('touchend', (event) => {
        const touchEndY = event.changedTouches[0]?.clientY ?? 0;
        const delta = touchStartY - touchEndY;
        if (Math.abs(delta) < 40) return;
        this.go(delta > 0 ? 1 : -1);
      }, { passive: true });

      document.querySelector('[data-nav="prev"]')?.addEventListener('click', () => this.go(-1));
      document.querySelector('[data-nav="next"]')?.addEventListener('click', () => this.go(1));
    }

    observe() {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        }
      }, { threshold: 0.55 });

      this.slides.forEach((slide) => observer.observe(slide));
    }

    go(offset) {
      this.current = Math.max(0, Math.min(this.current + offset, this.slides.length - 1));
      this.slides[this.current]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  window.addEventListener('DOMContentLoaded', () => new PresentationController());
  `
}

function renderHtmlDocument(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const theme = getTheme(variant.key)
  const slides = renderVariantSlides(deck, variant)

  return `<!DOCTYPE html>
<html lang="${escapeHtml(deck.language)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(deck.title)} - ${escapeHtml(variant.name)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${theme.fontHref}" rel="stylesheet" />
    <style>
      ${VIEWPORT_BASE_CSS}
      ${buildVariantSpecificCss(theme, variant.key)}
    </style>
  </head>
  <body class="${theme.deckClass}">
    <main class="deck">
      ${slides}
    </main>
    <nav class="nav" aria-label="Presentation navigation">
      <button type="button" data-nav="prev" aria-label="Previous slide">Prev</button>
      <button type="button" data-nav="next" aria-label="Next slide">Next</button>
    </nav>
    <script>${buildControllerScript()}</script>
  </body>
</html>`
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function toSvgAsset(svg: string): PptPreviewAsset {
  return {
    mimeType: "image/svg+xml",
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
  }
}

function renderPosterTextBlock(params: {
  text: string
  x: number
  y: number
  fontSize: number
  fill: string
  fontFamily: string
  fontWeight: number
  maxUnitsPerLine: number
  maxLines: number
  lineHeight: number
  letterSpacing?: number
  uppercase?: boolean
}) {
  const lines = wrapUnits(params.text, params.maxUnitsPerLine, params.maxLines)
  if (!lines.length) {
    return ""
  }

  return [
    `<text x="${params.x}" y="${params.y}" fill="${params.fill}" font-family="${params.fontFamily}" font-size="${params.fontSize}" font-weight="${params.fontWeight}"${params.letterSpacing ? ` letter-spacing="${params.letterSpacing}"` : ""}>`,
    ...lines.map((line, index) => {
      const value = params.uppercase ? line.toUpperCase() : line
      return `<tspan x="${params.x}" dy="${index === 0 ? 0 : params.lineHeight}">${escapeXml(value)}</tspan>`
    }),
    `</text>`,
  ].join("")
}

function renderPosterAsset(deck: PptPreviewDeck, variant: PptPreviewVariant, slide: PptPreviewSlide, slideIndex: number) {
  const theme = getTheme(variant.key)
  const bulletItems = slide.bullets.slice(0, 4)
  const bulletRows = bulletItems
    .map((bullet, index) => {
      const rowY = 488 + index * 72
      return [
        `<circle cx="168" cy="${rowY - 8}" r="8" fill="${theme.accent}" opacity="0.92" />`,
        renderPosterTextBlock({
          text: bullet,
          x: 192,
          y: rowY,
          fontSize: 25,
          fill: theme.foreground,
          fontFamily: theme.bodyFont,
          fontWeight: 520,
          maxUnitsPerLine: 54,
          maxLines: 2,
          lineHeight: 30,
        }),
      ].join("")
    })
    .join("")

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
    <defs>
      <linearGradient id="bg-${slide.id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme.background}" />
        <stop offset="60%" stop-color="${theme.background}" />
        <stop offset="100%" stop-color="${theme.secondary}" stop-opacity="0.35" />
      </linearGradient>
      <filter id="blur-${slide.id}">
        <feGaussianBlur stdDeviation="18" />
      </filter>
    </defs>
    <rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="url(#bg-${slide.id})" />
    <circle cx="1280" cy="160" r="180" fill="${theme.glow}" filter="url(#blur-${slide.id})" />
    <circle cx="260" cy="120" r="110" fill="${theme.accent}" opacity="0.12" filter="url(#blur-${slide.id})" />
    <rect x="108" y="100" width="1384" height="684" rx="42" fill="${theme.panel}" stroke="${theme.border}" />
    <rect x="108" y="100" width="18" height="684" rx="9" fill="${theme.accent}" />
    ${renderPosterTextBlock({
      text: slide.kicker,
      x: 158,
      y: 166,
      fontSize: 22,
      fill: theme.secondary,
      fontFamily: theme.monoFont,
      fontWeight: 700,
      maxUnitsPerLine: 28,
      maxLines: 1,
      lineHeight: 26,
      letterSpacing: 2.4,
      uppercase: true,
    })}
    ${renderPosterTextBlock({
      text: slide.title,
      x: 154,
      y: 264,
      fontSize: 68,
      fill: theme.foreground,
      fontFamily: theme.titleFont,
      fontWeight: 900,
      maxUnitsPerLine: 24,
      maxLines: 2,
      lineHeight: 72,
    })}
    ${renderPosterTextBlock({
      text: slide.body,
      x: 158,
      y: 410,
      fontSize: 30,
      fill: theme.foreground,
      fontFamily: theme.bodyFont,
      fontWeight: 520,
      maxUnitsPerLine: 62,
      maxLines: 3,
      lineHeight: 36,
    })}
    ${bulletRows}
    <text x="158" y="736" fill="${theme.secondary}" font-family="${theme.monoFont}" font-size="18" font-weight="700" letter-spacing="1.8">${escapeXml(deck.title.toUpperCase())}</text>
    <text x="1370" y="736" fill="${theme.secondary}" font-family="${theme.monoFont}" font-size="18" font-weight="700" text-anchor="end">${String(slideIndex + 1).padStart(2, "0")} / ${String(variant.slides.length).padStart(2, "0")}</text>
  </svg>
  `

  return toSvgAsset(svg)
}

function materializeVariant(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const repairedVariant = repairVariantForRuntime(deck, variant)
  const html = renderHtmlDocument(deck, repairedVariant)
  const slides = repairedVariant.slides.map((slide, index) =>
    renderPosterAsset(deck, repairedVariant, slide, index),
  )

  return {
    ...repairedVariant,
    preview: {
      format: "svg" as const,
      themeId: repairedVariant.key,
      cover: slides[0] ?? renderPosterAsset(deck, repairedVariant, repairedVariant.slides[0]!, 0),
      slides,
      htmlDocument: {
        fileName: `${slugify(deck.title || "deck")}-${repairedVariant.key}.html`,
        html,
      },
    },
  }
}

export const frontendSlidesPreviewRuntime: LeadToolPptPreviewRuntime = {
  id: "frontend-slides-agent",
  renderKind: "html",
  async materializeStoryDeck(deck) {
    return storePptPreviewSessionDeck({
      ...deck,
      previewEngine: "frontend-slides-html" as const,
      previewSessionId: deck.previewSessionId ?? randomUUID(),
      variants: deck.variants.map((variant) => materializeVariant(deck, variant)),
    })
  },
}
