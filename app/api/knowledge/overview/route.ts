import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getKnowledgeWorkspaceSnapshot } from "@/lib/knowledge/service"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const snapshot = await getKnowledgeWorkspaceSnapshot(currentUser.enterpriseId)
    return NextResponse.json({ data: snapshot.overview })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_overview_failed" },
      { status: 500 },
    )
  }
}
