import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listWriterMessages, updateWriterLatestAssistantMessage } from "@/lib/writer/repository"

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
    const content = typeof body?.content === "string" ? body.content : ""

    if (!conversationId || !content.trim()) {
      return NextResponse.json({ error: "conversation_id and content are required" }, { status: 400 })
    }

    const updated = await updateWriterLatestAssistantMessage(auth.user.id, conversationId, content, {
      status: typeof body?.status === "string" ? body.status : "text_ready",
      imagesRequested: typeof body?.imagesRequested === "boolean" ? body.imagesRequested : undefined,
    })
    if (!updated) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
