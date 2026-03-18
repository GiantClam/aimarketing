import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { logAuditEvent } from "@/lib/server/audit"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 600

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const rateLimit = await checkRateLimit({
      key: `crewai:chat:${auth.user.id}:${getRequestIp(request)}`,
      limit: 20,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      logAuditEvent(request, "video.chat.rate_limited", { userId: auth.user.id })
      return createRateLimitResponse("Too many video generation requests", rateLimit)
    }

    const body = await request.json()
    const action = body.action

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 600_000)

    try {
      const response = await fetch(`${AGENT_URL}/crewai-chat`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          user_id: auth.user.id,
          user_email: auth.user.email,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        logAuditEvent(request, "video.chat.upstream_error", {
          action,
          status: response.status,
          userId: auth.user.id,
        })
        return new Response(JSON.stringify({ error: "Upstream request failed" }), {
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

      const upstream = response.body
      const stream = new ReadableStream({
        start(streamController) {
          const reader = upstream.getReader()
          const pump = async () => {
            try {
              const { done, value } = await reader.read()
              if (done) {
                streamController.close()
                return
              }
              streamController.enqueue(value)
              await pump()
            } catch (error) {
              streamController.error(error)
            }
          }
          void pump()
        },
        cancel() {
          try {
            controller.abort()
          } catch {
            // Ignore abort failures during stream cancellation.
          }
        },
      })

      logAuditEvent(request, "video.chat.stream_opened", { action, userId: auth.user.id })

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
          "X-Accel-Buffering": "no",
        },
      })
    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError?.name === "AbortError") {
        logAuditEvent(request, "video.chat.timeout", { action, userId: auth.user.id })
        return new Response(JSON.stringify({ error: "Request timed out" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        })
      }

      throw fetchError
    }
  } catch (error: any) {
    logAuditEvent(request, "video.chat.error", { message: error?.message || "unknown" })
    console.error("CrewAI proxy error:", error)
    return new Response(JSON.stringify({ error: error?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
