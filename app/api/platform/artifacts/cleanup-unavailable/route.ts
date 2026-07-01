import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasPlatformArtifactAccessibleContent } from "@/lib/platform/artifact-actions"
import { deletePlatformArtifactPermanently, listPlatformArtifactsForEnterprise } from "@/lib/platform/task-run-store"
import { deleteR2Object } from "@/lib/r2"

export const runtime = "nodejs"

function normalizeArtifactIds(value: unknown) {
  if (!Array.isArray(value)) return null

  const ids = value
    .map((item) => (typeof item === "number" ? item : typeof item === "string" ? Number(item) : NaN))
    .filter((item): item is number => Number.isInteger(item) && item > 0)

  return ids.length > 0 ? [...new Set(ids)] : null
}

function normalizeLimit(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.id || !currentUser.enterpriseId) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const requestedArtifactIds = normalizeArtifactIds(body?.artifactIds)
    const limit = normalizeLimit(body?.limit)

    const artifacts = await listPlatformArtifactsForEnterprise(currentUser.enterpriseId)
    const unavailableArtifacts = artifacts.filter((artifact) => !hasPlatformArtifactAccessibleContent(artifact))
    const filteredArtifacts = requestedArtifactIds
      ? unavailableArtifacts.filter((artifact) => requestedArtifactIds.includes(artifact.id))
      : unavailableArtifacts
    const targetArtifacts = limit ? filteredArtifacts.slice(0, limit) : filteredArtifacts

    const deletedArtifactIds: number[] = []
    const deletedWorkItemIds: number[] = []
    const failedArtifactIds: number[] = []

    for (const artifact of targetArtifacts) {
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
        failedArtifactIds.push(artifact.id)
        continue
      }

      deletedArtifactIds.push(result.artifactId)
      deletedWorkItemIds.push(...result.deletedWorkItemIds)
    }

    const ignoredArtifactIds = requestedArtifactIds
      ? requestedArtifactIds.filter((artifactId) => !targetArtifacts.some((artifact) => artifact.id === artifactId))
      : []

    return NextResponse.json({
      data: {
        requestedArtifactIds,
        totalUnavailableBefore: unavailableArtifacts.length,
        matchedUnavailableCount: filteredArtifacts.length,
        attemptedCount: targetArtifacts.length,
        deletedCount: deletedArtifactIds.length,
        deletedArtifactIds,
        deletedWorkItemIds,
        failedArtifactIds,
        ignoredArtifactIds,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cleanup_unavailable_artifacts_failed" },
      { status: 500 },
    )
  }
}
