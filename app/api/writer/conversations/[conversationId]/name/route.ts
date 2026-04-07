import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { invalidateWriterConversationListCacheByUser } from "@/lib/writer/conversation-list-cache"
import { renameWriterConversation } from "@/lib/writer/repository"

export async function POST(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const resolved = await params
    const body = await req.json()
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    if (!body?.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const renamed = await renameWriterConversation(auth.user.id, resolved.conversationId, body.name)
    invalidateWriterConversationListCacheByUser(auth.user.id)
    return NextResponse.json({ success: Boolean(renamed), conversation: renamed, name: body.name })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
