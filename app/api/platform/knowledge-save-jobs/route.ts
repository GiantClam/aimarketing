import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  getPlatformArtifact,
  listPlatformKnowledgeSaveJobsForEnterprise,
  type PlatformKnowledgeSaveJobStatus,
} from "@/lib/platform/task-run-store"

export const runtime = "nodejs"

function readKnowledgeSaveJobStatus(value: string | null): PlatformKnowledgeSaveJobStatus | null {
  if (value === "queued" || value === "running" || value === "succeeded" || value === "failed" || value === "rejected") {
    return value
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.id) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const limitParam = Number(request.nextUrl.searchParams.get("limit") || "")
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50
    const status = readKnowledgeSaveJobStatus(request.nextUrl.searchParams.get("status"))

    const jobs = await listPlatformKnowledgeSaveJobsForEnterprise(currentUser.enterpriseId, limit, status)
    const items = await Promise.all(
      jobs.map(async (job) => {
        const artifact = await getPlatformArtifact(job.artifactId)
        return {
          ...job,
          createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : null,
          updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : null,
          artifact: artifact
            ? {
                id: artifact.id,
                runId: artifact.runId,
                title: artifact.title,
                mimeType: artifact.mimeType,
                createdAt: artifact.createdAt instanceof Date ? artifact.createdAt.toISOString() : null,
              }
            : null,
        }
      }),
    )

    return NextResponse.json({ data: { items } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_save_job_list_failed"
    const status =
      message === "authentication_required" ? 401 : message === "enterprise_context_required" ? 403 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
