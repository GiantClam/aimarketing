import { notFound } from "next/navigation"

import { WorkflowRunResultsPage } from "@/components/workflows/workflow-run-results-page"
import { requireServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { resolvePlatformArtifactSourceUrl } from "@/lib/platform/artifact-actions"
import { serializePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { getWorkflowRunDetail } from "@/lib/workflows/store"

function serializeWorkflowRunDetail(detail: Awaited<ReturnType<typeof getWorkflowRunDetail>>) {
  if (!detail) return null

  return {
    run: serializePlatformWorkflowRun(detail.run),
    workflow: {
      ...detail.workflow,
      createdAt: detail.workflow.createdAt instanceof Date ? detail.workflow.createdAt.toISOString() : null,
      updatedAt: detail.workflow.updatedAt instanceof Date ? detail.workflow.updatedAt.toISOString() : null,
      edges: detail.workflow.edges.map((edge) => ({
        ...edge,
        inputName: edge.inputName ?? null,
      })),
    },
    nodeExecutions: detail.nodeExecutions.map((execution) => ({
      ...execution,
      startedAt: execution.startedAt instanceof Date ? execution.startedAt.toISOString() : null,
      finishedAt: execution.finishedAt instanceof Date ? execution.finishedAt.toISOString() : null,
      createdAt: execution.createdAt instanceof Date ? execution.createdAt.toISOString() : null,
      updatedAt: execution.updatedAt instanceof Date ? execution.updatedAt.toISOString() : null,
    })),
    statusPath: `/api/workflows/runs/${detail.run.id}?mode=status`,
  }
}

export default async function WorkflowRunResultsRoutePage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const { runId } = await params
  const numericRunId = Number(runId)
  const currentUser = await requireServerSessionUser(`/dashboard/workflows/runs/${runId}`)

  if (!currentUser.enterpriseId || !Number.isInteger(numericRunId) || numericRunId <= 0) {
    notFound()
  }

  const detail = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
  if (!detail || detail.run.kind !== "workflow") {
    notFound()
  }

  const serializedDetail = serializeWorkflowRunDetail(detail)
  if (!serializedDetail) {
    notFound()
  }

  const firstArtifact = serializedDetail.run.artifacts[0] ?? null
  const firstArtifactSourceUrl = firstArtifact
    ? resolvePlatformArtifactSourceUrl(firstArtifact as unknown as Parameters<typeof resolvePlatformArtifactSourceUrl>[0])
    : null

  return (
    <WorkflowRunResultsPage
      locale={displayLocale}
      detail={{
        ...serializedDetail,
        detailPath: `/api/workflows/runs/${numericRunId}`,
      }}
      firstArtifactSourceUrl={firstArtifactSourceUrl}
    />
  )
}
