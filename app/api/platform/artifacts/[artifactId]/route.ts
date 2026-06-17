import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { assertArtifactEnterpriseAccess } from "@/lib/platform/artifact-actions"
import { deletePlatformArtifactPermanently, getPlatformArtifact } from "@/lib/platform/task-run-store"
import { deleteR2Object } from "@/lib/r2"

export const runtime = "nodejs"

export async function DELETE(
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
    const result = await deletePlatformArtifactPermanently(
      artifact.id,
      artifact.enterpriseId,
      artifact.storageKey
        ? async (storageKey) => {
            try {
              return await deleteR2Object(storageKey)
            } catch {
              return false
            }
          }
        : undefined,
    )

    if (!result) {
      return NextResponse.json({ error: "artifact_not_found" }, { status: 404 })
    }

    return NextResponse.json({
      data: result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "delete_artifact_failed"
    const status =
      message === "authentication_required"
        ? 401
        : message === "enterprise_context_required"
          ? 403
          : message === "artifact_not_found"
            ? 404
            : 500

    return NextResponse.json({ error: message }, { status })
  }
}
