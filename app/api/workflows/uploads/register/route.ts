import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { createPlatformTaskRun, savePlatformArtifact } from "@/lib/platform/task-run-store"
import { serializePlatformArtifact } from "@/lib/platform/artifact-actions"

export const runtime = "nodejs"

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.id || !currentUser.enterpriseId) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const fileName = normalizeText(body?.fileName, 255)
    const mimeType = normalizeText(body?.mimeType, 120) || "application/octet-stream"
    const storageKey = normalizeText(body?.storageKey, 4096)
    const publicUrl = normalizeText(body?.publicUrl, 4096) || null

    if (!fileName || !storageKey) {
      return NextResponse.json({ error: "file_name_and_storage_key_required" }, { status: 400 })
    }

    const run = await createPlatformTaskRun({
      enterpriseId: currentUser.enterpriseId,
      userId: currentUser.id,
      kind: "workflow",
      itemType: "upload",
      itemSlug: "workflow-upload",
      status: "succeeded",
      startedAt: new Date(),
      finishedAt: new Date(),
      inputPayload: {
        source: "upload",
        fileName,
        mimeType,
        storageKey,
      },
      normalizedResult: {
        source: "upload",
        fileName,
        mimeType,
        storageKey,
      },
    })

    const artifact = await savePlatformArtifact({
      runId: run.id,
      enterpriseId: currentUser.enterpriseId,
      ownerUserId: currentUser.id,
      kind: "file",
      title: fileName,
      mimeType,
      storageKey,
      externalUrl: publicUrl,
      source: "upload",
      payload: {
        source: "upload",
        entry: "workflow_upload",
      },
    })

    return NextResponse.json({
      data: {
        artifact: serializePlatformArtifact(artifact),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_upload_register_failed" },
      { status: 500 },
    )
  }
}
