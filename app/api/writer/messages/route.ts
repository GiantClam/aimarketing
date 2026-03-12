import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listWriterMockMessages, updateWriterMockLatestAssistantMessage } from "@/lib/writer/mock"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const conversationId = searchParams.get("conversation_id")
  const limit = parseInt(searchParams.get("limit") || "50", 10)

  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id is required" }, { status: 400 })
  }

  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const data = await listWriterMockMessages(auth.user.id, conversationId, limit)
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

    const updated = await updateWriterMockLatestAssistantMessage(auth.user.id, conversationId, content)
    if (!updated) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
