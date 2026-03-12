import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listWriterMockMessages } from "@/lib/writer/mock"

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
