import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { assertArtifactEnterpriseAccess, serializePlatformArtifact } from "@/lib/platform/artifact-actions"
import { deletePlatformArtifactPermanently, getPlatformArtifact } from "@/lib/platform/task-run-store"
import { deleteR2Object } from "@/lib/r2"

export const runtime = "nodejs"

function buildArtifactPreviewContext(artifact: ReturnType<typeof serializePlatformArtifact>) {
  if (!artifact.payload || typeof artifact.payload !== "object" || Array.isArray(artifact.payload)) {
    return null
  }

  const payload = artifact.payload as Record<string, unknown>
  if (payload.artifactType !== "lead_tool_preview_deck") {
    return null
  }

  const previewSessionId = typeof payload.previewSessionId === "string" ? payload.previewSessionId.trim() : ""
  if (!previewSessionId) return null

  const deck = payload.deck && typeof payload.deck === "object" && !Array.isArray(payload.deck)
    ? (payload.deck as Record<string, unknown>)
    : null
  const variants = Array.isArray(deck?.variants)
    ? deck.variants
        .map((variant) => {
          if (!variant || typeof variant !== "object" || Array.isArray(variant)) return null
          const key = typeof (variant as Record<string, unknown>).key === "string"
            ? ((variant as Record<string, unknown>).key as string).trim()
            : ""
          return key || null
        })
        .filter((key): key is string => Boolean(key))
    : []

  return {
    previewSessionId,
    defaultVariantKey: variants[0] ?? null,
    variantKeys: variants,
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
    const serialized = serializePlatformArtifact(artifact)

    return NextResponse.json({
      data: {
        artifact: {
          id: serialized.id,
          kind: serialized.kind,
          title: serialized.title,
          mimeType: serialized.mimeType,
          createdAt: serialized.createdAt,
        },
        sourceUrl: serialized.externalUrl || null,
        previewContext: buildArtifactPreviewContext(serialized),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "get_artifact_failed"
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
