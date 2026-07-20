import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { serializeWorkflowRunDetail } from "@/lib/workflows/run-detail-serialization"
import { getWorkflowRunDetail } from "@/lib/workflows/store"

export const runtime = "nodejs"

function parseRunId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

/** Returns redacted, immutable-run attempts with deterministic scope ordering. */
export async function GET(
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

    const detail = await getWorkflowRunDetail(numericRunId, currentUser.enterpriseId)
    if (!detail) return NextResponse.json({ error: "workflow_run_not_found" }, { status: 404 })
    const serialized = serializeWorkflowRunDetail(detail) as { attempts?: Array<Record<string, unknown>> }
    const nodeKeyByExecution = new Map(detail.nodeExecutions.map((execution) => [execution.id, execution.nodeKey]))
    const iterationKeyById = new Map((detail.iterations ?? []).map((iteration) => [iteration.id, iteration.iterationKey]))
    const nodeKey = request.nextUrl.searchParams.get("nodeKey")?.trim() || null
    const iterationKey = request.nextUrl.searchParams.get("iterationKey")?.trim() || null
    if (!nodeKey) return NextResponse.json({ error: "invalid_attempts_query" }, { status: 400 })
    const attempts = (serialized.attempts ?? []).map((attempt) => ({
      ...attempt,
      nodeKey: nodeKeyByExecution.get(Number(attempt.nodeExecutionId)) ?? null,
      iterationKey: attempt.iterationId == null ? null : iterationKeyById.get(Number(attempt.iterationId)) ?? null,
    })).filter((attempt) => {
      if (nodeKey && attempt.nodeKey !== nodeKey) return false
      if (iterationKey && attempt.iterationKey !== iterationKey) return false
      return true
    })
    return NextResponse.json({ data: { runId: numericRunId, nodeKey, iterationKey, attempts } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_attempts_failed" },
      { status: 500 },
    )
  }
}
