import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  assertArtifactEnterpriseAccess,
  inferWorkItemTypeFromArtifact,
  serializePlatformArtifact,
} from "@/lib/platform/artifact-actions"
import { createPlatformWorkItem, getPlatformArtifact } from "@/lib/platform/task-run-store"

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
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : artifact.title
    const summary = typeof body?.summary === "string" && body.summary.trim() ? body.summary.trim() : null

    const workItem = await createPlatformWorkItem({
      sourceArtifactId: artifact.id,
      enterpriseId: artifact.enterpriseId,
      ownerUserId: artifact.ownerUserId,
      type: inferWorkItemTypeFromArtifact(artifact),
      title,
      summary,
      metadata: {
        artifactId: artifact.id,
        artifactTitle: artifact.title,
      },
    })

    return NextResponse.json({
      data: {
        artifact: serializePlatformArtifact(artifact),
        workItem: {
          ...workItem,
          createdAt: workItem.createdAt instanceof Date ? workItem.createdAt.toISOString() : null,
          updatedAt: workItem.updatedAt instanceof Date ? workItem.updatedAt.toISOString() : null,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "promote_to_work_failed"
    const status =
      message === "authentication_required" ? 401 : message === "enterprise_context_required" ? 403 : message === "artifact_not_found" ? 404 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
