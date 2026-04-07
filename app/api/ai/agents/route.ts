import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  getAiEntryAgentCatalog,
  getAiEntryAgentGroups,
  getDefaultAiEntryAgentId,
} from "@/lib/ai-entry/agent-catalog"

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const catalog = getAiEntryAgentCatalog()
  const groups = getAiEntryAgentGroups()

  return NextResponse.json(
    {
      defaultAgentId: getDefaultAiEntryAgentId(),
      agents: catalog,
      groups,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  )
}
