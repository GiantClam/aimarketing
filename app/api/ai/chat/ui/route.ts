import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { isConsultingAdvisorEntryMode } from "@/lib/ai-entry/model-policy"
import { updateLatestAiEntryMessageParts } from "@/lib/ai-entry/repository"
import { readLegacySse, type LegacySseTerminalState } from "@/lib/ai-entry/legacy-sse"
import {
  createAiEntryUIStreamAdapterState,
  writeLegacyEventToAiEntryUIStream,
} from "@/lib/ai-entry/ui-message-stream-adapter"
import type { AiEntryUIMessage } from "@/lib/ai-entry/ui-message"
import { getAiEntryUIMessageText, uiMessagesToLegacyChatMessages } from "@/lib/ai-entry/ui-message"

export const runtime = "nodejs"
export const maxDuration = 1800

type UIChatRequestBody = {
  messages?: AiEntryUIMessage[]
  uiMessageRequestId?: string
  [key: string]: unknown
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const body = (await request.json()) as UIChatRequestBody
  const uiMessages = Array.isArray(body.messages) ? body.messages : []
  const modelMessages = await convertToModelMessages(
    uiMessages.map(({ id: _id, ...message }) => message),
    {
      ignoreIncompleteToolCalls: true,
      convertDataPart: () => undefined,
    },
  )
  const legacyMessages = uiMessagesToLegacyChatMessages(uiMessages, modelMessages)
  const upstreamBody = {
    ...body,
    messages: legacyMessages,
    stream: true,
  }

  const upstreamHeaders = new Headers({
    "content-type": "application/json",
    accept: "text/event-stream",
  })
  for (const headerName of ["cookie", "authorization", "x-forwarded-for", "x-real-ip", "user-agent"]) {
    const value = request.headers.get(headerName)
    if (value) upstreamHeaders.set(headerName, value)
  }

  const upstream = await fetch(new URL("/api/ai/chat", request.url), {
    method: "POST",
    headers: upstreamHeaders,
    body: JSON.stringify(upstreamBody),
    signal: request.signal,
  })

  if (!upstream.ok) {
    const errorText = await upstream.text()
    return new NextResponse(errorText || JSON.stringify({ error: "chat_request_failed" }), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
    })
  }

  let resolvedConversationId = typeof body.conversationId === "string" ? body.conversationId : ""
  const conversationScope = body.conversationScope === "consulting" || isConsultingAdvisorEntryMode(
    typeof (body.agentConfig as { entryMode?: unknown } | undefined)?.entryMode === "string"
      ? String((body.agentConfig as { entryMode?: unknown }).entryMode)
      : null,
  ) ? "consulting" as const : "chat" as const

  const streamState: LegacySseTerminalState = { terminal: null }
  let streamFailed = false
  const stream = createUIMessageStream<AiEntryUIMessage>({
    execute: async ({ writer }) => {
      const responseMessageId = `ai-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const state = createAiEntryUIStreamAdapterState(responseMessageId)
      writer.write({ type: "start", messageId: responseMessageId })

      try {
        for await (const payload of readLegacySse(upstream, streamState)) {
          if (payload.event === "conversation_init" && typeof payload.conversation_id === "string") {
            resolvedConversationId = payload.conversation_id
          }
          writeLegacyEventToAiEntryUIStream(writer, payload, state)
        }
      } catch (error) {
        streamFailed = true
        writer.write({ type: "abort", reason: error instanceof Error ? error.message : "stream_failed" })
        throw error
      }

      if (streamState.terminal === "error") {
        writer.write({ type: "abort", reason: "upstream_error" })
        return
      }

      writer.write({ type: "finish", finishReason: "stop" })
    },
    onError: () => "An error occurred while streaming the AI response.",
    originalMessages: uiMessages,
    onFinish: async ({ messages, isAborted }) => {
      if (isAborted || streamFailed || !resolvedConversationId) return

      const requestId = typeof body.uiMessageRequestId === "string" ? body.uiMessageRequestId.trim() : ""
      const userMessageIdempotencyKey = requestId ? `ui:${requestId}:user` : null
      const assistantMessageIdempotencyKey = requestId ? `ui:${requestId}:assistant` : null

      const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant")
      if (assistantMessage) {
        try {
          await updateLatestAiEntryMessageParts({
            userId: auth.user.id,
            conversationId: resolvedConversationId,
            role: "assistant",
            content: getAiEntryUIMessageText(assistantMessage),
            parts: assistantMessage.parts,
            metadata: assistantMessage.metadata || null,
            idempotencyKey: assistantMessageIdempotencyKey,
            scope: conversationScope,
            agentId: typeof (body.agentConfig as { agentId?: unknown } | undefined)?.agentId === "string"
              ? String((body.agentConfig as { agentId?: unknown }).agentId)
              : null,
          })
        } catch (error) {
          console.error("ai-entry.ui-message.assistant-parts.persist.failed", {
            conversationId: resolvedConversationId,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")
      if (latestUserMessage) {
        try {
          await updateLatestAiEntryMessageParts({
            userId: auth.user.id,
            conversationId: resolvedConversationId,
            role: "user",
            content: getAiEntryUIMessageText(latestUserMessage),
            parts: latestUserMessage.parts,
            metadata: latestUserMessage.metadata || null,
            idempotencyKey: userMessageIdempotencyKey,
            scope: conversationScope,
            agentId: typeof (body.agentConfig as { agentId?: unknown } | undefined)?.agentId === "string"
              ? String((body.agentConfig as { agentId?: unknown }).agentId)
              : null,
          })
        } catch (error) {
          console.error("ai-entry.ui-message.user-parts.persist.failed", {
            conversationId: resolvedConversationId,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
