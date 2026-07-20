import { NextRequest, NextResponse } from "next/server"

import { runWorkflowTaskRecoveryPass } from "@/lib/workflows/task-runner"

export const runtime = "nodejs"
export const maxDuration = 600

const RUNNER_SECRET = process.env.WORKFLOW_TASK_RUNNER_SECRET || process.env.CRON_SECRET || ""

function authorizeRequest(request: NextRequest) {
  if (!RUNNER_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 500, error: "workflow_task_runner_secret_missing" } as const
    }
    return { ok: true } as const
  }

  if (request.headers.get("authorization") === `Bearer ${RUNNER_SECRET}`) {
    return { ok: true } as const
  }

  return { ok: false, status: 401, error: "unauthorized" } as const
}

function parseLimit(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("limit")
  const value = Number.parseInt(raw || "", 10)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.max(1, Math.min(20, value))
}

async function handleRunnerRequest(request: NextRequest) {
  const auth = authorizeRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const result = await runWorkflowTaskRecoveryPass({
      limit: parseLimit(request),
      requestOrigin: new URL(request.url).origin,
      waitForCompletion: true,
    })

    return NextResponse.json({
      data: result,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_task_runner_failed" },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  return handleRunnerRequest(request)
}

export async function POST(request: NextRequest) {
  return handleRunnerRequest(request)
}
