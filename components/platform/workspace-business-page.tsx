import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkspaceBusinessAgentWorkbench } from "@/components/platform/workspace-business-agent-workbench"
import type { LocalizedBusinessAgentConfig } from "@/lib/platform/business-agents"
import type { LocalizedWorkspaceBusinessEntry, WorkspaceBusinessSlug } from "@/lib/platform/workspace-business"

type BusinessScopedCustomAgentCard = {
  id: number
  name: string
  slug: string
  summary: string
  status: "draft" | "published" | "disabled" | "archived"
  visibility: "private" | "shared"
  executionMode: "direct_agent" | "workflow_backed"
  linkedWorkflowId: number | null
  linkedWorkflowTitle: string | null
  workflowLabels: string[]
  artifactKinds: string[]
}

function getCustomAgentStatusLabel(status: BusinessScopedCustomAgentCard["status"], locale: "zh" | "en") {
  if (locale === "zh") {
    if (status === "published") return "已发布"
    if (status === "disabled") return "已停用"
    if (status === "archived") return "已归档"
    return "草稿"
  }
  if (status === "published") return "Published"
  if (status === "disabled") return "Disabled"
  if (status === "archived") return "Archived"
  return "Draft"
}

function getCustomAgentVisibilityLabel(visibility: BusinessScopedCustomAgentCard["visibility"], locale: "zh" | "en") {
  if (locale === "zh") return visibility === "shared" ? "企业共享" : "仅自己"
  return visibility === "shared" ? "Shared" : "Private"
}

function getCustomAgentExecutionModeLabel(mode: BusinessScopedCustomAgentCard["executionMode"], locale: "zh" | "en") {
  if (locale === "zh") return mode === "workflow_backed" ? "Workflow 驱动" : "直接运行"
  return mode === "workflow_backed" ? "Workflow-backed" : "Direct"
}

export function WorkspaceBusinessPage({
  locale,
  currentSlug,
  entries,
  agents,
  customAgents,
}: {
  locale: "zh" | "en"
  currentSlug: WorkspaceBusinessSlug
  entries: LocalizedWorkspaceBusinessEntry[]
  agents: LocalizedBusinessAgentConfig[]
  customAgents: BusinessScopedCustomAgentCard[]
}) {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-transparent">
      <section className="public-grid-bg mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-3 px-1 py-1 sm:px-1.5 sm:py-2 sm:gap-4">
        {customAgents.length > 0 ? (
          <section className="rounded-[12px] border border-border bg-card/75 p-3 sm:p-4">
            <div className="flex flex-col gap-2 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="dashboard-kicker text-muted-foreground">
                  {locale === "zh" ? "业务已挂载的自定义 Agent" : "Business-bound custom agents"}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {locale === "zh" ? "来自智能体中台的企业 Agent" : "Enterprise agents from the agent platform"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {locale === "zh"
                    ? "这些 Agent 通过 business binding 进入当前业务入口。可继续在中台维护、在 workflow 中复用，或跳转到关联执行骨架。"
                    : "These agents enter the current business view through business bindings. Manage them in the platform, reuse them in workflows, or jump to their linked execution graph."}
                </p>
              </div>
              <Button variant="outline" className="h-9 rounded-[8px]" asChild>
                <Link href="/dashboard/agent-platform">{locale === "zh" ? "打开智能体中台" : "Open agent platform"}</Link>
              </Button>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {customAgents.map((agent) => (
                <article key={agent.id} className="rounded-[10px] border border-border bg-background/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{agent.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{agent.slug}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{getCustomAgentStatusLabel(agent.status, locale)}</Badge>
                      <Badge variant="outline">{getCustomAgentVisibilityLabel(agent.visibility, locale)}</Badge>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{agent.summary}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">{getCustomAgentExecutionModeLabel(agent.executionMode, locale)}</Badge>
                    {agent.workflowLabels.slice(0, 3).map((label) => (
                      <Badge key={label} variant="outline">{label}</Badge>
                    ))}
                    {agent.artifactKinds.slice(0, 3).map((kind) => (
                      <Badge key={kind} variant="outline">{kind}</Badge>
                    ))}
                  </div>

                  {agent.linkedWorkflowId ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      {locale === "zh" ? "执行骨架" : "Execution workflow"}: {agent.linkedWorkflowTitle || `#${agent.linkedWorkflowId}`}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" className="h-8 rounded-[8px] px-3 text-xs" asChild>
                      <Link href={`/dashboard/agent-platform/${agent.id}`}>{locale === "zh" ? "查看 Agent" : "Open agent"}</Link>
                    </Button>
                    {agent.linkedWorkflowId ? (
                      <Button variant="outline" className="h-8 rounded-[8px] px-3 text-xs" asChild>
                        <Link href={`/dashboard/workflows/${agent.linkedWorkflowId}`}>{locale === "zh" ? "打开 Workflow" : "Open workflow"}</Link>
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {agents.length > 0 ? (
          <WorkspaceBusinessAgentWorkbench locale={locale} currentSlug={currentSlug} entries={entries} agents={agents} />
        ) : null}
      </section>
    </div>
  )
}
