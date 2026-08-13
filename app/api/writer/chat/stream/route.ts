import { NextRequest, NextResponse } from "next/server"

import { createPendingWriterConversation, enqueueAssistantTask } from "@/lib/assistant-async"
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
import {
  appendWriterAssistantMessage,
  listWriterMessages,
  updateWriterAssistantMessageById,
  updateWriterLatestAssistantMessage,
} from "@/lib/writer/repository"
import { buildWriterRuntimeContext } from "@/lib/writer/runtime/session-runtime"
import { getWriterRevisionState, persistWriterRevision } from "@/lib/writer/revisions"
import type { WriterConversationStatus, WriterPreloadedBrief } from "@/lib/writer/types"

export const runtime = "nodejs"
export const maxDuration = 300

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

function normalizeWriterIdempotencyKey(input: unknown) {
  if (typeof input !== "string") return null
  const value = input.trim()
  if (!value || value.length > 128) return null
  return /^[A-Za-z0-9._:-]+$/u.test(value) ? value : null
}

function resolveWriterRequestKey(req: NextRequest, body: Record<string, unknown>) {
  const headerKey = req.headers?.get?.("Idempotency-Key")
  return (
    normalizeWriterIdempotencyKey(body.idempotencyKey) ||
    normalizeWriterIdempotencyKey(body.request_id) ||
    normalizeWriterIdempotencyKey(body.requestId) ||
    normalizeWriterIdempotencyKey(headerKey) ||
    `task-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
  )
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
    const workflowExecution = body?.executionContext === "workflow"
    const selectedProviderId =
      typeof body?.modelConfig?.providerId === "string" && body.modelConfig.providerId.trim()
        ? body.modelConfig.providerId.trim()
        : typeof body?.selectedProviderId === "string" && body.selectedProviderId.trim()
          ? body.selectedProviderId.trim()
          : null
    const selectedModelId =
      typeof body?.modelConfig?.modelId === "string" && body.modelConfig.modelId.trim()
        ? body.modelConfig.modelId.trim()
        : typeof body?.selectedModelId === "string" && body.selectedModelId.trim()
          ? body.selectedModelId.trim()
          : null
    const requestKey = resolveWriterRequestKey(req, body as Record<string, unknown>)
    const billingOperationKey = `writer-copy:stream:${auth.user.id}:${requestKey}`

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
        idempotencyKey: `${billingOperationKey}:reserve`,
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
    const revisionState = conversationId ? await getWriterRevisionState(auth.user.id, conversationId) : null
    const latestDraft = [...history].reverse().find((entry) => entry.answer.trim())
    // Clarification messages are not revisions. Do not turn the latest
    // clarification into a synthetic active revision for the next turn.
    const activeDraftContent = revisionState
      ? revisionState.activeDraft || ""
      : latestDraft?.answer || ""
    const writerContext = buildWriterRuntimeContext({
      sessionKey: undefined,
      conversationId: pending.conversationId,
      currentTurn: userQuery,
      platform,
      activeDraft: activeDraftContent
        ? {
            revision: revisionState?.activeRevision || Math.max(1, history.filter((entry) => entry.answer.trim()).length),
            title: activeDraftContent.split("\n").find((line) => /^#\s+/u.test(line.trim()))?.replace(/^#\s+/u, "").trim() || "",
            content: activeDraftContent,
            sourceUrls: [],
          }
        : null,
      recentTurns: history.flatMap((entry) => [
        ...(entry.query.trim() ? [{ role: "user" as const, content: entry.query }] : []),
        ...(entry.answer.trim() ? [{ role: "assistant" as const, content: entry.answer }] : []),
      ]),
      recentTurnLimit: 12,
      taskStatus: "pending",
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

        // OpenCode can spend a while planning and loading a skill before its
        // first text delta. Keep the browser-facing SSE response active during
        // that silent period so an otherwise successful Railway run is not
        // mistaken for a disconnected Writer request.
        const writerHeartbeat = setInterval(() => {
          sendProgressEvent({
            type: "runtime_waiting",
            label: "Writer is preparing the draft",
            detail: "OpenCode is still working on the article.",
            status: "running",
            at: Date.now(),
          })
        }, 10_000)

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
            conversationStatus: workflowExecution
              ? "text_ready"
              : (pending.conversation.status as WriterConversationStatus),
            enterpriseId: auth.user.enterpriseId,
            selectedProviderId,
            selectedModelId,
            writerContext,
            onProgress: async (event) => {
              sendProgressEvent(event)
            },
          })

          if (turnResult.outcome === "draft_ready") {
            const persistedRevision = await persistWriterRevision({
              userId: auth.user.id,
              conversationId: pending.conversationId,
              pendingAssistantMessageId: pending.assistantMessageId,
              expectedRevision: writerContext.activeDraft?.revision || 0,
              title: turnResult.answer.split("\n").find((line) => /^#\s+/u.test(line.trim()))?.replace(/^#\s+/u, "").trim() || "",
              content: turnResult.answer,
              language,
              platform: turnResult.routing.renderPlatform,
              mode: turnResult.routing.renderMode,
              diagnostics: turnResult.diagnostics,
              turnOutcome: turnResult.outcome,
              activePlatformSkillId: turnResult.routing.selectedPlatformSkillId || turnResult.routing.renderPlatform,
              contextHash: writerContext.contextHash,
            })
            if (turnResult.assetIntents?.length) {
              await enqueueAssistantTask({
                userId: auth.user.id,
                workflowName: "writer_assets",
                payload: {
                  kind: "writer_assets",
                  enterpriseId: auth.user.enterpriseId,
                  conversationId: pending.conversationId,
                  markdown: turnResult.answer,
                  platform: turnResult.routing.renderPlatform,
                  mode: turnResult.routing.renderMode,
                  assetIntents: turnResult.assetIntents,
                  expectedRevision: persistedRevision.revision,
                },
              })
            }
          } else {
            const status: WriterConversationStatus = turnResult.outcome === "needs_clarification" ? "drafting" : "text_ready"
            const responseMeta = {
              status,
              imagesRequested: false,
              language,
              platform: turnResult.routing.renderPlatform,
              mode: turnResult.routing.renderMode,
              diagnostics: turnResult.diagnostics,
            }
            const updated = pending.assistantMessageId
              ? await updateWriterAssistantMessageById(
                  auth.user.id,
                  pending.conversationId,
                  pending.assistantMessageId,
                  turnResult.answer,
                  responseMeta,
                )
              : await updateWriterLatestAssistantMessage(auth.user.id, pending.conversationId, turnResult.answer, responseMeta)
            if (!updated) {
              await appendWriterAssistantMessage({
                userId: auth.user.id,
                conversationId: pending.conversationId,
                content: turnResult.answer,
                diagnostics: turnResult.diagnostics,
                meta: { status, imagesRequested: false, language, platform: turnResult.routing.renderPlatform, mode: turnResult.routing.renderMode },
              })
            }
          }

          const updatedConversation = (await listWriterMessages(auth.user.id, pending.conversationId, 1)).conversation
          if (!updatedConversation) {
            throw new Error("writer_stream_conversation_missing")
          }

          const actualCost = estimateTextCredits({
            featureKey: "writer_copy",
            inputTokens: turnResult.usage?.inputTokens && turnResult.usage.inputTokens > 0 ? turnResult.usage.inputTokens : inputTokens,
            outputTokens: turnResult.usage?.outputTokens && turnResult.usage.outputTokens > 0 ? turnResult.usage.outputTokens : estimateWriterTokens(turnResult.answer),
            provider: "writer",
            model: "writer-skills",
          })
          await finalizeReservedCredits({
            reservation: writerCreditReservation,
            userId: auth.user.id,
            enterpriseId: auth.user.enterpriseId,
            actualAmount: actualCost.credits,
            idempotencyKey: `${billingOperationKey}:debit`,
            provider: actualCost.provider,
            model: actualCost.model,
            officialCostUsd: actualCost.officialCostUsd,
            costBasisUsd: actualCost.costBasisUsd,
            usagePayload: {
              ...actualCost.metadata,
              writerRuntimeUsage: turnResult.usage || null,
            },
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
              idempotencyKey: `${billingOperationKey}:release`,
              reason: error instanceof Error ? error.message : "writer_stream_failed",
            }).catch((billingError) => {
              console.warn("writer.chat.stream.billing.release_failed", {
                conversationId: pending.conversationId,
                message: billingError instanceof Error ? billingError.message : String(billingError),
              })
            })
          }
          const failedMessage = `Request failed: ${error instanceof Error ? error.message : "writer_stream_failed"}`
          const updated = pending.assistantMessageId
            ? await updateWriterAssistantMessageById(
                auth.user.id,
                pending.conversationId,
                pending.assistantMessageId,
                failedMessage,
                { status: "failed", imagesRequested: false },
              ).catch(() => false)
            : await updateWriterLatestAssistantMessage(auth.user.id, pending.conversationId, failedMessage, {
                status: "failed",
                imagesRequested: false,
              }).catch(() => false)
          if (!updated) {
            await appendWriterAssistantMessage({
              userId: auth.user.id,
              conversationId: pending.conversationId,
              content: failedMessage,
              meta: { status: "failed", imagesRequested: false },
            }).catch(() => null)
          }

          sendEvent({
            event: "error",
            task_id: taskId,
            conversation_id: pending.conversationId,
            error: error instanceof Error ? error.message : "writer_stream_failed",
          })
          closeStream()
        } finally {
          clearInterval(writerHeartbeat)
        }
      },
    })

    return new Response(stream, { headers: STREAM_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "writer_stream_failed" }, { status: 500 })
  }
}
