import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { serializePlatformWorkflowRun, updatePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { collectWorkflowBranchNodeKeys } from "@/lib/workflows/execution"
import {
  getWorkflowRunDetail,
  resetWorkflowNodeExecutions,
} from "@/lib/workflows/store"
import { runWorkflowTaskRecoveryPass } from "@/lib/workflows/task-runner"

export const runtime = "nodejs"

type RetryRequest = {
  mode: "node" | "branch"
  nodeKey: string
}

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
    if (!currentUser) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { runId } = await params
    const numericRunId = parseRunId(runId)
    if (!numericRunId) {
      return NextResponse.json({ error: "invalid_run_id" }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as RetryRequest
    if ((body.mode !== "node" && body.mode !== "branch") || typeof body.nodeKey !== "string" || !body.nodeKey.trim()) {
      return NextResponse.json({ error: "invalid_retry_request" }, { status: 400 })
    }

    const detail = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
    if (!detail) {
      return NextResponse.json({ error: "workflow_run_not_found" }, { status: 404 })
    }

    const rerunNodeKeys =
      body.mode === "node"
        ? [body.nodeKey.trim()]
        : collectWorkflowBranchNodeKeys({
            nodeKey: body.nodeKey.trim(),
            nodes: detail.workflow.nodes,
            edges: detail.workflow.edges,
          })

    await resetWorkflowNodeExecutions(numericRunId, rerunNodeKeys)
    await updatePlatformWorkflowRun({
      runId: numericRunId,
      patch: {
        status: "queued",
        startedAt: null,
        finishedAt: null,
        normalizedResult: {
          ...(detail.run.normalizedResult && typeof detail.run.normalizedResult === "object" ? detail.run.normalizedResult : {}),
          pendingRetry: {
            mode: body.mode,
            nodeKey: body.nodeKey.trim(),
          },
        },
      },
    })

    const refreshed = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
    if (!refreshed) {
      return NextResponse.json({ error: "workflow_run_not_found" }, { status: 500 })
    }

    void runWorkflowTaskRecoveryPass({
      runId: numericRunId,
      requestOrigin: new URL(request.url).origin,
      waitForCompletion: false,
    }).catch((error) => {
      console.error("workflow.retry.recovery-kick.failed", {
        runId: numericRunId,
        workflowId: detail.workflow.id,
        mode: body.mode,
        nodeKey: body.nodeKey.trim(),
        message: error instanceof Error ? error.message : String(error),
      })
    })

    return NextResponse.json({
      data: {
        run: serializePlatformWorkflowRun(refreshed.run),
        workflow: refreshed.workflow,
        nodeExecutions: refreshed.nodeExecutions,
        detailPath: `/api/workflows/runs/${numericRunId}`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_retry_failed" },
      { status: 500 },
    )
  }
}
