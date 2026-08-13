import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { isConsultingAdvisorEntryMode } from "@/lib/ai-entry/model-policy"
import { appendAiEntryMessage, updateLatestAiEntryMessageParts } from "@/lib/ai-entry/repository"
import { readLegacySse, type LegacySseTerminalState } from "@/lib/ai-entry/legacy-sse"
import {
  createAiEntryUIStreamAdapterState,
  writeLegacyEventToAiEntryUIStream,
} from "@/lib/ai-entry/ui-message-stream-adapter"
import type { AiEntryUIMessage } from "@/lib/ai-entry/ui-message"
import { getAiEntryUIMessageText, getAiEntryUIMessageTurnId, uiMessagesToLegacyChatMessages } from "@/lib/ai-entry/ui-message"
import type { AiEntryTaskRunSummary } from "@/lib/ai-entry/task-runs"

export const runtime = "nodejs"
export const maxDuration = 1800

type UIChatRequestBody = {
  messages?: AiEntryUIMessage[]
  uiMessageRequestId?: string
  durableTask?: boolean
  [key: string]: unknown
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const body = (await request.json()) as UIChatRequestBody
  const uiMessages = Array.isArray(body.messages) ? body.messages : []
  const latestUserMessageInRequest = [...uiMessages].reverse().find((message) => message.role === "user")
  const turnId = (latestUserMessageInRequest ? getAiEntryUIMessageTurnId(latestUserMessageInRequest) : null)
    || body.uiMessageRequestId
    || crypto.randomUUID()
  const modelMessages = await convertToModelMessages(
    uiMessages.map(({ id: _id, ...message }) => message),
    {
      ignoreIncompleteToolCalls: true,
      convertDataPart: () => undefined,
    },
  )
  const legacyMessages = uiMessagesToLegacyChatMessages(uiMessages, modelMessages)
  const durableTask = body.durableTask === true || asRecord(body.agentConfig)?.agentId === "executive-ppt"
  const upstreamBody = {
    ...body,
    messages: legacyMessages,
    uiMessageRequestId: turnId,
    stream: !durableTask,
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
  let queuedPayload: Record<string, unknown> | null = null
  let completedPayload: Record<string, unknown> | null = null
  if (durableTask) {
    const payload = asRecord(await upstream.json().catch(() => null))
    if (!payload) return NextResponse.json({ error: "chat_queue_response_invalid" }, { status: 502 })
    if (typeof payload.conversationId === "string") resolvedConversationId = payload.conversationId
    if (asRecord(payload.pending_task)) queuedPayload = payload
    else completedPayload = payload
  }
  const conversationScope = body.conversationScope === "consulting" || isConsultingAdvisorEntryMode(
    typeof (body.agentConfig as { entryMode?: unknown } | undefined)?.entryMode === "string"
      ? String((body.agentConfig as { entryMode?: unknown }).entryMode)
      : null,
  ) ? "consulting" as const : "chat" as const

  const streamState: LegacySseTerminalState = { terminal: null }
  let streamFailed = false
  const stream = createUIMessageStream<AiEntryUIMessage>({
    execute: async ({ writer }) => {
      const responseMessageId = `ai-entry-${turnId}`
      const state = createAiEntryUIStreamAdapterState(responseMessageId)
      writer.write({ type: "start", messageId: responseMessageId })

      try {
        if (queuedPayload) {
          const pendingTask = asRecord(queuedPayload.pending_task)
          const textPartId = `text-${responseMessageId}`
          writer.write({ type: "text-start", id: textPartId })
          writer.write({ type: "text-delta", id: textPartId, delta: asString(queuedPayload.message) || "Task queued; execution continues in the background." })
          writer.write({ type: "text-end", id: textPartId })
          if (pendingTask) {
            const now = Math.floor(Date.now() / 1000)
            const queuedTaskRun: AiEntryTaskRunSummary = {
              task_id: asString(pendingTask.task_id) || responseMessageId,
              task_source: "runtime",
              status: "pending",
              task_type: "opencode_agent_run",
              conversation_id: asString(pendingTask.conversation_id) || resolvedConversationId,
              agent_id: asString(pendingTask.agent_id) || null,
              created_at: now,
              updated_at: now,
              started_at: null,
              stage: "runtime_queued",
              stage_label: asString(pendingTask.stage_label) || asString(queuedPayload.message) || "Task queued",
              progress_current: 0,
              progress_total: 1,
              last_heartbeat_at: now,
              finished_at: null,
              preview_session_id: null,
              request_label: null,
              result_summary: null,
              selected_template_id: null,
              selected_template_label: null,
              error_code: null,
              error_message: null,
              error: null,
              events: [],
            }
            writer.write({ type: "data-task-run", id: `task-${queuedTaskRun.task_id}`, data: { taskRun: queuedTaskRun } })
            writer.write({
              type: "data-runtime-status",
              id: `runtime-${responseMessageId}`,
              data: {
                status: "queued",
                stage: asString(pendingTask.stage) || "runtime_queued",
                message: asString(pendingTask.stage_label) || asString(queuedPayload.message),
                conversationId: resolvedConversationId,
              },
            })
          }
        } else if (completedPayload) {
          const answer = asString(completedPayload.message)
          if (answer) {
            writeLegacyEventToAiEntryUIStream(writer, {
              event: "message",
              answer,
              conversation_id: resolvedConversationId,
            }, state)
          }
          const artifacts = Array.isArray(completedPayload.artifacts) ? completedPayload.artifacts : []
          for (const artifact of artifacts) {
            const record = asRecord(artifact)
            if (!record) continue
            writeLegacyEventToAiEntryUIStream(writer, {
              event: "artifact_created",
              artifact: record,
            }, state)
          }
          writeLegacyEventToAiEntryUIStream(writer, { event: "message_end" }, state)
        } else {
          for await (const payload of readLegacySse(upstream, streamState)) {
            if (typeof payload.conversation_id === "string" && payload.conversation_id.trim()) {
              resolvedConversationId = payload.conversation_id
            }
            writeLegacyEventToAiEntryUIStream(writer, payload, state)
          }
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

      const requestId = turnId.trim()
      const userMessageIdempotencyKey = requestId ? `ui:${requestId}:user` : null
      const assistantMessageIdempotencyKey = requestId ? `ui:${requestId}:assistant` : null

      const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant")
      if (assistantMessage) {
        try {
          const assistantPartsParams = {
            userId: auth.user.id,
            conversationId: resolvedConversationId,
            role: "assistant" as const,
            content: getAiEntryUIMessageText(assistantMessage),
            parts: assistantMessage.parts,
            metadata: { ...(asRecord(assistantMessage.metadata) || {}), turnId },
            idempotencyKey: assistantMessageIdempotencyKey,
            scope: conversationScope,
            agentId: typeof (body.agentConfig as { agentId?: unknown } | undefined)?.agentId === "string"
              ? String((body.agentConfig as { agentId?: unknown }).agentId)
              : null,
          }
          const updated = await updateLatestAiEntryMessageParts(assistantPartsParams)
          if (!updated) await appendAiEntryMessage(assistantPartsParams)
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
            metadata: { ...(asRecord(latestUserMessage.metadata) || {}), turnId },
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
