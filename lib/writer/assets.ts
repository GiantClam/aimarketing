import { WRITER_PLATFORM_CONFIG, type WriterPlatform } from "@/lib/writer/config"

export type WriterAsset = {
  id: "cover" | "section-1" | "section-2"
  label: string
  title: string
  prompt: string
  dataUrl: string
  status: "ready" | "loading"
  provider: "openrouter" | "loading"
  error?: string
}

const DEFAULT_ASSET_IDS: WriterAsset["id"][] = ["cover", "section-1", "section-2"]

export function articleTitle(markdown: string) {
  return (markdown.split(/\r?\n/).find((line) => line.trim()) || "未命名文章").replace(/^#+\s*/, "").slice(0, 24)
}

export function svgDataUrl(title: string, accent: string, ratio: string) {
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

export function buildWriterAssetBlueprints(markdown: string, platform: WriterPlatform) {
  const config = WRITER_PLATFORM_CONFIG[platform]
  const title = articleTitle(markdown || config.shortLabel)
  const focus =
    markdown
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line && !line.startsWith("![")) || config.shortLabel

  return [
    {
      id: "cover" as const,
      label: "封面图",
      title,
      prompt: `${config.shortLabel}文章封面，主题“${title}”，比例${config.imageAspectRatio}，风格${config.imageStyle}，适合社交媒体发布，画面简洁，中文标题清晰，留出文字排版空间`,
    },
    {
      id: "section-1" as const,
      label: "配图 1",
      title: "核心观点",
      prompt: `${config.shortLabel}文章配图，围绕“${focus}”表现核心观点，比例${config.imageAspectRatio}，风格${config.imageStyle}，适合信息解释和重点强调`,
    },
    {
      id: "section-2" as const,
      label: "配图 2",
      title: "行动建议",
      prompt: `${config.shortLabel}文章配图，围绕“${title}”表现行动建议或落地步骤，比例${config.imageAspectRatio}，风格${config.imageStyle}，适合结尾总结`,
    },
  ]
}

export function buildPendingWriterAssets(markdown: string, platform: WriterPlatform): WriterAsset[] {
  return buildWriterAssetBlueprints(markdown, platform).map((asset) => ({
    ...asset,
    dataUrl: "",
    status: "loading",
    provider: "loading",
  }))
}

export function resolveWriterAssetMarkdown(content: string, assets: WriterAsset[]) {
  if (!content.trim()) {
    return ""
  }

  const assetMap = new Map(assets.map((asset) => [asset.id, asset.dataUrl]))
  let next = content.replace(/\((writer-asset:\/\/([^)]+))\)/g, (_, __, assetId: WriterAsset["id"]) => {
    return `(${assetMap.get(assetId) ?? ""})`
  })

  if (!/!\[[^\]]*\]\((?!\s*\))/m.test(next)) {
    next = [
      `![${assets[0]?.label ?? "封面图"}](${assets[0]?.dataUrl ?? ""})`,
      "",
      next,
      "",
      `![${assets[1]?.label ?? "配图 1"}](${assets[1]?.dataUrl ?? ""})`,
      "",
      `![${assets[2]?.label ?? "配图 2"}](${assets[2]?.dataUrl ?? ""})`,
    ].join("\n")
  }

  return next
}

export function ensureWriterAssetOrder(assets: WriterAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  return DEFAULT_ASSET_IDS.map((id) => byId.get(id)).filter(Boolean) as WriterAsset[]
}
