import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listWriterMessages, updateWriterAssistantMessageById, updateWriterLatestAssistantMessage } from "@/lib/writer/repository"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const conversationId = searchParams.get("conversation_id")
  const cursor = searchParams.get("cursor")
  const limit = parseInt(searchParams.get("limit") || "50", 10)

  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id is required" }, { status: 400 })
  }

  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const data = await listWriterMessages(auth.user.id, conversationId, limit, cursor)
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json()
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : ""
    const messageId = typeof body?.message_id === "string" ? body.message_id : ""
    const content = typeof body?.content === "string" ? body.content : ""

    if (!conversationId || !content.trim()) {
      return NextResponse.json({ error: "conversation_id and content are required" }, { status: 400 })
    }

    const hasDiagnosticsField = Object.prototype.hasOwnProperty.call(body || {}, "diagnostics")
    const optionalMeta = {
      ...(typeof body?.status === "string" ? { status: body.status } : {}),
      ...(typeof body?.imagesRequested === "boolean" ? { imagesRequested: body.imagesRequested } : {}),
      ...(typeof body?.language === "string" ? { language: body.language } : {}),
      ...(typeof body?.platform === "string" ? { platform: body.platform } : {}),
      ...(typeof body?.mode === "string" ? { mode: body.mode } : {}),
      ...(hasDiagnosticsField ? { diagnostics: body?.diagnostics || null } : {}),
    }

    const updated = messageId
      ? await updateWriterAssistantMessageById(auth.user.id, conversationId, messageId, content, optionalMeta)
      : await updateWriterLatestAssistantMessage(auth.user.id, conversationId, content, {
          ...(typeof body?.status === "string" ? { status: body.status } : { status: "text_ready" }),
          ...(typeof body?.imagesRequested === "boolean" ? { imagesRequested: body.imagesRequested } : {}),
          ...(typeof body?.language === "string" ? { language: body.language } : {}),
          ...(typeof body?.platform === "string" ? { platform: body.platform } : {}),
          ...(typeof body?.mode === "string" ? { mode: body.mode } : {}),
          ...(hasDiagnosticsField ? { diagnostics: body?.diagnostics || null } : {}),
        })
    if (!updated) {
      return NextResponse.json({ error: messageId ? "message_not_found" : "conversation_not_found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
