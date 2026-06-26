"use client"

import { LayoutTemplate } from "lucide-react"

import type { ReportPart } from "@/lib/ai-entry/message-parts/types"

export function ReportPartView({ part, isZh }: { part: ReportPart; isZh: boolean }) {
  if (!part.variants.length) return null
  return (
    <div className="rounded-[10px] border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{part.title || (isZh ? "预览方案" : "Preview variants")}</span>
        <span className="text-muted-foreground">{part.variants.length}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {part.variants.map((v) => (
          <li key={v.key} className="rounded-[8px] border border-border bg-background/60 p-2 text-xs">
            <div className="font-medium text-foreground">{v.name || v.key}</div>
            {v.summary ? <div className="mt-0.5 text-muted-foreground/80">{v.summary}</div> : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {isZh ? "选择 variant 后调用 export_ppt_deck 导出成品。" : "Pick a variant, then call export_ppt_deck to export."}
      </div>
    </div>
  )
}
