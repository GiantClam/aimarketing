import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { listKnowledgeRecentActivity } from "@/lib/knowledge/repository"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const activities = await listKnowledgeRecentActivity(currentUser.enterpriseId)
    return NextResponse.json({ data: activities })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_recent_activity_failed" },
      { status: 500 },
    )
  }
}
