import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getWorkflowRunDetail } from "@/lib/workflows/store"
import { requestRunCancellation } from "@/lib/workflows/workflow-attempts"

export const runtime = "nodejs"

function parseRunId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    if (!currentUser.enterpriseId) return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })

    const { runId } = await params
    const numericRunId = parseRunId(runId)
    if (!numericRunId) return NextResponse.json({ error: "invalid_run_id" }, { status: 400 })

    // Resolve through the tenant-scoped workflow query first.  This prevents
    // leaking whether a run exists in another enterprise.
    const detail = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
    if (!detail) return NextResponse.json({ error: "workflow_run_not_found" }, { status: 404 })

    const cancellation = await requestRunCancellation(numericRunId)
    if (!cancellation) return NextResponse.json({ error: "workflow_run_not_found" }, { status: 404 })

    const terminal = detail.run.status === "succeeded" || detail.run.status === "failed" || detail.run.status === "cancelled"
    const status = terminal ? detail.run.status : cancellation.alreadyRequested ? "cancel_requested" : "cancel_requested"
    return NextResponse.json(
      {
        data: {
          runId: numericRunId,
          status,
          alreadyRequested: cancellation.alreadyRequested,
          cancelledIterationCount: cancellation.cancelledIterationCount,
          cancelRequestedAttemptCount: cancellation.cancelRequestedAttemptCount,
          providerCancelRequestedCount: cancellation.providerCancelRequestedCount ?? 0,
          providerCancelNotSupportedCount: cancellation.providerCancelNotSupportedCount ?? 0,
          detailPath: `/api/workflows/runs/${numericRunId}`,
          statusPath: `/api/workflows/runs/${numericRunId}?mode=status`,
        },
      },
      { status: cancellation.alreadyRequested || terminal ? 200 : 202 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_cancel_failed" },
      { status: 500 },
    )
  }
}
