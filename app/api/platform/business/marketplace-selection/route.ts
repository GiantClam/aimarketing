import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  getBusinessMarketplaceSelection,
  sanitizeBusinessMarketplaceSelectionInput,
  upsertBusinessMarketplaceSelection,
} from "@/lib/platform/business-marketplace-selection"
import { listImportedAgencyAgentsByIds } from "@/lib/platform/imported-agency-agents"
import { getLocalizedWorkspaceMarketplaceEntries } from "@/lib/platform/workspace-business"

export const runtime = "nodejs"

function resolveLocale(value: string | null) {
  return value === "zh" ? "zh" : "en"
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) return auth.response

    const locale = resolveLocale(request.nextUrl.searchParams.get("locale"))
    const selection = (await getBusinessMarketplaceSelection(auth.user.id)) || { selectedAgentIds: [] }
    const selectedAgents = listImportedAgencyAgentsByIds(locale, selection.selectedAgentIds)
    const selectedEntries = getLocalizedWorkspaceMarketplaceEntries(locale, {
      includeSlugs: [...new Set(selectedAgents.map((agent) => agent.businessSlug))],
    })

    return NextResponse.json({
      data: {
        selectedAgentIds: selection.selectedAgentIds,
        selectedAgents,
        selectedEntries,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "business_marketplace_selection_read_failed",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) return auth.response

    const body = await request.json().catch(() => ({}))
    const selection = sanitizeBusinessMarketplaceSelectionInput(body)
    const updated = await upsertBusinessMarketplaceSelection(auth.user.id, selection)
    return NextResponse.json({ data: updated })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "business_marketplace_selection_write_failed",
      },
      { status: 500 },
    )
  }
}
