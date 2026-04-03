import { NextRequest, NextResponse } from "next/server"

import { createPendingWriterConversation } from "@/lib/assistant-async"
import { requireSessionUser } from "@/lib/auth/guards"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { normalizeWriterLanguage, normalizeWriterMode, normalizeWriterPlatform } from "@/lib/writer/config"
import { getWriterConversation, listWriterMessages, updateWriterLatestAssistantMessage } from "@/lib/writer/repository"
import { runWriterSkillsTurn } from "@/lib/writer/skills"
import { createWriterSseStream } from "@/lib/writer/stream"
import type { WriterConversationStatus, WriterPreloadedBrief } from "@/lib/writer/types"

export const runtime = "nodejs"

const WRITER_CHAT_HISTORY_LIMIT = 12
const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

function normalizeWriterPreloadedBrief(input: unknown): WriterPreloadedBrief | null {
  if (!input || typeof input !== "object") return null

  const candidate = input as Record<string, unknown>
  const brief: WriterPreloadedBrief = {}

  for (const key of ["topic", "audience", "objective", "tone", "constraints"] as const) {
    const value = typeof candidate[key] === "string" ? candidate[key].trim() : ""
    if (value) {
      brief[key] = value
    }
  }

  return Object.keys(brief).length > 0 ? brief : null
}

export async function POST(req: NextRequest) {
  let userId: number | null = null
  let pendingConversationId: string | null = null

  try {
    const body = await req.json()
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }
    userId = auth.user.id

    const platform = normalizeWriterPlatform(body?.platform)
    const mode = normalizeWriterMode(platform, body?.mode)
    const language = normalizeWriterLanguage(body?.language)

    const rateLimit = await checkRateLimit({
      key: `writer:chat:stream:${auth.user.id}:${getRequestIp(req)}:${platform}:${mode}`,
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

    const preloadedBrief = normalizeWriterPreloadedBrief(body?.brief)
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : null
    const existingConversation = conversationId ? await getWriterConversation(auth.user.id, conversationId) : null
    const history = conversationId
      ? (await listWriterMessages(auth.user.id, conversationId, WRITER_CHAT_HISTORY_LIMIT)).data
      : []

    const pending = await createPendingWriterConversation({
      userId: auth.user.id,
      conversationId,
      query: userQuery,
      platform,
      mode,
      language,
    })
    pendingConversationId = pending.conversationId

    const turnResult = await runWriterSkillsTurn({
      query: userQuery,
      preloadedBrief,
      userId: auth.user.id,
      conversationId: pending.conversationId,
      agentType: "writer",
      platform,
      mode,
      preferredLanguage: language,
      history,
      conversationStatus: existingConversation?.status as WriterConversationStatus | undefined,
      enterpriseId: auth.user.enterpriseId,
    })

    const status = turnResult.outcome === "needs_clarification" ? "drafting" : "text_ready"

    await updateWriterLatestAssistantMessage(auth.user.id, pending.conversationId, turnResult.answer, {
      status,
      imagesRequested: false,
      language,
      platform: turnResult.routing.renderPlatform,
      mode: turnResult.routing.renderMode,
      diagnostics: turnResult.diagnostics,
    })

    const updatedConversation = (await listWriterMessages(auth.user.id, pending.conversationId, 1)).conversation
    if (!updatedConversation) {
      throw new Error("writer_stream_conversation_missing")
    }
    const finalConversation = updatedConversation

    const stream = createWriterSseStream({
      answer: turnResult.answer,
      conversation: finalConversation,
      taskId: `writer_stream_${Date.now()}`,
      outcome: turnResult.outcome,
      diagnostics: turnResult.diagnostics,
    })

    return new Response(stream, { headers: STREAM_HEADERS })
  } catch (error: any) {
    console.error("writer.chat.stream.error", error)

    if (userId && pendingConversationId) {
      const failedMessage = `Request failed: ${error instanceof Error ? error.message : "writer_stream_failed"}`
      await updateWriterLatestAssistantMessage(userId, pendingConversationId, failedMessage, {
        status: "failed",
        imagesRequested: false,
      }).catch(() => null)
    }

    return NextResponse.json({ error: error?.message || "writer_stream_failed" }, { status: 500 })
  }
}
