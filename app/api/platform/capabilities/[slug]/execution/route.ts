import { NextRequest, NextResponse } from "next/server"

import { normalizeLocale } from "@/lib/i18n/config"
import { getPlatformCapabilityExecutionState } from "@/lib/platform/execution"
import { getSessionUser } from "@/lib/auth/session"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const locale = normalizeLocale(new URL(request.url).searchParams.get("locale")) || "en"
  const currentUser = await getSessionUser(request).catch(() => null)
  const state = await getPlatformCapabilityExecutionState(slug, locale, currentUser)

  if (!state) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({
    data: state,
  })
}
