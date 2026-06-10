import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  assertArtifactEnterpriseAccess,
  serializePlatformArtifact,
} from "@/lib/platform/artifact-actions"
import { enqueuePlatformKnowledgeSaveJob, getPlatformArtifact } from "@/lib/platform/task-run-store"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ artifactId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    const { artifactId } = await context.params
    const numericArtifactId = Number(artifactId)

    if (!Number.isInteger(numericArtifactId) || numericArtifactId <= 0) {
      return NextResponse.json({ error: "invalid_artifact_id" }, { status: 400 })
    }

    const artifact = assertArtifactEnterpriseAccess(currentUser, await getPlatformArtifact(numericArtifactId))
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const targetType =
      typeof body?.targetType === "string" && body.targetType.trim() ? body.targetType.trim() : "knowledge_base"

    const job = await enqueuePlatformKnowledgeSaveJob({
      artifactId: artifact.id,
      enterpriseId: artifact.enterpriseId,
      ownerUserId: artifact.ownerUserId,
      targetType,
      requestPayload: {
        source: "workspace-output-actions",
        artifactTitle: artifact.title,
      },
    })

    return NextResponse.json({
      data: {
        artifact: serializePlatformArtifact(artifact),
        job: {
          ...job,
          createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : null,
          updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : null,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_enqueue_failed"
    const status =
      message === "authentication_required" ? 401 : message === "enterprise_context_required" ? 403 : message === "artifact_not_found" ? 404 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
