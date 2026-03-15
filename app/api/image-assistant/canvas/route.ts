import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { saveImageAssistantCanvas } from "@/lib/image-assistant/repository"
import type { ImageAssistantLayer } from "@/lib/image-assistant/types"

export const runtime = "nodejs"

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => ({}))
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    }

    const layers = Array.isArray(body?.layers) ? (body.layers as ImageAssistantLayer[]) : []
    const saved = await saveImageAssistantCanvas({
      userId: auth.user.id,
      sessionId,
      canvasDocumentId: typeof body?.canvasDocumentId === "string" ? body.canvasDocumentId : null,
      baseVersionId: typeof body?.baseVersionId === "string" ? body.baseVersionId : null,
      width: Number.parseInt(String(body?.width || "1080"), 10) || 1080,
      height: Number.parseInt(String(body?.height || "1080"), 10) || 1080,
      backgroundAssetId: typeof body?.backgroundAssetId === "string" ? body.backgroundAssetId : null,
      revision: typeof body?.revision === "number" ? body.revision : undefined,
      layers,
    })

    return NextResponse.json({ data: saved })
  } catch (error: any) {
    const status = error?.message === "image_assistant_canvas_revision_conflict" ? 409 : 500
    return NextResponse.json({ error: error.message || "canvas_save_failed" }, { status })
  }
}
