import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import {
  buildAttachmentContentDisposition,
  fetchMiniMaxArtifactSource,
  getMiniMaxArtifactForUser,
} from "@/lib/platform/minimax-audio"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ artifactId: string }> },
) {
  const currentUser = await getSessionUser(request).catch(() => null)
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  if (!hasFeatureAccess(currentUser, "video_generation")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { artifactId } = await context.params
  const numericArtifactId = Number(artifactId)
  if (!Number.isFinite(numericArtifactId) || numericArtifactId <= 0) {
    return NextResponse.json({ error: "invalid_artifact_id" }, { status: 400 })
  }

  const artifact = await getMiniMaxArtifactForUser(numericArtifactId, currentUser)
  if (!artifact) {
    return NextResponse.json({ error: "artifact_not_found" }, { status: 404 })
  }

  const response = await fetchMiniMaxArtifactSource({ artifact }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "platform_media_artifact_fetch_failed" }, { status: 502 })
  })

  if (response instanceof NextResponse) {
    return response
  }

  const fileName = artifact.title || `platform-artifact-${artifact.id}.bin`
  const headers = new Headers()
  headers.set("Content-Type", artifact.mimeType || response.headers.get("content-type") || "application/octet-stream")
  headers.set("Content-Disposition", buildAttachmentContentDisposition(fileName))
  headers.set("Cache-Control", "private, no-store")

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  })
}
