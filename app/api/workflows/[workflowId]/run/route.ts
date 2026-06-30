import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { listRecentWorkflowTaskRunsForEnterprise } from "@/lib/platform/task-run-store"
import {
  createPlatformWorkflowRun,
  serializePlatformWorkflowRun,
  updatePlatformWorkflowRun,
} from "@/lib/platform/workflow-runner"
import { collectWorkflowRetryNodeKeys, type WorkflowNodeRunStatus } from "@/lib/workflows/execution"
import { findLatestWorkflowRunRecordForWorkflow, resolveWorkflowResumeNodeKey } from "@/lib/workflows/manual-resume"
import {
  createWorkflowNodeExecutionRecords,
  getWorkflowDefinition,
  getWorkflowRunDetail,
  resetWorkflowNodeExecutions,
} from "@/lib/workflows/store"
import { isWorkflowResumeCompatible } from "@/lib/workflows/resume-compatibility"
import { runWorkflowTaskRecoveryPass } from "@/lib/workflows/task-runner"

export const runtime = "nodejs"

function parseWorkflowId(value: string) {
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
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { workflowId } = await params
    const numericWorkflowId = parseWorkflowId(workflowId)
    if (!numericWorkflowId) {
      return NextResponse.json({ error: "invalid_workflow_id" }, { status: 400 })
    }
    const body = (await request.json().catch(() => ({}))) as {
      prompt?: unknown
      sourceAgentId?: unknown
    }
    const requestedPrompt =
      typeof body.prompt === "string" ? body.prompt.trim().slice(0, 8_000) : ""
    const requestedSourceAgentId =
      typeof body.sourceAgentId === "string" ? body.sourceAgentId.trim().slice(0, 160) : ""

    const workflow = await getWorkflowDefinition(numericWorkflowId, currentUser.enterpriseId)
    if (!workflow) {
      return NextResponse.json({ error: "workflow_definition_not_found" }, { status: 404 })
    }

    const latestRunRecord = findLatestWorkflowRunRecordForWorkflow(
      await listRecentWorkflowTaskRunsForEnterprise(currentUser.enterpriseId, 40),
      workflow.id,
    )
    const latestRunPrompt =
      typeof latestRunRecord?.inputPayload?.prompt === "string" ? latestRunRecord.inputPayload.prompt.trim() : ""
    const latestRunCanResume = latestRunPrompt === requestedPrompt
    const latestRunDetail = latestRunRecord ? await getWorkflowRunDetail(latestRunRecord.id, currentUser.enterpriseId) : null
    const latestRunMatchesWorkflow =
      latestRunDetail ? isWorkflowResumeCompatible(workflow, latestRunDetail.workflow) : false
    const latestRunStatus = latestRunDetail?.run.status ?? latestRunRecord?.status ?? null

    if (latestRunStatus === "running" && latestRunRecord && latestRunDetail && latestRunMatchesWorkflow && latestRunCanResume) {
      void runWorkflowTaskRecoveryPass({
        runId: latestRunRecord.id,
        requestOrigin: new URL(request.url).origin,
        waitForCompletion: false,
      }).catch((error) => {
        console.error("workflow.run.active-kick.failed", {
          runId: latestRunRecord.id,
          workflowId: workflow.id,
          message: error instanceof Error ? error.message : String(error),
        })
      })

      return NextResponse.json(
        {
          data: {
            run: serializePlatformWorkflowRun(latestRunDetail.run),
            workflow: latestRunDetail.workflow,
            nodeExecutions: latestRunDetail.nodeExecutions,
            detailPath: `/api/workflows/runs/${latestRunRecord.id}`,
            statusPath: `/api/workflows/runs/${latestRunRecord.id}?mode=status`,
            executionMode: "resume",
          },
        },
        { status: 202 },
      )
    }

    if (latestRunStatus === "failed" && latestRunRecord && latestRunDetail && latestRunMatchesWorkflow && latestRunCanResume) {
      const retryNodeKey = latestRunDetail ? resolveWorkflowResumeNodeKey(latestRunDetail) : null

      if (latestRunDetail && retryNodeKey) {
        const retryMode = "branch" as const
        const rerunNodeKeys = collectWorkflowRetryNodeKeys({
          mode: retryMode,
          nodeKey: retryNodeKey,
          nodes: latestRunDetail.workflow.nodes,
          edges: latestRunDetail.workflow.edges,
          nodeStates: buildLatestWorkflowNodeStatuses(latestRunDetail.nodeExecutions),
        })

        await resetWorkflowNodeExecutions(latestRunRecord.id, rerunNodeKeys)
        await updatePlatformWorkflowRun({
          runId: latestRunRecord.id,
          patch: {
            status: "queued",
            startedAt: null,
            finishedAt: null,
            normalizedResult: {
              ...(latestRunDetail.run.normalizedResult && typeof latestRunDetail.run.normalizedResult === "object"
                ? latestRunDetail.run.normalizedResult
                : {}),
              pendingRetry: {
                mode: retryMode,
                nodeKey: retryNodeKey,
              },
            },
          },
        })

        const refreshed = await getWorkflowRunDetail(latestRunRecord.id, currentUser.enterpriseId)
        if (!refreshed) {
          return NextResponse.json({ error: "workflow_run_not_found" }, { status: 500 })
        }

        void runWorkflowTaskRecoveryPass({
          runId: latestRunRecord.id,
          requestOrigin: new URL(request.url).origin,
          waitForCompletion: false,
        }).catch((error) => {
          console.error("workflow.run.resume-kick.failed", {
            runId: latestRunRecord.id,
            workflowId: workflow.id,
            nodeKey: retryNodeKey,
            message: error instanceof Error ? error.message : String(error),
          })
        })

        return NextResponse.json(
          {
            data: {
              run: serializePlatformWorkflowRun(refreshed.run),
              workflow: refreshed.workflow,
              nodeExecutions: refreshed.nodeExecutions,
              detailPath: `/api/workflows/runs/${latestRunRecord.id}`,
              statusPath: `/api/workflows/runs/${latestRunRecord.id}?mode=status`,
              executionMode: "resume",
              resumedFrom: {
                mode: retryMode,
                nodeKey: retryNodeKey,
                runId: latestRunRecord.id,
              },
            },
          },
          { status: 202 },
        )
      }
    }

    const run = await createPlatformWorkflowRun({
      currentUser,
      slug: workflow.slug,
      action: "execute",
      bindingTarget: workflow.slug,
      inputPayload: {
        workflowId: workflow.id,
        trigger: "manual",
        ...(requestedPrompt ? { prompt: requestedPrompt } : {}),
        ...(requestedSourceAgentId ? { sourceAgentId: requestedSourceAgentId } : {}),
      },
    })

    await createWorkflowNodeExecutionRecords(
      workflow.nodes.map((node) => ({
        runId: run.id,
        workflowId: workflow.id,
        nodeKey: node.nodeKey,
        nodeType: node.type,
        status: "queued",
      })),
    )

    const detail = await getWorkflowRunDetail(run.id, currentUser.enterpriseId)
    if (!detail) {
      return NextResponse.json({ error: "workflow_run_not_found" }, { status: 500 })
    }

    void runWorkflowTaskRecoveryPass({
      runId: run.id,
      requestOrigin: new URL(request.url).origin,
      waitForCompletion: false,
    }).catch((error) => {
      console.error("workflow.run.recovery-kick.failed", {
        runId: run.id,
        workflowId: workflow.id,
        message: error instanceof Error ? error.message : String(error),
      })
    })

    return NextResponse.json(
      {
        data: {
          run: serializePlatformWorkflowRun(detail.run),
          workflow: detail.workflow,
          nodeExecutions: detail.nodeExecutions,
          detailPath: `/api/workflows/runs/${run.id}`,
          statusPath: `/api/workflows/runs/${run.id}?mode=status`,
          executionMode: "fresh",
        },
      },
      { status: 202 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_run_failed" },
      { status: 500 },
    )
  }
}
