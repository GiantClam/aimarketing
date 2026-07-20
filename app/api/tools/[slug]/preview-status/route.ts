import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getLeadToolPptPreviewJobStatus, LeadToolRuntimeError } from "@/lib/lead-tools/runtime"
import { syncLeadToolPptPreviewJobs } from "@/lib/platform/task-run-sync"

type ToolRouteContext = {
  params: Promise<{ slug: string }>
}

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: NextRequest, context: ToolRouteContext) {
  const { slug } = await context.params

  try {
    const body = await request.json() as { jobId?: unknown; input?: unknown }
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : ""
    if (!jobId || !body.input || typeof body.input !== "object") {
      return NextResponse.json({ error: "jobId and input are required" }, { status: 400 })
    }

    const user = await getSessionUser(request).catch(() => null)
    // The browser and workflow runtime both poll this endpoint. Keep the local
    // job record fresh even when the scheduled platform-task sync has not run.
    // This is especially important for long-running PPT jobs after a page is
    // closed or when the local process is the only active orchestrator.
    await syncLeadToolPptPreviewJobs({ limit: 25 })
    const result = await getLeadToolPptPreviewJobStatus(slug, jobId, body.input, user)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof LeadToolRuntimeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Lead tool preview status failed:", error)
    return NextResponse.json({ error: "Failed to read tool preview status" }, { status: 500 })
  }
}
