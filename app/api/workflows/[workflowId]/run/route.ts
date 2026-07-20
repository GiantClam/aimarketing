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
import { resolveWorkflowFeatures } from "@/lib/workflows/features"
import {
  createWorkflowRunFromRevision,
  getWorkflowRevisionForRun,
} from "@/lib/workflows/workflow-attempts"
import {
  createWorkflowConfirmationToken,
  isWorkflowRequestId,
  verifyWorkflowConfirmationToken,
} from "@/lib/workflows/iteration-runtime"

export const runtime = "nodejs"

function parseWorkflowId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

type WorkflowBudgetEstimate = {
  taskCount: number
  /** -1 means at least one provider cost is not statically known. */
  maxCredits: number
}

const BILLABLE_NODE_TYPES = new Set([
  "writer",
  "llm_generate",
  "agent_execute",
  "image_generate",
  "video_generate",
  "digital_human",
  "music_generate",
  "voice_synthesis",
  "audio_generate",
  "ppt_generate",
  "knowledge_retrieve",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function workflowDefinitionBody(value: Record<string, unknown>) {
  const nested = asRecord(value.definition)
  return nested && Array.isArray(nested.nodes) ? nested : value
}

function staticCollectionCount(config: Record<string, unknown>) {
  for (const key of ["items", "inputs", "inputItems", "collection", "staticItems"]) {
    if (Array.isArray(config[key])) return config[key].length
  }
  for (const key of ["inputCount", "staticInputCount"]) {
    const value = config[key]
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  }
  return null
}

function maxIterations(config: Record<string, unknown>) {
  const value = config.maxIterations
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? Math.min(value, 100)
    : 20
}

function nodeCreditCost(node: Record<string, unknown>) {
  const config = asRecord(node.config) ?? {}
  for (const key of ["estimatedCredits", "credits", "creditCost"]) {
    const value = config[key]
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  }
  return null
}

/**
 * Derive the confirmation payload from the immutable revision, never from
 * client-provided taskCount/maxCredits.  Dynamic foreach inputs use their
 * configured upper bound; a missing provider cost is represented by -1.
 */
function estimateWorkflowBudget(definition: Record<string, unknown>): WorkflowBudgetEstimate {
  const body = workflowDefinitionBody(definition)
  const nodes = Array.isArray(body.nodes) ? body.nodes.map(asRecord).filter(Boolean) as Record<string, unknown>[] : []
  const byKey = new Map(nodes.map((node) => [typeof node.nodeKey === "string" ? node.nodeKey : "", node]))
  const adjacency = new Map<string, string[]>()
  if (Array.isArray(body.edges)) {
    for (const edgeValue of body.edges) {
      const edge = asRecord(edgeValue)
      const source = edge && typeof edge.sourceNodeKey === "string" ? edge.sourceNodeKey : null
      const target = edge && typeof edge.targetNodeKey === "string" ? edge.targetNodeKey : null
      if (source && target) adjacency.set(source, [...(adjacency.get(source) ?? []), target])
    }
  }
  let taskCount = 0
  let maxCredits = 0
  let unknownCredits = false
  const scoped = new Set<string>()

  const addNodeCost = (node: Record<string, unknown>, multiplier: number) => {
    if (typeof node.type !== "string" || !BILLABLE_NODE_TYPES.has(node.type)) return
    taskCount += multiplier
    const cost = nodeCreditCost(node)
    if (cost === null) unknownCredits = true
    else maxCredits += cost * multiplier
  }

  for (const node of nodes) {
    if (node.type !== "foreach") continue
    const config = asRecord(node.config) ?? {}
    let bodyKeys = Array.isArray(config.bodyNodeKeys)
      ? config.bodyNodeKeys.filter((key): key is string => typeof key === "string")
      : Array.isArray(config.body)
        ? config.body.filter((key): key is string => typeof key === "string")
        : []
    if (bodyKeys.length === 0 && typeof node.nodeKey === "string") {
      const collectKey = typeof config.collectNodeKey === "string" ? config.collectNodeKey : null
      const queue = [...(adjacency.get(node.nodeKey) ?? [])]
      const visited = new Set<string>()
      const discovered: string[] = []
      while (queue.length) {
        const key = queue.shift()!
        if (visited.has(key) || key === collectKey) continue
        visited.add(key)
        discovered.push(key)
        queue.push(...(adjacency.get(key) ?? []))
      }
      bodyKeys = discovered
    }
    const multiplier = staticCollectionCount(config) ?? maxIterations(config)
    for (const key of bodyKeys) {
      const bodyNode = byKey.get(key)
      if (!bodyNode) continue
      scoped.add(key)
      addNodeCost(bodyNode, multiplier)
    }
  }
  for (const node of nodes) {
    if (node.type === "foreach" || node.type === "collect" || node.type === "output" || scoped.has(String(node.nodeKey))) continue
    addNodeCost(node, 1)
  }
  return { taskCount, maxCredits: unknownCredits ? -1 : maxCredits }
}

function revisionNodeSummaries(definition: Record<string, unknown>) {
  const body = workflowDefinitionBody(definition)
  const nodes = Array.isArray(body.nodes) ? body.nodes : []
  return nodes.reduce<Array<{ nodeKey: string; nodeType: string }>>((result, value) => {
    const node = asRecord(value)
    if (typeof node?.nodeKey === "string" && typeof node.type === "string") {
      result.push({ nodeKey: node.nodeKey, nodeType: node.type })
    }
    return result
  }, [])
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
      requestId?: unknown
      iterationsEnabled?: unknown
      revision?: unknown
      confirmationToken?: unknown
      confirmationExpiresAt?: unknown
      taskCount?: unknown
      maxCredits?: unknown
    }
    const requestedPrompt =
      typeof body.prompt === "string" ? body.prompt.trim().slice(0, 8_000) : ""
    const requestedSourceAgentId =
      typeof body.sourceAgentId === "string" ? body.sourceAgentId.trim().slice(0, 160) : ""

    const workflow = await getWorkflowDefinition(numericWorkflowId, currentUser.enterpriseId)
    if (!workflow) {
      return NextResponse.json({ error: "workflow_definition_not_found" }, { status: 404 })
    }

    // M3 runs are explicitly request keyed and snapshot based.  Keep this
    // branch before the legacy "latest matching prompt" lookup so enabling
    // iterations can never resume another request accidentally.
    const workflowFeatures = resolveWorkflowFeatures()
    if (workflowFeatures.iterationsV1) {
      // `iterationsEnabled` is a client capability hint only.  The server
      // flag remains authoritative so a stale client cannot opt into (or
      // bypass) the request-keyed execution path.
      if (body.iterationsEnabled !== undefined && typeof body.iterationsEnabled !== "boolean") {
        return NextResponse.json({ error: "invalid_workflow_iterations_flag" }, { status: 400 })
      }
      const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
      if (!isWorkflowRequestId(requestId)) {
        return NextResponse.json({ error: "workflow_request_id_invalid" }, { status: 400 })
      }

      const revision = Number(body.revision)
      if (!Number.isInteger(revision) || revision < 1) {
        return NextResponse.json({ error: "invalid_workflow_revision" }, { status: 400 })
      }
      const revisionRecord = await getWorkflowRevisionForRun({
        workflowId: workflow.id,
        enterpriseId: currentUser.enterpriseId,
        revision,
      })
      if (!revisionRecord) {
        return NextResponse.json({ error: "workflow_revision_not_found" }, { status: 404 })
      }

      const estimatedBudget = estimateWorkflowBudget(revisionRecord.definition)
      const taskCount = estimatedBudget.taskCount
      const maxCredits = estimatedBudget.maxCredits
      const configuredThreshold = Number(process.env.WORKFLOW_CONFIRMATION_CREDITS_THRESHOLD ?? "100")
      const creditsThreshold = Number.isInteger(configuredThreshold) && configuredThreshold >= 0
        ? configuredThreshold
        : 100
      const confirmationRequired = taskCount > 20 || maxCredits < 0 || maxCredits > creditsThreshold
      let confirmation = "not_required"
      if (confirmationRequired && body.confirmationToken === undefined) {
        const expiresAt = Date.now() + 10 * 60 * 1000
        let confirmationToken: string
        try {
          confirmationToken = createWorkflowConfirmationToken(
            {
              enterpriseId: currentUser.enterpriseId,
              workflowId: workflow.id,
              revision,
              requestId,
              taskCount,
              maxCredits,
              expiresAt,
            },
            process.env.WORKFLOW_CONFIRMATION_SECRET ?? "",
          )
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "workflow_confirmation_secret_invalid" }, { status: 500 })
        }
        return NextResponse.json(
          {
            error: "workflow_budget_confirmation_required",
            details: { taskCount, maxCredits, expiresAt, confirmationToken },
          },
          { status: 409 },
        )
      }
      if (body.confirmationToken !== undefined) {
        const confirmationExpiresAt = Number(body.confirmationExpiresAt)
        if (!Number.isInteger(confirmationExpiresAt) || confirmationExpiresAt <= Date.now()) {
          return NextResponse.json({ error: "invalid_confirmation_token" }, { status: 400 })
        }
        const verification = verifyWorkflowConfirmationToken(
          body.confirmationToken,
          process.env.WORKFLOW_CONFIRMATION_SECRET ?? "",
          {
            enterpriseId: currentUser.enterpriseId,
            workflowId: workflow.id,
            revision,
            requestId,
            taskCount,
            maxCredits,
            expiresAt: confirmationExpiresAt,
          },
        )
        if (!verification.ok) {
          return NextResponse.json({ error: verification.code }, { status: 400 })
        }
        confirmation = "verified"
      }

      const created = await createWorkflowRunFromRevision({
        enterpriseId: currentUser.enterpriseId,
        userId: currentUser.id,
        workflowId: workflow.id,
        revisionId: revisionRecord.id,
        definitionHash: revisionRecord.definitionHash,
        definition: revisionRecord.definition,
        requestId,
        inputPayload: {
          workflowId: workflow.id,
          trigger: "manual",
          requestId,
          revision,
          ...(requestedPrompt ? { prompt: requestedPrompt } : {}),
          ...(requestedSourceAgentId ? { sourceAgentId: requestedSourceAgentId } : {}),
        },
        // Node execution rows are part of the immutable run snapshot.  Do not
        // source them from `workflow.nodes`: that is the mutable current
        // draft, and may have diverged from the historical revision selected
        // above between save and execution.
        nodes: revisionNodeSummaries(revisionRecord.definition),
      })
      const detail = await getWorkflowRunDetail(created.run.id, currentUser.enterpriseId)
      if (!detail) return NextResponse.json({ error: "workflow_run_not_found" }, { status: 500 })

      void runWorkflowTaskRecoveryPass({
        runId: created.run.id,
        requestOrigin: new URL(request.url).origin,
        waitForCompletion: false,
      }).catch((error) => {
        console.error("workflow.run.iteration-recovery-kick.failed", {
          runId: created.run.id,
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
            detailPath: `/api/workflows/runs/${created.run.id}`,
            statusPath: `/api/workflows/runs/${created.run.id}?mode=status`,
            executionMode: created.reused ? "iteration-idempotent" : "iteration",
            runId: created.run.id,
            requestId,
            revision,
            definitionHash: revisionRecord.definitionHash,
            confirmation,
          },
        },
        { status: 202 },
      )
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
