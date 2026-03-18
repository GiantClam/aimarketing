import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { logAuditEvent } from "@/lib/server/audit"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300

const WEBGEN_URL = process.env.WEBGEN_URL || "http://localhost:8001"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "website_generation")
    if ("response" in auth) {
      return auth.response
    }

    const rateLimit = await checkRateLimit({
      key: `webgen:${auth.user.id}:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      logAuditEvent(request, "website.generate.rate_limited", { userId: auth.user.id })
      return createRateLimitResponse("Too many website generation requests", rateLimit)
    }

    const body = await request.json()
    const response = await fetch(`${WEBGEN_URL}/api/webgen/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        user_email: auth.user.email,
        user_id: auth.user.id,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logAuditEvent(request, "website.generate.upstream_error", {
        status: response.status,
        userId: auth.user.id,
      })
      return new Response(JSON.stringify({ error: errorText || "Website generation request failed" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!response.body) {
      return new Response(JSON.stringify({ error: "Upstream response body is empty" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    }

    logAuditEvent(request, "website.generate.success", { userId: auth.user.id })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": response.headers.get("content-type") || "text/event-stream",
      },
    })
  } catch (error: any) {
    logAuditEvent(request, "website.generate.error", { message: error?.message || "unknown" })
    console.error("Webgen proxy error:", error)
    return new Response(JSON.stringify({ error: error?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
