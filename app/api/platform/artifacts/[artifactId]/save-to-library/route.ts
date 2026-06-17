import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  assertArtifactEnterpriseAccess,
  inferWorkItemTypeFromArtifact,
  serializePlatformArtifact,
} from "@/lib/platform/artifact-actions"
import {
  getPlatformArtifact,
  listPlatformWorkItemsForEnterprise,
  promotePlatformArtifactToWorkItem,
} from "@/lib/platform/task-run-store"

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
    const existingWorkItem = (await listPlatformWorkItemsForEnterprise(artifact.enterpriseId)).find(
      (item) => item.sourceArtifactId === artifact.id,
    )

    const workItem =
      existingWorkItem ??
      (await promotePlatformArtifactToWorkItem({
        enterpriseId: artifact.enterpriseId,
        ownerUserId: artifact.ownerUserId,
        sourceArtifactId: artifact.id,
        type: inferWorkItemTypeFromArtifact(artifact),
        title: artifact.title,
        summary: artifact.mimeType || artifact.kind,
        metadata: {
          source: "workspace-output-actions",
          savedFrom: "save-to-library",
        },
      }))

    return NextResponse.json({
      data: {
        saved: true,
        artifact: serializePlatformArtifact(artifact),
        workItem: {
          ...workItem,
          createdAt: workItem.createdAt instanceof Date ? workItem.createdAt.toISOString() : null,
          updatedAt: workItem.updatedAt instanceof Date ? workItem.updatedAt.toISOString() : null,
        },
        alreadySaved: Boolean(existingWorkItem),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "save_to_library_failed"
    const status =
      message === "authentication_required" ? 401 : message === "enterprise_context_required" ? 403 : message === "artifact_not_found" ? 404 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
