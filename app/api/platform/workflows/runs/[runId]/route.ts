import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  buildPlatformWorkflowRunDetailPath,
  getPlatformWorkflowRunDetail,
  serializePlatformWorkflowRun,
} from "@/lib/platform/workflow-runner"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const currentUser = await getSessionUser(request).catch(() => null)
  if (!currentUser) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 })
  }

  if (!currentUser.enterpriseId) {
    return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
  }

  const { runId } = await context.params
  const numericRunId = Number(runId)
  if (!Number.isInteger(numericRunId) || numericRunId <= 0) {
    return NextResponse.json({ error: "invalid_run_id" }, { status: 400 })
  }

  const detail = await getPlatformWorkflowRunDetail({
    runId: numericRunId,
    currentUser,
  })
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      run: serializePlatformWorkflowRun(detail),
      detailPath: buildPlatformWorkflowRunDetailPath(detail.id),
    },
  })
}
