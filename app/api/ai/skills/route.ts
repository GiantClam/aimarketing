import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  getAiEntryMcpServerUrls,
  loadAiEntryMcpTools,
} from "@/lib/ai-entry/mcp-tools"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const urls = getAiEntryMcpServerUrls()
    if (urls.length === 0) {
      return NextResponse.json({
        enabled: false,
        reason: "AI_ENTRY_MCP_SERVER_URLS is not configured",
        skills: [],
      })
    }

    const loaded = await loadAiEntryMcpTools(urls)
    try {
      return NextResponse.json({
        enabled: true,
        sourceCount: urls.length,
        skills: loaded.skills,
      })
    } finally {
      await loaded.close()
    }
  } catch (error) {
    return NextResponse.json(
      {
        enabled: false,
        error: error instanceof Error ? error.message : "ai_entry_skills_failed",
        skills: [],
      },
      { status: 500 },
    )
  }
}
