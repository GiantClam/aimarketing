import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { sendMessage } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { logAuditEvent } from "@/lib/server/audit"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = await requireAdvisorAccess(req, body?.advisorType)
    if ("response" in auth) {
      return auth.response
    }

    const rateLimit = checkRateLimit({
      key: `dify:chat:${auth.user.id}:${getRequestIp(req)}:${body.advisorType}`,
      limit: 30,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      logAuditEvent(req, "advisor.chat.rate_limited", { userId: auth.user.id, advisorType: body?.advisorType })
      return createRateLimitResponse("Too many advisor requests", rateLimit)
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, body.advisorType)
    const config = await getDifyConfigByAdvisorType(body.advisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })
    if (!config) {
      logAuditEvent(req, "advisor.chat.config_missing", { userId: auth.user.id, advisorType: body?.advisorType })
      return NextResponse.json({ error: "No Dify connection configured" }, { status: 500 })
    }

    const difyRes = await sendMessage(config, { ...body, user: difyUser })

    if (!difyRes.ok) {
      const errorData = await difyRes.text()
      return NextResponse.json({ error: "Dify API Error", details: errorData }, { status: difyRes.status })
    }

    if (body.response_mode === "streaming" && difyRes.body) {
      return new Response(difyRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    const data = await difyRes.json()
    logAuditEvent(req, "advisor.chat.success", { userId: auth.user.id, advisorType: body?.advisorType })
    return NextResponse.json(data)
  } catch (error: any) {
    logAuditEvent(req, "advisor.chat.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
