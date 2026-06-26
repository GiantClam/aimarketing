import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { type AiEntryProviderId } from "@/lib/ai-entry/provider-routing"
import { getGovernedAiEntryModelCatalogForUser } from "@/lib/platform/model-governance"

function parseProviderId(value: string | null): AiEntryProviderId | null {
  const normalized = (value || "").trim().toLowerCase()
  if (normalized === "crazyrouter") return "crazyroute"
  if (
    normalized === "pptoken" ||
    normalized === "openrouter" ||
    normalized === "aiberm" ||
    normalized === "crazyroute" ||
    normalized === "enterprise-openai-compatible" ||
    normalized === "enterprise-qwen-official" ||
    normalized === "enterprise-minimax-official" ||
    normalized === "enterprise-glm-official" ||
    normalized === "enterprise-volcengine-official"
  ) {
    return normalized
  }
  return null
}

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  try {
    const providerId = parseProviderId(request.nextUrl.searchParams.get("providerId"))
    const catalog = await getGovernedAiEntryModelCatalogForUser({
      user: auth.user,
      requestedProviderId: providerId,
    })
    return NextResponse.json({
      ...catalog,
    }, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_models_list_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
