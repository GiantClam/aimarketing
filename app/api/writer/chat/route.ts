import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { normalizeWriterLanguage, normalizeWriterMode, normalizeWriterPlatform } from "@/lib/writer/config"
import { appendWriterMockConversation, createWriterMockStream } from "@/lib/writer/mock"
import { generateWriterDraftWithSkills } from "@/lib/writer/skills"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const platform = normalizeWriterPlatform(body?.platform)
    const mode = normalizeWriterMode(platform, body?.mode)
    const language = normalizeWriterLanguage(body?.language)

    const rateLimit = checkRateLimit({
      key: `writer:chat:${auth.user.id}:${getRequestIp(req)}:${platform}:${mode}`,
      limit: 24,
      windowMs: 60_000,
    })

    if (!rateLimit.ok) {
      return createRateLimitResponse("Too many writer requests", rateLimit)
    }

    const userQuery = typeof body?.query === "string" ? body.query : body?.inputs?.contents
    if (!userQuery || typeof userQuery !== "string" || !userQuery.trim()) {
      return NextResponse.json({ error: "query is required" }, { status: 400 })
    }

    const answer = await generateWriterDraftWithSkills(userQuery, platform, mode, language)
    const persisted = await appendWriterMockConversation({
      userId: auth.user.id,
      conversationId: typeof body?.conversation_id === "string" ? body.conversation_id : null,
      query: userQuery,
      answer,
      platform,
      mode,
      language,
    })

    const taskId = `writer-${Date.now()}`
    if (body?.response_mode === "streaming") {
      return new Response(createWriterMockStream({ answer, conversationId: persisted.conversationId, taskId }), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    return NextResponse.json({
      event: "message",
      task_id: taskId,
      conversation_id: persisted.conversationId,
      answer,
    })
  } catch (error: any) {
    console.error("writer.chat.error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
