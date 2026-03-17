import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { shouldUseImageAssistantFixtures } from "@/lib/image-assistant/aiberm"
import { fileToBuffer, sha256Buffer } from "@/lib/image-assistant/assets"
import { createImageAssistantAsset, getImageAssistantSession } from "@/lib/image-assistant/repository"
import { isImageAssistantR2Available, uploadImageAssistantBuffer } from "@/lib/image-assistant/r2"
import type { ImageAssistantAssetType } from "@/lib/image-assistant/types"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])
const MAX_FILE_BYTES = 10 * 1024 * 1024

function parseReferenceRole(value: FormDataEntryValue | null) {
  const role = typeof value === "string" ? value : ""
  return role === "subject" || role === "background" || role === "style" || role === "logo" ? role : null
}

function parseAssetType(value: FormDataEntryValue | null): ImageAssistantAssetType {
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

    const formData = await req.formData()
    const sessionId = typeof formData.get("sessionId") === "string" ? String(formData.get("sessionId")) : null
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    if (sessionId && !(await getImageAssistantSession(auth.user.id, sessionId))) {
      return NextResponse.json({ error: "session not found" }, { status: 404 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "unsupported_file_type" }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 400 })
    }

    const buffer = await fileToBuffer(file)
    const referenceRole = parseReferenceRole(formData.get("referenceRole"))
    const assetType = parseAssetType(formData.get("assetType"))
    const width = Number.parseInt(String(formData.get("width") || ""), 10)
    const height = Number.parseInt(String(formData.get("height") || ""), 10)

    let storageProvider = "inline"
    let storageKey = `inline:${assetType}:${auth.user.id}:${Date.now()}:${file.name}`
    let publicUrl: string | null = `data:${file.type};base64,${buffer.toString("base64")}`

    if (!shouldUseImageAssistantFixtures() && isImageAssistantR2Available()) {
      try {
        const uploaded = await uploadImageAssistantBuffer({
          userId: auth.user.id,
          sessionId,
          assetType,
          mimeType: file.type,
          buffer,
          suggestedName: file.name,
        })
        storageProvider = "r2"
        storageKey = uploaded.storageKey
        publicUrl = uploaded.publicUrl
      } catch (error) {
        console.warn("image-assistant.assets.upload.r2_fallback", {
          sessionId,
          fileName: file.name,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const asset = await createImageAssistantAsset({
      userId: auth.user.id,
      sessionId,
      assetType,
      referenceRole,
      storageProvider,
      storageKey,
      publicUrl,
      mimeType: file.type,
      fileSize: file.size,
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      sha256: sha256Buffer(buffer),
      status: "ready",
    })

    return NextResponse.json({ data: asset })
  } catch (error: any) {
    console.error("image-assistant.assets.upload.error", error)
    return NextResponse.json({ error: error.message || "upload_failed" }, { status: 500 })
  }
}
