import fs from "node:fs"
import path from "node:path"

import type {
  PptPreviewAsset,
  PptPreviewDeck,
  PptPreviewSlide,
  PptPreviewStyleArchetype,
  PptPreviewStyleKey,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { resolvePptPreviewStyleArchetype } from "@/lib/lead-tools/ppt-preview-data-fixed"

const PREVIEW_WIDTH = 1600
const PREVIEW_HEIGHT = 900
const BASE_VIEWBOX_WIDTH = 1280
const BASE_VIEWBOX_HEIGHT = 720

type AssetTheme = {
  directory: string
  files: string[]
  overlay: {
    panelFill: string
    panelStroke: string
    panelOpacity: number
    textColor: string
    mutedTextColor: string
    accentColor: string
    eyebrowFont: string
    titleFont: string
    bodyFont: string
    titleWeight: number
    bodyWeight: number
    shadow?: boolean
  }
}

type OverlayFrame = {
  panel: { x: number; y: number; width: number; height: number; radius: number }
  accent?: { x: number; y: number; width: number; height: number; radius: number }
  kicker: { x: number; y: number; maxUnitsPerLine: number; maxLines: number; fontSize: number; lineHeight: number }
  title: { x: number; y: number; maxUnitsPerLine: number; maxLines: number; fontSize: number; lineHeight: number }
  body: { x: number; y: number; maxUnitsPerLine: number; maxLines: number; fontSize: number; lineHeight: number }
  bullets: {
    x: number
    y: number
    maxUnitsPerLine: number
    fontSize: number
    rowGap: number
    maxRows: number
    bulletRadius: number
  }
  footer?: { leftX: number; rightX: number; y: number; fontSize: number }
}

const themeAssets: Record<PptPreviewStyleArchetype, AssetTheme> = {
  "ppt169_brutalist_ai_newspaper_2026": {
    directory: "neo-brutalism",
    files: ["01_cover.svg", "02_issue_at_a_glance.svg", "03_revenue_league.svg", "08_three_rulebooks.svg", "10_closing_read.svg"],
    overlay: {
      panelFill: "#f4ecdf",
      panelStroke: "#111111",
      panelOpacity: 0.97,
      textColor: "#111111",
      mutedTextColor: "#52463f",
      accentColor: "#df3a2f",
      eyebrowFont: "'IBM Plex Mono','Consolas',monospace",
      titleFont: "'Arial Black','Barlow Condensed','Noto Sans SC','Microsoft YaHei',sans-serif",
      bodyFont: "'IBM Plex Sans','Noto Sans SC','Microsoft YaHei',sans-serif",
      titleWeight: 900,
      bodyWeight: 500,
    },
  },
  "ppt169_sugar_rush_memphis": {
    directory: "aurora-glass",
    files: ["01_cover.svg", "02_hero_demo_to_prod.svg", "04_agent_architecture.svg", "08_kpi_dashboard.svg", "12_cta_closing.svg"],
    overlay: {
      panelFill: "#fff1fb",
      panelStroke: "#3d37ff",
      panelOpacity: 0.84,
      textColor: "#23153a",
      mutedTextColor: "#5c4482",
      accentColor: "#ff4db8",
      eyebrowFont: "'Arial Black','Barlow Condensed','Noto Sans SC','Microsoft YaHei',sans-serif",
      titleFont: "'Arial Black','Barlow Condensed','Noto Sans SC','Microsoft YaHei',sans-serif",
      bodyFont: "'Trebuchet MS','Noto Sans SC','Microsoft YaHei',sans-serif",
      titleWeight: 900,
      bodyWeight: 520,
      shadow: true,
    },
  },
  "ppt169_pritzker_2026": {
    directory: "editorial-poster",
    files: ["01_cover.svg", "02_overview.svg", "03_ando.svg", "07_oma_sanaa.svg", "11_epilogue.svg"],
    overlay: {
      panelFill: "#f6efe8",
      panelStroke: "#5f4b40",
      panelOpacity: 0.96,
      textColor: "#171312",
      mutedTextColor: "#5f4b40",
      accentColor: "#ff6436",
      eyebrowFont: "Georgia,'Noto Serif SC','Songti SC',serif",
      titleFont: "Georgia,'Noto Serif SC','Songti SC',serif",
      bodyFont: "'IBM Plex Sans','Noto Sans SC','Microsoft YaHei',sans-serif",
      titleWeight: 700,
      bodyWeight: 470,
    },
  },
  "ppt169_building_effective_agents": {
    // The official example is materialized by ppt-master at runtime. Keep the
    // local preview fallback dark rather than borrowing another template's art.
    directory: "effective-agents",
    files: [],
    overlay: {
      panelFill: "#1A1D27",
      panelStroke: "#2D3348",
      panelOpacity: 0.96,
      textColor: "#E8E8EC",
      mutedTextColor: "#9CA3AF",
      accentColor: "#D4845A",
      eyebrowFont: "'Helvetica Neue',Arial,sans-serif",
      titleFont: "'Helvetica Neue',Arial,sans-serif",
      bodyFont: "'Helvetica Neue',Arial,sans-serif",
      titleWeight: 700,
      bodyWeight: 400,
    },
  },
  "ppt169_swiss_grid_systems": {
    directory: "swiss-grid",
    files: ["01_cover.svg", "02_quote.svg", "04_principles.svg", "05_figures.svg", "14_closing.svg"],
    overlay: {
      panelFill: "#f7f2e8",
      panelStroke: "#d3c4af",
      panelOpacity: 0.96,
      textColor: "#111111",
      mutedTextColor: "#5a534b",
      accentColor: "#c1121f",
      eyebrowFont: "'IBM Plex Sans','Noto Sans SC','Microsoft YaHei',sans-serif",
      titleFont: "'IBM Plex Sans','Noto Sans SC','Microsoft YaHei',sans-serif",
      bodyFont: "'IBM Plex Sans','Noto Sans SC','Microsoft YaHei',sans-serif",
      titleWeight: 650,
      bodyWeight: 420,
    },
  },
}

const assetCache = new Map<string, string>()
const DEFAULT_PREVIEW_ASSET_DIR_SEGMENTS = ["lib", "lead-tools", ["ppt", "master", "assets"].join("-")]

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function splitUnits(value: string) {
  if (/[\u4e00-\u9fff]/u.test(value)) {
    return Array.from(value)
  }

  return value.split(/(\s+)/).filter(Boolean)
}

function wrapText(value: string, maxUnitsPerLine: number, maxLines: number) {
  const units = splitUnits(value.trim())
  if (units.length === 0) {
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

  if (lines.length < maxLines && current.trim().length > 0) {
    lines.push(current.trim())
  }

  if (lines.length === maxLines && lines.join("").length < value.replace(/\s+/g, "").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.。,…:：;；-]*$/u, "")}…`
  }

  return lines
}

function renderTextBlock(params: {
  text: string
  x: number
  y: number
  maxUnitsPerLine: number
  maxLines: number
  fontSize: number
  lineHeight: number
  fill: string
  fontFamily: string
  fontWeight?: number | string
  letterSpacing?: number
  textTransform?: "uppercase"
  opacity?: number
}) {
  const lines = wrapText(params.text, params.maxUnitsPerLine, params.maxLines)
  if (lines.length === 0) {
    return ""
  }

  return [
    `<text x="${params.x}" y="${params.y}" fill="${params.fill}" font-family="${params.fontFamily}" font-size="${params.fontSize}" font-weight="${params.fontWeight ?? 400}"${params.letterSpacing ? ` letter-spacing="${params.letterSpacing}"` : ""}${params.opacity ? ` opacity="${params.opacity}"` : ""}>`,
    ...lines.map((line, index) => {
      const value = params.textTransform === "uppercase" ? line.toUpperCase() : line
      return `<tspan x="${params.x}" dy="${index === 0 ? 0 : params.lineHeight}">${escapeXml(value)}</tspan>`
    }),
    "</text>",
  ].join("")
}

function renderBulletList(params: {
  bullets: string[]
  x: number
  y: number
  maxUnitsPerLine: number
  fill: string
  accent: string
  fontFamily: string
  fontSize: number
  rowGap: number
  maxRows: number
  bulletRadius: number
}) {
  const chunks: string[] = []
  let currentY = params.y

  for (const bullet of params.bullets.slice(0, params.maxRows)) {
    chunks.push(
      `<circle cx="${params.x}" cy="${currentY - 6}" r="${params.bulletRadius}" fill="${params.accent}" opacity="0.94" />`,
      renderTextBlock({
        text: bullet,
        x: params.x + 20,
        y: currentY,
        maxUnitsPerLine: params.maxUnitsPerLine,
        maxLines: 2,
        fontSize: params.fontSize,
        lineHeight: Math.round(params.fontSize * 1.35),
        fill: params.fill,
        fontFamily: params.fontFamily,
        opacity: 0.96,
      }),
    )
    currentY += params.rowGap
  }

  return chunks.join("")
}

function encodeSvg(svg: string): PptPreviewAsset {
  return {
    mimeType: "image/svg+xml",
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
  }
}

function sanitizeBaseSvg(svg: string) {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<text\b[\s\S]*?<\/text>/gi, "")
}

function resolvePreviewAssetDir() {
  const configuredDir = process.env.PPT_MASTER_ASSET_DIR?.trim()
  if (configuredDir) {
    return configuredDir
  }

  return path.resolve(process.cwd(), ...DEFAULT_PREVIEW_ASSET_DIR_SEGMENTS)
}

function getAssetDataUrl(styleKey: PptPreviewStyleKey, fileName?: string) {
  if (!fileName) {
    return null
  }

  const archetype = resolvePptPreviewStyleArchetype(styleKey)
  const cacheKey = `${archetype}/${fileName}`
  const cached = assetCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const assetTheme = themeAssets[archetype]
  const filePath = path.join(resolvePreviewAssetDir(), assetTheme.directory, fileName)

  try {
    const svg = sanitizeBaseSvg(fs.readFileSync(filePath, "utf8"))
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
    assetCache.set(cacheKey, dataUrl)
    return dataUrl
  } catch (error) {
    console.warn("ppt-preview.asset_missing", {
      styleKey,
      archetype,
      fileName,
      filePath,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function renderFallbackBackdrop(variant: PptPreviewVariant, index: number) {
  const gradientId = `fallback-gradient-${variant.key}-${index}`

  return [
    "<defs>",
    `<linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${variant.palette.background}" />`,
    `<stop offset="100%" stop-color="${variant.palette.panel}" />`,
    "</linearGradient>",
    "</defs>",
    `<rect width="${BASE_VIEWBOX_WIDTH}" height="${BASE_VIEWBOX_HEIGHT}" fill="url(#${gradientId})" />`,
    `<rect x="64" y="64" width="420" height="164" rx="24" fill="${variant.palette.accent}" opacity="0.18" />`,
    `<rect x="946" y="92" width="220" height="220" rx="32" fill="${variant.palette.border}" opacity="0.18" />`,
    `<rect x="812" y="470" width="300" height="120" rx="24" fill="${variant.palette.foreground}" opacity="0.08" />`,
  ].join("")
}

function getOverlayFrame(variant: PptPreviewVariant, slide: PptPreviewSlide): OverlayFrame {
  const archetype = resolvePptPreviewStyleArchetype(variant.styleKey)

  if (archetype === "ppt169_swiss_grid_systems") {
    switch (slide.layout) {
      case "cover":
        return {
          panel: { x: 56, y: 340, width: 560, height: 300, radius: 8 },
          accent: { x: 56, y: 340, width: 18, height: 300, radius: 0 },
          kicker: { x: 96, y: 392, maxUnitsPerLine: 24, maxLines: 1, fontSize: 18, lineHeight: 20 },
          title: { x: 96, y: 458, maxUnitsPerLine: 18, maxLines: 3, fontSize: 44, lineHeight: 50 },
          body: { x: 96, y: 594, maxUnitsPerLine: 30, maxLines: 2, fontSize: 18, lineHeight: 26 },
          bullets: { x: 686, y: 180, maxUnitsPerLine: 23, fontSize: 16, rowGap: 56, maxRows: 4, bulletRadius: 5 },
          footer: { leftX: 96, rightX: 1210, y: 682, fontSize: 12 },
        }
      case "comparison":
        return {
          panel: { x: 692, y: 72, width: 516, height: 576, radius: 8 },
          accent: { x: 692, y: 72, width: 516, height: 14, radius: 0 },
          kicker: { x: 734, y: 126, maxUnitsPerLine: 24, maxLines: 1, fontSize: 17, lineHeight: 18 },
          title: { x: 734, y: 190, maxUnitsPerLine: 18, maxLines: 3, fontSize: 38, lineHeight: 46 },
          body: { x: 734, y: 326, maxUnitsPerLine: 25, maxLines: 3, fontSize: 18, lineHeight: 28 },
          bullets: { x: 734, y: 472, maxUnitsPerLine: 21, fontSize: 16, rowGap: 52, maxRows: 4, bulletRadius: 5 },
          footer: { leftX: 734, rightX: 1172, y: 622, fontSize: 12 },
        }
      default:
        return {
          panel: { x: 680, y: 84, width: 530, height: 552, radius: 8 },
          accent: { x: 680, y: 84, width: 18, height: 552, radius: 0 },
          kicker: { x: 720, y: 140, maxUnitsPerLine: 24, maxLines: 1, fontSize: 18, lineHeight: 20 },
          title: { x: 720, y: 204, maxUnitsPerLine: 18, maxLines: 3, fontSize: 40, lineHeight: 48 },
          body: { x: 720, y: 344, maxUnitsPerLine: 25, maxLines: 3, fontSize: 18, lineHeight: 28 },
          bullets: { x: 720, y: 494, maxUnitsPerLine: 22, fontSize: 16, rowGap: 52, maxRows: 4, bulletRadius: 5 },
          footer: { leftX: 720, rightX: 1180, y: 610, fontSize: 12 },
        }
    }
  }

  if (archetype === "ppt169_pritzker_2026") {
    switch (slide.layout) {
      case "cover":
        return {
          panel: { x: 48, y: 286, width: 548, height: 344, radius: 18 },
          accent: { x: 48, y: 286, width: 8, height: 344, radius: 4 },
          kicker: { x: 84, y: 336, maxUnitsPerLine: 20, maxLines: 1, fontSize: 18, lineHeight: 20 },
          title: { x: 84, y: 416, maxUnitsPerLine: 14, maxLines: 3, fontSize: 48, lineHeight: 56 },
          body: { x: 84, y: 578, maxUnitsPerLine: 30, maxLines: 2, fontSize: 18, lineHeight: 28 },
          bullets: { x: 662, y: 492, maxUnitsPerLine: 22, fontSize: 16, rowGap: 48, maxRows: 3, bulletRadius: 4 },
          footer: { leftX: 84, rightX: 1196, y: 680, fontSize: 12 },
        }
      default:
        return {
          panel: { x: 66, y: 86, width: 530, height: 548, radius: 18 },
          accent: { x: 66, y: 86, width: 530, height: 10, radius: 5 },
          kicker: { x: 100, y: 140, maxUnitsPerLine: 20, maxLines: 1, fontSize: 17, lineHeight: 18 },
          title: { x: 100, y: 214, maxUnitsPerLine: 15, maxLines: 3, fontSize: 42, lineHeight: 50 },
          body: { x: 100, y: 370, maxUnitsPerLine: 28, maxLines: 3, fontSize: 18, lineHeight: 28 },
          bullets: { x: 100, y: 526, maxUnitsPerLine: 23, fontSize: 16, rowGap: 48, maxRows: 4, bulletRadius: 4 },
          footer: { leftX: 100, rightX: 1194, y: 662, fontSize: 12 },
        }
    }
  }

  if (archetype === "ppt169_brutalist_ai_newspaper_2026") {
    switch (slide.layout) {
      case "cover":
        return {
          panel: { x: 56, y: 364, width: 714, height: 260, radius: 0 },
          accent: { x: 56, y: 332, width: 250, height: 24, radius: 0 },
          kicker: { x: 84, y: 404, maxUnitsPerLine: 28, maxLines: 1, fontSize: 17, lineHeight: 18 },
          title: { x: 84, y: 470, maxUnitsPerLine: 18, maxLines: 2, fontSize: 48, lineHeight: 52 },
          body: { x: 84, y: 574, maxUnitsPerLine: 34, maxLines: 2, fontSize: 18, lineHeight: 26 },
          bullets: { x: 862, y: 182, maxUnitsPerLine: 19, fontSize: 16, rowGap: 48, maxRows: 4, bulletRadius: 5 },
          footer: { leftX: 84, rightX: 1208, y: 682, fontSize: 12 },
        }
      default:
        return {
          panel: { x: 64, y: 96, width: 628, height: 540, radius: 0 },
          accent: { x: 64, y: 64, width: 300, height: 24, radius: 0 },
          kicker: { x: 96, y: 148, maxUnitsPerLine: 26, maxLines: 1, fontSize: 16, lineHeight: 18 },
          title: { x: 96, y: 228, maxUnitsPerLine: 17, maxLines: 3, fontSize: 44, lineHeight: 50 },
          body: { x: 96, y: 392, maxUnitsPerLine: 30, maxLines: 3, fontSize: 18, lineHeight: 28 },
          bullets: { x: 96, y: 538, maxUnitsPerLine: 24, fontSize: 16, rowGap: 46, maxRows: 4, bulletRadius: 5 },
          footer: { leftX: 96, rightX: 1206, y: 676, fontSize: 12 },
        }
    }
  }

  switch (slide.layout) {
    case "cover":
      return {
        panel: { x: 58, y: 340, width: 590, height: 286, radius: 24 },
        accent: { x: 58, y: 340, width: 590, height: 18, radius: 9 },
        kicker: { x: 96, y: 392, maxUnitsPerLine: 24, maxLines: 1, fontSize: 17, lineHeight: 18 },
        title: { x: 96, y: 466, maxUnitsPerLine: 16, maxLines: 3, fontSize: 44, lineHeight: 50 },
        body: { x: 96, y: 592, maxUnitsPerLine: 30, maxLines: 2, fontSize: 18, lineHeight: 26 },
        bullets: { x: 780, y: 198, maxUnitsPerLine: 22, fontSize: 16, rowGap: 48, maxRows: 4, bulletRadius: 4 },
        footer: { leftX: 96, rightX: 1192, y: 678, fontSize: 12 },
      }
    default:
      return {
        panel: { x: 700, y: 88, width: 490, height: 548, radius: 24 },
        accent: { x: 700, y: 88, width: 490, height: 14, radius: 7 },
        kicker: { x: 736, y: 142, maxUnitsPerLine: 24, maxLines: 1, fontSize: 17, lineHeight: 18 },
        title: { x: 736, y: 214, maxUnitsPerLine: 16, maxLines: 3, fontSize: 40, lineHeight: 48 },
        body: { x: 736, y: 366, maxUnitsPerLine: 24, maxLines: 3, fontSize: 18, lineHeight: 28 },
        bullets: { x: 736, y: 518, maxUnitsPerLine: 21, fontSize: 16, rowGap: 48, maxRows: 4, bulletRadius: 4 },
        footer: { leftX: 736, rightX: 1166, y: 664, fontSize: 12 },
      }
  }
}

function resolveOverlayTheme(variant: PptPreviewVariant) {
  const baseTheme = themeAssets[resolvePptPreviewStyleArchetype(variant.styleKey)].overlay
  return {
    ...baseTheme,
    panelFill: variant.palette.panel,
    panelStroke: variant.palette.border,
    textColor: variant.palette.foreground,
    mutedTextColor: variant.palette.border,
    accentColor: variant.palette.accent,
  }
}

function renderPanelDecor(frame: OverlayFrame, variant: PptPreviewVariant, overlay: AssetTheme["overlay"]) {
  const { panel, accent } = frame
  const blurFilter = overlay.shadow
    ? `<filter id="shadow-${variant.key}" x="-25%" y="-25%" width="150%" height="170%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.26" /></filter>`
    : ""
  const filterAttr = overlay.shadow ? ` filter="url(#shadow-${variant.key})"` : ""

  return [
    blurFilter,
    `<rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="${panel.radius}" fill="${overlay.panelFill}" fill-opacity="${overlay.panelOpacity}" stroke="${overlay.panelStroke}" stroke-opacity="0.9" stroke-width="2"${filterAttr} />`,
    accent
      ? `<rect x="${accent.x}" y="${accent.y}" width="${accent.width}" height="${accent.height}" rx="${accent.radius}" fill="${overlay.accentColor}" fill-opacity="0.96" />`
      : "",
  ].join("")
}

function renderOverlay(deck: PptPreviewDeck, variant: PptPreviewVariant, slide: PptPreviewSlide, index: number) {
  const overlay = resolveOverlayTheme(variant)
  const frame = getOverlayFrame(variant, slide)

  return [
    renderPanelDecor(frame, variant, overlay),
    renderTextBlock({
      text: slide.kicker,
      x: frame.kicker.x,
      y: frame.kicker.y,
      maxUnitsPerLine: frame.kicker.maxUnitsPerLine,
      maxLines: frame.kicker.maxLines,
      fontSize: frame.kicker.fontSize,
      lineHeight: frame.kicker.lineHeight,
      fill: overlay.accentColor,
      fontFamily: overlay.eyebrowFont,
      fontWeight: 700,
      letterSpacing: 2.4,
      textTransform: "uppercase",
    }),
    renderTextBlock({
      text: slide.title,
      x: frame.title.x,
      y: frame.title.y,
      maxUnitsPerLine: frame.title.maxUnitsPerLine,
      maxLines: frame.title.maxLines,
      fontSize: frame.title.fontSize,
      lineHeight: frame.title.lineHeight,
      fill: overlay.textColor,
      fontFamily: overlay.titleFont,
      fontWeight: overlay.titleWeight,
    }),
    renderTextBlock({
      text: slide.body,
      x: frame.body.x,
      y: frame.body.y,
      maxUnitsPerLine: frame.body.maxUnitsPerLine,
      maxLines: frame.body.maxLines,
      fontSize: frame.body.fontSize,
      lineHeight: frame.body.lineHeight,
      fill: overlay.mutedTextColor,
      fontFamily: overlay.bodyFont,
      fontWeight: overlay.bodyWeight,
    }),
    renderBulletList({
      bullets: slide.bullets,
      x: frame.bullets.x,
      y: frame.bullets.y,
      maxUnitsPerLine: frame.bullets.maxUnitsPerLine,
      fill: overlay.textColor,
      accent: overlay.accentColor,
      fontFamily: overlay.bodyFont,
      fontSize: frame.bullets.fontSize,
      rowGap: frame.bullets.rowGap,
      maxRows: frame.bullets.maxRows,
      bulletRadius: frame.bullets.bulletRadius,
    }),
    frame.footer
      ? `<text x="${frame.footer.leftX}" y="${frame.footer.y}" fill="${overlay.mutedTextColor}" font-family="${overlay.bodyFont}" font-size="${frame.footer.fontSize}" opacity="0.9">${escapeXml(deck.title)}</text><text x="${frame.footer.rightX}" y="${frame.footer.y}" fill="${overlay.mutedTextColor}" font-family="${overlay.bodyFont}" font-size="${frame.footer.fontSize}" opacity="0.9" text-anchor="end">${escapeXml(variant.name)} / ${String(index + 1).padStart(2, "0")}</text>`
      : "",
  ].join("")
}

function renderSlide(deck: PptPreviewDeck, variant: PptPreviewVariant, slide: PptPreviewSlide, index: number) {
  const assetTheme = themeAssets[resolvePptPreviewStyleArchetype(variant.styleKey)]
  const fileName = assetTheme.files[Math.min(index, assetTheme.files.length - 1)]
  const baseAssetDataUrl = getAssetDataUrl(variant.styleKey, fileName)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${BASE_VIEWBOX_WIDTH} ${BASE_VIEWBOX_HEIGHT}" role="img" aria-label="${escapeXml(`${variant.name} preview slide ${index + 1}`)}">`,
    baseAssetDataUrl
      ? `<image href="${baseAssetDataUrl}" x="0" y="0" width="${BASE_VIEWBOX_WIDTH}" height="${BASE_VIEWBOX_HEIGHT}" preserveAspectRatio="xMidYMid slice" />`
      : renderFallbackBackdrop(variant, index),
    renderOverlay(deck, variant, slide, index),
    "</svg>",
  ].join("")
}

export function renderPptPreviewDeckAssets(deck: PptPreviewDeck): PptPreviewDeck {
  return {
    ...deck,
    previewEngine: "ppt-master-svg",
    variants: deck.variants.map((variant) => {
      const slideAssets = variant.slides.map((slide, index) => encodeSvg(renderSlide(deck, variant, slide, index)))

      return {
        ...variant,
        preview: {
          format: "svg",
          themeId: variant.styleKey,
          cover: slideAssets[0],
          slides: slideAssets,
        },
      }
    }),
  }
}
