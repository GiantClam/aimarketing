import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  deleteImageAssistantSession,
  getImageAssistantSessionDetail,
  updateImageAssistantSession,
} from "@/lib/image-assistant/repository"

function parsePositiveInt(value: string | null) {
  const parsed = Number.parseInt(value || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function toSafeImageAssistantError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("Failed query:")) {
    return { status: 503, error: "image_assistant_data_temporarily_unavailable" }
  }
  return { status: 500, error: message || fallback }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const resolved = await params
    const mode = req.nextUrl.searchParams.get("mode") || "full"
    const detailOptions =
      mode === "summary"
        ? {
            includeMessages: true,
            includeVersions: false,
            includeAssets: false,
            includeCanvas: false,
            messageLimit: parsePositiveInt(req.nextUrl.searchParams.get("messageLimit")) ?? 16,
          }
        : mode === "content"
          ? {
              includeMessages: true,
              includeVersions: true,
              includeAssets: true,
              includeCanvas: false,
              messageLimit: parsePositiveInt(req.nextUrl.searchParams.get("messageLimit")) ?? 12,
              versionLimit: parsePositiveInt(req.nextUrl.searchParams.get("versionLimit")) ?? 6,
              assetLimit: parsePositiveInt(req.nextUrl.searchParams.get("assetLimit")) ?? 24,
            }
          : mode === "canvas"
            ? {
                includeMessages: false,
                includeVersions: false,
                includeAssets: false,
                includeCanvas: true,
              }
            : undefined

    const detail = await getImageAssistantSessionDetail(auth.user.id, resolved.sessionId, detailOptions)
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ data: detail })
  } catch (error: any) {
    console.error("image-assistant.session-detail.get.error", error)
    const safe = toSafeImageAssistantError(error, "session_detail_failed")
    return NextResponse.json({ error: safe.error }, { status: safe.status })
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
    console.error("image-assistant.session-detail.patch.error", error)
    const safe = toSafeImageAssistantError(error, "session_update_failed")
    return NextResponse.json({ error: safe.error }, { status: safe.status })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const resolved = await params
    const deleted = await deleteImageAssistantSession(auth.user.id, resolved.sessionId)
    return NextResponse.json({ success: deleted, sessionId: resolved.sessionId })
  } catch (error: any) {
    console.error("image-assistant.session-detail.delete.error", error)
    const safe = toSafeImageAssistantError(error, "session_delete_failed")
    return NextResponse.json({ error: safe.error }, { status: safe.status })
  }
}
