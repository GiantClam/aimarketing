import { NextRequest, NextResponse } from "next/server"

import { createPendingWriterConversation, enqueueAssistantTask } from "@/lib/assistant-async"
import { requireSessionUser } from "@/lib/auth/guards"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { normalizeWriterLanguage, normalizeWriterMode, normalizeWriterPlatform } from "@/lib/writer/config"
import { getWriterConversation, listWriterMessages } from "@/lib/writer/repository"
import type { WriterConversationStatus } from "@/lib/writer/types"

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

    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : null
    const existingConversation = conversationId ? await getWriterConversation(auth.user.id, conversationId) : null
    const history = conversationId ? (await listWriterMessages(auth.user.id, conversationId, 5)).data : []
    const persisted = await createPendingWriterConversation({
      userId: auth.user.id,
      conversationId,
      query: userQuery,
      platform,
      mode,
      language,
    })

    const task = await enqueueAssistantTask({
      userId: auth.user.id,
      workflowName: "writer_turn",
      payload: {
        kind: "writer_turn",
        enterpriseId: auth.user.enterpriseId,
        conversationId: persisted.conversationId,
        query: userQuery,
        platform,
        mode,
        language,
        history,
        conversationStatus: existingConversation?.status as WriterConversationStatus | undefined,
      },
    })

    return NextResponse.json({
      accepted: true,
      task_id: String(task.id),
      conversation_id: persisted.conversationId,
      conversation: persisted.conversation,
    })
  } catch (error: any) {
    console.error("writer.chat.error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
