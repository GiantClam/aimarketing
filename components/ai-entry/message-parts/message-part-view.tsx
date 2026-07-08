"use client"

import type { ComponentType, ReactNode } from "react"

import type { MessagePart, SourcePart } from "@/lib/ai-entry/message-parts/types"

import { ArtifactPartView } from "./artifact-part-view"
import { ReasoningPartView } from "./reasoning-part-view"
import { ReportPartView } from "./report-part-view"
import { SourcesPartView } from "./sources-part-view"
import { TaskProgressPartView } from "./task-progress-part-view"
import { TaskRunPartView } from "./task-run-part-view"
import { TemplateRecommendationPartView } from "./template-recommendation-part-view"
import { ToolCallPartView } from "./tool-call-part-view"
import { ValidationPartView } from "./validation-part-view"

function UnknownPartView({ part }: { part: MessagePart }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
      {`unknown part: ${part.type}`}
    </div>
  )
}

type RendererProps<T extends MessagePart> = { part: T; isZh: boolean }
type Renderer = ComponentType<RendererProps<any>>

export const PART_RENDERERS: Partial<Record<MessagePart["type"], Renderer>> = {
  reasoning: ReasoningPartView as Renderer,
  "tool-call": ToolCallPartView as Renderer,
  artifact: ArtifactPartView as Renderer,
  report: ReportPartView as Renderer,
  "template-recommendation": TemplateRecommendationPartView as Renderer,
  validation: ValidationPartView as Renderer,
  "task-progress": TaskProgressPartView as Renderer,
  "task-run": TaskRunPartView as Renderer,
}

export function MessagePartView({ part, isZh }: { part: MessagePart; isZh: boolean }) {
  const Renderer = PART_RENDERERS[part.type]
  if (Renderer) {
    return <Renderer part={part} isZh={isZh} />
  }

  switch (part.type) {
    case "text":
      return null // phase 1 正文由 message.content 承载
    case "source":
      return null // 由 SourcesPartView 统一渲染（见 MessagePartViewList 聚合）
    case "workflow-status":
      return null // phase 1.5
    default:
      return <UnknownPartView part={part} />
  }
}

/**
 * 聚合渲染：把连续的 source part 合并成一张 SourcesPartView；其余逐段渲染。
 * 跳过 text（正文由 content 承载）。
 */
export function MessagePartViewList({
  parts,
  isZh,
  className,
}: {
  parts: MessagePart[]
  isZh: boolean
  className?: string
}) {
  const items: ReactNode[] = []
  let bucket: SourcePart[] = []
  const flush = () => {
    if (bucket.length) {
      items.push(<SourcesPartView key={`sources-${items.length}`} parts={bucket} isZh={isZh} />)
      bucket = []
    }
  }
  for (const part of parts) {
    if (part.type === "source") {
      bucket.push(part)
      continue
    }
    flush()
    items.push(<MessagePartView key={`${part.type}-${part.id}`} part={part} isZh={isZh} />)
  }
  flush()
  return <div className={className ?? "mt-3 space-y-3"}>{items}</div>
}
