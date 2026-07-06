"use client"

import { ArrowRight, LayoutTemplate } from "lucide-react"

import type { TemplateRecommendationPart } from "@/lib/ai-entry/message-parts/types"

export function TemplateRecommendationPartView({
  part,
  isZh,
}: {
  part: TemplateRecommendationPart
  isZh: boolean
}) {
  if (!part.templates.length) return null

  return (
    <div className="artifact-card artifact-card-wide">
      <div className="artifact-cover artifact-cover-muted">
        <LayoutTemplate className="h-8 w-8 text-primary/80" />
      </div>
      <div className="artifact-meta">
        <div className="artifact-title-text">{isZh ? "推荐模板" : "Recommended templates"}</div>
        <div className="artifact-subtitle">
          {isZh
            ? `${part.templates.length} 个模板可选，回复模板 ID 或名称继续生成`
            : `${part.templates.length} templates available. Reply with a template ID or name to continue.`}
        </div>
      </div>
      <ul className="artifact-variant-list">
        {part.templates.map((template) => {
          const primaryLabel = template.labels.find((label) => label !== template.templateId) || template.templateId
          return (
            <li
              key={template.templateId}
              className="rounded-[8px] border border-border bg-background/60 p-2 text-xs"
            >
              <div className="font-medium text-foreground">{primaryLabel}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">{template.templateId}</div>
            </li>
          )
        })}
      </ul>
      <div className="artifact-note">
        <ArrowRight className="h-3.5 w-3.5" />
        <span>
          {isZh
            ? "确认模板后才会启动可编辑 PPT 预览生成。"
            : "The editable PPT preview starts only after a template is confirmed."}
        </span>
      </div>
    </div>
  )
}
