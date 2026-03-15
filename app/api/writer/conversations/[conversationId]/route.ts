import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { deleteWriterConversation } from "@/lib/writer/repository"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const resolved = await params
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const deleted = await deleteWriterConversation(auth.user.id, resolved.conversationId)
    return NextResponse.json({ success: deleted, conversationId: resolved.conversationId })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
