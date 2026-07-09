"use client"

import { ArrowRight, LayoutTemplate } from "lucide-react"

import { PptPreviewReportCard } from "@/components/ai-entry/ppt-preview-report-card"
import type { ReportPart } from "@/lib/ai-entry/message-parts/types"

export function ReportPartView({
  part,
  isZh,
  agentId,
}: {
  part: ReportPart
  isZh: boolean
  agentId?: string | null
}) {
  if (!part.variants.length) return null

  if (part.reportType === "ppt-preview" && part.previewSessionId) {
    return (
      <PptPreviewReportCard
        previewSessionId={part.previewSessionId}
        defaultVariantKey={part.defaultVariantKey ?? part.variants[0]?.key ?? null}
        variantKeys={part.variantKeys?.length ? part.variantKeys : part.variants.map((variant) => variant.key)}
        isZh={isZh}
        agentId={agentId}
      />
    )
  }

  return (
    <div className="artifact-card artifact-card-wide">
      <div className="artifact-cover artifact-cover-muted">
        <LayoutTemplate className="h-8 w-8 text-primary/80" />
      </div>
      <div className="artifact-meta">
        <div className="artifact-title-text">{part.title || (isZh ? "预览方案" : "Preview variants")}</div>
        <div className="artifact-subtitle">
          {isZh ? `${part.variants.length} 个输出方向可选` : `${part.variants.length} variants available`}
        </div>
      </div>
      <ul className="artifact-variant-list">
        {part.variants.map((v) => (
          <li key={v.key} className="rounded-[8px] border border-border bg-background/60 p-2 text-xs">
            <div className="font-medium text-foreground">{v.name || v.key}</div>
            {v.summary ? <div className="mt-0.5 text-muted-foreground/80">{v.summary}</div> : null}
          </li>
        ))}
      </ul>
      <div className="artifact-note">
        <ArrowRight className="h-3.5 w-3.5" />
        <span>{isZh ? "选择 variant 后可继续导出成品。" : "Choose a variant, then continue to export."}</span>
      </div>
    </div>
  )
}
