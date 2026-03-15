import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listWriterConversations } from "@/lib/writer/repository"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const limit = parseInt(searchParams.get("limit") || "20", 10)

  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const data = await listWriterConversations(auth.user.id, limit)
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
