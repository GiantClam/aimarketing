import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  serializePlatformWorkflowRunStatus,
} from "@/lib/platform/workflow-runner"
import { serializeWorkflowRunDetail } from "@/lib/workflows/run-detail-serialization"
import {
  getWorkflowRunDetail,
  getWorkflowRunStatusDetail,
  type WorkflowRunStatusDetail,
} from "@/lib/workflows/store"

export const runtime = "nodejs"

function parseRunId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function serializeWorkflowNodeExecutionsStatus(
  nodeExecutions: WorkflowRunStatusDetail["nodeExecutions"],
) {
  return nodeExecutions.map((execution) => ({
    ...execution,
    providerId: execution.providerId ?? null,
    modelId: execution.modelId ?? null,
    taskRunId: execution.taskRunId ?? null,
    errorMessage: execution.errorMessage ?? null,
    creditsConsumed: execution.creditsConsumed ?? 0,
    inputPayload: null,
    outputPayload:
      execution.outputPayload && typeof execution.outputPayload === "object"
        ? execution.outputPayload
        : null,
    startedAt: execution.startedAt ? execution.startedAt.toISOString() : null,
    finishedAt: execution.finishedAt ? execution.finishedAt.toISOString() : null,
    createdAt: execution.createdAt ? execution.createdAt.toISOString() : null,
    updatedAt: execution.updatedAt ? execution.updatedAt.toISOString() : null,
  }))
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { runId } = await params
    const numericRunId = parseRunId(runId)
    const mode = request.nextUrl.searchParams.get("mode") === "status" ? "status" : "full"
    if (!numericRunId) {
      return NextResponse.json({ error: "invalid_run_id" }, { status: 400 })
    }

    if (mode === "status") {
      const statusDetail = await getWorkflowRunStatusDetail(numericRunId, currentUser.enterpriseId)
      if (!statusDetail) {
        return NextResponse.json({ error: "workflow_run_not_found" }, { status: 404 })
      }

      return NextResponse.json({
        data: {
          mode,
          run: serializePlatformWorkflowRunStatus(statusDetail.run),
          nodeExecutions: serializeWorkflowNodeExecutionsStatus(statusDetail.nodeExecutions),
          detailPath: `/api/workflows/runs/${numericRunId}`,
          statusPath: `/api/workflows/runs/${numericRunId}?mode=status`,
        },
      })
    }

    const detail = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
    if (!detail) {
      return NextResponse.json({ error: "workflow_run_not_found" }, { status: 404 })
    }

    const serialized = serializeWorkflowRunDetail(detail)
    return NextResponse.json({
      data: {
        ...serialized,
        detailPath: `/api/workflows/runs/${numericRunId}`,
        statusPath: `/api/workflows/runs/${numericRunId}?mode=status`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_run_detail_failed" },
      { status: 500 },
    )
  }
}
