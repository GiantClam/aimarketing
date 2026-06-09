import { NextRequest, NextResponse } from "next/server"

import type { AuthUser } from "@/lib/auth/session"
import { isBillingCreditEnforcementEnabled } from "@/lib/billing/runtime"
import type { PlatformRegistryItemType } from "@/lib/platform/control-plane"
import type {
  PlatformCapabilityAccessState,
  PlatformCapabilityRuntimeStatus,
} from "@/lib/platform/execution"
import { resolvePlatformMediaExecutionProxyTarget } from "@/lib/platform/media-execute"
import type { RunningHubConfig } from "@/lib/platform/runninghub"

export type PlatformExecutionSurface = "public" | "workspace"

export type PlatformExecutionProxyTarget = {
  action: string
  downstreamPath: string
  requiresLogin: boolean
  bodyOverrides?: Record<string, unknown>
}

export type PlatformExecutionGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

function normalizeAction(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "execute"
}

function buildExecutionJsonError(error: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json(
    {
      error,
      ...(details ? { details } : {}),
    },
    { status },
  )
}

export function normalizePlatformRegistryItemType(value: string | null): PlatformRegistryItemType | null {
  if (value === "capability" || value === "agent" || value === "plugin" || value === "workflow") return value
  if (value === "mcp_service" || value === "mcp-services" || value === "mcp") return "mcp_service"
  return null
}

export function resolvePlatformCapabilityExecutionProxyTarget(
  capabilitySlug: string,
  actionInput?: string | null,
  runningHubConfig?: RunningHubConfig,
): PlatformExecutionProxyTarget | null {
  const action = normalizeAction(actionInput)

  if (capabilitySlug === "ai-chat" || capabilitySlug === "agent-platform") {
    if (action === "execute" || action === "chat" || action === "message") {
      return {
        action,
        downstreamPath: "/api/ai/chat",
        requiresLogin: true,
      }
    }
    return null
  }

  if (capabilitySlug === "ai-ppt") {
    if (action === "execute" || action === "preview") {
      return {
        action: "preview",
        downstreamPath: "/api/tools/ai-ppt-preview/preview",
        requiresLogin: false,
      }
    }
    if (action === "finalize") {
      return {
        action,
        downstreamPath: "/api/tools/ai-ppt-preview/finalize",
        requiresLogin: true,
      }
    }
    if (action === "download") {
      return {
        action,
        downstreamPath: "/api/tools/ai-ppt-preview/download",
        requiresLogin: true,
      }
    }
    return null
  }

  if (capabilitySlug === "ai-image") {
    return resolvePlatformMediaExecutionProxyTarget("ai-image", action, runningHubConfig)
  }

  if (capabilitySlug === "ai-video") {
    return resolvePlatformMediaExecutionProxyTarget("ai-video", action, runningHubConfig)
  }

  if (capabilitySlug === "ai-music") {
    return {
      action: action === "execute" ? "generate" : action,
      downstreamPath: `/api/platform/media/run?target=ai-music&action=${encodeURIComponent(action === "execute" ? "generate" : action)}`,
      requiresLogin: true,
    }
  }

  return null
}

export function resolvePlatformBindingExecutionProxyTarget(
  bindingTarget: string,
  actionInput?: string | null,
  runningHubConfig?: RunningHubConfig,
): PlatformExecutionProxyTarget | null {
  const action = normalizeAction(actionInput)

  if (bindingTarget === "content-repurpose") {
    if (action === "execute" || action === "chat" || action === "generate") {
      return {
        action: "chat",
        downstreamPath: "/api/writer/chat",
        requiresLogin: true,
      }
    }
    return null
  }

  if (bindingTarget === "campaign-launch") {
    return resolvePlatformCapabilityExecutionProxyTarget("ai-ppt", action)
  }

  if (bindingTarget === "visual-ad-pipeline") {
    return resolvePlatformMediaExecutionProxyTarget("visual-ad-pipeline", action, runningHubConfig)
  }

  return resolvePlatformCapabilityExecutionProxyTarget(bindingTarget, action, runningHubConfig)
}

export function evaluatePlatformExecutionGate(input: {
  currentUser: AuthUser | null | undefined
  requiresLogin: boolean
  runtimeStatus: PlatformCapabilityRuntimeStatus | null
  accessState: PlatformCapabilityAccessState | null
  usesSharedCredits?: boolean
  billingCanSpendCredits?: boolean | null
}) {
  const { currentUser, requiresLogin, runtimeStatus, accessState, usesSharedCredits, billingCanSpendCredits } = input

  if (runtimeStatus === "deferred") {
    return {
      ok: false,
      response: buildExecutionJsonError("deferred_runtime", 409),
    } satisfies PlatformExecutionGateResult
  }

  if (runtimeStatus === "runtime_disabled") {
    return {
      ok: false,
      response: buildExecutionJsonError("runtime_disabled", 410),
    } satisfies PlatformExecutionGateResult
  }

  if (requiresLogin && !currentUser) {
    return {
      ok: false,
      response: buildExecutionJsonError("authentication_required", 401),
    } satisfies PlatformExecutionGateResult
  }

  if (accessState === "admin_required") {
    return {
      ok: false,
      response: buildExecutionJsonError("admin_required", 403),
    } satisfies PlatformExecutionGateResult
  }

  if (accessState === "permission_required") {
    return {
      ok: false,
      response: buildExecutionJsonError("permission_required", 403),
    } satisfies PlatformExecutionGateResult
  }

  if ((accessState === "login_required" || accessState === "public_then_login") && requiresLogin && !currentUser) {
    return {
      ok: false,
      response: buildExecutionJsonError("authentication_required", 401),
    } satisfies PlatformExecutionGateResult
  }

  if (
    currentUser &&
    isBillingCreditEnforcementEnabled() &&
    usesSharedCredits &&
    billingCanSpendCredits === false
  ) {
    return {
      ok: false,
      response: buildExecutionJsonError("insufficient_credits", 402),
    } satisfies PlatformExecutionGateResult
  }

  return { ok: true } satisfies PlatformExecutionGateResult
}

export async function proxyPlatformExecutionRequest(
  request: NextRequest,
  target: PlatformExecutionProxyTarget,
  rawBody: string,
  meta: Record<string, string>,
) {
  const headers = new Headers()
  const contentType = request.headers.get("content-type")
  const cookie = request.headers.get("cookie")

  if (contentType) headers.set("content-type", contentType)
  if (cookie) headers.set("cookie", cookie)

  headers.set("x-platform-execution-proxy", "1")
  for (const [key, value] of Object.entries(meta)) {
    headers.set(key, value)
  }

  let body = rawBody || undefined
  if (target.bodyOverrides) {
    const parsed = rawBody?.trim() ? JSON.parse(rawBody) : {}
    body = JSON.stringify({
      ...parsed,
      ...target.bodyOverrides,
    })
    headers.set("content-type", "application/json")
  }

  const response = await fetch(new URL(target.downstreamPath, request.url), {
    method: "POST",
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  })

  const passthroughHeaders = new Headers()
  for (const key of [
    "content-type",
    "content-disposition",
    "cache-control",
    "location",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ]) {
    const value = response.headers.get(key)
    if (value) passthroughHeaders.set(key, value)
  }
  passthroughHeaders.set("x-platform-proxy-target", target.downstreamPath)

  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: passthroughHeaders,
  })
}
