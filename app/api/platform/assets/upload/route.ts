import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { uploadAssetLibraryArtifactBuffer } from "@/lib/platform/asset-library-ingest"
import { serializePlatformArtifact } from "@/lib/platform/artifact-actions"

export const runtime = "nodejs"
export const maxDuration = 60

function normalizeText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) {
      return auth.response
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file_required" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const surface = normalizeText(formData.get("surface"), "ai-entry")
    const artifact = await uploadAssetLibraryArtifactBuffer({
      currentUser: auth.user,
      runKind: "agent",
      itemType: "chat_attachment",
      itemSlug: "ai-entry-upload",
      provider: surface,
      fileName: file.name || "attachment",
      mimeType: file.type || "application/octet-stream",
      buffer,
      source: "chat",
      payload: {
        entry: "ai_entry_upload",
        surface,
        fileSize: file.size,
      },
    })

    if (!artifact) {
      return NextResponse.json({ error: "asset_library_context_required" }, { status: 400 })
    }

    return NextResponse.json({
      data: {
        artifact: serializePlatformArtifact(artifact),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_asset_upload_failed" },
      { status: 500 },
    )
  }
}

