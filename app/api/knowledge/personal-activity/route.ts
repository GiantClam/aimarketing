import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { listRecentPersonalKnowledgeActivity } from "@/lib/knowledge/personal-datasets"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const items = await listRecentPersonalKnowledgeActivity(currentUser.id)
    return NextResponse.json({ data: { items } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "personal_knowledge_activity_failed" },
      { status: 500 },
    )
  }
}
