import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getAiEntryModelCatalog } from "@/lib/ai-entry/model-catalog"
import {
  getConfiguredAiEntryProviders,
  type AiEntryProviderId,
} from "@/lib/ai-entry/provider-routing"

function parseProviderId(value: string | null): AiEntryProviderId | null {
  const normalized = (value || "").trim().toLowerCase()
  if (normalized === "crazyrouter") return "crazyroute"
  if (
    normalized === "aiberm" ||
    normalized === "crazyroute" ||
    normalized === "openrouter"
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
    const providers = getConfiguredAiEntryProviders().map((provider) => ({
      id: provider.id,
      label:
        provider.id === "aiberm"
          ? "Aiberm"
          : provider.id === "crazyroute"
            ? "CrazyRouter"
            : "OpenRouter",
    }))
    const catalog = await getAiEntryModelCatalog({ providerId })
    return NextResponse.json({
      ...catalog,
      providers,
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
