import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import { getPlatformCapabilityExecutionState } from "@/lib/platform/execution"
import {
  evaluatePlatformExecutionGate,
  proxyPlatformExecutionRequest,
  resolvePlatformCapabilityExecutionProxyTarget,
} from "@/lib/platform/execute"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const locale = normalizeLocale(new URL(request.url).searchParams.get("locale")) || "en"
  const action = new URL(request.url).searchParams.get("action")
  const currentUser = await getSessionUser(request).catch(() => null)
  const state = await getPlatformCapabilityExecutionState(slug, locale, currentUser)

  if (!state) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const target = resolvePlatformCapabilityExecutionProxyTarget(slug, action)
  if (!target) {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
  }

  const gate = evaluatePlatformExecutionGate({
    currentUser,
    requiresLogin: target.requiresLogin,
    runtimeStatus: state.runtimeStatus,
    accessState: state.accessState,
    usesSharedCredits: state.usesSharedCredits,
    billingCanSpendCredits: state.billing?.canSpendCredits ?? null,
  })
  if (!gate.ok) {
    return gate.response
  }

  const rawBody = await request.text()
  return proxyPlatformExecutionRequest(request, target, rawBody, {
    "x-platform-capability-slug": slug,
    "x-platform-capability-action": target.action,
  })
}
