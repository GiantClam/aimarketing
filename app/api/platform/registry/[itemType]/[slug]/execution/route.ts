import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import { getPlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"

function normalizeItemType(value: string | null) {
  if (value === "capability" || value === "agent" || value === "plugin" || value === "workflow") return value
  if (value === "mcp_service" || value === "mcp-services" || value === "mcp") return "mcp_service"
  return null
}

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ itemType: string; slug: string }> },
) {
  const { itemType, slug } = await context.params
  const normalizedItemType = normalizeItemType(itemType)
  if (!normalizedItemType) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  }

  const searchParams = new URL(request.url).searchParams
  const locale = normalizeLocale(searchParams.get("locale")) || "en"
  const surface = searchParams.get("surface") === "workspace" ? "workspace" : "public"
  const currentUser = await getSessionUser(request).catch(() => null)
  const state = await getPlatformRegistryEntryExecutionState({
    locale,
    itemType: normalizedItemType,
    slug,
    surface,
    enterpriseId: currentUser?.enterpriseId ?? null,
    currentUser,
  })

  if (!state) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({
    data: state,
  })
}
