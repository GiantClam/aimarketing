import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { runImageAssistantJob } from "@/lib/image-assistant/service"
import { createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => ({}))
    const prompt = typeof body?.prompt === "string" ? body.prompt : ""
    if (!prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const result = await runImageAssistantJob({
      userId: auth.user.id,
      enterpriseId: auth.user.enterpriseId,
      requestIp: getRequestIp(req),
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      prompt,
      taskType: "edit",
      referenceAssetIds: Array.isArray(body?.referenceAssetIds) ? body.referenceAssetIds : [],
      candidateCount: Number.parseInt(String(body?.candidateCount || "1"), 10),
      sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
      qualityMode: typeof body?.qualityMode === "string" ? body.qualityMode : null,
      parentVersionId: typeof body?.parentVersionId === "string" ? body.parentVersionId : null,
    })

    return NextResponse.json({ data: result })
  } catch (error: any) {
    if (error?.message === "rate_limited") {
      return createRateLimitResponse("Too many image assistant requests", {
        ok: false,
        retryAfterSeconds: error.retryAfterSeconds || 60,
        remaining: 0,
        resetAt: Date.now() + (error.retryAfterSeconds || 60) * 1000,
      })
    }
    console.error("image-assistant.edit.error", error)
    return NextResponse.json({ error: error.message || "edit_failed" }, { status: 500 })
  }
}
