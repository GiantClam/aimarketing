"use client"

import type { ReactNode } from "react"

import type { MessagePart, SourcePart } from "@/lib/ai-entry/message-parts/types"

import { ArtifactPartView } from "./artifact-part-view"
import { ReasoningPartView } from "./reasoning-part-view"
import { ReportPartView } from "./report-part-view"
import { SourcesPartView } from "./sources-part-view"
import { TaskProgressPartView } from "./task-progress-part-view"
import { ToolCallPartView } from "./tool-call-part-view"
import { ValidationPartView } from "./validation-part-view"

function UnknownPartView({ part }: { part: MessagePart }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border p-3 text-xs text-muted-foreground">
      {`unknown part: ${part.type}`}
    </div>
  )
}

export function MessagePartView({ part, isZh }: { part: MessagePart; isZh: boolean }) {
  switch (part.type) {
    case "text":
      return null // phase 1 正文由 message.content 承载
    case "reasoning":
      return <ReasoningPartView part={part} />
    case "tool-call":
      return <ToolCallPartView part={part} isZh={isZh} />
    case "source":
      return null // 由 SourcesPartView 统一渲染（见 MessagePartViewList 聚合）
    case "artifact":
      return <ArtifactPartView part={part} isZh={isZh} />
    case "report":
      return <ReportPartView part={part} isZh={isZh} />
    case "validation":
      return <ValidationPartView part={part} isZh={isZh} />
    case "workflow-status":
      return null // phase 1.5
    case "task-progress":
      return <TaskProgressPartView part={part} isZh={isZh} />
    default:
      return <UnknownPartView part={part} />
  }
}

/**
 * 聚合渲染：把连续的 source part 合并成一张 SourcesPartView；其余逐段渲染。
 * 跳过 text（正文由 content 承载）。
 */
export function MessagePartViewList({ parts, isZh }: { parts: MessagePart[]; isZh: boolean }) {
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
  return <div className="mt-3 space-y-3">{items}</div>
}
