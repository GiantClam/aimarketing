import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import {
  evaluatePlatformExecutionGate,
  normalizePlatformRegistryItemType,
  proxyPlatformExecutionRequest,
  resolvePlatformBindingExecutionProxyTarget,
} from "@/lib/platform/execute"
import { getPlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ itemType: string; slug: string }> },
) {
  const { itemType, slug } = await context.params
  const normalizedItemType = normalizePlatformRegistryItemType(itemType)
  if (!normalizedItemType) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  }

  const searchParams = new URL(request.url).searchParams
  const locale = normalizeLocale(searchParams.get("locale")) || "en"
  const surface = searchParams.get("surface") === "workspace" ? "workspace" : "public"
  const action = searchParams.get("action")
  const currentUser = await getSessionUser(request).catch(() => null)
  const execution = await getPlatformRegistryEntryExecutionState({
    locale,
    itemType: normalizedItemType,
    slug,
    surface,
    enterpriseId: currentUser?.enterpriseId ?? null,
    currentUser,
  })

  if (!execution) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const target = resolvePlatformBindingExecutionProxyTarget(execution.bindingTarget, action)
  if (!target) {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
  }

  const gate = evaluatePlatformExecutionGate({
    currentUser,
    requiresLogin: target.requiresLogin,
    runtimeStatus: execution.runtimeStatus,
    accessState: execution.accessState,
    usesSharedCredits: execution.usesSharedCredits,
    billingCanSpendCredits: execution.billing?.canSpendCredits ?? null,
  })
  if (!gate.ok) {
    return gate.response
  }

  const rawBody = await request.text()
  return proxyPlatformExecutionRequest(request, target, rawBody, {
    "x-platform-registry-item-type": normalizedItemType,
    "x-platform-registry-slug": slug,
    "x-platform-binding-target": execution.bindingTarget,
    "x-platform-binding-action": target.action,
  })
}
