import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import { resolvePlatformLaunchTarget } from "@/lib/platform/launch"
import type { PlatformRegistryItemType } from "@/lib/platform/control-plane"

function normalizeItemType(value: string | null): PlatformRegistryItemType | null {
  if (value === "capability" || value === "agent" || value === "plugin" || value === "workflow") return value
  if (value === "mcp_service" || value === "mcp" || value === "mcp-services") return "mcp_service"
  return null
}

function normalizeSurface(value: string | null) {
  return value === "workspace" ? "workspace" : "public"
}

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const itemType = normalizeItemType(searchParams.get("type"))
  const slug = searchParams.get("slug")?.trim() || ""
  const surface = normalizeSurface(searchParams.get("surface"))
  const locale = normalizeLocale(searchParams.get("locale")) || "en"

  if (!itemType || !slug) {
    return NextResponse.json({ error: "invalid_launch_target" }, { status: 400 })
  }

  const currentUser = await getSessionUser(request).catch(() => null)
  const target = await resolvePlatformLaunchTarget({
    itemType,
    slug,
    surface,
    locale,
    currentUser,
  })

  return NextResponse.redirect(new URL(target.href, request.url))
}
