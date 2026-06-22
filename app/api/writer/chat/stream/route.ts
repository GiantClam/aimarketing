import { NextRequest, NextResponse } from "next/server"

import { createPendingWriterConversation } from "@/lib/assistant-async"
import { requireSessionUser } from "@/lib/auth/guards"
import { estimateTextCredits } from "@/lib/billing/costing"
import {
  finalizeReservedCredits,
  releaseReservedCredits,
  reserveFeatureCredits,
  type BillingReservation,
} from "@/lib/billing/runtime"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { loadWriterSkillRunner } from "@/lib/skills/runtime/registry"
import { normalizeWriterLanguage, normalizeWriterMode, normalizeWriterPlatform } from "@/lib/writer/config"
import { getWriterConversation, listWriterMessages, updateWriterLatestAssistantMessage } from "@/lib/writer/repository"
import type { WriterConversationStatus, WriterPreloadedBrief } from "@/lib/writer/types"

export const runtime = "nodejs"

const WRITER_CHAT_HISTORY_LIMIT = 12
const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}
const WRITER_STREAM_CHUNK_SIZE = 120
const WRITER_STREAM_CHUNK_DELAY_MS = 16

type WriterProgressEvent = {
  type: string
  label: string
  detail?: string
  status: string
  at?: number
}

function buildSseEvent(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function isClosedStreamControllerError(error: unknown) {
  return error instanceof Error && /controller is already closed/i.test(error.message)
}

function splitAnswerIntoChunks(answer: string) {
  const normalized = answer.trim()
  if (!normalized) return []

  const chunks: string[] = []
  for (let index = 0; index < normalized.length; index += WRITER_STREAM_CHUNK_SIZE) {
    chunks.push(normalized.slice(index, index + WRITER_STREAM_CHUNK_SIZE))
  }
  return chunks
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function estimateWriterTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
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
  try {
    const body = await req.json()
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }
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
    const inputTokens = estimateWriterTokens(
      [
        userQuery,
        ...history.map((entry) => `${entry.role}: ${entry.content}`),
        preloadedBrief ? JSON.stringify(preloadedBrief) : "",
      ].join("\n"),
    )
    const reserveEstimate = estimateTextCredits({
      featureKey: "writer_copy",
      inputTokens,
      outputTokens: Math.max(600, inputTokens),
      provider: "writer",
      model: "writer-skills",
    })
    let writerCreditReservation: BillingReservation | null = null
    let writerCreditFinalized = false
    try {
      writerCreditReservation = await reserveFeatureCredits({
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        featureKey: reserveEstimate.featureKey,
        amount: reserveEstimate.credits,
        idempotencyKey: `writer-copy:stream:reserve:${auth.user.id}:${Date.now()}`,
        metadata: {
          route: "writer.chat.stream",
          platform,
          mode,
          language,
          source: reserveEstimate.source,
        },
      })
    } catch (billingError) {
      if (billingError instanceof Error && billingError.message === "insufficient_credits") {
        return NextResponse.json({ error: "insufficient_credits" }, { status: 402 })
      }
      throw billingError
    }

    const pending = await createPendingWriterConversation({
      userId: auth.user.id,
      conversationId,
      query: userQuery,
      platform,
      mode,
      language,
    })
    const taskId = `writer_stream_${Date.now()}`
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false

        const closeStream = () => {
          if (streamClosed) return
          streamClosed = true
          try {
            controller.close()
          } catch (error) {
            if (!isClosedStreamControllerError(error)) {
              throw error
            }
          }
        }

        const sendEvent = (payload: Record<string, unknown>) => {
          if (streamClosed) return false
          try {
            controller.enqueue(encoder.encode(buildSseEvent(payload)))
            return true
          } catch (error) {
            if (isClosedStreamControllerError(error)) {
              streamClosed = true
              return false
            }
            throw error
          }
        }
        const sendProgressEvent = (event: WriterProgressEvent) => {
          return sendEvent({
            event: "progress",
            task_id: taskId,
            conversation_id: pending.conversationId,
            type: event.type,
            label: event.label,
            detail: event.detail,
            status: event.status,
            at: typeof event.at === "number" && Number.isFinite(event.at) ? event.at : Date.now(),
          })
        }

        sendEvent({
          event: "conversation_init",
          task_id: taskId,
          conversation_id: pending.conversationId,
          conversation: pending.conversation,
        })
        sendProgressEvent({
          type: "request_submitted",
          label: "Writer request submitted, preparing task",
          status: "running",
          at: Date.now(),
        })

        try {
          const writerSkillRunner = loadWriterSkillRunner()
          const turnResult = await writerSkillRunner.runBlocking({
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
            onProgress: async (event) => {
              sendProgressEvent(event)
            },
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

          const actualCost = estimateTextCredits({
            featureKey: "writer_copy",
            inputTokens,
            outputTokens: estimateWriterTokens(turnResult.answer),
            provider: "writer",
            model: "writer-skills",
          })
          await finalizeReservedCredits({
            reservation: writerCreditReservation,
            userId: auth.user.id,
            enterpriseId: auth.user.enterpriseId,
            actualAmount: actualCost.credits,
            idempotencyKey: `writer-copy:stream:debit:${pending.conversationId}:${taskId}`,
            provider: actualCost.provider,
            model: actualCost.model,
            officialCostUsd: actualCost.officialCostUsd,
            costBasisUsd: actualCost.costBasisUsd,
            usagePayload: actualCost.metadata,
            metadata: {
              route: "writer.chat.stream",
              conversationId: pending.conversationId,
              outcome: turnResult.outcome,
            },
          }).then(() => {
            writerCreditFinalized = true
          }).catch((billingError) => {
            console.warn("writer.chat.stream.billing.finalize_failed", {
              conversationId: pending.conversationId,
              message: billingError instanceof Error ? billingError.message : String(billingError),
            })
          })

          const chunks = splitAnswerIntoChunks(turnResult.answer)
          for (const chunk of chunks) {
            const delivered = sendEvent({
              event: "message",
              task_id: taskId,
              conversation_id: pending.conversationId,
              answer: chunk,
            })
            if (!delivered) break
            await sleep(WRITER_STREAM_CHUNK_DELAY_MS)
          }

          sendEvent({
            event: "message_end",
            task_id: taskId,
            conversation_id: pending.conversationId,
            answer: turnResult.answer,
            conversation: updatedConversation,
            outcome: turnResult.outcome,
            diagnostics: turnResult.diagnostics,
          })
          closeStream()
        } catch (error) {
          console.error("writer.chat.stream.error", error)
          if (!writerCreditFinalized) {
            await releaseReservedCredits({
              reservation: writerCreditReservation,
              userId: auth.user.id,
              enterpriseId: auth.user.enterpriseId,
              idempotencyKey: `writer-copy:stream:release:${pending.conversationId}:${taskId}`,
              reason: error instanceof Error ? error.message : "writer_stream_failed",
            }).catch((billingError) => {
              console.warn("writer.chat.stream.billing.release_failed", {
                conversationId: pending.conversationId,
                message: billingError instanceof Error ? billingError.message : String(billingError),
              })
            })
          }
          const failedMessage = `Request failed: ${error instanceof Error ? error.message : "writer_stream_failed"}`
          await updateWriterLatestAssistantMessage(auth.user.id, pending.conversationId, failedMessage, {
            status: "failed",
            imagesRequested: false,
          }).catch(() => null)

          sendEvent({
            event: "error",
            task_id: taskId,
            conversation_id: pending.conversationId,
            error: error instanceof Error ? error.message : "writer_stream_failed",
          })
          closeStream()
        }
      },
    })

    return new Response(stream, { headers: STREAM_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "writer_stream_failed" }, { status: 500 })
  }
}
