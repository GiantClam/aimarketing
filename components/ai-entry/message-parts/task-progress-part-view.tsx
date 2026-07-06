"use client"

import { useState } from "react"
import { Check, ChevronDown, Clock3, ListTree, Loader2, TriangleAlert } from "lucide-react"

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

  const completedCount = part.steps.filter((step) => step.status === "completed").length
  const failedCount = part.steps.filter((step) => step.status === "failed").length
  const runningCount = part.steps.filter((step) => step.status === "running").length
  const waitingCount = part.steps.filter((step) => step.status === "waiting").length
  const summary = failedCount > 0
    ? isZh
      ? `${failedCount} 个步骤失败`
      : `${failedCount} steps failed`
    : runningCount > 0
      ? isZh
        ? `${runningCount} 个步骤进行中`
        : `${runningCount} steps running`
      : waitingCount > 0
        ? isZh
          ? `${waitingCount} 个步骤等待继续`
          : `${waitingCount} steps waiting`
      : isZh
        ? `${completedCount} 个步骤已完成`
        : `${completedCount} steps completed`

  return (
    <div className="process-item">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="process-row"
        aria-expanded={open}
      >
        <span className="process-label">
          <ListTree className="h-3.5 w-3.5" />
          <span>{isZh ? "步骤轨迹" : "Step trace"}</span>
        </span>
        <span className="process-value">{summary}</span>
        <span className="process-trailing">
          {failedCount > 0 ? <TriangleAlert className="h-3.5 w-3.5 text-destructive" /> : null}
          {failedCount === 0 && runningCount > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
          {failedCount === 0 && runningCount === 0 && waitingCount > 0 ? <Clock3 className="h-3.5 w-3.5 text-amber-600" /> : null}
          {failedCount === 0 && runningCount === 0 && waitingCount === 0 ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="process-panel space-y-1.5">
          {part.steps.map((step, i) => (
            <div key={`${step.type}-${step.at}-${i}`} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 rounded-full",
                  step.status === "failed"
                    ? "bg-destructive"
                    : step.status === "completed"
                      ? "bg-emerald-500"
                      : step.status === "waiting"
                        ? "bg-amber-500"
                      : step.status === "running"
                        ? "bg-primary"
                        : "bg-muted-foreground",
                )}
              />
              <span className="text-[12px] text-muted-foreground">
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
