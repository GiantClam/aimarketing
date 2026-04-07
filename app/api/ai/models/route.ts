import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getAiEntryModelCatalog } from "@/lib/ai-entry/model-catalog"

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  try {
    const catalog = await getAiEntryModelCatalog()
    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_models_list_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
