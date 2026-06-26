import { NextRequest, NextResponse } from "next/server"

import { isBillingCreditEnforcementEnabled } from "@/lib/billing/runtime"
import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import { getPlatformCapabilityExecutionState } from "@/lib/platform/execution"
import {
  evaluatePlatformExecutionGate,
  normalizePlatformMediaExecutionPayload,
  proxyPlatformExecutionRequest,
  resolvePlatformCapabilityExecutionProxyTarget,
} from "@/lib/platform/execute"
import { shouldChargeSharedCreditsForCapability } from "@/lib/platform/shared-credits-policy"

export const runtime = "nodejs"

function parseFeatureIdFromBody(rawBody: string) {
  if (!rawBody.trim()) return null

  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    return typeof parsed.featureId === "string" ? parsed.featureId : null
  } catch {
    return null
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const locale = normalizeLocale(new URL(request.url).searchParams.get("locale")) || "en"
  const action = new URL(request.url).searchParams.get("action")
  const rawBody = await request.text()
  let parsedBody: Record<string, unknown> | null = null
  if (rawBody.trim()) {
    try {
      parsedBody = (JSON.parse(rawBody) as Record<string, unknown>) || null
    } catch {
      parsedBody = null
    }
  }

  const currentUser = await getSessionUser(request, {
    hydrateDemoFromDb: false,
  }).catch(() => null)
  const target = resolvePlatformCapabilityExecutionProxyTarget(slug, action)
  if (!target) {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
  }

  const state = await getPlatformCapabilityExecutionState(slug, locale, currentUser, {
    includeBilling: Boolean(currentUser) && isBillingCreditEnforcementEnabled(),
  })
  if (!state) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const gate = evaluatePlatformExecutionGate({
    currentUser,
    requiresLogin: target.requiresLogin,
    runtimeStatus: state.runtimeStatus,
    accessState: state.accessState,
    usesSharedCredits: state.usesSharedCredits,
    sharedCreditsRequired: shouldChargeSharedCreditsForCapability({
      capabilitySlug: slug,
      body: parsedBody,
      usesSharedCredits: state.usesSharedCredits,
    }),
    billingCanSpendCredits: state.billing?.canSpendCredits ?? null,
  })
  if (!gate.ok) {
    return gate.response
  }
  const proxied = await proxyPlatformExecutionRequest(request, target, rawBody, {
    "x-platform-capability-slug": slug,
    "x-platform-capability-action": target.action,
  })

  if (!target.downstreamPath.startsWith("/api/platform/media/")) {
    return proxied
  }

  const contentType = proxied.headers.get("content-type")?.toLowerCase() || ""
  if (!contentType.includes("application/json")) {
    return proxied
  }

  const payload = (await proxied.clone().json().catch(() => null)) as { error?: string; data?: Record<string, unknown> } | null
  if (!payload?.data) {
    return proxied
  }

  const normalized =
    normalizePlatformMediaExecutionPayload({
      capabilitySlug: slug,
      featureId: parseFeatureIdFromBody(rawBody),
      data: payload.data,
    }) ?? payload

  const headers = new Headers()
  for (const key of ["content-type", "x-platform-proxy-target"]) {
    const value = proxied.headers.get(key)
    if (value) headers.set(key, value)
  }

  return NextResponse.json(normalized, {
    status: proxied.status,
    headers,
  })
}
