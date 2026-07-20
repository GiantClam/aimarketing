"use client"

import { useMemo } from "react"
import type { WorkflowBuiltinAgentOption, WorkflowCustomAgentOption } from "@/components/workflows/workflow-agent-options"
import {
  buildWorkflowNodePalette,
  type WorkflowNodeVisual,
} from "@/components/workflows/workflow-node-registry-ui"
import { cn } from "@/lib/utils"
import { Bot } from "lucide-react"
import { workflowNodeRegistry } from "@/lib/workflows/node-definitions/registry"
import type { WorkflowFeatures } from "@/lib/workflows/features"
import type { WorkflowLocale, WorkflowNodeType } from "@/lib/workflows/schema"

type WorkflowNodePaletteProps = {
  className?: string
  locale: WorkflowLocale
  features?: WorkflowFeatures
  builtinAgents: WorkflowBuiltinAgentOption[]
  customAgents: WorkflowCustomAgentOption[]
  onAddNode: (type: WorkflowNodeType) => void
  onAddBuiltinAgent: (builtinAgentId: string) => void
  onAddCustomAgent: (customAgentId: number) => void
}

export function WorkflowNodePalette({
  className,
  locale,
  features,
  customAgents,
  onAddNode,
  onAddCustomAgent,
}: WorkflowNodePaletteProps) {
  const paletteItems = useMemo(() => buildWorkflowNodePalette(workflowNodeRegistry, locale), [locale])
  const copy =
    locale === "zh"
      ? {
          library: "节点库",
          fixedNodes: "基础节点",
          agents: "企业 Agent",
          dragToCanvas: "拖入画布",
          clickToAdd: "点击添加",
          noAgents: "还没有可用的企业 Agent。",
          workflowBacked: "工作流驱动",
          directAgent: "直接执行",
        }
      : {
          library: "Node library",
          fixedNodes: "Core nodes",
          agents: "Enterprise agents",
          dragToCanvas: "Drag to canvas",
          clickToAdd: "Click to add",
          noAgents: "No enterprise agents available yet.",
          workflowBacked: "Workflow-backed",
          directAgent: "Direct",
        }

  const handleDragStart = (event: React.DragEvent<HTMLElement>, type: WorkflowNodeType) => {
    event.dataTransfer.effectAllowed = "copy"
    event.dataTransfer.setData("application/x-workflow-node-type", type)
  }

  return (
    <section
      className={cn("dashboard-panel rounded-[14px] border border-border bg-card/88 p-2", className)}
      data-workflow-node-registry={features?.nodeRegistryV2 === false ? "legacy" : "v2"}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="dashboard-kicker text-muted-foreground">{copy.library}</div>
          <h2 className="mt-1 font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
            {copy.fixedNodes}
          </h2>
        </div>
        <div className="rounded-[4px] border border-primary/30 bg-background/70 px-2 py-1 font-display text-[11px] uppercase tracking-[0.08em] text-foreground">
          V1
        </div>
      </div>

      <div className="mt-2 grid gap-1.5">
        {paletteItems.map((item) => {
          const type = item.type as WorkflowNodeType
          const displayTitle = item.title
          const visual: WorkflowNodeVisual = item.visual
          const NodeIcon = visual.icon

          return (
            <button
              key={type}
              type="button"
              title={`${displayTitle} · ${copy.clickToAdd} · ${copy.dragToCanvas}`}
              draggable
              onClick={() => onAddNode(type)}
              onDragStart={(event) => handleDragStart(event, type)}
              data-agent-add-node={type}
              className={cn(
                "group flex w-full items-center gap-2 rounded-[10px] border border-border/80 bg-background/78 px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background active:cursor-grabbing",
              )}
              aria-label={`${displayTitle} · ${copy.clickToAdd} · ${copy.dragToCanvas}`}
            >
              <div className="flex min-w-0 flex-1 cursor-grab items-center gap-2 overflow-hidden">
                <div className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border", visual.accentClassName)}>
                  <NodeIcon className="size-4" />
                </div>
                <span className="truncate font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">
                  {displayTitle}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="dashboard-kicker text-muted-foreground">{copy.agents}</div>
        <div className="mt-2 grid gap-1.5">
          {customAgents.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border/80 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
              {copy.noAgents}
            </div>
          ) : null}

          {customAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onAddCustomAgent(agent.id)}
              className="group flex w-full items-start gap-2 rounded-[10px] border border-border/80 bg-background/78 px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background"
              aria-label={`${agent.name} · ${copy.clickToAdd}`}
            >
              <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-amber-400/80 bg-amber-100 text-amber-900">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">
                  {agent.name}
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                  {agent.summary}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {agent.executionMode === "workflow_backed" ? copy.workflowBacked : copy.directAgent}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
