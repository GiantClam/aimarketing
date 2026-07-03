import type {
  PptPreviewDeck,
  PptPreviewPageIntent,
  PptPreviewSlide,
  PptPreviewStyleKey,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { getPptPreviewTemplateSlotByLayout } from "@/lib/lead-tools/ppt-preview-data-fixed"

export type ContentsRow = { index: string; title: string; detail: string }
export type ComparisonRow = { label: string; title: string; detail: string }
export type SpotlightRow = { title: string; detail: string }
export type MetricRow = { value: string; label: string; note?: string }
export type ChartRow = { label: string; value: number; detail: string }
export type ProcessRow = { step: string; title: string; detail: string }
export type ClosingRow = { label: string; detail: string }

export function getVariantSlideByIntent(
  variant: PptPreviewVariant,
  intent: PptPreviewPageIntent,
  fallbackLayout: PptPreviewSlide["layout"],
) {
  return variant.slides.find((slide) => slide.intent === intent) ?? variant.slides.find((slide) => slide.layout === fallbackLayout)
}

export function getVariantSlideByLayout(variant: PptPreviewVariant, layout: PptPreviewSlide["layout"]) {
  return variant.slides.find((slide) => slide.layout === layout)
}

export function getComparisonRows(slide: PptPreviewSlide | undefined) {
  if (slide?.comparisonItems?.length) return slide.comparisonItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    label: String.fromCharCode(65 + index),
    title: `Track ${index + 1}`,
    detail,
  }))
}

export function getContentsRows(slide: PptPreviewSlide | undefined, fallbackOutline: string[]) {
  if (slide?.contentsItems?.length) return slide.contentsItems.slice(0, 9)
  return fallbackOutline.slice(0, 9).map((title, index) => ({
    index: String(index + 1).padStart(2, "0"),
    title,
    detail: slide?.bullets?.[index] ?? slide?.body ?? title,
  }))
}

export function getSpotlightRows(slide: PptPreviewSlide | undefined) {
  if (slide?.spotlightItems?.length) return slide.spotlightItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    title: index === 0 ? slide?.title ?? `Signal ${index + 1}` : `Signal ${index + 1}`,
    detail,
  }))
}

export function getMetricRows(slide: PptPreviewSlide | undefined) {
  if (slide?.metricItems?.length) return slide.metricItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((label, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label,
    note: "",
  }))
}

export function getChartRows(slide: PptPreviewSlide | undefined) {
  if (slide?.chartItems?.length) return slide.chartItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    label: String.fromCharCode(65 + index),
    value: Math.max(24, Math.min(96, detail.length * 4)),
    detail,
  }))
}

export function getProcessRows(slide: PptPreviewSlide | undefined) {
  if (slide?.processItems?.length) return slide.processItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    step: String(index + 1).padStart(2, "0"),
    title: `Step ${index + 1}`,
    detail,
  }))
}

export function getClosingRows(slide: PptPreviewSlide | undefined) {
  if (slide?.closingItems?.length) return slide.closingItems.slice(0, 4)
  return (slide?.bullets ?? []).slice(0, 4).map((detail, index) => ({
    label: String(index + 1).padStart(2, "0"),
    detail,
  }))
}

function getTemplateFallbackIntents(styleKey: PptPreviewStyleKey, layout: PptPreviewSlide["layout"]) {
  return getPptPreviewTemplateSlotByLayout(styleKey, layout)?.fallbackIntents ?? []
}

export function deriveChartRowsFromTemplateFallbacks(params: {
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

export function deriveProcessRowsFromTemplateFallbacks(params: {
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

export function partitionLongTableAgendaRows(rows: ContentsRow[]) {
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

export function repairVariantForRuntime(deck: PptPreviewDeck, variant: PptPreviewVariant) {
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
    styleKey: variant.styleKey,
    slide: chart,
    comparisonRows,
    statsRows,
    spotlightRows,
  })
  const processRows = deriveProcessRowsFromTemplateFallbacks({
    styleKey: variant.styleKey,
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

export function deriveNeoGridChartRows(params: {
  chart: PptPreviewSlide | undefined
  comparisonRows: ComparisonRow[]
  statsRows: MetricRow[]
  spotlightRows: SpotlightRow[]
}) {
  return deriveChartRowsFromTemplateFallbacks({
    styleKey: "ppt169_swiss_grid_systems",
    slide: params.chart,
    comparisonRows: params.comparisonRows,
    statsRows: params.statsRows,
    spotlightRows: params.spotlightRows,
  })
}

export function deriveNeoGridProcessRows(params: {
  process: PptPreviewSlide | undefined
  closingRows: ClosingRow[]
  agendaRows: ContentsRow[]
  spotlightRows: SpotlightRow[]
}) {
  return deriveProcessRowsFromTemplateFallbacks({
    styleKey: "ppt169_swiss_grid_systems",
    slide: params.process,
    closingRows: params.closingRows,
    agendaRows: params.agendaRows,
    spotlightRows: params.spotlightRows,
  })
}
