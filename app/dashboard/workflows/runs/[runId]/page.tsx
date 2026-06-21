import { notFound } from "next/navigation"

import { WorkflowRunResultsPage } from "@/components/workflows/workflow-run-results-page"
import { requireServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { resolvePlatformArtifactSourceUrl } from "@/lib/platform/artifact-actions"
import { serializeWorkflowRunDetail } from "@/lib/workflows/run-detail-serialization"
import { getWorkflowRunDetail } from "@/lib/workflows/store"

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
