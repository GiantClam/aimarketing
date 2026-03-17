import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  createImageAssistantAsset,
  getImageAssistantAssetByStorageKey,
  getImageAssistantSession,
} from "@/lib/image-assistant/repository"
import {
  headImageAssistantObject,
  isImageAssistantR2Available,
  isImageAssistantStorageKeyOwnedByUser,
} from "@/lib/image-assistant/r2"
import type { ImageAssistantAssetType, ImageAssistantReferenceRole } from "@/lib/image-assistant/types"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])
const MAX_FILE_BYTES = 10 * 1024 * 1024

function parseReferenceRole(value: unknown): ImageAssistantReferenceRole | null {
  const role = typeof value === "string" ? value : ""
  return role === "subject" || role === "background" || role === "style" || role === "logo" ? role : null
}

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
    const storageKey = typeof body?.storageKey === "string" ? body.storageKey.trim() : ""
    const assetType = parseAssetType(body?.assetType)
    const referenceRole = parseReferenceRole(body?.referenceRole)
    const width = Number.parseInt(String(body?.width || ""), 10)
    const height = Number.parseInt(String(body?.height || ""), 10)
    const sha256 = typeof body?.sha256 === "string" ? body.sha256.trim() : null

    if (!storageKey) {
      return NextResponse.json({ error: "storage_key_required" }, { status: 400 })
    }

    if (!isImageAssistantStorageKeyOwnedByUser(auth.user.id, storageKey)) {
      return NextResponse.json({ error: "invalid_storage_key" }, { status: 403 })
    }

    if (sessionId && !(await getImageAssistantSession(auth.user.id, sessionId))) {
      return NextResponse.json({ error: "session not found" }, { status: 404 })
    }

    const existing = await getImageAssistantAssetByStorageKey(auth.user.id, storageKey)
    if (existing) {
      return NextResponse.json({ data: existing })
    }

    const uploaded = await headImageAssistantObject(storageKey)
    if (!uploaded) {
      return NextResponse.json({ error: "uploaded_file_not_found" }, { status: 404 })
    }

    if (!ALLOWED_TYPES.has(uploaded.contentType)) {
      return NextResponse.json({ error: "unsupported_file_type" }, { status: 400 })
    }

    if (uploaded.fileSize > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 400 })
    }

    const asset = await createImageAssistantAsset({
      userId: auth.user.id,
      sessionId,
      assetType,
      referenceRole,
      storageProvider: "r2",
      storageKey,
      publicUrl: uploaded.publicUrl,
      mimeType: uploaded.contentType,
      fileSize: uploaded.fileSize,
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      sha256,
      status: "ready",
    })

    return NextResponse.json({ data: asset })
  } catch (error: any) {
    console.error("image-assistant.assets.complete.error", error)
    return NextResponse.json({ error: error.message || "upload_complete_failed" }, { status: 500 })
  }
}
