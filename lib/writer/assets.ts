import type { WriterMode, WriterPlatform } from "@/lib/writer/config"

export type WriterAssetId = "cover" | "section-1" | "section-2"

export type WriterAsset = {
  id: WriterAssetId
  label: string
  title: string
  prompt: string
  url: string
  status: "ready" | "loading" | "failed"
  provider: "aiberm" | "gemini" | "loading" | "error"
  error?: string
  storageKey?: string
  contentType?: string
}

const DEFAULT_ASSET_IDS: WriterAssetId[] = ["cover", "section-1", "section-2"]

const PLATFORM_IMAGE_META: Record<
  WriterPlatform,
  {
    label: string
    aspectRatio: string
    style: string
    promptTone: string
  }
> = {
  wechat: {
    label: "微信公众号",
    aspectRatio: "16:9",
    style: "专业、简洁、偏编辑插图或信息图",
    promptTone: "适合深度文章阅读场景，突出专业感和清晰的信息层级",
  },
  xiaohongshu: {
    label: "小红书",
    aspectRatio: "3:4",
    style: "明亮、生活化、封面感强，适合移动端图文笔记",
    promptTone: "适合吸引停留与收藏，画面轻盈，具备社交传播感",
  },
  x: {
    label: "X",
    aspectRatio: "16:9",
    style: "极简、科技感、适合横向社交分享",
    promptTone: "适合国际科技话题传播，视觉简洁，重点突出",
  },
  facebook: {
    label: "Facebook",
    aspectRatio: "16:9",
    style: "温暖、品牌感、适合社区传播",
    promptTone: "适合品牌内容分发与社区讨论，画面自然、可信、易分享",
  },
}

const WRITER_ASSET_PLACEHOLDER_RE = /writer-asset:\/\/(cover|section-1|section-2)/
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

export function getWriterAssetPlan(platform: WriterPlatform, mode: WriterMode = "article"): WriterAssetId[] {
  if (mode === "thread") {
    return ["cover"]
  }

  if (platform === "x" || platform === "facebook") {
    return ["cover", "section-1"]
  }

  return DEFAULT_ASSET_IDS
}

export function articleTitle(markdown: string) {
  return (markdown.split(/\r?\n/).find((line) => line.trim()) || "未命名文章")
    .replace(/^#+\s*/, "")
    .slice(0, 24)
}

function svgDataUrl(title: string, accent: string, ratio: string) {
  const [width, height] = ratio === "3:4" ? [1080, 1440] : [1600, 900]
  const safeTitle = title.replace(/[<>&"]/g, "")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="${width}" height="${height}" rx="40" fill="url(#g)"/><text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.42)}" fill="#F9FAFB" font-size="${ratio === "3:4" ? 64 : 54}" font-weight="700" font-family="Arial">${safeTitle.slice(0, 20)}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function getAccent(platform: WriterPlatform) {
  const accents: Record<WriterPlatform, string> = {
    wechat: "#0EA5E9",
    xiaohongshu: "#FB7185",
    x: "#3B82F6",
    facebook: "#2563EB",
  }
  return accents[platform]
}

function compactText(value: string, fallback: string) {
  return (
    value
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 36) || fallback
  )
}

function normalizeMarkdownImageUrl(rawUrl: string) {
  return rawUrl.trim().replace(/^<|>$/g, "").split(/\s+/)[0] || ""
}

export function hasWriterAssetPlaceholders(markdown: string) {
  return WRITER_ASSET_PLACEHOLDER_RE.test(markdown)
}

export function buildWriterAssetBlueprints(
  markdown: string,
  platform: WriterPlatform,
  mode: WriterMode = "article",
) {
  const meta = PLATFORM_IMAGE_META[platform]
  const title = articleTitle(markdown || meta.label)
  const focus = compactText(markdown, title)
  const assetPlan = new Set(getWriterAssetPlan(platform, mode))

  return [
    {
      id: "cover" as const,
      label: "封面图",
      title,
      prompt: `${meta.label}文章封面插图，主题是“${title}”。画面比例 ${meta.aspectRatio}，风格 ${meta.style}。${meta.promptTone}。不要密集小字，不要复杂拼贴，适合正式发布。`,
    },
    {
      id: "section-1" as const,
      label: "配图 1",
      title: "核心观点",
      prompt: `${meta.label}文章正文配图，围绕“${focus}”表达核心观点或关键洞察。画面比例 ${meta.aspectRatio}，风格 ${meta.style}。构图清晰，适合插入正文中段。`,
    },
    {
      id: "section-2" as const,
      label: "配图 2",
      title: "行动建议",
      prompt: `${meta.label}文章正文配图，围绕“${title}”表达行动建议、方法步骤或结论总结。画面比例 ${meta.aspectRatio}，风格 ${meta.style}。适合放在文章后段作为总结型配图。`,
    },
  ].filter((asset) => assetPlan.has(asset.id))
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

export function resolveWriterAssetMarkdown(
  content: string,
  assets: WriterAsset[],
  platform: WriterPlatform = "wechat",
  mode: WriterMode = "article",
) {
  if (!content.trim()) {
    return ""
  }

  const assetPlan = getWriterAssetPlan(platform, mode)
  const allowedAssetIds = new Set(assetPlan)
  const assetMap = new Map(assets.map((asset) => [asset.id, asset.url]))
  let next = content.replace(/\((writer-asset:\/\/([^)]+))\)/g, (_, __, assetId: WriterAssetId) => {
    return `(${assetMap.get(assetId) || `writer-asset://${assetId}`})`
  })

  next = next.replace(/^\s*!\[[^\]]*\]\(writer-asset:\/\/(cover|section-1|section-2)\)\s*$/gm, (line, assetId: WriterAssetId) =>
    allowedAssetIds.has(assetId) ? line : "",
  )

  if (!/!\[[^\]]*\]\((?!\s*\))/m.test(next)) {
    const assetLines = assetPlan
      .map((assetId) => {
        const asset = assets.find((item) => item.id === assetId)
        if (!asset) return ""
        return `![${asset.label}](${asset.url || `writer-asset://${asset.id}`})`
      })
      .filter(Boolean)

    next = [...assetLines, "", next].filter(Boolean).join("\n")
  }

  return next.replace(/\n{3,}/g, "\n\n").trim()
}

export function extractWriterAssetsFromMarkdown(
  markdown: string,
  platform: WriterPlatform,
  mode: WriterMode = "article",
): WriterAsset[] {
  const blueprints = buildWriterAssetBlueprints(markdown, platform, mode)
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
  platform: WriterPlatform = "wechat",
  mode: WriterMode = "article",
) {
  const assetPlan = getWriterAssetPlan(platform, mode)
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  return assetPlan.map((id) => byId.get(id)).filter(Boolean) as WriterAsset[]
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
