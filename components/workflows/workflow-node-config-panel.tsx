"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type WorkflowNodeConfigPanelProps = {
  className?: string
  locale: "zh" | "en"
  workflowTitle: string
  workflowDescription: string | null
  workflowStatus: "draft" | "live" | "archived"
  onWorkflowMetaChange: (patch: {
    title?: string
    description?: string | null
    status?: "draft" | "live" | "archived"
  }) => void
}

export function WorkflowNodeConfigPanel({
  className,
  locale,
  workflowTitle,
  workflowDescription,
  workflowStatus,
  onWorkflowMetaChange,
}: WorkflowNodeConfigPanelProps) {
  const copy =
    locale === "zh"
      ? {
          workflow: "工作流设置",
          workflowTitle: "工作流标题",
          workflowDescription: "工作流说明",
          workflowStatus: "状态",
          inputHint: "这里只保留工作流级基础信息。节点内容请直接在画布中的节点卡片内编辑。",
        }
      : {
          workflow: "Workflow settings",
          workflowTitle: "Workflow title",
          workflowDescription: "Workflow description",
          workflowStatus: "Status",
          inputHint: "Only workflow-level metadata stays here. Edit node content directly inside the canvas cards.",
        }

  return (
    <aside className={cn("dashboard-panel rounded-[12px] border border-border bg-card/85 p-2.5", className)}>
      <div className="space-y-3">
        <div className="dashboard-kicker text-muted-foreground">{copy.workflow}</div>
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
          {copy.workflow}
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">{copy.inputHint}</p>
      </div>

      <div className="mt-4 space-y-3">
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.workflowTitle}</span>
          <Input
            value={workflowTitle}
            onChange={(event) => onWorkflowMetaChange({ title: event.target.value })}
            className="h-11 rounded-[8px]"
          />
        </label>

        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.workflowDescription}</span>
          <Textarea
            value={workflowDescription || ""}
            onChange={(event) => onWorkflowMetaChange({ description: event.target.value })}
            className="min-h-28 rounded-[8px]"
          />
        </label>

        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.workflowStatus}</span>
          <select
            value={workflowStatus}
            onChange={(event) => onWorkflowMetaChange({ status: event.target.value as "draft" | "live" | "archived" })}
            className="h-11 rounded-[8px] border border-border bg-background px-3 text-sm"
          >
            <option value="draft">draft</option>
            <option value="live">live</option>
            <option value="archived">archived</option>
          </select>
        </label>
      </div>
    </aside>
  )
}
