import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getImageAssistantSession } from "@/lib/image-assistant/repository"
import { createImageAssistantUploadUrl, isImageAssistantR2Available } from "@/lib/image-assistant/r2"
import type { ImageAssistantAssetType } from "@/lib/image-assistant/types"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])
const MAX_FILE_BYTES = 10 * 1024 * 1024

function parseAssetType(value: unknown): ImageAssistantAssetType {
  const assetType = typeof value === "string" ? value.trim() : ""
  if (assetType === "canvas_snapshot" || assetType === "mask") {
    return assetType
  }
  return "reference"
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    if (!isImageAssistantR2Available()) {
      return NextResponse.json({ error: "image_assistant_r2_config_missing" }, { status: 503 })
    }

    const body = await req.json().catch(() => null)
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : ""
    const fileType = typeof body?.fileType === "string" ? body.fileType.trim().toLowerCase() : ""
    const fileSize = Number(body?.fileSize || 0)
    const assetType = parseAssetType(body?.assetType)

    if (!fileName || !fileType) {
      return NextResponse.json({ error: "file_metadata_required" }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(fileType)) {
      return NextResponse.json({ error: "unsupported_file_type" }, { status: 400 })
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "file_size_required" }, { status: 400 })
    }

    if (fileSize > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 400 })
    }

    if (sessionId && !(await getImageAssistantSession(auth.user.id, sessionId))) {
      return NextResponse.json({ error: "session not found" }, { status: 404 })
    }

    const signed = await createImageAssistantUploadUrl({
      userId: auth.user.id,
      sessionId,
      assetType,
      mimeType: fileType,
      suggestedName: fileName,
    })

    return NextResponse.json({
      data: {
        method: "PUT",
        uploadUrl: signed.uploadUrl,
        storageKey: signed.storageKey,
        publicUrl: signed.publicUrl,
        headers: signed.headers,
      },
    })
  } catch (error: any) {
    console.error("image-assistant.assets.presign.error", error)
    return NextResponse.json({ error: error.message || "upload_presign_failed" }, { status: 500 })
  }
}
