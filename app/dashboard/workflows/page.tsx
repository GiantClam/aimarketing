import { notFound } from "next/navigation"

import { WorkflowListPage } from "@/components/workflows/workflow-list-page"
import { requireServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listRecentWorkflowTaskRunsForEnterprise } from "@/lib/platform/task-run-store"
import { listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"
import { listWorkflowDefinitionsForEnterprise } from "@/lib/workflows/store"

function getWorkflowIdFromNormalizedResult(value: unknown) {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  return typeof record.workflowId === "number" && record.workflowId > 0 ? record.workflowId : null
}

export default async function DashboardWorkflowsPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await requireServerSessionUser("/dashboard/workflows")
  const enterpriseId = currentUser.enterpriseId

  if (!enterpriseId) {
    notFound()
  }

  const workflows = await listWorkflowDefinitionsForEnterprise(enterpriseId)
  const templates = await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "workflow",
    surface: "workspace",
    enterpriseId,
    currentUser,
  })
  const recentWorkflowRuns = await listRecentWorkflowTaskRunsForEnterprise(enterpriseId, 60)
  const recentRuns = recentWorkflowRuns
    .map((run) => ({
      id: run.id,
      workflowId: getWorkflowIdFromNormalizedResult(run.normalizedResult),
      itemSlug: run.itemSlug,
      status: run.status,
      createdAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : null,
      finishedAt: run.finishedAt instanceof Date ? run.finishedAt.toISOString() : null,
    }))

  const serializedWorkflows = workflows.map((workflow) => ({
    ...workflow,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  }))

  return (
    <WorkflowListPage
      locale={displayLocale}
      initialWorkflows={serializedWorkflows}
      initialTemplates={templates}
      recentRuns={recentRuns}
      currentUserName={currentUser.name}
    />
  )
}
