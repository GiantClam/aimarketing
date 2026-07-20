import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  assertArtifactEnterpriseAccess,
  normalizePlatformArtifactContentType,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import { buildAttachmentContentDisposition, buildInlineContentDisposition } from "@/lib/platform/minimax-audio"
import { getPlatformArtifact } from "@/lib/platform/task-run-store"
import { toUint8Array } from "@/lib/utils/binary"

export const runtime = "nodejs"

function readEmbeddedArtifactContent(
  artifact: Awaited<ReturnType<typeof getPlatformArtifact>>,
): { bytes: Uint8Array; contentType: string } | null {
  if (!artifact?.payload || typeof artifact.payload !== "object") return null

  const payload = artifact.payload as Record<string, unknown>
  const encoded = typeof payload.embeddedContentBase64 === "string" ? payload.embeddedContentBase64.trim() : ""
  if (!encoded) return null

  return {
    bytes: toUint8Array(Buffer.from(encoded, "base64")),
    contentType: normalizePlatformArtifactContentType(artifact.mimeType || "application/octet-stream"),
  }
}

function readInlineArtifactTextContent(
  artifact: Awaited<ReturnType<typeof getPlatformArtifact>>,
): { bytes: Uint8Array; contentType: string } | null {
  if (!artifact?.payload || typeof artifact.payload !== "object") return null

  const payload = artifact.payload as Record<string, unknown>
  const text = typeof payload.text === "string" ? payload.text : null
  if (!text) return null

  return {
    bytes: toUint8Array(Buffer.from(text, "utf8")),
    contentType: normalizePlatformArtifactContentType(artifact.mimeType || "text/plain"),
  }
}

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
    const forceDownload = new URL(request.url).searchParams.get("download") === "1"
    const headers = new Headers()
    headers.set(
      "Content-Disposition",
      forceDownload
        ? buildAttachmentContentDisposition(artifact.title, artifact.mimeType)
        : buildInlineContentDisposition(artifact.title, artifact.mimeType),
    )
    headers.set("Cache-Control", "private, no-store")

    const sourceUrl = resolvePlatformArtifactSourceUrl(artifact)
    if (sourceUrl) {
      const response = await fetch(sourceUrl, {
        cache: "no-store",
      })
      if (!response.ok) {
        return NextResponse.json({ error: "platform_artifact_download_failed" }, { status: 502 })
      }

      headers.set(
        "Content-Type",
        normalizePlatformArtifactContentType(artifact.mimeType || response.headers.get("content-type") || "application/octet-stream"),
      )

      return new NextResponse(response.body, {
        status: response.status,
        headers,
      })
    }

    const localContent = readEmbeddedArtifactContent(artifact) ?? readInlineArtifactTextContent(artifact)
    if (!localContent) {
      return NextResponse.json({ error: "artifact_source_unavailable" }, { status: 404 })
    }

    headers.set("Content-Type", localContent.contentType)

    return new NextResponse(Buffer.from(localContent.bytes), {
      status: 200,
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
