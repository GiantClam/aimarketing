"use client"

import { useState } from "react"
import { ChevronDown, ListTree } from "lucide-react"

import type { TaskProgressPart, TaskProgressStep } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

function stepLabel(step: TaskProgressStep, isZh: boolean): string {
  if (step.type === "provider") return isZh ? "模型路由" : "Model routing"
  if (step.type === "knowledge_query") return isZh ? "企业知识检索" : "Enterprise knowledge"
  if (step.type === "conversation_init") return isZh ? "会话就绪" : "Conversation ready"
  if (step.type === "response") return isZh ? "响应完成" : "Response complete"
  if (step.type === "stream_error") return isZh ? "请求失败" : "Request failed"
  if (step.type.startsWith("tool:")) return step.toolName ? `Tool: ${step.toolName}` : "Tool"
  if (step.type.startsWith("artifact:")) return isZh ? "已生成交付物" : "Artifact created"
  if (step.type.startsWith("validation:")) return isZh ? "结果校验" : "Validation"
  return step.type
}

export function TaskProgressPartView({ part, isZh }: { part: TaskProgressPart; isZh: boolean }) {
  const [open, setOpen] = useState(false)
  if (!part.steps.length) return null
  return (
    <div className="rounded-[10px] border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
      >
        <ListTree className="h-3.5 w-3.5" />
        <span>{isZh ? "步骤轨迹" : "Step trace"}</span>
        <span className="ml-auto">{part.steps.length}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-1.5 border-t border-border px-3 py-2 pl-6 text-xs">
          {part.steps.map((step, i) => (
            <div key={`${step.type}-${step.at}-${i}`} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 rounded-full",
                  step.status === "failed"
                    ? "bg-destructive"
                    : step.status === "completed"
                      ? "bg-emerald-500"
                      : step.status === "running"
                        ? "bg-primary"
                        : "bg-muted-foreground",
                )}
              />
              <span>
                {stepLabel(step, isZh)}
                {step.detail ? <span className="ml-1 text-muted-foreground/80">{step.detail}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
