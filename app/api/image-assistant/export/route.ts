import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { createImageAssistantAsset, logImageAssistantExport } from "@/lib/image-assistant/repository"

const IMAGE_ASSISTANT_REFERENCE_NOT_FOUND_ERRORS = new Set([
  "image_assistant_session_not_found",
  "image_assistant_version_not_found",
  "image_assistant_asset_not_found",
  "image_assistant_canvas_document_not_found",
])

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => ({}))
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
    const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : ""
    const format = typeof body?.format === "string" ? body.format : "png"
    const sizePreset =
      body?.sizePreset === "4:5" || body?.sizePreset === "3:4" || body?.sizePreset === "16:9" || body?.sizePreset === "9:16"
        ? body.sizePreset
        : "1:1"

    if (!sessionId || !dataUrl) {
      return NextResponse.json({ error: "sessionId and dataUrl are required" }, { status: 400 })
    }

    const asset = await createImageAssistantAsset({
      userId: auth.user.id,
      sessionId,
      assetType: "export",
      storageProvider: "inline",
      storageKey: `inline:export:${sessionId}:${Date.now()}`,
      publicUrl: dataUrl,
      mimeType: /^data:([^;]+);/i.exec(dataUrl)?.[1] || "image/png",
      fileSize: 0,
      status: "ready",
      meta: {
        format,
        sizePreset,
      },
    })

    await logImageAssistantExport({
      userId: auth.user.id,
      sessionId,
      assetId: asset.id,
      format,
      sizePreset,
      transparentBackground: Boolean(body?.transparentBackground),
      versionId: typeof body?.versionId === "string" ? body.versionId : null,
      canvasDocumentId: typeof body?.canvasDocumentId === "string" ? body.canvasDocumentId : null,
    })

    return NextResponse.json({ data: asset })
  } catch (error: any) {
    if (IMAGE_ASSISTANT_REFERENCE_NOT_FOUND_ERRORS.has(error?.message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ error: error.message || "export_log_failed" }, { status: 500 })
  }
}
