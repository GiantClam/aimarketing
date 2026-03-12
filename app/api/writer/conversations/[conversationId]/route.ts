import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { deleteWriterMockConversation } from "@/lib/writer/mock"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const resolved = await params
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const deleted = await deleteWriterMockConversation(auth.user.id, resolved.conversationId)
    return NextResponse.json({ success: deleted })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
