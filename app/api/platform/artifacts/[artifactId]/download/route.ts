import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  assertArtifactEnterpriseAccess,
  normalizePlatformArtifactContentType,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import { buildAttachmentContentDisposition, buildInlineContentDisposition } from "@/lib/platform/minimax-audio"
import { getPlatformArtifact } from "@/lib/platform/task-run-store"
import { getR2BucketName, getR2Object, getR2SignedUrl, headR2Object } from "@/lib/r2"
import { toUint8Array } from "@/lib/utils/binary"

export const runtime = "nodejs"

function getArtifactR2BucketCandidates() {
  return [...new Set([
    process.env.PLATFORM_ARTIFACT_R2_BUCKET?.trim(),
    getR2BucketName(),
    "platform-artifacts",
  ].filter((value): value is string => Boolean(value)))]
}

function getHttpSourceUrl(value: string | null | undefined) {
  const sourceUrl = value?.trim() || ""
  if (!sourceUrl) return null

  try {
    const parsed = new URL(sourceUrl)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null
  } catch {
    return null
  }
}

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

    const sourceUrls = [
      getHttpSourceUrl(artifact.externalUrl),
      getHttpSourceUrl(resolvePlatformArtifactSourceUrl(artifact)),
    ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)

    for (const sourceUrl of sourceUrls) {
      try {
        const response = await fetch(sourceUrl, { cache: "no-store" })
        if (!response.ok) continue

        headers.set(
          "Content-Type",
          normalizePlatformArtifactContentType(artifact.mimeType || response.headers.get("content-type") || "application/octet-stream"),
        )

        return new NextResponse(response.body, {
          status: response.status,
          headers,
        })
      } catch (error) {
        console.warn("platform_artifact_source_fetch_failed", {
          artifactId: numericArtifactId,
          sourceUrl,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (artifact.storageKey) {
      for (const artifactBucket of getArtifactR2BucketCandidates()) {
        try {
          const object = await headR2Object(artifact.storageKey, { bucketName: artifactBucket })
          if (!object) continue

          const signedUrl = await getR2SignedUrl(artifact.storageKey, {
            bucketName: artifactBucket,
            contentDisposition: headers.get("Content-Disposition") || undefined,
            contentType: normalizePlatformArtifactContentType(artifact.mimeType || object.contentType || "application/octet-stream"),
          })
          if (signedUrl) {
            return NextResponse.redirect(signedUrl, {
              status: 307,
              headers: { "Cache-Control": "private, no-store" },
            })
          }
        } catch (error) {
          console.warn("platform_artifact_r2_read_failed", {
            artifactId: numericArtifactId,
            storageKey: artifact.storageKey,
            bucket: artifactBucket,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      for (const artifactBucket of getArtifactR2BucketCandidates()) {
        try {
          const object = await getR2Object(artifact.storageKey, { bucketName: artifactBucket })
          if (!object) continue

          headers.set(
            "Content-Type",
            normalizePlatformArtifactContentType(artifact.mimeType || object.contentType || "application/octet-stream"),
          )
          return new NextResponse(Buffer.from(object.bytes), {
            status: 200,
            headers,
          })
        } catch (error) {
          console.warn("platform_artifact_r2_read_failed", {
            artifactId: numericArtifactId,
            storageKey: artifact.storageKey,
            bucket: artifactBucket,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
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
