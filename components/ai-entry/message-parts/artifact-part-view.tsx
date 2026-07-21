"use client"

import { useEffect, useState } from "react"
import { Download, Eye, LibraryBig, Package } from "lucide-react"

import { PptPreviewReportCard } from "@/components/ai-entry/ppt-preview-report-card"
import type { ArtifactPart } from "@/lib/ai-entry/message-parts/types"

type ArtifactPreviewContext = {
  previewSessionId: string
  defaultVariantKey?: string | null
  variantKeys?: string[]
}

type ArtifactDetailResponse = {
  data?: {
    sourceUrl?: string | null
    previewContext?: ArtifactPreviewContext | null
  }
}

function buildPptOnlinePreviewUrl(sourceUrl: string | null | undefined) {
  const normalizedSourceUrl = sourceUrl?.trim() || ""
  if (!normalizedSourceUrl) return null

  try {
    const parsed = new URL(normalizedSourceUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(parsed.toString())}`
  } catch {
    return null
  }
}

function kindLabel(part: ArtifactPart, isZh: boolean): string {
  if (part.artifactType === "html") return isZh ? "HTML 交付物" : "HTML deliverable"
  if (part.artifactType === "pptx") return isZh ? "PPT 交付物" : "PPT deliverable"
  if (part.artifactType === "image") return isZh ? "图像交付物" : "Image deliverable"
  return isZh ? "交付文件" : "Deliverable"
}

function extensionLabel(part: ArtifactPart) {
  const source = part.fileName || part.title || ""
  const match = source.match(/\.([a-z0-9]+)$/i)
  if (match?.[1]) return match[1].toUpperCase()
  if (part.artifactType === "pptx") return "PPTX"
  if (part.artifactType === "html") return "HTML"
  if (part.artifactType === "image") return "IMAGE"
  return "FILE"
}

export function ArtifactPartView({
  part,
  isZh,
  agentId,
}: {
  part: ArtifactPart
  isZh: boolean
  agentId?: string | null
}) {
  const [previewContext, setPreviewContext] = useState<ArtifactPreviewContext | null>(null)
  const [pptOnlinePreviewUrl, setPptOnlinePreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPreviewContext() {
      if (!part.artifactId || part.artifactType !== "pptx") {
        setPreviewContext(null)
        setPptOnlinePreviewUrl(null)
        return
      }

      try {
        const response = await fetch(`/api/platform/artifacts/${part.artifactId}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })
        const data = (await response.json().catch(() => ({}))) as ArtifactDetailResponse
        if (!cancelled && response.ok) {
          if (data.data?.previewContext?.previewSessionId) {
            setPreviewContext(data.data.previewContext)
          }
          setPptOnlinePreviewUrl(buildPptOnlinePreviewUrl(data.data?.sourceUrl))
        }
      } catch {
        if (!cancelled) {
          setPreviewContext(null)
          setPptOnlinePreviewUrl(null)
        }
      }
    }

    void loadPreviewContext()
    return () => {
      cancelled = true
    }
  }, [part.artifactId, part.artifactType])

  if (previewContext?.previewSessionId) {
    return (
      <PptPreviewReportCard
        previewSessionId={previewContext.previewSessionId}
        defaultVariantKey={previewContext.defaultVariantKey ?? previewContext.variantKeys?.[0] ?? null}
        variantKeys={previewContext.variantKeys}
        isZh={isZh}
        agentId={agentId}
      />
    )
  }

  return (
    <div className="artifact-card">
      <div className="artifact-cover">
        <Package className="h-7 w-7 text-primary/80" />
        <span className="artifact-cover-ext">{extensionLabel(part)}</span>
      </div>
      <div className="artifact-meta">
        <div className="artifact-eyebrow">{kindLabel(part, isZh)}</div>
        <div className="artifact-title-text">{part.title || part.fileName || (isZh ? "生成产物" : "Generated artifact")}</div>
        <div className="artifact-subtitle">{part.fileName || (isZh ? "可预览 / 下载 / 进入作品库" : "Ready to preview, download, or open in works")}</div>
        <div className="artifact-card-actions">
          {(part.artifactType === "pptx" ? pptOnlinePreviewUrl : part.previewUrl) ? (
            <a
              className="artifact-action"
              href={part.artifactType === "pptx" ? pptOnlinePreviewUrl || undefined : part.previewUrl || undefined}
              target="_blank"
              rel="noreferrer"
            >
              <Eye className="h-3.5 w-3.5" />
              {isZh ? "预览" : "Preview"}
            </a>
          ) : null}
          {part.downloadUrl ? (
            <a className="artifact-action" href={part.downloadUrl} target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" />
              {isZh ? "下载" : "Download"}
            </a>
          ) : null}
          {part.workHref ? (
            <a className="artifact-action" href={part.workHref}>
              <LibraryBig className="h-3.5 w-3.5" />
              {isZh ? "作品库" : "Works"}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
