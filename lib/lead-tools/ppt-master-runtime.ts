import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { allowPptMasterEmergencyFallback } from "@/lib/lead-tools/config"
import {
  createPptMasterSessionArchive,
  getConfiguredPptMasterSessionStore,
  getPptMasterSessionDir,
  getPptMasterSessionManifestPath,
  getPptMasterSessionRootDir,
  restorePptMasterSessionArchive,
} from "@/lib/lead-tools/ppt-master-session-store"
import { buildPptExportFileName } from "@/lib/lead-tools/ppt-export-file-name"
import type { PptPreviewAsset, PptPreviewDeck, PptPreviewSlide, PptPreviewVariant } from "@/lib/lead-tools/ppt-preview-data-fixed"

const execFileAsync = promisify(execFile)
const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const PREVIEW_WIDTH = 1280
const PREVIEW_HEIGHT = 720
const SESSION_TTL_MS = 1000 * 60 * 60 * 6

type StoredVariant = {
  key: string
  name: string
  projectDir: string
  slideCount: number
  runtimeDiagnostics?: {
    materializeMs: number
    slideRuns: Array<{
      slideId: string
      layout: PptPreviewSlide["layout"]
      fileBaseName: string
      durationMs: number
      provider?: string
      model?: string
      fallbackReason?: string | null
    }>
  }
}

type StoredVariantSlideRun = NonNullable<StoredVariant["runtimeDiagnostics"]>["slideRuns"][number]

type StoredSession = {
  sessionId: string
  createdAt: string
  title: string
  deck?: PptPreviewDeck
  variants: StoredVariant[]
}

type RuntimeTypography = {
  fontFamily: string
  titleFamily: string
  bodyFamily: string
  emphasisFamily: string
  codeFamily: string
  bodySize: number
  titleSize: number
  subtitleSize: number
  annotationSize: number
}

type RuntimeProjectArtifacts = {
  designSpecPath: string
  specLockPath: string
  sourceBriefPath: string
}

export type PptMasterPreviewRuntimeSlideContext = {
  deck: PptPreviewDeck
  variant: PptPreviewVariant
  slide: PptPreviewSlide
  slideIndex: number
  projectDir: string
  slideFileBaseName: string
  designSpecPath: string
  specLockPath: string
  sourceBriefPath: string
  previousSlides: Array<Pick<PptPreviewSlide, "layout" | "title" | "body" | "bullets">>
}

export type PptMasterPreviewRuntimeSlideResult = {
  model?: string
  provider?: string
  svg: string
}

export type PptMasterPreviewRuntimeOptions = {
  generateSlideSvg: (context: PptMasterPreviewRuntimeSlideContext) => Promise<PptMasterPreviewRuntimeSlideResult>
}

function getPptMasterRootCandidates() {
  return [
    process.env.PPT_MASTER_REPO_DIR,
    "D:\\tmp\\ppt-master",
    path.join(os.tmpdir(), "ppt-master"),
    path.join(process.cwd(), ".cache", "ppt-master"),
  ].filter((value): value is string => Boolean(value?.trim()))
}

async function resolvePptMasterRepoDir() {
  for (const candidate of getPptMasterRootCandidates()) {
    const skillPath = path.join(candidate, "skills", "ppt-master", "SKILL.md")
    try {
      await fs.access(skillPath)
      return candidate
    } catch {
      continue
    }
  }

  throw new Error("ppt_master_repo_missing")
}

function getSessionRootDir() {
  return getPptMasterSessionRootDir()
}

function getSessionDir(sessionId: string) {
  return getPptMasterSessionDir(sessionId)
}

function getManifestPath(sessionId: string) {
  return getPptMasterSessionManifestPath(sessionId)
}

async function cleanupExpiredSessions() {
  const rootDir = getSessionRootDir()

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const now = Date.now()

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const sessionDir = path.join(rootDir, entry.name)
          try {
            const stats = await fs.stat(sessionDir)
            if (now - stats.mtimeMs > SESSION_TTL_MS) {
              await fs.rm(sessionDir, { recursive: true, force: true })
            }
          } catch {
            return
          }
        }),
    )
  } catch {
    return
  }
}

async function writeManifest(session: StoredSession) {
  const manifestPath = getManifestPath(session.sessionId)
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(session, null, 2), "utf8")
}

async function persistStoredSession(session: StoredSession) {
  const archive = await createPptMasterSessionArchive(getSessionDir(session.sessionId))
  const store = await getConfiguredPptMasterSessionStore()
  await store.saveSession({
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    manifest: session,
    archive,
  })
}

async function restoreStoredSession(sessionId: string) {
  const store = await getConfiguredPptMasterSessionStore()
  const persisted = await store.getSession(sessionId)
  if (!persisted) {
    return null
  }

  await restorePptMasterSessionArchive(getSessionDir(sessionId), persisted.archive)
  return persisted.manifest as StoredSession
}

async function readManifest(sessionId: string) {
  try {
    const manifest = await fs.readFile(getManifestPath(sessionId), "utf8")
    return JSON.parse(manifest) as StoredSession
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null
    if (code !== "ENOENT") {
      throw error
    }

    const restored = await restoreStoredSession(sessionId)
    if (!restored) {
      throw error
    }

    const manifest = await fs.readFile(getManifestPath(sessionId), "utf8")
    return JSON.parse(manifest) as StoredSession
  }
}

function encodeSvgAsset(svg: string): PptPreviewAsset {
  return {
    mimeType: "image/svg+xml",
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
  }
}

function getPptMasterPythonCandidates() {
  return [process.env.PPT_MASTER_PYTHON_BIN, "python", "python3"].filter(
    (value): value is string => Boolean(value?.trim()),
  )
}

async function runPythonScript(repoDir: string, scriptRelativePath: string, args: string[]) {
  const scriptPath = path.join(repoDir, "skills", "ppt-master", "scripts", scriptRelativePath)
  let commandNotFound = false

  for (const pythonCommand of getPptMasterPythonCandidates()) {
    try {
      await execFileAsync(pythonCommand, [scriptPath, ...args], {
        cwd: repoDir,
        maxBuffer: 1024 * 1024 * 20,
        encoding: "utf8",
      })
      return
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        commandNotFound = true
        continue
      }

      const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr || "") : ""
      const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout || "") : ""
      const detail = stderr.trim() || stdout.trim()
      throw new Error(detail || `ppt_master_script_failed:${scriptRelativePath}`)
    }
  }

  if (commandNotFound) {
    throw new Error("ppt_master_python_missing")
  }
}

async function createProjectStructure(projectDir: string) {
  await fs.mkdir(path.join(projectDir, "svg_output"), { recursive: true })
  await fs.mkdir(path.join(projectDir, "svg_final"), { recursive: true })
  await fs.mkdir(path.join(projectDir, "exports"), { recursive: true })
  await fs.mkdir(path.join(projectDir, "notes"), { recursive: true })
  await fs.mkdir(path.join(projectDir, "images"), { recursive: true })
  await fs.mkdir(path.join(projectDir, "sources"), { recursive: true })
  await fs.mkdir(path.join(projectDir, "templates"), { recursive: true })
}

function buildNoteMarkdown(title: string, body: string, bullets: string[]) {
  return [`# ${title}`, "", body, "", ...bullets.map((bullet) => `- ${bullet}`), ""].join("\n")
}

function toSpecLockKey(index: number) {
  return `P${String(index + 1).padStart(2, "0")}`
}

function getRuntimeTypography(variantKey: PptPreviewVariant["styleKey"]): RuntimeTypography {
  switch (variantKey) {
    case "ppt169_brutalist_ai_newspaper_2026":
      return {
        fontFamily: "\"Arial Black\", Arial, \"Microsoft YaHei\", sans-serif",
        titleFamily: "\"Arial Black\", Arial, \"Microsoft YaHei\", sans-serif",
        bodyFamily: "Arial, \"Microsoft YaHei\", sans-serif",
        emphasisFamily: "\"Arial Black\", Arial, \"Microsoft YaHei\", sans-serif",
        codeFamily: "Consolas, \"Courier New\", monospace",
        bodySize: 20,
        titleSize: 54,
        subtitleSize: 28,
        annotationSize: 13,
      }
    case "ppt169_sugar_rush_memphis":
      return {
        fontFamily: "\"Trebuchet MS\", Arial, \"Microsoft YaHei\", sans-serif",
        titleFamily: "\"Arial Black\", Arial, \"Microsoft YaHei\", sans-serif",
        bodyFamily: "\"Trebuchet MS\", Arial, \"Microsoft YaHei\", sans-serif",
        emphasisFamily: "\"Arial Black\", Arial, \"Microsoft YaHei\", sans-serif",
        codeFamily: "Consolas, \"Courier New\", monospace",
        bodySize: 21,
        titleSize: 52,
        subtitleSize: 30,
        annotationSize: 13,
      }
    case "ppt169_pritzker_2026":
      return {
        fontFamily: "Georgia, \"Microsoft YaHei\", serif",
        titleFamily: "Georgia, \"Microsoft YaHei\", serif",
        bodyFamily: "Arial, \"Microsoft YaHei\", sans-serif",
        emphasisFamily: "Georgia, SimSun, serif",
        codeFamily: "Consolas, \"Courier New\", monospace",
        bodySize: 20,
        titleSize: 50,
        subtitleSize: 30,
        annotationSize: 13,
      }
    case "ppt169_swiss_grid_systems":
      return {
        fontFamily: "Arial, \"Microsoft YaHei\", sans-serif",
        titleFamily: "Arial, \"Microsoft YaHei\", sans-serif",
        bodyFamily: "Arial, \"Microsoft YaHei\", sans-serif",
        emphasisFamily: "Georgia, SimSun, serif",
        codeFamily: "Consolas, \"Courier New\", monospace",
        bodySize: 20,
        titleSize: 46,
        subtitleSize: 28,
        annotationSize: 13,
      }
  }
}

function buildRuntimeSourceBrief(deck: PptPreviewDeck, variant: PptPreviewVariant) {
  return [
    `# ${deck.title}`,
    "",
    `- Scenario: ${deck.scenario}`,
    `- Language: ${deck.language}`,
    `- Variant: ${variant.name}`,
    `- Summary: ${variant.summary}`,
    "",
    "## Outline",
    ...deck.outline.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Slides",
    ...variant.slides.flatMap((slide, index) => [
      `### ${index + 1}. ${slide.layout}`,
      `- Kicker: ${slide.kicker}`,
      `- Title: ${slide.title}`,
      `- Body: ${slide.body}`,
      ...slide.bullets.map((bullet) => `- Bullet: ${bullet}`),
      "",
    ]),
  ].join("\n")
}

function buildRuntimeDesignSpec(deck: PptPreviewDeck, variant: PptPreviewVariant, typography: RuntimeTypography) {
  const now = new Date().toISOString().slice(0, 10)

  return [
    `# ${deck.title} - Design Spec`,
    "",
    "## I. Project Information",
    "",
    "| Item | Value |",
    "| ---- | ----- |",
    `| **Project Name** | ${deck.title} |`,
    "| **Canvas Format** | PPT 16:9 (1280 x 720) |",
    `| **Page Count** | ${variant.slides.length} |`,
    `| **Design Style** | ${variant.name} |`,
    "| **Target Audience** | Preview viewers evaluating PPT directions |",
    `| **Use Case** | ${deck.scenario} |`,
    `| **Created Date** | ${now} |`,
    "",
    "## II. Canvas Specification",
    "",
    "| Property | Value |",
    "| -------- | ----- |",
    "| **Format** | PPT 16:9 |",
    "| **Dimensions** | 1280 x 720 |",
    "| **viewBox** | `0 0 1280 720` |",
    "| **Margins** | left/right 68px, top 56px, bottom 48px |",
    "| **Content Area** | 1144 x 616 |",
    "",
    "## III. Visual Theme",
    "",
    `- **Style**: ${variant.name}`,
    `- **Theme**: ${variant.palette.background.startsWith("#0") ? "Dark theme" : "Light theme"}`,
    `- **Tone**: ${variant.summary}`,
    "",
    "### Color Scheme",
    "",
    "| Role | HEX | Purpose |",
    "| ---- | --- | ------- |",
    `| **Background** | \`${variant.palette.background}\` | Page background |`,
    `| **Secondary bg** | \`${variant.palette.panel}\` | Panels and structural blocks |`,
    `| **Primary** | \`${variant.palette.foreground}\` | Headlines and key text |`,
    `| **Accent** | \`${variant.palette.accent}\` | Emphasis, dividers, key signals |`,
    `| **Secondary accent** | \`${variant.palette.border}\` | Frame lines and secondary rhythm |`,
    `| **Body text** | \`${variant.palette.foreground}\` | Main body copy |`,
    `| **Secondary text** | \`${variant.palette.border}\` | Labels, captions, secondary text |`,
    `| **Border/divider** | \`${variant.palette.border}\` | Rules and card edges |`,
    "",
    "## IV. Typography System",
    "",
    "### Font Plan",
    "",
    `- Title: ${typography.titleFamily}`,
    `- Body: ${typography.bodyFamily}`,
    `- Emphasis: ${typography.emphasisFamily}`,
    `- Code: ${typography.codeFamily}`,
    "",
    "### Font Size Hierarchy",
    "",
    `- Body baseline: ${typography.bodySize}px`,
    `- Page title: ${typography.titleSize}px`,
    `- Subtitle: ${typography.subtitleSize}px`,
    `- Annotation: ${typography.annotationSize}px`,
    "",
    "## V. Layout Principles",
    "",
    "- Preserve one coherent visual system across all pages in the same variant.",
    "- Each page should feel individually composed, not duplicated from a shared shell.",
    "- Use page rhythm intentionally: anchor for cover, dense for agenda/comparison/timeline, breathing for insight.",
    "",
    "## IX. Content Outline",
    "",
    ...variant.slides.flatMap((slide, index) => [
      `### ${toSpecLockKey(index)} / ${slide.layout}`,
      `- Kicker: ${slide.kicker}`,
      `- Title: ${slide.title}`,
      `- Body: ${slide.body}`,
      `- Bullets: ${slide.bullets.join(" | ")}`,
      "",
    ]),
  ].join("\n")
}

function buildRuntimeSpecLock(variant: PptPreviewVariant, typography: RuntimeTypography) {
  const pageRhythm = variant.slides.map((slide, index) => {
    if (slide.layout === "cover") {
      return `${toSpecLockKey(index)}: anchor`
    }
    if (slide.layout === "insight") {
      return `${toSpecLockKey(index)}: breathing`
    }
    return `${toSpecLockKey(index)}: dense`
  })

  return [
    "## canvas",
    "- viewBox: 0 0 1280 720",
    "- format: PPT 16:9",
    "",
    "## colors",
    `- bg: ${variant.palette.background}`,
    `- primary: ${variant.palette.foreground}`,
    `- accent: ${variant.palette.accent}`,
    `- secondary_accent: ${variant.palette.border}`,
    `- text: ${variant.palette.foreground}`,
    `- text_secondary: ${variant.palette.border}`,
    `- border: ${variant.palette.border}`,
    "",
    "## typography",
    `- font_family: ${typography.fontFamily}`,
    `- title_family: ${typography.titleFamily}`,
    `- body_family: ${typography.bodyFamily}`,
    `- emphasis_family: ${typography.emphasisFamily}`,
    `- code_family: ${typography.codeFamily}`,
    `- body: ${typography.bodySize}`,
    `- title: ${typography.titleSize}`,
    `- subtitle: ${typography.subtitleSize}`,
    `- annotation: ${typography.annotationSize}`,
    "",
    "## icons",
    "- library: chunk-filled",
    "- inventory: target, bolt, shield, users, chart-bar, lightbulb",
    "",
    "## page_rhythm",
    ...pageRhythm.map((entry) => `- ${entry}`),
    "",
    "## forbidden",
    "- rgba()",
    "- <style>, class, <foreignObject>, textPath, @font-face, <animate*>, <script>, <iframe>, <symbol>+<use>",
    "- <g opacity>",
    "- HTML named entities in text",
    "",
  ].join("\n")
}

async function writeProjectArtifacts(projectDir: string, deck: PptPreviewDeck, variant: PptPreviewVariant): Promise<RuntimeProjectArtifacts> {
  const typography = getRuntimeTypography(variant.styleKey)
  const sourceBriefPath = path.join(projectDir, "sources", "brief.md")
  const designSpecPath = path.join(projectDir, "design_spec.md")
  const specLockPath = path.join(projectDir, "spec_lock.md")

  await fs.writeFile(sourceBriefPath, buildRuntimeSourceBrief(deck, variant), "utf8")
  await fs.writeFile(designSpecPath, buildRuntimeDesignSpec(deck, variant, typography), "utf8")
  await fs.writeFile(specLockPath, buildRuntimeSpecLock(variant, typography), "utf8")

  return {
    designSpecPath,
    specLockPath,
    sourceBriefPath,
  }
}

function buildSlideFileBaseName(index: number, layout: PptPreviewSlide["layout"]) {
  return `${String(index + 1).padStart(2, "0")}_${layout}`
}

function isRecoverableRuntimeSlideFailure(detail: string) {
  return (
    detail === "ppt_master_runtime_slide_timeout" ||
    detail === "lead_tool_preview_empty_response" ||
    detail === "ppt_master_runtime_slide_svg_invalid"
  )
}

function shouldFallbackForGeneratedSvg(_context: PptMasterPreviewRuntimeSlideContext, _svg: string) {
  return null
}

function shouldUseDeterministicRuntimeSvg(_context: PptMasterPreviewRuntimeSlideContext) {
  return false
}

function normalizeNamedEntities(svg: string) {
  return svg
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&copy;/g, "©")
    .replace(/&reg;/g, "®")
    .replace(/&rarr;/g, "→")
    .replace(/&middot;/g, "·")
    .replace(/&hellip;/g, "…")
    .replace(/&bull;/g, "•")
}

function escapeUnknownAmpersands(svg: string) {
  return svg.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
}

function extractSvgDocument(raw: string) {
  const withoutCodeFence = raw.replace(/```svg|```xml|```/gi, "").trim()
  const matches = Array.from(withoutCodeFence.matchAll(/<svg[\s\S]*?<\/svg>/gi), (match) => match[0].trim()).filter(Boolean)

  if (!matches.length) {
    throw new Error("ppt_master_runtime_svg_missing")
  }

  return matches.sort((left, right) => right.length - left.length)[0] ?? matches[0]
}

function ensureCanvasAttributes(svg: string) {
  return svg.replace(
    /<svg\b([^>]*)>/i,
    (_fullMatch, attrs: string) => {
      let nextAttrs = attrs

      if (!/\bxmlns=/.test(nextAttrs)) {
        nextAttrs += ' xmlns="http://www.w3.org/2000/svg"'
      }
      if (!/\bwidth=/.test(nextAttrs)) {
        nextAttrs += ` width="${PREVIEW_WIDTH}"`
      }
      if (!/\bheight=/.test(nextAttrs)) {
        nextAttrs += ` height="${PREVIEW_HEIGHT}"`
      }
      if (!/\bviewBox=/.test(nextAttrs)) {
        nextAttrs += ` viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}"`
      }

      return `<svg${nextAttrs}>`
    },
  )
}

function prepareGeneratedSvg(raw: string) {
  return ensureCanvasAttributes(escapeUnknownAmpersands(normalizeNamedEntities(extractSvgDocument(raw))))
}

function postprocessGeneratedSvg(_context: PptMasterPreviewRuntimeSlideContext, svg: string) {
  return svg
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function splitTextIntoLines(value: string, maxCharsPerLine: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = word
      continue
    }

    lines.push(word)
  }

  if (current) {
    lines.push(current)
  }

  return lines.length ? lines : [value.trim()]
}

function splitTextSmart(value: string, maxCharsPerLine: number) {
  if (/[一-龥]/u.test(value)) {
    const normalized = value.replace(/\s+/g, "")
    const lines: string[] = []

    for (let index = 0; index < normalized.length; index += maxCharsPerLine) {
      lines.push(normalized.slice(index, index + maxCharsPerLine))
    }

    return lines.length ? lines : [normalized]
  }

  return splitTextIntoLines(value, maxCharsPerLine)
}

function compactRuntimeText(value: string, maxUnits: number, language: PptPreviewDeck["language"]) {
  const normalized = value.replace(/\s+/g, language === "zh-CN" ? "" : " ").trim()
  if (!normalized || maxUnits <= 0) return normalized

  const symbols = Array.from(normalized)
  if (symbols.length <= maxUnits) {
    return normalized
  }

  if (language === "zh-CN") {
    return `${symbols.slice(0, Math.max(1, maxUnits - 1)).join("")}…`
  }

  const words = normalized.split(/\s+/).filter(Boolean)
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxUnits - 1) {
      break
    }
    current = candidate
  }

  if (current) {
    return `${current}…`
  }

  return `${normalized.slice(0, Math.max(1, maxUnits - 1)).trimEnd()}…`
}

function normalizeRuntimeCopyText(value: string, language: PptPreviewDeck["language"]) {
  return value.replace(/\s+/g, language === "zh-CN" ? "" : " ").trim()
}

function normalizeRuntimeSlideCopy(
  slide: PptPreviewSlide,
  language: PptPreviewDeck["language"],
  templateId?: string,
): PptPreviewSlide {
  void templateId

  return {
    ...slide,
    kicker: normalizeRuntimeCopyText(slide.kicker, language),
    title: normalizeRuntimeCopyText(slide.title, language),
    body: normalizeRuntimeCopyText(slide.body, language),
    bullets: slide.bullets.map((item) => normalizeRuntimeCopyText(item, language)).filter(Boolean),
    contentsItems: slide.contentsItems?.map((item) => ({
      ...item,
      title: normalizeRuntimeCopyText(item.title, language),
      detail: normalizeRuntimeCopyText(item.detail, language),
    })),
    comparisonItems: slide.comparisonItems?.map((item) => ({
      ...item,
      title: normalizeRuntimeCopyText(item.title, language),
      detail: normalizeRuntimeCopyText(item.detail, language),
    })),
    spotlightItems: slide.spotlightItems?.map((item) => ({
      ...item,
      title: normalizeRuntimeCopyText(item.title, language),
      detail: normalizeRuntimeCopyText(item.detail, language),
    })),
    metricItems: slide.metricItems?.map((item) => ({
      ...item,
      label: normalizeRuntimeCopyText(item.label, language),
      note: item.note ? normalizeRuntimeCopyText(item.note, language) : item.note,
    })),
    chartItems: slide.chartItems?.map((item) => ({
      ...item,
      label: normalizeRuntimeCopyText(item.label, language),
      detail: normalizeRuntimeCopyText(item.detail, language),
    })),
    processItems: slide.processItems?.map((item) => ({
      ...item,
      title: normalizeRuntimeCopyText(item.title, language),
      detail: normalizeRuntimeCopyText(item.detail, language),
    })),
    closingItems: slide.closingItems?.map((item) => ({
      ...item,
      detail: normalizeRuntimeCopyText(item.detail, language),
    })),
  }
}

function normalizeRuntimeDeckCopy(deck: PptPreviewDeck): PptPreviewDeck {
  return {
    ...deck,
    variants: deck.variants.map((variant) => ({
      ...variant,
      slides: variant.slides.map((slide) => normalizeRuntimeSlideCopy(slide, deck.language, variant.templateId)),
    })),
  }
}

function getKickerText(context: PptMasterPreviewRuntimeSlideContext) {
  const kicker = context.slide.kicker.trim()
  if (kicker && !/^slide\s+\d+$/i.test(kicker)) {
    return kicker
  }

  const fallbackByLayout: Record<PptPreviewSlide["layout"], string> = {
    cover: context.variant.name,
    agenda: context.deck.language === "zh-CN" ? "结构总览" : "STRUCTURE",
    insight: context.deck.language === "zh-CN" ? "关键判断" : "KEY INSIGHT",
    comparison: context.deck.language === "zh-CN" ? "对比视角" : "COMPARISON",
    evidence: context.deck.language === "zh-CN" ? "证据锚点" : "PROOF",
    stats: context.deck.language === "zh-CN" ? "关键数据" : "STATS",
    chart: context.deck.language === "zh-CN" ? "图示扩散" : "CHART",
    process: context.deck.language === "zh-CN" ? "执行路径" : "PROCESS",
    timeline: context.deck.language === "zh-CN" ? "推进路径" : "TIMELINE",
  }

  return fallbackByLayout[context.slide.layout]
}

function renderTextBlock(params: {
  color: string
  family: string
  fontSize: number
  fontWeight?: number | string
  lineHeight: number
  lines: string[]
  x: number
  y: number
}) {
  const { color, family, fontSize, fontWeight = 400, lineHeight, lines, x, y } = params

  return [
    `<text x="${x}" y="${y}" font-family="${escapeXml(family)}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">`,
    ...lines.map((line, index) =>
      index === 0
        ? escapeXml(line)
        : `<tspan x="${x}" dy="${lineHeight}">${escapeXml(line)}</tspan>`,
    ),
    "</text>",
  ].join("")
}

function renderBulletItems(params: {
  color: string
  family: string
  fontSize: number
  items: string[]
  x: number
  y: number
  lineHeight: number
  maxCharsPerLine: number
}) {
  const { color, family, fontSize, items, x, y, lineHeight, maxCharsPerLine } = params
  let cursorY = y

  return items
    .flatMap((item) => {
      const lines = splitTextSmart(item, maxCharsPerLine)
      const block = [
        `<g id="bullet-${Math.abs(cursorY)}">`,
        `<circle cx="${x}" cy="${cursorY - 6}" r="4" fill="${color}"/>`,
        renderTextBlock({
          color,
          family,
          fontSize,
          lineHeight,
          lines,
          x: x + 16,
          y: cursorY,
        }),
        "</g>",
      ]

      cursorY += lineHeight * Math.max(1, lines.length) + 12
      return block
    })
    .join("")
}

function buildEmergencyRuntimeSvg(context: PptMasterPreviewRuntimeSlideContext) {
  const { slide, variant } = context
  const titleLines = splitTextSmart(slide.title, slide.layout === "cover" ? 12 : 18).slice(0, slide.layout === "cover" ? 2 : 3)
  const bodyLines = splitTextSmart(slide.body, slide.layout === "comparison" ? 18 : 26).slice(0, 4)
  const kicker = escapeXml(getKickerText(context).toUpperCase())
  const accent = variant.palette.accent
  const border = variant.palette.border
  const panel = variant.palette.panel
  const foreground = variant.palette.foreground
  const background = variant.palette.background

  const backgroundBlockByStyle: Record<PptPreviewVariant["key"], string> = {
    "ppt169_brutalist_ai_newspaper_2026": [
      `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${background}"/>`,
      `<rect x="64" y="56" width="1152" height="74" fill="none" stroke="${border}" stroke-width="3"/>`,
      `<rect x="64" y="56" width="320" height="74" fill="${accent}"/>`,
      `<line x1="64" y1="154" x2="1216" y2="154" stroke="${border}" stroke-width="2"/>`,
      `<line x1="64" y1="610" x2="1216" y2="610" stroke="${border}" stroke-width="2"/>`,
      `<rect x="64" y="628" width="180" height="24" fill="${border}"/>`,
    ].join(""),
    "ppt169_sugar_rush_memphis": [
      `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${background}"/>`,
      `<circle cx="1078" cy="132" r="166" fill="${accent}" fill-opacity="0.22"/>`,
      `<circle cx="250" cy="176" r="118" fill="${border}" fill-opacity="0.24"/>`,
      `<rect x="78" y="76" width="1124" height="568" rx="32" fill="${panel}" fill-opacity="0.72"/>`,
      `<polygon points="106,646 252,646 182,560" fill="${accent}" fill-opacity="0.9"/>`,
      `<rect x="876" y="580" width="242" height="32" rx="12" fill="${border}" fill-opacity="0.92" transform="rotate(-8 876 580)"/>`,
    ].join(""),
    "ppt169_pritzker_2026": [
      `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${background}"/>`,
      `<rect x="74" y="72" width="1132" height="566" rx="26" fill="${panel}" fill-opacity="0.72"/>`,
      `<rect x="74" y="72" width="1132" height="566" rx="26" fill="none" stroke="${border}" stroke-width="2"/>`,
      `<circle cx="1084" cy="124" r="64" fill="${accent}" fill-opacity="0.14"/>`,
      `<rect x="138" y="104" width="216" height="10" fill="${accent}" fill-opacity="0.85"/>`,
    ].join(""),
    "ppt169_swiss_grid_systems": [
      `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${background}"/>`,
      `<rect x="56" y="52" width="8" height="616" fill="${accent}"/>`,
      `<line x1="120" y1="120" x2="1200" y2="120" stroke="${border}" stroke-width="2"/>`,
      `<line x1="120" y1="600" x2="1200" y2="600" stroke="${border}" stroke-width="2"/>`,
      `<line x1="640" y1="120" x2="640" y2="600" stroke="${border}" stroke-opacity="0.2" stroke-width="1"/>`,
    ].join(""),
  }

  return buildEmergencyRuntimeSvgDocument({
    context,
    innerBackground: backgroundBlockByStyle[variant.styleKey],
    titleLines,
    bodyLines,
    kicker,
    accent,
    border,
    panel,
    foreground,
    background,
  })
}

function buildEmergencyRuntimeSvgDocument(params: {
  context: PptMasterPreviewRuntimeSlideContext
  innerBackground: string
  titleLines: string[]
  bodyLines: string[]
  kicker: string
  accent: string
  border: string
  panel: string
  foreground: string
  background: string
}) {
  const { context, innerBackground, titleLines, bodyLines, kicker, accent, border, panel, foreground, background } = params
  const titleFont =
    context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026"
      ? 52
      : context.variant.styleKey === "ppt169_sugar_rush_memphis"
        ? 46
        : context.slide.layout === "cover"
          ? 42
          : 34
  const bodyFont = 20
  const coverBodyY = 250 + titleLines.length * (titleFont + 8)
  const coverBulletY = coverBodyY + bodyLines.length * 28 + 46
  const insightBodyY = 286 + titleLines.length * 34
  const insightBulletY = insightBodyY + bodyLines.length * 34 + 36
  const insightHeadlineLines = splitTextSmart(context.slide.title, 6).slice(0, 3)
  const insightHeadlineY = 226
  const insightHeadlineLineHeight = 58
  const insightHeadlineBottomY = insightHeadlineY + (insightHeadlineLines.length - 1) * insightHeadlineLineHeight
  const insightBodyLines = splitTextSmart(context.slide.body, 14).slice(0, 2)
  const insightBodyLineHeight = 28
  const insightBodyStartY = insightHeadlineBottomY + 42
  const insightBodyBottomY = insightBodyStartY + (insightBodyLines.length - 1) * insightBodyLineHeight
  const insightVerdictHeight = 72
  const insightVerdictY = 500
  const insightBannerHeight = 62
  const insightBannerY = Math.min(insightBodyBottomY + 34, insightVerdictY - insightBannerHeight - 24)
  const insightBannerLines = splitTextSmart(context.slide.bullets[0] ?? context.slide.title, 10).slice(0, 1)
  const insightVerdictLines = splitTextSmart(context.slide.bullets[1] ?? context.slide.body, 16).slice(0, 2)
  const insightMetricLines = splitTextSmart(context.slide.bullets[0] ?? context.slide.title, 6).slice(0, 2)
  const insightSupportLines = splitTextSmart(context.slide.bullets[1] ?? context.slide.body, 14).slice(0, 2)
  const insightRiskLines = splitTextSmart(context.slide.bullets[2] ?? context.slide.body, 12).slice(0, 3)

  const contentByLayout: Record<PptPreviewSlide["layout"], string> = {
    cover: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 120,
      }),
      renderTextBlock({
        color: foreground,
        family: context.variant.styleKey === "ppt169_pritzker_2026" ? "Georgia, \"Microsoft YaHei\", serif" : "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: titleFont,
        fontWeight: 800,
        lineHeight: titleFont + 8,
        lines: titleLines,
        x: 136,
        y: 200,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: bodyFont,
        lineHeight: 28,
        lines: bodyLines,
        x: 136,
        y: coverBodyY,
      }),
      renderBulletItems({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        items: context.slide.bullets.slice(0, 3),
        x: 146,
        y: Math.min(coverBulletY, 520),
        lineHeight: 24,
        maxCharsPerLine: 24,
      }),
      `<rect x="900" y="148" width="220" height="220" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 28}" fill="${accent}" fill-opacity="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? "1" : "0.18"}"/>`,
      `<rect x="968" y="390" width="150" height="150" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 24}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
    ].join(""),
    agenda: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 40,
        lines: titleLines,
        x: 136,
        y: 168,
      }),
      ...context.slide.bullets.slice(0, 4).flatMap((item, index) => {
        const rowY = 248 + index * 92
        return [
          `<g id="agenda-row-${index + 1}">`,
          `<rect x="136" y="${rowY - 34}" width="880" height="70" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 18}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
          renderTextBlock({
            color: accent,
            family: "Arial, \"Microsoft YaHei\", sans-serif",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 20,
            lines: [`0${index + 1}`],
            x: 166,
            y: rowY + 2,
          }),
          renderTextBlock({
            color: foreground,
            family: "Arial, \"Microsoft YaHei\", sans-serif",
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 24,
            lines: splitTextSmart(item, 26).slice(0, 2),
            x: 260,
            y: rowY,
          }),
          `</g>`,
        ]
      }).join(""),
    ].join(""),
    insight: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      `<rect x="136" y="154" width="1008" height="430" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 28}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
      `<rect x="782" y="154" width="362" height="430" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 28}" fill="${background}" stroke="${border}" stroke-width="2"/>`,
      `<rect x="180" y="${insightBannerY}" width="420" height="${insightBannerHeight}" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 8}" fill="${accent}"/>`,
      renderTextBlock({
        color: foreground,
        family: context.variant.styleKey === "ppt169_pritzker_2026" ? "Georgia, \"Microsoft YaHei\", serif" : "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 56,
        fontWeight: 800,
        lineHeight: insightHeadlineLineHeight,
        lines: insightHeadlineLines,
        x: 180,
        y: insightHeadlineY,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 24,
        fontWeight: 600,
        lineHeight: insightBodyLineHeight,
        lines: insightBodyLines,
        x: 180,
        y: insightBodyStartY,
      }),
      renderTextBlock({
        color: background,
        family: "Arial Black, Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 30,
        fontWeight: 900,
        lineHeight: 34,
        lines: insightBannerLines,
        x: 204,
        y: insightBannerY + 40,
      }),
      `<rect x="180" y="${insightVerdictY}" width="520" height="${insightVerdictHeight}" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 12}" fill="none" stroke="${foreground}" stroke-width="2"/>`,
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        fontWeight: 800,
        lineHeight: 22,
        lines: ["一句话判断"],
        x: 208,
        y: insightVerdictY + 32,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 20,
        fontWeight: 700,
        lineHeight: 24,
        lines: insightVerdictLines,
        x: 340,
        y: insightVerdictY + 30,
      }),
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        fontWeight: 800,
        lineHeight: 22,
        lines: ["支撑列"],
        x: 826,
        y: 212,
      }),
      `<line x1="826" y1="226" x2="1106" y2="226" stroke="${border}" stroke-width="2"/>`,
      renderTextBlock({
        color: foreground,
        family: "Arial Black, Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 42,
        fontWeight: 900,
        lineHeight: 44,
        lines: insightMetricLines,
        x: 826,
        y: 296,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 24,
        lines: insightSupportLines,
        x: 826,
        y: 390,
      }),
      `<rect x="826" y="444" width="260" height="108" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 12}" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="2"/>`,
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        fontWeight: 800,
        lineHeight: 22,
        lines: ["风险未退"],
        x: 850,
        y: 478,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 24,
        lines: insightRiskLines,
        x: 850,
        y: 514,
      }),
    ].join(""),
    comparison: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 40,
        lines: titleLines,
        x: 136,
        y: 168,
      }),
      `<rect x="136" y="228" width="456" height="314" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 24}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
      `<rect x="688" y="228" width="456" height="314" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 24}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 22,
        lines: [context.slide.bullets[0] ?? context.slide.title],
        x: 174,
        y: 286,
      }),
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 22,
        lines: [context.slide.bullets[1] ?? context.slide.body],
        x: 726,
        y: 286,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 17,
        lineHeight: 24,
        lines: splitTextSmart(context.slide.body, 16).slice(0, 5),
        x: 174,
        y: 340,
      }),
      renderBulletItems({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        items: context.slide.bullets.slice(2),
        x: 726,
        y: 340,
        lineHeight: 22,
        maxCharsPerLine: 14,
      }),
    ].join(""),
    evidence: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      `<rect x="136" y="154" width="1008" height="378" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 28}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
      renderTextBlock({
        color: foreground,
        family: context.variant.styleKey === "ppt169_pritzker_2026" ? "Georgia, \"Microsoft YaHei\", serif" : "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 42,
        lines: titleLines,
        x: 180,
        y: 232,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 24,
        fontWeight: 500,
        lineHeight: 34,
        lines: bodyLines,
        x: 180,
        y: insightBodyY,
      }),
      renderBulletItems({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        items: context.slide.bullets.slice(0, 3),
        x: 184,
        y: Math.min(insightBulletY, 500),
        lineHeight: 24,
        maxCharsPerLine: 26,
      }),
    ].join(""),
    stats: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 40,
        lines: titleLines,
        x: 136,
        y: 168,
      }),
      `<rect x="136" y="228" width="316" height="314" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 24}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
      `<rect x="492" y="228" width="316" height="314" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 24}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
      `<rect x="848" y="228" width="296" height="314" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 24}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
      ...context.slide.bullets.slice(0, 3).flatMap((item, index) => {
        const x = index === 0 ? 168 : index === 1 ? 524 : 880
        const bigFont = index === 2 ? 44 : 52
        return [
          renderTextBlock({
            color: accent,
            family: "Arial, \"Microsoft YaHei\", sans-serif",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 22,
            lines: [`0${index + 1}`],
            x,
            y: 284,
          }),
          renderTextBlock({
            color: foreground,
            family: "Arial, \"Microsoft YaHei\", sans-serif",
            fontSize: bigFont,
            fontWeight: 800,
            lineHeight: bigFont + 4,
            lines: splitTextSmart(item, 8).slice(0, 3),
            x,
            y: 362,
          }),
        ]
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        lineHeight: 26,
        lines: bodyLines,
        x: 136,
        y: 602,
      }),
    ].join(""),
    chart: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 40,
        lines: titleLines,
        x: 136,
        y: 168,
      }),
      `<line x1="220" y1="500" x2="420" y2="350" stroke="${accent}" stroke-width="6"/>`,
      `<line x1="420" y1="350" x2="700" y2="330" stroke="${accent}" stroke-width="6"/>`,
      `<line x1="700" y1="330" x2="1020" y2="240" stroke="${accent}" stroke-width="6"/>`,
      `<circle cx="220" cy="500" r="14" fill="${accent}"/>`,
      `<circle cx="420" cy="350" r="14" fill="${accent}"/>`,
      `<circle cx="700" cy="330" r="14" fill="${accent}"/>`,
      `<circle cx="1020" cy="240" r="14" fill="${accent}"/>`,
      ...context.slide.bullets.slice(0, 4).flatMap((item, index) => {
        const points = [
          { x: 174, y: 548 },
          { x: 374, y: 398 },
          { x: 654, y: 378 },
          { x: 974, y: 288 },
        ]
        const point = points[index] ?? points[points.length - 1]
        return renderTextBlock({
          color: foreground,
          family: "Arial, \"Microsoft YaHei\", sans-serif",
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 24,
          lines: splitTextSmart(item, 10).slice(0, 3),
          x: point.x,
          y: point.y,
        })
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        lineHeight: 26,
        lines: bodyLines,
        x: 136,
        y: 620,
      }),
    ].join(""),
    process: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 40,
        lines: titleLines,
        x: 136,
        y: 168,
      }),
      `<line x1="164" y1="368" x2="1110" y2="368" stroke="${accent}" stroke-width="4"/>`,
      ...context.slide.bullets.slice(0, 4).flatMap((item, index) => {
        const x = 180 + index * 230
        return [
          `<g id="process-stop-${index + 1}">`,
          `<circle cx="${x}" cy="368" r="12" fill="${accent}"/>`,
          `<rect x="${x - 60}" y="408" width="170" height="94" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 18}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
          renderTextBlock({
            color: foreground,
            family: "Arial, \"Microsoft YaHei\", sans-serif",
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 22,
            lines: splitTextSmart(item, 10).slice(0, 3),
            x: x - 40,
            y: 446,
          }),
          `</g>`,
        ]
      }).join(""),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        lineHeight: 26,
        lines: bodyLines,
        x: 136,
        y: 586,
      }),
    ].join(""),
    timeline: [
      renderTextBlock({
        color: accent,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 20,
        lines: [kicker],
        x: 136,
        y: 112,
      }),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 40,
        lines: titleLines,
        x: 136,
        y: 168,
      }),
      `<line x1="164" y1="368" x2="1110" y2="368" stroke="${accent}" stroke-width="4"/>`,
      ...context.slide.bullets.slice(0, 4).flatMap((item, index) => {
        const x = 180 + index * 230
        return [
          `<g id="timeline-stop-${index + 1}">`,
          `<circle cx="${x}" cy="368" r="12" fill="${accent}"/>`,
          `<rect x="${x - 60}" y="408" width="170" height="94" rx="${context.variant.styleKey === "ppt169_brutalist_ai_newspaper_2026" ? 0 : 18}" fill="${panel}" stroke="${border}" stroke-width="2"/>`,
          renderTextBlock({
            color: foreground,
            family: "Arial, \"Microsoft YaHei\", sans-serif",
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 22,
            lines: splitTextSmart(item, 10).slice(0, 3),
            x: x - 40,
            y: 446,
          }),
          `</g>`,
        ]
      }).join(""),
      renderTextBlock({
        color: foreground,
        family: "Arial, \"Microsoft YaHei\", sans-serif",
        fontSize: 18,
        lineHeight: 26,
        lines: bodyLines,
        x: 136,
        y: 586,
      }),
    ].join(""),
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">`,
    `<g id="background">${innerBackground}</g>`,
    `<g id="chrome">`,
    `<text x="1060" y="90" font-family="Arial, &quot;Microsoft YaHei&quot;, sans-serif" font-size="14" font-weight="700" fill="${foreground}" opacity="0.7">${escapeXml(context.variant.name.toUpperCase())}</text>`,
    `</g>`,
    `<g id="content">${contentByLayout[context.slide.layout]}</g>`,
    `<g id="annotations">`,
    `<text x="1120" y="674" font-family="Arial, &quot;Microsoft YaHei&quot;, sans-serif" font-size="12" fill="${foreground}" opacity="0.55">${escapeXml(
      `${context.slideIndex + 1}/${context.variant.slides.length}`,
    )}</text>`,
    `</g>`,
    `</svg>`,
  ].join("")
}

async function materializeVariantProject(params: {
  deck: PptPreviewDeck
  options: PptMasterPreviewRuntimeOptions
  repoDir: string
  sessionDir: string
  variant: PptPreviewVariant
}) {
  const { deck, options, repoDir, sessionDir, variant } = params
  const projectDir = path.join(sessionDir, variant.key)
  const materializeStartedAt = Date.now()
  const slideRuns: StoredVariantSlideRun[] = []
  const allowEmergencyFallback = allowPptMasterEmergencyFallback()

  await fs.rm(projectDir, { recursive: true, force: true })
  await createProjectStructure(projectDir)

  const projectArtifacts = await writeProjectArtifacts(projectDir, deck, variant)
  const normalizedSlides: PptPreviewSlide[] = []
  let runtimeProvider = deck.provider
  let runtimeModel = deck.previewModel

  for (const [index, slide] of variant.slides.entries()) {
    const slideFileBaseName = buildSlideFileBaseName(index, slide.layout)
    const previousSlides = normalizedSlides.map((item) => ({
      layout: item.layout,
      title: item.title,
      body: item.body,
      bullets: item.bullets,
    }))
    const slideContext = {
      deck,
      variant,
      slide,
      slideIndex: index,
      projectDir,
      slideFileBaseName,
      designSpecPath: projectArtifacts.designSpecPath,
      specLockPath: projectArtifacts.specLockPath,
      sourceBriefPath: projectArtifacts.sourceBriefPath,
      previousSlides,
    } satisfies PptMasterPreviewRuntimeSlideContext

    const slideStartedAt = Date.now()
    let result: PptMasterPreviewRuntimeSlideResult
    let fallbackReason: string | null = null
    if (shouldUseDeterministicRuntimeSvg(slideContext)) {
      fallbackReason = "deterministic_runtime_svg"
      result = {
        provider: "ppt-master-emergency-svg",
        model: deck.previewModel ?? "emergency-svg",
        svg: buildEmergencyRuntimeSvg(slideContext),
      }
    } else {
      try {
        result = await options.generateSlideSvg(slideContext)
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown_error"
        if (!isRecoverableRuntimeSlideFailure(detail)) {
          throw new Error(`ppt_master_runtime_slide_generation_failed:${variant.key}:${slideFileBaseName}:${detail}`)
        }
        if (!allowEmergencyFallback) {
          throw new Error(`ppt_master_runtime_slide_generation_failed:${variant.key}:${slideFileBaseName}:${detail}`)
        }

        fallbackReason = detail
        result = {
          provider: "ppt-master-emergency-svg",
          model: deck.previewModel ?? "emergency-svg",
          svg: buildEmergencyRuntimeSvg(slideContext),
        }
      }
    }

    let normalizedSvg: string
    try {
      normalizedSvg = postprocessGeneratedSvg(slideContext, prepareGeneratedSvg(result.svg))
    } catch (error) {
      const detail = error instanceof Error ? error.message : "svg_postprocess_failed"
      if (!allowEmergencyFallback) {
        throw new Error(`ppt_master_runtime_slide_postprocess_failed:${variant.key}:${slideFileBaseName}:${detail}`)
      }

      fallbackReason = fallbackReason ?? detail
      result = {
        provider: "ppt-master-emergency-svg",
        model: deck.previewModel ?? "emergency-svg",
        svg: buildEmergencyRuntimeSvg(slideContext),
      }
      normalizedSvg = prepareGeneratedSvg(result.svg)
    }

    const svgFallbackReason = shouldFallbackForGeneratedSvg(slideContext, normalizedSvg)
    if (svgFallbackReason) {
      if (!allowEmergencyFallback) {
        throw new Error(`ppt_master_runtime_slide_validation_failed:${variant.key}:${slideFileBaseName}:${svgFallbackReason}`)
      }

      fallbackReason = fallbackReason ?? svgFallbackReason
      result = {
        provider: "ppt-master-emergency-svg",
        model: deck.previewModel ?? "emergency-svg",
        svg: buildEmergencyRuntimeSvg(slideContext),
      }
      normalizedSvg = prepareGeneratedSvg(result.svg)
    }

    await fs.writeFile(path.join(projectDir, "svg_output", `${slideFileBaseName}.svg`), normalizedSvg, "utf8")
    await fs.writeFile(path.join(projectDir, "notes", `${slideFileBaseName}.md`), buildNoteMarkdown(slide.title, slide.body, slide.bullets), "utf8")

    normalizedSlides.push(slide)
    runtimeProvider = result.provider ?? runtimeProvider
    runtimeModel = result.model ?? runtimeModel
    slideRuns.push({
      slideId: slide.id,
      layout: slide.layout,
      fileBaseName: slideFileBaseName,
      durationMs: Date.now() - slideStartedAt,
      provider: result.provider,
      model: result.model,
      fallbackReason,
    })
  }

  await runPythonScript(repoDir, "finalize_svg.py", [projectDir])

  const slideFiles = (await fs.readdir(path.join(projectDir, "svg_final")))
    .filter((file) => file.endsWith(".svg"))
    .sort((left, right) => left.localeCompare(right, "en"))

  const slideAssets = await Promise.all(
    slideFiles.map(async (fileName) => {
      const svg = await fs.readFile(path.join(projectDir, "svg_final", fileName), "utf8")
      return encodeSvgAsset(svg)
    }),
  )

  if (!slideAssets.length) {
    throw new Error(`ppt_master_finalized_slides_missing:${variant.key}`)
  }

  return {
    runtimeModel,
    runtimeProvider,
    stored: {
      key: variant.key,
      name: variant.name,
      projectDir,
      slideCount: slideAssets.length,
      runtimeDiagnostics: {
        materializeMs: Date.now() - materializeStartedAt,
        slideRuns,
      },
    } satisfies StoredVariant,
    variant: {
      ...variant,
      preview: {
        format: "svg" as const,
        themeId: variant.styleKey,
        cover: slideAssets[0],
        slides: slideAssets,
      },
    },
  }
}

function toAsciiFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^[-.\s]+|[-.\s]+$)/g, "")

  return normalized || "ppt-master-export"
}

// Local subprocess adapter retained for dev fallback and rollback.
// Remote worker execution is selected in the engine layer.
export async function materializePptMasterPreviewDeck(deck: PptPreviewDeck, options: PptMasterPreviewRuntimeOptions) {
  await cleanupExpiredSessions()

  const repoDir = await resolvePptMasterRepoDir()
  const sessionId = randomUUID()
  const sessionDir = getSessionDir(sessionId)
  const runtimeDeck = normalizeRuntimeDeckCopy(deck)

  const variantResults = await Promise.all(
    runtimeDeck.variants.map((variant) => materializeVariantProject({ deck: runtimeDeck, options, repoDir, sessionDir, variant })),
  )

  const materializedDeck = {
    ...runtimeDeck,
    previewEngine: "ppt-master-project" as const,
    previewModel: variantResults[0]?.runtimeModel ?? runtimeDeck.previewModel,
    previewSessionId: sessionId,
    provider: variantResults[0]?.runtimeProvider ?? runtimeDeck.provider,
    variants: variantResults.map((item) => item.variant),
  }
  const storedSession = {
    sessionId,
    createdAt: new Date().toISOString(),
    title: deck.title,
    deck: materializedDeck,
    variants: variantResults.map((item) => item.stored),
  } satisfies StoredSession

  await writeManifest(storedSession)
  await persistStoredSession(storedSession)

  return materializedDeck
}

export async function getPptMasterSessionDeck(sessionId: string) {
  const manifest = await readManifest(sessionId)

  if (!manifest.deck) {
    throw new Error("ppt_master_session_deck_missing")
  }

  return manifest.deck
}

export async function getPptMasterSessionVariant(sessionId: string, variantKey: string) {
  const manifest = await readManifest(sessionId)
  const variant = manifest.variants.find((item) => item.key === variantKey)

  if (!variant) {
    throw new Error("ppt_master_variant_missing")
  }

  return {
    session: manifest,
    variant,
  }
}

export async function exportPptMasterSessionVariant(sessionId: string, variantKey: string) {
  const { variant, session } = await getPptMasterSessionVariant(sessionId, variantKey)
  const repoDir = await resolvePptMasterRepoDir()

  await runPythonScript(repoDir, "svg_to_pptx.py", [variant.projectDir, "-s", "final"])

  const exportDir = path.join(variant.projectDir, "exports")
  const exportFiles = (await fs.readdir(exportDir))
    .filter((file) => file.endsWith(".pptx"))
    .sort((left, right) => right.localeCompare(left, "en"))

  const latestFile = exportFiles[0]
  if (!latestFile) {
    throw new Error("ppt_master_export_missing")
  }

  const buffer = await fs.readFile(path.join(exportDir, latestFile))
  const sessionDeckVariant = session.deck?.variants.find((item) => item.key === variant.key)
  const fileName =
    session.deck && sessionDeckVariant
      ? buildPptExportFileName(session.deck, sessionDeckVariant, "pptx")
      : `${toAsciiFileName(session.title)}-${variant.key}.pptx`

  return {
    buffer,
    contentType: CONTENT_TYPE,
    fileName,
    slideCount: variant.slideCount,
    variantName: variant.name,
  }
}

export const __testables__ = {
  getPptMasterPythonCandidates,
  readManifest,
  compactRuntimeText,
  normalizeRuntimeDeckCopy,
  prepareGeneratedSvg,
  postprocessGeneratedSvg,
  buildEmergencyRuntimeSvg,
  shouldFallbackForGeneratedSvg,
  shouldUseDeterministicRuntimeSvg,
  isRecoverableRuntimeSlideFailure,
}
