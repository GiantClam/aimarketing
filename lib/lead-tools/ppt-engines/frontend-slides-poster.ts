import type {
  PptPreviewAsset,
  PptPreviewDeck,
  PptPreviewSlide,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { getFrontendSlidesTheme } from "@/lib/lead-tools/ppt-engines/frontend-slides-theme"

const PREVIEW_WIDTH = 1600
const PREVIEW_HEIGHT = 900

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

export function renderFrontendSlidesPosterAsset(
  deck: PptPreviewDeck,
  variant: PptPreviewVariant,
  slide: PptPreviewSlide,
  slideIndex: number,
): PptPreviewAsset {
  const theme = getFrontendSlidesTheme(variant)
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
