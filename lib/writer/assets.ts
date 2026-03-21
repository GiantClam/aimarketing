import type { WriterMode, WriterPlatform } from "@/lib/writer/config"

export type WriterAssetId = string

export type WriterAsset = {
  id: WriterAssetId
  label: string
  title: string
  prompt: string
  url: string
  status: "ready" | "loading" | "failed"
  provider: "aiberm" | "gemini" | "openrouter" | "loading" | "error"
  error?: string
  storageKey?: string
  contentType?: string
}

type WriterAssetRole = "cover" | "inline"

type WriterAssetBlueprint = {
  id: WriterAssetId
  label: string
  title: string
  prompt: string
  role: WriterAssetRole
  summary: string
  insertionLine: number
}

type WriterSection = {
  heading: string
  body: string
  summary: string
  insertionLine: number
  score: number
}

type WriterArticleAnalysis = {
  title: string
  summary: string
  wordCount: number
  titleLineIndex: number
  sections: WriterSection[]
  visualDirection: string
  explicitSlotCount: number
}

const WRITER_MAX_ARTICLE_IMAGES = 4

const PLATFORM_IMAGE_META: Record<
  WriterPlatform,
  {
    label: string
    aspectRatio: string
    style: string
    promptTone: string
    minImages: number
    maxImages: number
  }
> = {
  wechat: {
    label: "WeChat Official Account",
    aspectRatio: "16:9",
    style: "professional, polished, editorial",
    promptTone: "Optimized for long-form article reading with trustworthy visual hierarchy and clean whitespace.",
    minImages: 2,
    maxImages: 4,
  },
  xiaohongshu: {
    label: "Xiaohongshu",
    aspectRatio: "3:4",
    style: "bright, lifestyle-driven, highly saveable",
    promptTone: "Optimized for mobile-first swiping with stronger scene clarity, emotional appeal, and visual punch.",
    minImages: 3,
    maxImages: 6,
  },
  weibo: {
    label: "Weibo",
    aspectRatio: "16:9",
    style: "high-contrast, topical, easy to scan",
    promptTone: "Optimized for fast social consumption and quick message delivery.",
    minImages: 1,
    maxImages: 2,
  },
  douyin: {
    label: "Douyin",
    aspectRatio: "9:16",
    style: "vertical, dynamic, hook-first",
    promptTone: "Optimized for short-video cover usage with immediate visual attention.",
    minImages: 1,
    maxImages: 1,
  },
  x: {
    label: "X",
    aspectRatio: "16:9",
    style: "minimal, sharp, modern, tech-forward",
    promptTone: "Optimized for horizontal social sharing and global readability.",
    minImages: 1,
    maxImages: 3,
  },
  linkedin: {
    label: "LinkedIn",
    aspectRatio: "16:9",
    style: "professional, clean, brand-safe",
    promptTone: "Optimized for professional feeds with credibility and restraint.",
    minImages: 1,
    maxImages: 3,
  },
  instagram: {
    label: "Instagram",
    aspectRatio: "4:5",
    style: "visual-first, elevated, composition-led",
    promptTone: "Optimized for feed and carousel reading with stronger aesthetic presence.",
    minImages: 1,
    maxImages: 5,
  },
  tiktok: {
    label: "TikTok",
    aspectRatio: "9:16",
    style: "vertical, kinetic, high-energy",
    promptTone: "Optimized for short-video cover use with fast visual payoff.",
    minImages: 1,
    maxImages: 1,
  },
  facebook: {
    label: "Facebook",
    aspectRatio: "16:9",
    style: "warm, narrative, brand-friendly",
    promptTone: "Optimized for community storytelling and approachable brand communication.",
    minImages: 1,
    maxImages: 4,
  },
  generic: {
    label: "Generic editorial",
    aspectRatio: "16:9",
    style: "clean, editorial, versatile",
    promptTone: "Optimized for general article and document usage without looking like a social template.",
    minImages: 1,
    maxImages: 2,
  },
}

const WRITER_ASSET_PLACEHOLDER_RE = /writer-asset:\/\/([a-z0-9-]+)/i
const WRITER_PLACEHOLDER_LINE_RE =
  /^\s*!\[[^\]]*\]\(writer-asset:\/\/([a-z0-9-]+)(?:\s+["'][^"']*["'])?\)\s*$/gim
const WRITER_MANAGED_BLOCK_RE =
  /<!--\s*writer-asset-slot:start:([a-z0-9-]+)\s*-->\s*\r?\n\s*!\[([^\]]*)\]\(([^)]+)\)\s*\r?\n\s*<!--\s*writer-asset-slot:end:\1\s*-->/gim
const WRITER_EMPTY_MANAGED_BLOCK_RE =
  /<!--\s*writer-asset-slot:start:([a-z0-9-]+)\s*-->\s*\r?\n\s*<!--\s*writer-asset-slot:end:\1\s*-->/gim
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
const LEGACY_WRITER_IMAGE_LINE_RE =
  /^\s*!\[(?:Cover|Inline Image \d+|Section Image \d+|Core Insight|Action Step|Article image)\]\(([^)]+)\)\s*$/gim

function articleTitle(markdown: string) {
  return (markdown.split(/\r?\n/).find((line) => line.trim()) || "Untitled Draft").replace(/^#+\s*/, "").slice(0, 64)
}

function svgDataUrl(title: string, accent: string, ratio: string) {
  const [width, height] =
    ratio === "3:4" ? [1080, 1440] : ratio === "4:5" ? [1200, 1500] : ratio === "9:16" ? [1080, 1920] : [1600, 900]
  const safeTitle = title.replace(/[<>&"]/g, "")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="${width}" height="${height}" rx="40" fill="url(#g)"/><text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.42)}" fill="#F9FAFB" font-size="${ratio === "9:16" ? 72 : ratio === "3:4" || ratio === "4:5" ? 64 : 54}" font-weight="700" font-family="Arial">${safeTitle.slice(0, 20)}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function getAccent(platform: WriterPlatform) {
  const accents: Record<WriterPlatform, string> = {
    wechat: "#0EA5E9",
    xiaohongshu: "#FB7185",
    weibo: "#F97316",
    douyin: "#06B6D4",
    x: "#3B82F6",
    linkedin: "#2563EB",
    instagram: "#EC4899",
    tiktok: "#14B8A6",
    facebook: "#2563EB",
    generic: "#64748B",
  }
  return accents[platform]
}

function compactText(value: string, fallback: string, maxLength = 72) {
  const normalized = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return fallback
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}...`
}

function normalizeMarkdownImageUrl(rawUrl: string) {
  return rawUrl.trim().replace(/^<|>$/g, "").split(/\s+/)[0] || ""
}

function stripManagedWriterAssetBlocks(markdown: string) {
  return markdown
    .replace(WRITER_MANAGED_BLOCK_RE, "")
    .replace(WRITER_EMPTY_MANAGED_BLOCK_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function stripWriterPlaceholderLines(markdown: string) {
  return markdown.replace(WRITER_PLACEHOLDER_LINE_RE, "").replace(/\n{3,}/g, "\n\n").trim()
}

function stripLegacyWriterImageLines(markdown: string) {
  return markdown.replace(LEGACY_WRITER_IMAGE_LINE_RE, "").replace(/\n{3,}/g, "\n\n").trim()
}

function stripMarkdownImages(markdown: string) {
  return markdown.replace(MARKDOWN_IMAGE_RE, "").replace(/\n{3,}/g, "\n\n").trim()
}

function normalizeAssetIdOrder(id: string) {
  if (id === "cover") return 0
  const inlineMatch = /^inline-(\d+)$/u.exec(id)
  if (inlineMatch) {
    return 100 + Number.parseInt(inlineMatch[1], 10)
  }
  return 1_000
}

function countApproxWords(text: string) {
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const nonCjkText = text.replace(/[\u4e00-\u9fff]/g, " ")
  const latinWords = nonCjkText.split(/\s+/).filter(Boolean).length
  return latinWords + Math.ceil(cjkCount / 2)
}

function buildNormalizedKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function inferVisualDirection(markdown: string, platform: WriterPlatform) {
  const lower = markdown.toLowerCase()
  const directions: string[] = []

  if (/(?:ai|agent|automation|saas|software|data|workflow|crm|dashboard|api|模型|智能体|自动化|数据|工作流)/iu.test(lower)) {
    directions.push("clean editorial technology aesthetic with credible modern details")
  }
  if (/(?:trend|report|research|benchmark|forecast|framework|method|step|guide|playbook|趋势|报告|研究|框架|方法|步骤|指南)/iu.test(lower)) {
    directions.push("insight-led editorial visuals with report-like clarity")
  }
  if (/(?:case study|customer|founder|team|community|story|案例|客户|团队|品牌故事|社区)/iu.test(lower)) {
    directions.push("human-centered narrative scenes with brand-safe realism")
  }
  if (/(?:luxury|premium|brand|campaign|launch|fashion|高端|品牌|活动|发布|审美)/iu.test(lower)) {
    directions.push("polished campaign-level art direction with stronger mood control")
  }
  if (platform === "xiaohongshu" || platform === "instagram") {
    directions.push("strong mobile-first composition with a more visually arresting focal subject")
  }
  if (platform === "wechat" || platform === "linkedin") {
    directions.push("restrained editorial composition that looks informed rather than promotional")
  }

  return directions.length > 0
    ? directions.filter((value, index) => directions.indexOf(value) === index).join("; ")
    : "editorial visual storytelling that matches the article tone"
}

function buildWriterAssetPlanningBase(markdown: string) {
  return stripMarkdownImages(stripLegacyWriterImageLines(stripWriterPlaceholderLines(stripManagedWriterAssetBlocks(markdown))))
}

function buildWriterAssetInsertionBase(markdown: string) {
  return stripLegacyWriterImageLines(stripWriterPlaceholderLines(stripManagedWriterAssetBlocks(markdown)))
}

function extractExplicitSlotCount(markdown: string) {
  const managedCount = [...markdown.matchAll(/<!--\s*writer-asset-slot:start:([a-z0-9-]+)\s*-->/gim)].length
  const placeholderCount = [...markdown.matchAll(/writer-asset:\/\/([a-z0-9-]+)/gim)].length
  return Math.max(managedCount, placeholderCount)
}

function analyzeWriterMarkdown(markdown: string, platform: WriterPlatform): WriterArticleAnalysis {
  const baseMarkdown = buildWriterAssetPlanningBase(markdown)
  const lines = baseMarkdown.split(/\r?\n/)
  const titleLineIndex = lines.findIndex((line) => Boolean(line.trim()))
  const title = articleTitle(baseMarkdown || PLATFORM_IMAGE_META[platform].label)
  const sections: WriterSection[] = []

  let currentHeading = ""
  let currentLineIndex = -1
  let currentLines: string[] = []
  const introLines: string[] = []
  let encounteredSection = false

  const flushSection = () => {
    const body = currentLines.join("\n").trim()
    const summary = compactText(body, currentHeading || title, 140)
    const score = Math.min(240, countApproxWords(body)) + (currentHeading ? 24 : 0)
    if (summary && body) {
      sections.push({
        heading: currentHeading,
        body,
        summary,
        insertionLine: currentLineIndex >= 0 ? currentLineIndex : Math.max(titleLineIndex + 1, 0),
        score,
      })
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.trim()
    if (!line) {
      if (encounteredSection) {
        currentLines.push("")
      } else {
        introLines.push("")
      }
      continue
    }

    if (/^#\s+/u.test(line)) {
      if (!encounteredSection) {
        introLines.push(line)
      } else {
        currentLines.push(line)
      }
      continue
    }

    const headingMatch = /^(##|###)\s+(.+)$/u.exec(line)
    if (headingMatch) {
      if (encounteredSection) {
        flushSection()
      }
      encounteredSection = true
      currentHeading = headingMatch[2].trim()
      currentLineIndex = index
      currentLines = []
      continue
    }

    if (encounteredSection) {
      currentLines.push(rawLine)
    } else {
      introLines.push(rawLine)
    }
  }

  if (encounteredSection) {
    flushSection()
  }

  if (sections.length === 0) {
    const blocks = baseMarkdown
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block && !/^#\s+/u.test(block))

    for (let index = 0; index < blocks.length; index += 1) {
      const body = blocks[index]
      const firstLine = body.split(/\r?\n/)[0]?.trim() || ""
      const lineIndex = lines.findIndex((line) => line.includes(firstLine))
      const summary = compactText(body, `${title} key point ${index + 1}`, 140)
      sections.push({
        heading: `Key point ${index + 1}`,
        body,
        summary,
        insertionLine: lineIndex >= 0 ? lineIndex : Math.max(titleLineIndex + 1, 0),
        score: Math.min(220, countApproxWords(body)) + Math.max(0, 18 - index * 4),
      })
    }
  }

  const introSummary = compactText(introLines.join("\n"), title, 180)
  const bodySummary = compactText(
    [introSummary, ...sections.map((section) => section.summary)].filter(Boolean).join(" "),
    title,
    220,
  )

  return {
    title,
    summary: bodySummary,
    wordCount: countApproxWords(baseMarkdown),
    titleLineIndex,
    sections,
    visualDirection: inferVisualDirection(baseMarkdown, platform),
    explicitSlotCount: extractExplicitSlotCount(markdown),
  }
}

function chooseWriterImageCount(
  analysis: WriterArticleAnalysis,
  platform: WriterPlatform,
  mode: WriterMode,
) {
  const meta = PLATFORM_IMAGE_META[platform]
  if (mode === "thread" || meta.maxImages === 1) {
    return 1
  }

  let desired = 1

  if (analysis.wordCount >= 1_800) {
    desired += 2
  } else if (analysis.wordCount >= 900) {
    desired += 1
  }

  if (analysis.sections.length >= 3) {
    desired += 1
  }

  if (platform === "xiaohongshu" && analysis.wordCount >= 450) {
    desired += 1
  }

  if (platform === "generic" && analysis.wordCount < 500) {
    desired = 1
  }

  desired = Math.max(meta.minImages, Math.min(meta.maxImages, desired, WRITER_MAX_ARTICLE_IMAGES))

  if (analysis.explicitSlotCount > 0) {
    desired = Math.min(meta.maxImages, WRITER_MAX_ARTICLE_IMAGES, Math.max(desired, analysis.explicitSlotCount))
  }

  return Math.max(1, Math.min(WRITER_MAX_ARTICLE_IMAGES, desired))
}

function selectDistinctSections(sections: WriterSection[], count: number) {
  if (count <= 0) return []

  const sorted = [...sections].sort((left, right) => right.score - left.score)
  const selected: WriterSection[] = []
  const seen = new Set<string>()

  for (const section of sorted) {
    const key = buildNormalizedKey(`${section.heading} ${section.summary}`)
    if (!key || seen.has(key)) continue
    seen.add(key)
    selected.push(section)
    if (selected.length >= count) break
  }

  return selected.sort((left, right) => left.insertionLine - right.insertionLine)
}

function buildSlotPrompt(
  slot: Omit<WriterAssetBlueprint, "prompt">,
  analysis: WriterArticleAnalysis,
  platform: WriterPlatform,
  allSlots: Array<Omit<WriterAssetBlueprint, "prompt">>,
) {
  const meta = PLATFORM_IMAGE_META[platform]
  const otherSlots = allSlots.filter((candidate) => candidate.id !== slot.id)
  const otherSlotBriefs = otherSlots
    .map((candidate) => `${candidate.label}: ${candidate.summary}`)
    .join("; ")

  const roleInstruction =
    slot.role === "cover"
      ? "Create a hero cover image that captures the full article theme and makes the opening feel publication-ready."
      : "Create an inline editorial image that supports this specific section rather than repeating the cover."

  const compositionInstruction =
    slot.role === "cover"
      ? "Use a strong primary focal point, clean hierarchy, and leave enough whitespace for article layout without rendering text."
      : "Use a tighter composition tied to the section idea, with a clearly different scene, camera angle, or visual metaphor from the other images."

  const sectionInstruction =
    slot.role === "cover"
      ? `Article theme: ${analysis.title}. Summary: ${analysis.summary}.`
      : `Section focus: ${slot.title}. Section summary: ${slot.summary}.`

  const uniquenessInstruction = otherSlotBriefs
    ? `Distinctiveness requirement: this slot must be visually different from the other planned images. Do not reuse the same primary scene, subject arrangement, palette emphasis, or camera framing. Other slots: ${otherSlotBriefs}.`
    : "Distinctiveness requirement: make the image specific and non-generic."

  return [
    `${meta.label} ${slot.role === "cover" ? "cover" : "inline"} editorial image.`,
    roleInstruction,
    sectionInstruction,
    `Visual style: ${meta.style}. ${meta.promptTone}`,
    `Visual direction inferred from the article: ${analysis.visualDirection}.`,
    compositionInstruction,
    `Aspect ratio ${meta.aspectRatio}.`,
    uniquenessInstruction,
    "Do not render text, logos, UI screenshots, watermarks, or infographic labels unless the article explicitly requires a product interface concept.",
  ].join(" ")
}

export function getWriterAssetPlan(
  platform: WriterPlatform,
  mode: WriterMode = "article",
  markdown = "",
): WriterAssetId[] {
  return buildWriterAssetBlueprints(markdown, platform, mode).map((asset) => asset.id)
}

export function hasWriterAssetPlaceholders(markdown: string) {
  return WRITER_ASSET_PLACEHOLDER_RE.test(markdown)
}

export function buildWriterAssetBlueprints(
  markdown: string,
  platform: WriterPlatform,
  mode: WriterMode = "article",
) {
  const analysis = analyzeWriterMarkdown(markdown, platform)
  const totalImageCount = chooseWriterImageCount(analysis, platform, mode)
  const inlineSlotCount = Math.max(0, totalImageCount - 1)
  const selectedSections = selectDistinctSections(analysis.sections, inlineSlotCount)
  const coverInsertionLine = analysis.titleLineIndex >= 0 ? analysis.titleLineIndex + 1 : 0

  const slots: Array<Omit<WriterAssetBlueprint, "prompt">> = [
    {
      id: "cover",
      label: "Cover",
      title: analysis.title,
      role: "cover",
      summary: analysis.summary,
      insertionLine: coverInsertionLine,
    },
    ...selectedSections.map((section, index) => ({
      id: `inline-${index + 1}`,
      label: `Inline Image ${index + 1}`,
      title: section.heading || `Key Point ${index + 1}`,
      role: "inline" as const,
      summary: section.summary,
      insertionLine: section.insertionLine,
    })),
  ]

  return slots.map((slot) => ({
    ...slot,
    prompt: buildSlotPrompt(slot, analysis, platform, slots),
  }))
}

export function buildPendingWriterAssets(
  markdown: string,
  platform: WriterPlatform,
  mode: WriterMode = "article",
): WriterAsset[] {
  return buildWriterAssetBlueprints(markdown, platform, mode).map((asset) => ({
    ...asset,
    url: "",
    status: "loading",
    provider: "loading",
  }))
}

export function markWriterAssetsFailed(assets: WriterAsset[], error: string) {
  return assets.map((asset) => ({
    ...asset,
    status: "failed" as const,
    provider: "error" as const,
    error,
  }))
}

function buildManagedAssetBlock(asset: Pick<WriterAsset, "id" | "label" | "url">) {
  const src = asset.url || `writer-asset://${asset.id}`
  return [`<!-- writer-asset-slot:start:${asset.id} -->`, `![${asset.label}](${src})`, `<!-- writer-asset-slot:end:${asset.id} -->`].join(
    "\n",
  )
}

function insertManagedAssetBlocks(markdown: string, assets: WriterAsset[], platform: WriterPlatform, mode: WriterMode) {
  const baseMarkdown = buildWriterAssetInsertionBase(markdown)
  const blueprints = buildWriterAssetBlueprints(baseMarkdown, platform, mode)
  const lines = baseMarkdown ? baseMarkdown.split(/\r?\n/) : []
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const insertions = new Map<number, string[]>()

  for (const blueprint of blueprints) {
    const asset = assetById.get(blueprint.id)
    if (!asset) continue
    const insertionLine = Math.max(0, Math.min(lines.length, blueprint.insertionLine))
    const currentBlocks = insertions.get(insertionLine) || []
    currentBlocks.push(buildManagedAssetBlock(asset))
    insertions.set(insertionLine, currentBlocks)
  }

  const orderedInsertionLines = [...insertions.keys()].sort((left, right) => right - left)
  for (const insertionLine of orderedInsertionLines) {
    const blocks = insertions.get(insertionLine) || []
    lines.splice(insertionLine, 0, "", ...blocks, "")
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function resolveWriterAssetMarkdown(
  content: string,
  assets: WriterAsset[],
  platform: WriterPlatform = "wechat",
  mode: WriterMode = "article",
) {
  if (!content.trim()) {
    return ""
  }

  const cleanContent = insertManagedAssetBlocks(content, assets, platform, mode)
  if (!cleanContent) {
    return content.trim()
  }

  return cleanContent
}

type ManagedWriterAssetBlock = {
  id: string
  label: string
  url: string
}

function extractManagedWriterAssetBlocks(markdown: string): ManagedWriterAssetBlock[] {
  const managedBlocks = [...markdown.matchAll(WRITER_MANAGED_BLOCK_RE)].map((match) => ({
    id: match[1] || "",
    label: match[2] || "",
    url: (() => {
      const normalizedUrl = normalizeMarkdownImageUrl(match[3] || "")
      return normalizedUrl.startsWith("writer-asset://") ? "" : normalizedUrl
    })(),
  }))

  const emptyBlocks = [...markdown.matchAll(WRITER_EMPTY_MANAGED_BLOCK_RE)].map((match) => ({
    id: match[1] || "",
    label: "",
    url: "",
  }))

  return [...managedBlocks, ...emptyBlocks]
}

export function extractWriterAssetsFromMarkdown(
  markdown: string,
  platform: WriterPlatform,
  mode: WriterMode = "article",
): WriterAsset[] {
  const planningMarkdown = buildWriterAssetPlanningBase(markdown)
  const blueprints = buildWriterAssetBlueprints(planningMarkdown, platform, mode)
  const managedBlocks = extractManagedWriterAssetBlocks(markdown)
  const managedById = new Map(managedBlocks.map((asset) => [asset.id, asset]))

  if (managedBlocks.length > 0) {
    return blueprints.map((asset) => {
      const match = managedById.get(asset.id)
      return {
        ...asset,
        url: match?.url || "",
        status: match?.url ? "ready" : "loading",
        provider: match?.url ? ("gemini" as const) : ("loading" as const),
        error: match?.url ? undefined : "writer_asset_pending",
      }
    })
  }

  const urls = [...markdown.matchAll(MARKDOWN_IMAGE_RE)]
    .map((match) => normalizeMarkdownImageUrl(match[2] || ""))
    .filter((url) => Boolean(url) && !url.startsWith("writer-asset://") && !url.startsWith("data:image"))
    .slice(0, blueprints.length)

  return blueprints.map((asset, index) => ({
    ...asset,
    url: urls[index] || "",
    status: urls[index] ? "ready" : "failed",
    provider: urls[index] ? ("gemini" as const) : ("error" as const),
    error: urls[index] ? undefined : "writer_asset_missing",
  }))
}

export function ensureWriterAssetOrder(
  assets: WriterAsset[],
  _platform: WriterPlatform = "wechat",
  _mode: WriterMode = "article",
) {
  return [...assets].sort((left, right) => normalizeAssetIdOrder(left.id) - normalizeAssetIdOrder(right.id))
}

export function buildFallbackWriterAssets(
  markdown: string,
  platform: WriterPlatform,
  mode: WriterMode = "article",
) {
  return buildWriterAssetBlueprints(markdown, platform, mode).map((asset) => ({
    ...asset,
    url: svgDataUrl(asset.title, getAccent(platform), PLATFORM_IMAGE_META[platform].aspectRatio),
    status: "failed" as const,
    provider: "error" as const,
    error: "image_generation_failed",
  }))
}
