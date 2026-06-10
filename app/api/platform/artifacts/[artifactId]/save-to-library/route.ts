import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  assertArtifactEnterpriseAccess,
  serializePlatformArtifact,
} from "@/lib/platform/artifact-actions"
import { getPlatformArtifact } from "@/lib/platform/task-run-store"

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
    return NextResponse.json({
      data: {
        saved: true,
        artifact: serializePlatformArtifact(artifact),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "save_to_library_failed"
    const status =
      message === "authentication_required" ? 401 : message === "enterprise_context_required" ? 403 : message === "artifact_not_found" ? 404 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
