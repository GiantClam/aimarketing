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

export type PlatformMediaExecutionResult = {
  data: {
    runId?: number
    taskId?: string
    capabilitySlug: string
    featureId?: string
    provider: string
    status: "queued" | "running" | "succeeded" | "failed"
    results: Array<{
      url?: string | null
      outputType?: string | null
      text?: string | null
      title?: string | null
    }>
    detailPath?: string | null
    mediaTarget?: string
    requestedTarget?: string
    endpoint?: string | null
    extra?: Record<string, unknown> | null
    raw?: Record<string, unknown> | null
  }
}

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

function normalizePlatformMediaStatus(value: unknown): PlatformMediaExecutionResult["data"]["status"] {
  const normalized = String(value || "").trim().toUpperCase()
  if (normalized === "SUCCESS" || normalized === "SUCCEEDED") return "succeeded"
  if (normalized === "FAILED" || normalized === "CANCELLED") return "failed"
  if (normalized === "QUEUED" || normalized === "PENDING") return "queued"
  return "running"
}

function normalizePlatformMediaResults(value: unknown): PlatformMediaExecutionResult["data"]["results"] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      return {
        url: typeof record.url === "string" ? record.url : null,
        outputType: typeof record.outputType === "string" ? record.outputType : null,
        text: typeof record.text === "string" ? record.text : null,
        title: typeof record.title === "string" ? record.title : null,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

function inferPlatformMediaProvider(capabilitySlug: string, record: Record<string, unknown>) {
  if (typeof record.provider === "string" && record.provider.trim()) return record.provider
  if (capabilitySlug === "ai-music") return "minimax"
  return "runninghub"
}

function inferPlatformMediaDetailPath(capabilitySlug: string, taskId: string | undefined) {
  if (!taskId) return null
  if (capabilitySlug !== "ai-image" && capabilitySlug !== "ai-video" && capabilitySlug !== "ai-music") return null
  return `/api/platform/media/tasks/${encodeURIComponent(taskId)}?target=${encodeURIComponent(capabilitySlug)}`
}

export function normalizePlatformMediaExecutionPayload(input: {
  capabilitySlug: string
  featureId?: string | null
  data: Record<string, unknown> | null | undefined
}): PlatformMediaExecutionResult | null {
  const record = input.data
  if (!record || typeof record !== "object") return null

  const rawTaskId =
    typeof record.taskId === "string"
      ? record.taskId
      : typeof record.taskId === "number"
        ? String(record.taskId)
        : typeof record.runId === "number"
          ? String(record.runId)
          : undefined

  const numericRunId =
    typeof record.runId === "number"
      ? record.runId
      : rawTaskId && /^\d+$/.test(rawTaskId)
        ? Number(rawTaskId)
        : undefined

  const capabilitySlug = input.capabilitySlug
  const featureId =
    input.featureId ||
    (typeof record.featureId === "string" ? record.featureId : null) ||
    (typeof record.requestedTarget === "string" ? record.requestedTarget : null) ||
    undefined

  return {
    data: {
      runId: numericRunId,
      taskId: rawTaskId,
      capabilitySlug,
      featureId,
      provider: inferPlatformMediaProvider(capabilitySlug, record),
      status: normalizePlatformMediaStatus(record.status),
      results: normalizePlatformMediaResults(record.results),
      detailPath:
        typeof record.detailPath === "string" && record.detailPath.trim()
          ? record.detailPath
          : inferPlatformMediaDetailPath(capabilitySlug, rawTaskId),
      mediaTarget: typeof record.mediaTarget === "string" ? record.mediaTarget : capabilitySlug,
      requestedTarget: typeof record.requestedTarget === "string" ? record.requestedTarget : featureId,
      endpoint: typeof record.endpoint === "string" ? record.endpoint : null,
      extra: record.extra && typeof record.extra === "object" ? (record.extra as Record<string, unknown>) : null,
      raw: record.raw && typeof record.raw === "object" ? (record.raw as Record<string, unknown>) : null,
    },
  }
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

  if (bindingTarget === "lead-to-outreach") {
    return resolvePlatformCapabilityExecutionProxyTarget("ai-chat", action, runningHubConfig)
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
  sharedCreditsRequired?: boolean
  billingCanSpendCredits?: boolean | null
}) {
  const {
    currentUser,
    requiresLogin,
    runtimeStatus,
    accessState,
    usesSharedCredits,
    sharedCreditsRequired,
    billingCanSpendCredits,
  } = input
  const shouldCheckSharedCredits = sharedCreditsRequired ?? usesSharedCredits ?? false

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
    shouldCheckSharedCredits &&
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

  const responseContentType = response.headers.get("content-type")?.toLowerCase() || ""
  if (responseContentType.includes("text/event-stream") && response.body) {
    return new NextResponse(response.body, {
      status: response.status,
      headers: passthroughHeaders,
    })
  }

  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: passthroughHeaders,
  })
}
