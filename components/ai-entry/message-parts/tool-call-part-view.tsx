"use client"

import { useState } from "react"
import { Check, ChevronDown, Loader2, TriangleAlert, Wrench } from "lucide-react"

import type { ToolCallPart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

export function ToolCallPartView({ part, isZh }: { part: ToolCallPart; isZh: boolean }) {
  const [open, setOpen] = useState(false)
  const state = part.state
  const Icon = state === "output-error" ? TriangleAlert : state === "output-available" ? Check : Loader2
  const label = isZh
    ? state === "output-error"
      ? "工具调用失败"
      : state === "output-available"
        ? "工具调用完成"
        : "工具调用中"
    : state === "output-error"
      ? "Tool failed"
      : state === "output-available"
        ? "Tool completed"
        : "Tool running"
  return (
    <div className="rounded-[10px] border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs"
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            state === "output-error" ? "text-destructive" : state === "output-available" ? "text-emerald-500" : "text-primary",
            state === "input-streaming" && "animate-spin",
          )}
        />
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">{part.toolName}</span>
        <span className="text-muted-foreground">{label}</span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">{isZh ? "参数" : "Args"}</div>
          <pre className="overflow-x-auto rounded bg-background/60 p-2">{JSON.stringify(part.args ?? {}, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  )
}
