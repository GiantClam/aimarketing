"use client"

import { useState } from "react"
import { Check, ChevronDown, Code2, Loader2, TriangleAlert, Wrench } from "lucide-react"

import type { ToolCallPart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

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
  const output = part.output ?? null
  const outputText = output === null ? "" : formatJson(output)
  const summary = isZh
    ? `${part.toolName} ${state === "output-error" ? "失败" : state === "output-available" ? "完成" : "运行中"}`
    : `${part.toolName} ${state === "output-error" ? "failed" : state === "output-available" ? "completed" : "running"}`

  return (
    <div className="process-item">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="process-row transition-colors hover:bg-muted/20"
      >
        <span className="process-label">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{isZh ? "工具调用" : "Tool call"}</span>
        </span>
        <span className="process-value">{summary}</span>
        <span className="process-trailing">
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              state === "output-error" ? "text-destructive" : state === "output-available" ? "text-emerald-600" : "text-primary",
              state === "input-streaming" && "animate-spin",
            )}
          />
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="process-panel text-[11px] text-muted-foreground">
          <div className="grid gap-3">
            <section className="rounded-[10px] border border-border bg-background/80 p-2.5">
              <div className="mb-1.5 flex items-center gap-2 font-medium text-foreground">
                <Code2 className="h-3.5 w-3.5 text-primary" />
                <span>{isZh ? "参数" : "Args"}</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-[8px] bg-muted/40 p-2 text-[11px] leading-6 text-foreground">
                {formatJson(part.args ?? {})}
              </pre>
            </section>
            {outputText ? (
              <section className="rounded-[10px] border border-border bg-background/80 p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2 font-medium text-foreground">
                  <span>{isZh ? "结果" : "Output"}</span>
                  <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
                </div>
                <pre className={cn("overflow-x-auto whitespace-pre-wrap rounded-[8px] p-2 text-[11px] leading-6", state === "output-error" ? "bg-destructive/5 text-destructive" : "bg-muted/40 text-foreground")}>
                  {outputText}
                </pre>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
