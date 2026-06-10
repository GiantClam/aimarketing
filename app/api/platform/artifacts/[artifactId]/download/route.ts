import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  assertArtifactEnterpriseAccess,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import { buildAttachmentContentDisposition } from "@/lib/platform/minimax-audio"
import { getPlatformArtifact } from "@/lib/platform/task-run-store"

export const runtime = "nodejs"

export async function GET(
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
    const sourceUrl = resolvePlatformArtifactSourceUrl(artifact)
    if (!sourceUrl) {
      return NextResponse.json({ error: "artifact_source_unavailable" }, { status: 404 })
    }

    const response = await fetch(sourceUrl, {
      cache: "no-store",
    })
    if (!response.ok) {
      return NextResponse.json({ error: "platform_artifact_download_failed" }, { status: 502 })
    }

    const forceDownload = new URL(request.url).searchParams.get("download") === "1"
    const headers = new Headers()
    headers.set("Content-Type", artifact.mimeType || response.headers.get("content-type") || "application/octet-stream")
    headers.set(
      "Content-Disposition",
      forceDownload ? buildAttachmentContentDisposition(artifact.title) : `inline; filename="${artifact.title}"`,
    )
    headers.set("Cache-Control", "private, no-store")

    return new NextResponse(response.body, {
      status: response.status,
      headers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "artifact_download_failed"
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
