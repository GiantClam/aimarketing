import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getImageAssistantSessionDetail, updateImageAssistantSession } from "@/lib/image-assistant/repository"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const resolved = await params
    const detail = await getImageAssistantSessionDetail(auth.user.id, resolved.sessionId)
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ data: detail })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const resolved = await params
    const body = await req.json().catch(() => ({}))
    const updated = await updateImageAssistantSession({
      userId: auth.user.id,
      sessionId: resolved.sessionId,
      title: typeof body?.title === "string" ? body.title : undefined,
      currentMode: body?.currentMode === "canvas" ? "canvas" : body?.currentMode === "chat" ? "chat" : undefined,
      currentVersionId: typeof body?.currentVersionId === "string" ? body.currentVersionId : undefined,
      currentCanvasDocumentId: typeof body?.currentCanvasDocumentId === "string" ? body.currentCanvasDocumentId : undefined,
      coverAssetId: typeof body?.coverAssetId === "string" ? body.coverAssetId : undefined,
    })

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ data: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
