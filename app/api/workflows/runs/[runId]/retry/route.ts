import { after as nextAfter, NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { serializePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { collectWorkflowRetryNodeKeys, type WorkflowNodeRunStatus } from "@/lib/workflows/execution"
import {
  claimWorkflowRunForRetry,
  getWorkflowRunDetail,
} from "@/lib/workflows/store"
import { runWorkflowTaskRecoveryPass } from "@/lib/workflows/task-runner"
import { resolveWorkflowFeatures } from "@/lib/workflows/features"
import {
  getLatestWorkflowAttemptForIteration,
  getWorkflowIterationForRun,
} from "@/lib/workflows/workflow-attempts"

export const runtime = "nodejs"
export const maxDuration = 600

function scheduleWorkflowRecovery(input: {
  runId: number
  requestOrigin: string
  workflowId: number
  mode: string
  nodeKey: string
}) {
  const recovery = async () => {
    try {
      await runWorkflowTaskRecoveryPass({
        runId: input.runId,
        requestOrigin: input.requestOrigin,
        waitForCompletion: true,
      })
    } catch (error) {
      console.error("workflow.retry.recovery.failed", {
        runId: input.runId,
        workflowId: input.workflowId,
        mode: input.mode,
        nodeKey: input.nodeKey,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (typeof nextAfter === "function") nextAfter(recovery)
  else void recovery()
}

type RetryRequest = {
  mode: "node" | "branch" | "iteration"
  nodeKey: string
  iterationKey?: string
  iterationOnly?: boolean
}

function parseRunId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function buildLatestWorkflowNodeStatuses(
  nodeExecutions: NonNullable<Awaited<ReturnType<typeof getWorkflowRunDetail>>>["nodeExecutions"],
) {
  const latestStatuses: Record<string, { status: WorkflowNodeRunStatus }> = {}

  for (const execution of nodeExecutions) {
    latestStatuses[execution.nodeKey] = {
      status: execution.status as WorkflowNodeRunStatus,
    }
  }

  return latestStatuses
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

    const body = (await request.json().catch(() => ({}))) as Partial<RetryRequest>
    const iterationOnly = body.iterationOnly === true || body.mode === "iteration"
    if (
      (body.mode !== "node" && body.mode !== "branch" && body.mode !== "iteration") ||
      typeof body.nodeKey !== "string" ||
      !body.nodeKey.trim() ||
      (body.iterationOnly !== undefined && typeof body.iterationOnly !== "boolean")
    ) {
      return NextResponse.json({ error: "invalid_retry_request" }, { status: 400 })
    }
    const nodeKey = body.nodeKey.trim()
    const retryMode: "node" | "branch" = body.mode === "branch" ? "branch" : "node"

    if (iterationOnly) {
      let iterationsEnabled = false
      try {
        iterationsEnabled = resolveWorkflowFeatures().iterationsV1
      } catch {
        return NextResponse.json({ error: "workflow_confirmation_secret_invalid" }, { status: 500 })
      }
      if (!iterationsEnabled) {
        return NextResponse.json({ error: "workflow_feature_disabled" }, { status: 409 })
      }
      if (typeof body.iterationKey !== "string" || !body.iterationKey.trim()) {
        return NextResponse.json({ error: "invalid_retry_request" }, { status: 400 })
      }
    }

    const detail = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
    if (!detail) {
      return NextResponse.json({ error: "workflow_run_not_found" }, { status: 404 })
    }

    let iterationKey: string | null = null
    let nextAttemptNumber: number | null = null
    if (iterationOnly) {
      iterationKey = body.iterationKey!.trim()
      const iteration = await getWorkflowIterationForRun({
        runId: numericRunId,
        scopeNodeKey: nodeKey,
        iterationKey,
      })
      if (!iteration || (iteration.status !== "failed" && iteration.status !== "cancelled")) {
        return NextResponse.json({ error: "iteration_not_retryable" }, { status: 409 })
      }
      const latestAttempt = await getLatestWorkflowAttemptForIteration({ iterationId: iteration.id })
      if (latestAttempt && ["queued", "submitting", "running", "cancel_requested"].includes(latestAttempt.status)) {
        return NextResponse.json({ error: "iteration_retry_in_progress" }, { status: 409 })
      }
      nextAttemptNumber = Math.max(2, (latestAttempt?.attemptNumber ?? 1) + 1)
    }

    // The existing DAG executor reruns a node/branch.  An iteration-only
    // retry carries its scope in pendingRetry; M3 runtime consumes that
    // metadata and appends a new attempt without invalidating other items.
    const rerunNodeKeys = collectWorkflowRetryNodeKeys({
      mode: retryMode,
      nodeKey,
      nodes: detail.workflow.nodes,
      edges: detail.workflow.edges,
      nodeStates: buildLatestWorkflowNodeStatuses(detail.nodeExecutions),
    })

    const retryNormalizedResult = {
      ...(detail.run.normalizedResult && typeof detail.run.normalizedResult === "object" ? detail.run.normalizedResult : {}),
      pendingRetry: {
        mode: iterationOnly ? "iteration" : body.mode,
        nodeKey,
        ...(iterationOnly ? { iterationOnly: true } : {}),
        ...(iterationKey ? { iterationKey } : {}),
        ...(nextAttemptNumber ? { attemptNumber: nextAttemptNumber } : {}),
      },
    }
    let claimed = await claimWorkflowRunForRetry({
      runId: numericRunId,
      nodeKeys: rerunNodeKeys,
      allowSucceeded: iterationOnly,
      normalizedResult: retryNormalizedResult,
    })
    // The detail endpoint derives a terminal status from node executions while
    // the durable task-run row may still be committing its final status. Give
    // iteration-only retries a short settling window instead of surfacing a
    // transient transition conflict to the user.
    if (!claimed && iterationOnly) {
      for (const delayMs of [250, 500, 750]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        claimed = await claimWorkflowRunForRetry({
          runId: numericRunId,
          nodeKeys: rerunNodeKeys,
          allowSucceeded: true,
          normalizedResult: retryNormalizedResult,
        })
        if (claimed) break
      }
    }
    if (!claimed) {
      return NextResponse.json({ error: "workflow_retry_transition_conflict" }, { status: 409 })
    }

    const refreshed = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
    if (!refreshed) {
      return NextResponse.json({ error: "workflow_run_not_found" }, { status: 500 })
    }

    scheduleWorkflowRecovery({
      runId: numericRunId,
      requestOrigin: new URL(request.url).origin,
      workflowId: detail.workflow.id,
      mode: body.mode,
      nodeKey,
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
