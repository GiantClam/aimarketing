import {
  claimTaskExecution,
  createTask,
  getTaskById,
  listRecoverableTaskIds,
  renewTaskLease,
  updateTaskStatus,
} from "@/lib/services/tasks"
import { getMessages, sendMessage } from "@/lib/dify/client"
import { estimateTextCredits } from "@/lib/billing/costing"
import {
  finalizeReservedCredits,
  releaseReservedCredits,
  reserveFeatureCredits,
  type BillingReservation,
} from "@/lib/billing/runtime"
import { appendAiEntryMessage, type AiEntryConversationScope } from "@/lib/ai-entry/repository"
import { buildPptToolResultMessage } from "@/lib/ai-entry/ppt-tool-result-message"
import { buildAiEntryPptTools } from "@/lib/ai-entry/ppt-tools"
import type { AiEntryTaskRunStage } from "@/lib/ai-entry/task-runs"
import { getLeadToolPptExecutionTransport } from "@/lib/lead-tools/config"
import { persistLeadToolPreviewResult } from "@/lib/lead-tools/runtime"
import { storePptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"
import type { PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"
import {
  isPptMasterLibraryTemplateSupported,
} from "@/lib/lead-tools/ppt-worker-capabilities"
import {
  requestPptWorkerPreviewStatus,
  requestPptWorkerPreviewSubmit,
} from "@/lib/lead-tools/ppt-worker-client"
import type { PptWorkerPreviewRequest } from "@/lib/lead-tools/ppt-worker-types"
import { getPptPreviewJobByRequestId } from "@/lib/platform/ppt-job-store"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { buildDifyMemoryBridge, mergeDifyInputsWithMemoryBridge } from "@/lib/dify/memory-bridge"
import { getUserAuthPayload } from "@/lib/enterprise/server"
import {
  createImageAssistantSession,
  createImageAssistantMessage,
  getImageAssistantSession,
} from "@/lib/image-assistant/repository"
import type { LeadHunterEvidenceItem } from "@/lib/lead-hunter/evidence-types"
import { appendLeadHunterMessage, saveLeadHunterEvidenceForMessage } from "@/lib/lead-hunter/repository"
import { buildLeadHunterChatPayload, formatLeadHunterChatOutput } from "@/lib/lead-hunter/chat"
import { getLeadHunterAgentName, normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import { runImageAssistantConversationTurn } from "@/lib/image-assistant/service"
import { resolveImageAssistantMemoryBridge } from "@/lib/image-assistant/memory-bridge"
import {
  loadExecutiveAdvisorSkillRunner,
  loadLeadHunterSkillRunner,
  loadWriterSkillRunner,
} from "@/lib/skills/runtime/registry"
import { normalizeExecutiveAdvisorType } from "@/lib/skills/runtime/executive-advisor-types"
import { appendWriterConversation, updateWriterLatestAssistantMessage } from "@/lib/writer/repository"
import { persistWriterImplicitMemoryFromTurn } from "@/lib/writer/memory/extractor"
import { withTaskTimeout } from "@/lib/task-timeout"
import type { WriterLanguage, WriterMode, WriterPlatform } from "@/lib/writer/config"
import type { WriterConversationStatus, WriterHistoryEntry, WriterPreloadedBrief } from "@/lib/writer/types"
import type { WriterAgentType } from "@/lib/writer/memory/types"
import type {
  ImageAssistantBrief,
  ImageAssistantGuidedSelection,
  ImageAssistantInvocationMode,
  ImageAssistantTaskType,
} from "@/lib/image-assistant/types"
import type {
  GptImage2Background,
  GptImage2OutputFormat,
  GptImage2Quality,
  GptImage2Moderation,
  GptImage2ResponseFormat,
} from "@/lib/image-assistant/model-options"

type AssistantTaskStatus = "pending" | "running" | "success" | "failed"
type AssistantTaskProgressStatus = "running" | "completed" | "failed" | "info"

type AssistantTaskProgressEvent = {
  type: string
  label: string
  detail?: string
  status: AssistantTaskProgressStatus
  at: number
}

function normalizeAssistantTaskProgressStatus(status: unknown): AssistantTaskProgressStatus {
  return status === "running" || status === "completed" || status === "failed" || status === "info"
    ? status
    : "running"
}

type WriterTurnTaskPayload = {
  kind: "writer_turn"
  enterpriseId?: number | null
  conversationId: string
  query: string
  agentType?: WriterAgentType
  brief?: WriterPreloadedBrief | null
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
  history: WriterHistoryEntry[]
  conversationStatus?: WriterConversationStatus
}

type ImageTurnTaskPayload = {
  kind: "image_turn"
  userId: number
  enterpriseId?: number | null
  enterpriseRole?: string | null
  enterpriseStatus?: string | null
  requestIp: string
  sessionId: string
  prompt: string
  brief?: Partial<ImageAssistantBrief> | null
  taskType: ImageAssistantTaskType
  invocationMode?: ImageAssistantInvocationMode | null
  referenceAssetIds?: string[]
  referenceUrls?: string[]
  modelOptionId?: string | null
  providerLock?: "pptoken" | "aiberm" | "crazyroute" | null
  model?: string | null
  candidateCount?: number
  sizePreset?: string | null
  resolution?: string | null
  imageSize?: string | null
  imageQuality?: GptImage2Quality | null
  imageBackground?: GptImage2Background | null
  imageOutputFormat?: GptImage2OutputFormat | null
  imageOutputCompression?: number | null
  imageModeration?: GptImage2Moderation | null
  imageResponseFormat?: GptImage2ResponseFormat | null
  parentVersionId?: string | null
  extraInstructions?: string | null
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  versionMeta?: Record<string, unknown> | null
  guidedSelection?: ImageAssistantGuidedSelection | null
}

type AdvisorTurnTaskPayload = {
  kind: "advisor_turn"
  userId: number
  userEmail: string
  advisorType: string
  query: string
  preferredLanguage?: "zh" | "en" | "auto" | null
  conversationId?: string | null
  memoryContext?: string | null
  soulCard?: string | null
  memoryAppliedIds?: number[]
  enterpriseId?: number | null
  enterpriseCode?: string | null
}

type AiEntryPptPreviewTaskPayload = {
  kind: "ai_entry_ppt_preview"
  userId: number
  conversationId: string
  conversationScope: AiEntryConversationScope
  agentId: string
  toolCallId: string
  input: Record<string, unknown>
  isZh?: boolean
}

export type AssistantTaskPayload =
  | WriterTurnTaskPayload
  | ImageTurnTaskPayload
  | AdvisorTurnTaskPayload
  | AiEntryPptPreviewTaskPayload

type ParsedTaskRow = Awaited<ReturnType<typeof getTaskById>> & {
  parsedPayload?: AssistantTaskPayload | null
  parsedResult?: Record<string, unknown> | null
}

const taskRunnerState = globalThis as typeof globalThis & {
  __assistantTaskPromises__?: Map<number, Promise<void>>
}

const runningTasks = taskRunnerState.__assistantTaskPromises__ || new Map<number, Promise<void>>()
taskRunnerState.__assistantTaskPromises__ = runningTasks

function parseTimeoutMs(raw: string | undefined, fallbackMs: number, minMs = 5_000, maxMs = 600_000) {
  const parsed = Number.parseInt(raw || "", 10)
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs
  return Math.max(minMs, Math.min(maxMs, value))
}

function parseBooleanFlag(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function parseIntWithRange(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(raw || "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function estimateTextTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
}

const WRITER_TASK_TIMEOUT_MS = parseTimeoutMs(process.env.WRITER_TASK_TIMEOUT_MS, 180_000)
const WRITER_MEMORY_EXTRACT_TIMEOUT_MS = parseTimeoutMs(process.env.WRITER_MEMORY_EXTRACT_TIMEOUT_MS, 2_000, 100, 10_000)
const IMAGE_ASSISTANT_TASK_TIMEOUT_MS = parseTimeoutMs(process.env.IMAGE_ASSISTANT_TASK_TIMEOUT_MS, 300_000)
const ADVISOR_TASK_TIMEOUT_MS = parseTimeoutMs(process.env.ADVISOR_TASK_TIMEOUT_MS, 240_000, 30_000, 300_000)
const AI_ENTRY_PPT_PREVIEW_TASK_TIMEOUT_MS = parseTimeoutMs(
  process.env.AI_ENTRY_PPT_PREVIEW_TASK_TIMEOUT_MS,
  1_200_000,
  30_000,
  1_200_000,
)
const ASSISTANT_STALE_TASK_MS = parseTimeoutMs(process.env.ASSISTANT_STALE_TASK_MS, 45_000, 10_000, 600_000)
const ADVISOR_RECOVERY_CHECK_MS = parseTimeoutMs(
  process.env.ADVISOR_RECOVERY_CHECK_MS,
  Math.max(ASSISTANT_STALE_TASK_MS, 60_000),
  10_000,
  600_000,
)
const ADVISOR_UPSTREAM_RETRY_ATTEMPTS = Math.max(
  1,
  Math.min(5, Number.parseInt(process.env.ADVISOR_UPSTREAM_RETRY_ATTEMPTS || "", 10) || 2),
)
const ADVISOR_UPSTREAM_RETRY_BASE_DELAY_MS = parseTimeoutMs(
  process.env.ADVISOR_UPSTREAM_RETRY_BASE_DELAY_MS,
  1_200,
  200,
  20_000,
)
const ASSISTANT_TASK_LEASE_MS = 30_000
const ASSISTANT_TASK_HEARTBEAT_MS = 10_000
const ASSISTANT_TASK_PROGRESS_LIMIT = 40
const ASSISTANT_TASK_PROGRESS_PERSIST_INTERVAL_MS = 900
const AI_ENTRY_PPT_PREVIEW_RETRY_ATTEMPTS = parseIntWithRange(
  process.env.AI_ENTRY_PPT_PREVIEW_RETRY_ATTEMPTS,
  3,
  1,
  5,
)
const AI_ENTRY_PPT_PREVIEW_RETRY_DELAY_MS = parseTimeoutMs(
  process.env.AI_ENTRY_PPT_PREVIEW_RETRY_DELAY_MS,
  1_500,
  100,
  30_000,
)
const LEAD_HUNTER_ASYNC_EVIDENCE_PERSIST = parseBooleanFlag(process.env.LEAD_HUNTER_ASYNC_EVIDENCE_PERSIST, true)
const LEAD_HUNTER_DEFER_PERSIST_AFTER_SUCCESS = parseBooleanFlag(
  process.env.LEAD_HUNTER_DEFER_PERSIST_AFTER_SUCCESS,
  true,
)
const LEAD_HUNTER_EVIDENCE_PERSIST_LIMIT = parseIntWithRange(
  process.env.LEAD_HUNTER_EVIDENCE_PERSIST_LIMIT,
  16,
  4,
  60,
)
const ASSISTANT_TASK_RECOVERY_BATCH_LIMIT = Math.max(
  1,
  Math.min(30, Number.parseInt(process.env.ASSISTANT_TASK_RECOVERY_BATCH_LIMIT || "", 10) || 6),
)

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}

function parseTask(task: Awaited<ReturnType<typeof getTaskById>>): ParsedTaskRow {
  if (!task) return task as ParsedTaskRow
  return {
    ...task,
    parsedPayload: safeJsonParse(task.payload) as AssistantTaskPayload | null,
    parsedResult: safeJsonParse(task.result),
  }
}

function sanitizeAssistantContent(raw: string) {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function extractSseBlocks(buffer: string) {
  const parts = buffer.split(/\r?\n\r?\n/)
  return { blocks: parts.slice(0, -1), rest: parts.at(-1) ?? "" }
}

function getSseDataFromBlock(block: string) {
  const raw = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim()

  if (!raw || raw === "[DONE]") return null

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map(extractText).find((item) => item.length > 0) || ""
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(extractText).find((item) => item.length > 0) || ""
  }
  return ""
}

function getObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickFirstNonEmptyText(...values: unknown[]) {
  for (const value of values) {
    const text = extractText(value).trim()
    if (text) return text
  }
  return ""
}

function truncateText(value: string, max = 160) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetryAdvisorUpstreamError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("sslerror") ||
    normalized.includes("ssleoferror") ||
    normalized.includes("unexpected_eof_while_reading") ||
    normalized.includes("httpsconnectionpool") ||
    normalized.includes("max retries exceeded") ||
    normalized.includes("connection reset") ||
    normalized.includes("econnreset") ||
    normalized.includes("connection terminated") ||
    normalized.includes("terminating connection") ||
    normalized.includes("connection reset") ||
    normalized.includes("administrator command") ||
    normalized.includes("etimedout") ||
    normalized.includes("timed out") ||
    normalized.includes("temporarily unavailable")
  )
}

function pushTaskProgressEvent(events: AssistantTaskProgressEvent[], input: AssistantTaskProgressEvent) {
  const last = events.at(-1)
  if (last && last.type === input.type && last.label === input.label && last.detail === input.detail) {
    return
  }
  events.push(input)
  if (events.length > ASSISTANT_TASK_PROGRESS_LIMIT) {
    events.splice(0, events.length - ASSISTANT_TASK_PROGRESS_LIMIT)
  }
}

function mapDifySseEventToTaskProgress(payload: Record<string, unknown>): AssistantTaskProgressEvent | null {
  const event = typeof payload.event === "string" ? payload.event : ""
  if (!event || event === "ping" || event === "message" || event === "agent_message" || event === "text_chunk") {
    return null
  }

  const data = getObjectRecord(payload.data)
  const nodeTitle = pickFirstNonEmptyText(
    data?.title,
    data?.node_name,
    data?.node_title,
    data?.node_id,
    data?.node_type,
  )
  const dataStatus = pickFirstNonEmptyText(data?.status).toLowerCase()
  const now = Date.now()

  if (event === "workflow_started") {
    return { type: event, label: "Workflow started", status: "running", at: now }
  }

  if (event === "workflow_finished") {
    const workflowError = pickFirstNonEmptyText(data?.error, payload.error)
    const failed = dataStatus === "failed" || Boolean(workflowError)
    return {
      type: event,
      label: failed ? "Workflow failed" : "Workflow completed",
      detail: workflowError ? truncateText(workflowError) : undefined,
      status: failed ? "failed" : "completed",
      at: now,
    }
  }

  if (event === "node_started") {
    return {
      type: event,
      label: nodeTitle ? `Node started: ${nodeTitle}` : "Node started",
      status: "running",
      at: now,
    }
  }

  if (event === "node_finished") {
    const nodeError = pickFirstNonEmptyText(data?.error, payload.error)
    const failed = dataStatus === "failed" || Boolean(nodeError)
    return {
      type: event,
      label: failed
        ? nodeTitle
          ? `Node failed: ${nodeTitle}`
          : "Node failed"
        : nodeTitle
          ? `Node completed: ${nodeTitle}`
          : "Node completed",
      detail: nodeError ? truncateText(nodeError) : undefined,
      status: failed ? "failed" : "completed",
      at: now,
    }
  }

  if (event === "message_end") {
    return { type: event, label: "Text generation completed", status: "completed", at: now }
  }

  if (event === "message_file") {
    return { type: event, label: "Result file detected", status: "info", at: now }
  }

  if (event === "tts_message") {
    return { type: event, label: "Generating speech segment", status: "running", at: now }
  }

  if (event === "tts_message_end") {
    return { type: event, label: "Speech generation completed", status: "completed", at: now }
  }

  if (event === "error") {
    const errorText = pickFirstNonEmptyText(payload.error, data?.error, payload.message)
    return {
      type: event,
      label: "Workflow returned an error",
      detail: errorText ? truncateText(errorText) : undefined,
      status: "failed",
      at: now,
    }
  }

  if (event === "agent_thought") {
    const thoughtText = pickFirstNonEmptyText(data?.thought, payload.thought, data?.observation, payload.observation)
    return {
      type: event,
      label: "Model thinking",
      detail: thoughtText ? truncateText(thoughtText) : undefined,
      status: "info",
      at: now,
    }
  }

  const genericDetail = pickFirstNonEmptyText(data?.message, payload.message, data?.error, payload.error)
  return {
    type: event,
    label: `Event: ${event}`,
    detail: genericDetail ? truncateText(genericDetail) : undefined,
    status: "info",
    at: now,
  }
}

function getTaskAgeMs(task: ParsedTaskRow | null) {
  if (!task?.updatedAt) return Number.POSITIVE_INFINITY
  const updatedAt = task.updatedAt instanceof Date ? task.updatedAt.getTime() : new Date(task.updatedAt).getTime()
  if (!Number.isFinite(updatedAt)) return Number.POSITIVE_INFINITY
  return Math.max(0, Date.now() - updatedAt)
}

function getTaskLeaseExpiresAtMs(task: ParsedTaskRow | null) {
  if (!task?.leaseExpiresAt) return null
  const leaseExpiresAt =
    task.leaseExpiresAt instanceof Date ? task.leaseExpiresAt.getTime() : new Date(task.leaseExpiresAt).getTime()
  return Number.isFinite(leaseExpiresAt) ? leaseExpiresAt : null
}

function hasActiveTaskLease(task: ParsedTaskRow | null) {
  if (!task || task.status !== "running") {
    return false
  }
  const leaseExpiresAtMs = getTaskLeaseExpiresAtMs(task)
  return leaseExpiresAtMs !== null && leaseExpiresAtMs > Date.now()
}

async function waitForRunningTask(taskId: number, timeoutMs?: number) {
  const taskPromise = runningTasks.get(taskId)
  if (!taskPromise) {
    return { waited: false, timedOut: false }
  }

  if (!timeoutMs || timeoutMs <= 0) {
    await taskPromise
    return { waited: true, timedOut: false }
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timedOut = await Promise.race([
    taskPromise.then(() => false),
    new Promise<boolean>((resolve) => {
      timeoutId = setTimeout(() => resolve(true), timeoutMs)
    }),
  ])

  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  return { waited: true, timedOut }
}

function createTaskWorkerId(taskId: number) {
  return [
    process.env.VERCEL_REGION || "local",
    process.pid,
    taskId,
    crypto.randomUUID(),
  ].join(":")
}

function toSafeImageAssistantTaskErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (!message) return "image_generation_failed"

  if (
    message.includes("Failed query:") ||
    /cover_asset_id/i.test(message) ||
    (/image_design_sessions/i.test(message) && /does not exist/i.test(message))
  ) {
    return "image_assistant_data_temporarily_unavailable"
  }

  return message
}

async function tryRecoverAdvisorAnswer(params: {
  payload: AdvisorTurnTaskPayload
  config: { baseUrl: string; apiKey: string }
  difyUser: string
}) {
  if (!params.payload.conversationId) {
    return null
  }

  const response = await getMessages(params.config, params.payload.conversationId, params.difyUser, undefined, 10)
  if (!response.ok) {
    return null
  }

  const data = (await response.json().catch(() => null)) as
    | {
        data?: Array<{
          query?: string
          answer?: string
          conversation_id?: string
        }>
      }
    | null

  const matched = (Array.isArray(data?.data) ? data.data : [])
    .filter((item) => typeof item?.query === "string" && item.query.trim() === params.payload.query.trim())
    .find((item) => typeof item?.answer === "string" && item.answer.trim().length > 0)

  if (!matched?.answer) {
    return null
  }

  return {
    conversation_id: matched.conversation_id || params.payload.conversationId,
    answer: sanitizeAssistantContent(matched.answer),
  }
}

async function handleWriterTurn(taskId: number, userId: number, payload: WriterTurnTaskPayload) {
  const progressEvents: AssistantTaskProgressEvent[] = []
  const persistProgressEvent = async (event: AssistantTaskProgressEvent) => {
    pushTaskProgressEvent(progressEvents, event)
    await updateTaskStatus(taskId, {
      status: "running",
      result: {
        conversation_id: payload.conversationId,
        events: progressEvents,
      },
    })
  }

  await persistProgressEvent({
    type: "request_submitted",
    label: "Writer request submitted, preparing task",
    status: "running",
    at: Date.now(),
  })

  const inputTokens = estimateTextTokens(
    [
      payload.query,
      ...(payload.history || []).map((entry) => `${entry.role}: ${entry.content}`),
      payload.brief ? JSON.stringify(payload.brief) : "",
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
      userId,
      enterpriseId: payload.enterpriseId,
      featureKey: reserveEstimate.featureKey,
      amount: reserveEstimate.credits,
      idempotencyKey: `writer-copy:async:reserve:${taskId}`,
      metadata: {
        taskId,
        conversationId: payload.conversationId,
        platform: payload.platform,
        mode: payload.mode,
        language: payload.language,
      },
    })

    const writerSkillRunner = loadWriterSkillRunner()
    const turnResult = await withTaskTimeout(
      writerSkillRunner.runBlocking({
        query: payload.query,
        preloadedBrief: payload.brief,
        userId,
        conversationId: payload.conversationId,
        agentType: payload.agentType || "writer",
        platform: payload.platform,
        mode: payload.mode,
        preferredLanguage: payload.language,
        history: payload.history,
        conversationStatus: payload.conversationStatus,
        enterpriseId: payload.enterpriseId,
        onProgress: async (event) => {
          await persistProgressEvent({
            type: event.type,
            label: event.label,
            detail: event.detail,
            status: normalizeAssistantTaskProgressStatus(event.status),
            at: typeof event.at === "number" && Number.isFinite(event.at) ? event.at : Date.now(),
          })
        },
      }),
      WRITER_TASK_TIMEOUT_MS,
      "writer_task_timeout",
    )

    await updateWriterLatestAssistantMessage(userId, payload.conversationId, turnResult.answer, {
      status: turnResult.outcome === "needs_clarification" ? "drafting" : "text_ready",
      imagesRequested: false,
      language: payload.language,
      platform: turnResult.routing.renderPlatform,
      mode: turnResult.routing.renderMode,
      diagnostics: turnResult.diagnostics,
    })

    const actualCost = estimateTextCredits({
      featureKey: "writer_copy",
      inputTokens,
      outputTokens: estimateTextTokens(turnResult.answer),
      provider: "writer",
      model: "writer-skills",
    })
    await finalizeReservedCredits({
      reservation: writerCreditReservation,
      userId,
      enterpriseId: payload.enterpriseId,
      actualAmount: actualCost.credits,
      idempotencyKey: `writer-copy:async:debit:${taskId}`,
      provider: actualCost.provider,
      model: actualCost.model,
      officialCostUsd: actualCost.officialCostUsd,
      costBasisUsd: actualCost.costBasisUsd,
      usagePayload: actualCost.metadata,
      metadata: {
        taskId,
        conversationId: payload.conversationId,
        outcome: turnResult.outcome,
      },
    }).then(() => {
      writerCreditFinalized = true
    }).catch((error) => {
      console.warn("writer.billing.finalize.skipped", {
        taskId,
        conversationId: payload.conversationId,
        message: error instanceof Error ? error.message : String(error),
      })
    })

    if (turnResult.outcome === "draft_ready") {
      await withTaskTimeout(
        persistWriterImplicitMemoryFromTurn({
          query: payload.query,
          answer: turnResult.answer,
          userId,
          agentType: payload.agentType || "writer",
          conversationId: Number.parseInt(payload.conversationId, 10) || null,
          outcome: turnResult.outcome,
        }),
        WRITER_MEMORY_EXTRACT_TIMEOUT_MS,
        "writer_memory_extract_timeout",
      ).catch((error) => {
        console.warn("writer.memory.extract.skipped", {
          taskId,
          conversationId: payload.conversationId,
          message: error instanceof Error ? error.message : String(error),
        })
      })
    }

    pushTaskProgressEvent(progressEvents, {
      type: "draft_ready",
      label: turnResult.outcome === "needs_clarification" ? "Clarification ready" : "Draft ready",
      status: "completed",
      at: Date.now(),
    })

    await updateTaskStatus(taskId, {
      status: "success",
      result: {
        conversation_id: payload.conversationId,
        outcome: turnResult.outcome,
        events: progressEvents,
      },
    })
  } catch (error) {
    if (!writerCreditFinalized) {
      await releaseReservedCredits({
        reservation: writerCreditReservation,
        userId,
        enterpriseId: payload.enterpriseId,
        idempotencyKey: `writer-copy:async:release:${taskId}`,
        reason: error instanceof Error ? error.message : "writer_task_failed",
      }).catch((releaseError) => {
        console.warn("writer.billing.release.skipped", {
          taskId,
          conversationId: payload.conversationId,
          message: releaseError instanceof Error ? releaseError.message : String(releaseError),
        })
      })
    }
    throw error
  }
}

async function handleImageTurn(taskId: number, payload: ImageTurnTaskPayload) {
  console.info("image-assistant.task.image.start", {
    taskId,
    sessionId: payload.sessionId,
    taskType: payload.taskType,
    referenceAssetCount: (payload.referenceAssetIds?.length || 0) + (payload.referenceUrls?.length || 0),
    sizePreset: payload.sizePreset,
    resolution: payload.resolution,
    imageSize: payload.imageSize,
    model: payload.model,
  })
  const memoryBridge = await resolveImageAssistantMemoryBridge({
    userId: payload.userId,
    prompt: payload.prompt,
  }).catch(() => null)

  const imageTaskAbortController = new AbortController()
  const result = await withTaskTimeout(
    runImageAssistantConversationTurn({
      userId: payload.userId,
      enterpriseId: payload.enterpriseId,
      requestIp: payload.requestIp,
      sessionId: payload.sessionId,
      prompt: payload.prompt,
      brief: payload.brief,
      taskType: payload.taskType,
      invocationMode: payload.invocationMode,
      referenceAssetIds: payload.referenceAssetIds,
      referenceUrls: payload.referenceUrls,
      modelOptionId: payload.modelOptionId || null,
      enterpriseRole: payload.enterpriseRole || null,
      enterpriseStatus: payload.enterpriseStatus || null,
      providerLock: payload.providerLock || null,
      model: payload.model || null,
      candidateCount: payload.candidateCount,
      sizePreset: payload.sizePreset,
      resolution: payload.resolution,
      imageSize: payload.imageSize,
      imageQuality: payload.imageQuality,
      imageBackground: payload.imageBackground,
      imageOutputFormat: payload.imageOutputFormat,
      imageOutputCompression: payload.imageOutputCompression,
      imageModeration: payload.imageModeration,
      imageResponseFormat: payload.imageResponseFormat,
      parentVersionId: payload.parentVersionId,
      extraInstructions: payload.extraInstructions,
      snapshotAssetId: payload.snapshotAssetId,
      maskAssetId: payload.maskAssetId,
      versionMeta: payload.versionMeta,
      guidedSelection: payload.guidedSelection,
      memoryBridge,
      signal: imageTaskAbortController.signal,
    }),
    IMAGE_ASSISTANT_TASK_TIMEOUT_MS,
    "image_assistant_task_timeout",
    { abortController: imageTaskAbortController },
  )

  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      session_id: payload.sessionId,
      message_id: result.message_id,
      outcome: result.outcome,
      version_id: result.version_id,
      follow_up_message_id: result.follow_up_message_id,
    },
  })
  console.info("image-assistant.task.image.success", {
    taskId,
    sessionId: payload.sessionId,
    outcome: result.outcome,
    versionId: result.version_id,
  })
}

async function handleLeadHunterTurn(
  taskId: number,
  payload: AdvisorTurnTaskPayload,
  config: { baseUrl: string; apiKey: string } | null,
  difyUser: string,
  memoryInputs: Record<string, unknown>,
) {
  const normalizedAdvisorType = normalizeLeadHunterAdvisorType(payload.advisorType)
  if (!normalizedAdvisorType) {
    throw new Error("invalid_lead_hunter_advisor_type")
  }

  if (!payload.conversationId) {
    throw new Error("lead_hunter_conversation_missing")
  }

  const useSkillEngine = Boolean(config?.baseUrl === "skill://lead-hunter")
  let responseStream: ReadableStream<Uint8Array> | null
  let skillResultPromise: Promise<{ answer: string; evidence: LeadHunterEvidenceItem[] }> | null = null

  if (useSkillEngine) {
    const leadHunterSkillRunner = await loadLeadHunterSkillRunner(normalizedAdvisorType)
    const skillStream = leadHunterSkillRunner.runStreaming({
      query: payload.query,
      preferredLanguage: payload.preferredLanguage,
      conversationId: payload.conversationId,
      enterpriseId: payload.enterpriseId,
      enterpriseCode: payload.enterpriseCode,
      memoryContext: payload.memoryContext || null,
      soulCard: payload.soulCard || null,
    })
    responseStream = skillStream.stream
    skillResultPromise = skillStream.done
  } else {
    if (!config) {
      throw new Error("advisor_config_missing")
    }
    const chatResponse = await sendMessage(
      config,
      buildLeadHunterChatPayload({
        query: payload.query,
        responseMode: "streaming",
        user: difyUser,
        advisorType: normalizedAdvisorType,
        extraInputs: memoryInputs,
      }),
    )

    if (!chatResponse.ok || !chatResponse.body) {
      const chatError = await chatResponse.text().catch(() => "")
      throw new Error(chatError || `lead_hunter_chat_http_${chatResponse.status}`)
    }
    responseStream = chatResponse.body
  }

  if (!responseStream) {
    throw new Error("lead_hunter_stream_missing")
  }

  const reader = responseStream.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let accumulated = ""
  let streamedChars = 0
  let workflowEvidence: LeadHunterEvidenceItem[] = []
  let streamingEventIndex = -1
  let lastProgressPersistAt = 0
  const progressEvents: AssistantTaskProgressEvent[] = []

  const persistTaskProgress = async (force = false) => {
    const now = Date.now()
    if (!force && now - lastProgressPersistAt < ASSISTANT_TASK_PROGRESS_PERSIST_INTERVAL_MS) {
      return
    }
    lastProgressPersistAt = now
    await updateTaskStatus(taskId, {
      status: "running",
      result: {
        conversation_id: payload.conversationId,
        events: progressEvents,
        streamed_chars: streamedChars,
      },
    })
  }

  pushTaskProgressEvent(progressEvents, {
    type: "request_submitted",
    label: "Request submitted, waiting for workflow response",
    status: "running",
    at: Date.now(),
  })
  await persistTaskProgress(true)

  const consumeSseBlocks = async (blocks: string[]) => {
    for (const block of blocks) {
      const data = getSseDataFromBlock(block)
      if (!data) continue
      const event = typeof data.event === "string" ? data.event : ""
      if (["message", "agent_message", "text_chunk"].includes(event)) {
        const chunk =
          extractText((data as { answer?: unknown }).answer) ||
          extractText((data.data as { text?: unknown } | undefined)?.text)
        if (chunk) {
          accumulated += chunk
          streamedChars += chunk.length
          if (streamingEventIndex < 0) {
            pushTaskProgressEvent(progressEvents, {
              type: "response_streaming",
              label: "Generating response",
              detail: `${streamedChars} chars received`,
              status: "running",
              at: Date.now(),
            })
            streamingEventIndex = progressEvents.length - 1
          } else {
            const target = progressEvents[streamingEventIndex]
            if (target) {
              progressEvents[streamingEventIndex] = {
                ...target,
                detail: `${streamedChars} chars received`,
                at: Date.now(),
              }
            }
          }
          await persistTaskProgress()
        }
      }

      const mappedEvent = mapDifySseEventToTaskProgress(data)
      if (!useSkillEngine && event === "workflow_finished") {
        const workflowData = getObjectRecord(data.data)
        if (Array.isArray(workflowData?.evidence)) {
          workflowEvidence = workflowData.evidence as LeadHunterEvidenceItem[]
        }
      }
      if (!mappedEvent) continue
      pushTaskProgressEvent(progressEvents, mappedEvent)
      await persistTaskProgress(true)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = extractSseBlocks(buffer)
    buffer = parsed.rest
    await consumeSseBlocks(parsed.blocks)
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    const parsed = extractSseBlocks(`${buffer}\n\n`)
    await consumeSseBlocks(parsed.blocks)
  }

  let answer = sanitizeAssistantContent(formatLeadHunterChatOutput(accumulated))
  if (skillResultPromise) {
    const skillResult = await skillResultPromise
    if (skillResult.answer) {
      answer = sanitizeAssistantContent(formatLeadHunterChatOutput(skillResult.answer))
    }
    if (Array.isArray(skillResult.evidence)) {
      workflowEvidence = skillResult.evidence
    }
  }
  pushTaskProgressEvent(progressEvents, {
    type: "response_ready",
    label: "Response ready",
    status: "completed",
    at: Date.now(),
  })

  const taskSuccessResult = {
    conversation_id: payload.conversationId,
    answer: answer || "No lead data returned.",
    agent_name: getLeadHunterAgentName(normalizedAdvisorType),
    events: progressEvents,
    streamed_chars: streamedChars,
  }

  const persistConversationArtifacts = async () => {
    if (!payload.conversationId) {
      return
    }

    const savedMessage = await appendLeadHunterMessage(
      payload.userId,
      normalizedAdvisorType,
      payload.conversationId,
      payload.query,
      answer || "No lead data returned.",
    )

    if (!savedMessage?.id || workflowEvidence.length <= 0) {
      return
    }

    const persistPromise = saveLeadHunterEvidenceForMessage(
      payload.userId,
      normalizedAdvisorType,
      payload.conversationId,
      String(savedMessage.id),
      workflowEvidence.slice(0, LEAD_HUNTER_EVIDENCE_PERSIST_LIMIT),
    ).catch((error) => {
      console.warn("lead_hunter.evidence_persist_failed", {
        taskId,
        conversationId: payload.conversationId,
        messageId: savedMessage.id,
        evidenceCount: workflowEvidence.length,
        message: error instanceof Error ? error.message : String(error),
      })
      return 0
    })

    if (LEAD_HUNTER_ASYNC_EVIDENCE_PERSIST) {
      void persistPromise
      return
    }
    await persistPromise
  }

  if (LEAD_HUNTER_DEFER_PERSIST_AFTER_SUCCESS) {
    await updateTaskStatus(taskId, {
      status: "success",
      result: taskSuccessResult,
    })
    void persistConversationArtifacts().catch((error) => {
      console.warn("lead_hunter.message_persist_failed", {
        taskId,
        conversationId: payload.conversationId,
        message: error instanceof Error ? error.message : String(error),
      })
    })
    return
  }

  await persistConversationArtifacts()

  await updateTaskStatus(taskId, {
    status: "success",
    result: taskSuccessResult,
  })
}

async function handleExecutiveAdvisorSkillTurn(
  taskId: number,
  payload: AdvisorTurnTaskPayload,
) {
  const normalizedAdvisorType = normalizeExecutiveAdvisorType(payload.advisorType)
  if (!normalizedAdvisorType) {
    throw new Error("invalid_executive_advisor_type")
  }

  const runner = await loadExecutiveAdvisorSkillRunner(normalizedAdvisorType)
  const result = await runner.runBlocking({
    query: payload.query,
    preferredLanguage: payload.preferredLanguage,
    conversationId: payload.conversationId || null,
    enterpriseId: payload.enterpriseId,
    enterpriseCode: payload.enterpriseCode,
    memoryContext: payload.memoryContext || null,
    soulCard: payload.soulCard || null,
  })

  const answer = sanitizeAssistantContent(result.answer)
  if (!answer) {
    throw new Error("advisor_empty_response")
  }

  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      conversation_id: payload.conversationId || null,
      answer,
      agent_name: result.agentName,
      provider: result.providerId,
      model: result.model,
    },
  })
}

function buildAiEntryPptPreviewFailureMessage(errorMessage: string, isZh: boolean) {
  if (isZh) {
    return `可编辑 PPT 后台生成失败：${errorMessage || "未知错误"}`
  }
  return `Editable PPT background generation failed: ${errorMessage || "unknown error"}`
}

function isRetryableAiEntryPptPreviewError(message: string) {
  const normalized = message.trim().toLowerCase()
  if (!normalized) return false

  return (
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("und_err_connect_timeout") ||
    normalized.includes("ppt_worker_http_502") ||
    normalized.includes("ppt_worker_http_503") ||
    normalized.includes("ppt_worker_http_504") ||
    normalized.includes("worker_internal_error") ||
    normalized.includes("ppt_master_runtime_unavailable") ||
    normalized.includes("ppt_master_script_failed")
  )
}

type DurablePptPreviewState = {
  remoteRequestId: string
  remoteJobId: string | null
}

function shouldUseDurablePptPreviewQueue() {
  return getLeadToolPptExecutionTransport() === "remote-worker"
}

function readDurablePptPreviewState(result: Record<string, unknown> | null, taskId: number): DurablePptPreviewState {
  const remoteRequestId =
    typeof result?.remoteRequestId === "string" && result.remoteRequestId.trim()
      ? result.remoteRequestId.trim()
      : `ai-entry-ppt-task-${taskId}`
  const remoteJobId =
    typeof result?.remoteJobId === "string" && result.remoteJobId.trim()
      ? result.remoteJobId.trim()
      : null

  return { remoteRequestId, remoteJobId }
}

function readTaskProgressEvents(value: unknown): AssistantTaskProgressEvent[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const record = getObjectRecord(item)
      const type = typeof record?.type === "string" ? record.type.trim() : ""
      const label = typeof record?.label === "string" ? record.label.trim() : ""
      const at = typeof record?.at === "number" && Number.isFinite(record.at) ? record.at : Date.now()
      if (!type || !label) return null
      return {
        type,
        label,
        ...(typeof record?.detail === "string" && record.detail.trim() ? { detail: record.detail.trim() } : {}),
        status: normalizeAssistantTaskProgressStatus(record?.status),
        at,
      } satisfies AssistantTaskProgressEvent
    })
    .filter((item): item is AssistantTaskProgressEvent => Boolean(item))
}

function buildDurablePptPreviewRequest(
  payload: AiEntryPptPreviewTaskPayload,
  requestId: string,
): Omit<PptWorkerPreviewRequest, "runtimeProfile"> {
  const input = payload.input
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
  if (!prompt) throw new Error("ppt_preview_prompt_missing")

  const scenario =
    input.scenario === "marketing-campaign" ||
    input.scenario === "product-launch" ||
    input.scenario === "sales-deck" ||
    input.scenario === "training"
      ? input.scenario
      : "marketing-campaign"
  const language = input.language === "en-US" ? "en-US" : "zh-CN"
  const requestedTemplateId =
    typeof input.templateId === "string" && isPptMasterLibraryTemplateSupported(input.templateId)
      ? input.templateId.trim()
      : null
  const narrativeAngle =
    input.narrativeAngle === "executive-brief" ||
    input.narrativeAngle === "campaign-story" ||
    input.narrativeAngle === "data-proof" ||
    input.narrativeAngle === "action-plan"
      ? input.narrativeAngle
      : undefined
  const pageCount =
    typeof input.pageCount === "number" && Number.isInteger(input.pageCount) ? input.pageCount : undefined
  const templateMode = input.templateMode === "auto-4" ? "auto-4" : "single-template"
  const templateId = requestedTemplateId || (templateMode === "single-template" ? "ppt169_swiss_grid_systems" : null)
  if (templateMode === "single-template" && !templateId) {
    throw new Error("ppt_master_template_selection_required")
  }

  return {
    requestId,
    prompt,
    ...(typeof input.researchBrief === "string" || getObjectRecord(input.researchBrief)
      ? { researchBrief: input.researchBrief as PptWorkerPreviewRequest["researchBrief"] }
      : {}),
    scenario,
    language,
    ...(typeof input.model === "string" && input.model.trim() ? { model: input.model.trim() } : {}),
    templateMode,
    ...(templateId ? { templateId } : {}),
    ...(narrativeAngle ? { narrativeAngle } : {}),
    ...(pageCount ? { pageCount } : {}),
    ...(Array.isArray(input.images) ? { images: input.images as PptWorkerPreviewRequest["images"] } : {}),
    allowMockFallback: false,
  }
}

function readCompletedPptPreviewResult(value: unknown) {
  const record = getObjectRecord(value)
  const previewSessionId = typeof record?.previewSessionId === "string" ? record.previewSessionId.trim() : ""
  const generatedAt = typeof record?.generatedAt === "string" ? record.generatedAt.trim() : ""
  const deck = getObjectRecord(record?.deck)
  if (!previewSessionId || !generatedAt || !deck) return null

  return {
    previewSessionId,
    generatedAt,
    deck: deck as PptPreviewDeck,
  }
}

function summarizeDurablePptPreviewDeck(deck: PptPreviewDeck) {
  return deck.variants.map((variant) => ({
    key: variant.key,
    name: variant.name,
    summary: variant.summary,
    styleKey: variant.styleKey,
    templateId: variant.templateId ?? null,
    narrativeAngle: variant.narrativeAngle ?? null,
    slideCount: variant.slides.length,
    coverTitle: variant.slides[0]?.title ?? null,
  }))
}

async function handleDurableAiEntryPptPreviewTask(
  taskId: number,
  payload: AiEntryPptPreviewTaskPayload,
) {
  const task = parseTask(await getTaskById(taskId))
  const previous = task?.parsedResult || null
  const isZh = payload.isZh !== false
  const events = readTaskProgressEvents(previous?.events)
  const state = readDurablePptPreviewState(previous, taskId)

  const persist = async (input: {
    stage: AiEntryTaskRunStage
    stageLabel: string
    progressCurrent: number
    previewSessionId?: string | null
    toolResult?: Record<string, unknown> | null
    assistantMessage?: string | null
    error?: string | null
    releaseLease?: boolean
  }) => {
    await updateTaskStatus(taskId, {
      status: "running",
      releaseLease: input.releaseLease,
      result: {
        conversation_id: payload.conversationId,
        toolName: "preview_ppt_deck",
        toolCallId: payload.toolCallId,
        stage: input.stage,
        stageLabel: input.stageLabel,
        progressCurrent: input.progressCurrent,
        progressTotal: 5,
        lastHeartbeatAt: Math.floor(Date.now() / 1000),
        previewSessionId: input.previewSessionId || null,
        toolResult: input.toolResult || null,
        resultSummary:
          input.assistantMessage ||
          (input.toolResult && typeof input.toolResult.title === "string" ? input.toolResult.title : undefined),
        assistantMessage: input.assistantMessage || undefined,
        errorCode: input.error || null,
        errorMessage: input.error || null,
        error: input.error || null,
        remoteRequestId: state.remoteRequestId,
        remoteJobId: state.remoteJobId,
        events,
      },
    })
  }

  if (!previous?.remoteRequestId) {
    pushTaskProgressEvent(events, {
      type: "background_task_queued",
      label: isZh ? "后台任务已创建" : "Background task queued",
      status: "running",
      at: Date.now(),
    })
    pushTaskProgressEvent(events, {
      type: "background_generation_preparing",
      label: isZh ? "正在提交 PPT 渲染任务" : "Submitting PPT render job",
      status: "running",
      at: Date.now(),
    })
    await persist({
      stage: "story_planning",
      stageLabel: isZh ? "已保存异步渲染任务" : "Persisted asynchronous render job",
      progressCurrent: 1,
    })
  }

  if (!state.remoteJobId) {
    const storedJob = await getPptPreviewJobByRequestId(state.remoteRequestId)
    if (storedJob) {
      state.remoteJobId = storedJob.jobId
    } else {
      const submitted = await requestPptWorkerPreviewSubmit(
        buildDurablePptPreviewRequest(payload, state.remoteRequestId),
      )
      state.remoteJobId = submitted.jobId
      pushTaskProgressEvent(events, {
        type: "background_generation_running",
        label: isZh ? "正在后台生成 SVG 预览（导出时再生成 PPTX）" : "Generating SVG preview in background (PPTX on export)",
        status: "running",
        at: Date.now(),
      })
      await persist({
        stage: "variant_generating",
        stageLabel: isZh ? "已提交远端渲染任务" : "Remote render job submitted",
        progressCurrent: 2,
        // Rendering is owned by Railway and tracked in Supabase, not by this Vercel invocation.
        releaseLease: true,
      })
      return
    }
  }

  const remoteStatus = await requestPptWorkerPreviewStatus(state.remoteJobId)
  if (remoteStatus.status === "queued" || remoteStatus.status === "running") {
    pushTaskProgressEvent(events, {
      type: "background_generation_running",
      label: isZh ? "远端正在渲染 SVG 预览" : "Remote worker is rendering the SVG preview",
      status: "running",
      at: Date.now(),
    })
    await persist({
      stage: "variant_generating",
      stageLabel: isZh ? "正在生成预览方向" : "Generating preview variants",
      progressCurrent: 2,
      releaseLease: true,
    })
    return
  }

  if (remoteStatus.status === "failed") {
    if (remoteStatus.message === "ppt_worker_job_request_missing") {
      const resubmitted = await requestPptWorkerPreviewSubmit(
        buildDurablePptPreviewRequest(payload, state.remoteRequestId),
      )
      state.remoteJobId = resubmitted.jobId
      pushTaskProgressEvent(events, {
        type: "background_generation_recovered",
        label: isZh ? "远端任务已恢复，继续生成预览" : "Remote job recovered, continuing preview generation",
        status: "running",
        at: Date.now(),
      })
      await persist({
        stage: "variant_generating",
        stageLabel: isZh ? "已恢复远端渲染任务" : "Recovered remote render job",
        progressCurrent: 2,
        releaseLease: true,
      })
      return
    }
    throw new Error(remoteStatus.message || "ppt_worker_preview_failed")
  }

  const completed = readCompletedPptPreviewResult(remoteStatus)
  if (!completed) throw new Error("ppt_worker_preview_result_invalid")

  const storedDeck = await storePptPreviewSessionDeck({
    ...completed.deck,
    previewSessionId: completed.previewSessionId,
  })
  const currentUser = await getUserAuthPayload(payload.userId)
  if (!currentUser) throw new Error("ai_entry_user_not_found")
  const platform = await persistLeadToolPreviewResult({
    toolSlug: "ai-ppt-preview",
    inputPayload: payload.input,
    deck: storedDeck,
    previewSessionId: storedDeck.previewSessionId,
    currentUser: currentUser as never,
  })
  const variants = summarizeDurablePptPreviewDeck(storedDeck)
  const toolResult = {
    ok: true,
    previewSessionId: storedDeck.previewSessionId,
    generatedAt: completed.generatedAt,
    recommendedVariantKey: storedDeck.variants[0]?.key ?? null,
    recommendedVariantName: storedDeck.variants[0]?.name ?? null,
    recommendedTemplates: [],
    selectedTemplateId: typeof payload.input.templateId === "string" ? payload.input.templateId : null,
    title: storedDeck.title,
    scenario: storedDeck.scenario,
    language: storedDeck.language,
    pageCount: storedDeck.pageCount ?? null,
    resolvedPageCount: storedDeck.resolvedPageCount ?? null,
    variants,
    validation: {
      ok: variants.length > 0,
      checks: [
        {
          code: "variants_present",
          ok: variants.length > 0,
          message: "Preview deck returned at least one variant.",
        },
      ],
    },
    platform: {
      previewRunId: platform.platformRunId ?? null,
      previewArtifactId: platform.platformArtifactId ?? null,
      toolRunId: platform.platformRunId ?? null,
    },
    nextStep: "Review the recommended variant first, then call export_ppt_deck to save the downloadable deck artifact to the work library.",
  }

  pushTaskProgressEvent(events, {
    type: "background_preview_rendering",
    label: isZh ? "正在物化预览会话" : "Materializing preview session",
    status: "running",
    at: Date.now(),
  })
  await persist({
    stage: "preview_rendering",
    stageLabel: isZh ? "正在渲染预览" : "Rendering preview",
    progressCurrent: 3,
    previewSessionId: storedDeck.previewSessionId,
    toolResult,
  })

  const assistantMessage =
    buildPptToolResultMessage({ toolName: "preview_ppt_deck", result: toolResult, isZh })?.trim() ||
    (isZh ? "后台预览已完成。" : "Background preview completed.")
  await persist({
    stage: "session_persisting",
    stageLabel: isZh ? "正在保存预览会话" : "Persisting preview session",
    progressCurrent: 4,
    previewSessionId: storedDeck.previewSessionId,
    toolResult,
    assistantMessage,
  })
  const appended = await appendAiEntryMessage({
    userId: payload.userId,
    conversationId: payload.conversationId,
    role: "assistant",
    content: assistantMessage,
    idempotencyKey: `ai-entry-task:${taskId}:assistant`,
    scope: payload.conversationScope,
    agentId: payload.agentId,
  })
  if (!appended) throw new Error("ai_entry_conversation_not_found")

  pushTaskProgressEvent(events, {
    type: "background_generation_finished",
    label: isZh ? "后台生成完成" : "Background generation completed",
    status: "completed",
    at: Date.now(),
  })
  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      conversation_id: payload.conversationId,
      toolName: "preview_ppt_deck",
      toolCallId: payload.toolCallId,
      stage: "session_persisting",
      stageLabel: isZh ? "预览已完成" : "Preview completed",
      progressCurrent: 5,
      progressTotal: 5,
      lastHeartbeatAt: Math.floor(Date.now() / 1000),
      finishedAt: Math.floor(Date.now() / 1000),
      previewSessionId: storedDeck.previewSessionId,
      resultSummary: assistantMessage,
      toolResult,
      assistantMessage,
      errorCode: null,
      errorMessage: null,
      error: null,
      remoteRequestId: state.remoteRequestId,
      remoteJobId: state.remoteJobId,
      events,
    },
  })
}

async function handleAiEntryPptPreviewTask(
  taskId: number,
  payload: AiEntryPptPreviewTaskPayload,
) {
  if (shouldUseDurablePptPreviewQueue()) {
    try {
      await handleDurableAiEntryPptPreviewTask(taskId, payload)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "ai_entry_ppt_preview_failed"
      const current = parseTask(await getTaskById(taskId))
      const result = current?.parsedResult || {}
      const events = readTaskProgressEvents(result.events)

      if (isRetryableAiEntryPptPreviewError(errorMessage)) {
        pushTaskProgressEvent(events, {
          type: "background_generation_retry",
          label: payload.isZh === false ? "Remote worker temporarily unavailable; retrying" : "远端渲染暂时不可用，稍后自动重试",
          detail: errorMessage,
          status: "running",
          at: Date.now(),
        })
        await updateTaskStatus(taskId, {
          status: "running",
          releaseLease: true,
          result: {
            ...result,
            conversation_id: payload.conversationId,
            stage: "variant_generating",
            stageLabel: payload.isZh === false ? "Waiting for remote render retry" : "等待远端渲染重试",
            progressCurrent: 2,
            progressTotal: 5,
            lastHeartbeatAt: Math.floor(Date.now() / 1000),
            errorCode: null,
            errorMessage: null,
            error: null,
            events,
          },
        })
        return
      }

      pushTaskProgressEvent(events, {
        type: "background_generation_finished",
        label: payload.isZh === false ? "Background generation failed" : "后台生成失败",
        detail: errorMessage,
        status: "failed",
        at: Date.now(),
      })
      await updateTaskStatus(taskId, {
        status: "failed",
        result: {
          ...result,
          conversation_id: payload.conversationId,
          errorCode: errorMessage,
          errorMessage,
          error: errorMessage,
          finishedAt: Math.floor(Date.now() / 1000),
          events,
        },
      })
    }
    return
  }

  const progressEvents: AssistantTaskProgressEvent[] = []
  const persistProgress = async (
    snapshot?: {
      stage?: AiEntryTaskRunStage
      stageLabel?: string
      progressCurrent?: number
      progressTotal?: number
      previewSessionId?: string | null
      toolResult?: Record<string, unknown> | null
      assistantMessage?: string
      error?: string | null
    },
    force = false,
  ) => {
    if (!force && progressEvents.length === 0) return
    await updateTaskStatus(taskId, {
      status: "running",
      result: {
        conversation_id: payload.conversationId,
        toolName: "preview_ppt_deck",
        toolCallId: payload.toolCallId,
        stage: snapshot?.stage || "story_planning",
        stageLabel: snapshot?.stageLabel,
        progressCurrent: snapshot?.progressCurrent,
        progressTotal: snapshot?.progressTotal,
        lastHeartbeatAt: Math.floor(Date.now() / 1000),
        previewSessionId: snapshot?.previewSessionId || null,
        toolResult: snapshot?.toolResult || null,
        resultSummary:
          snapshot?.assistantMessage ||
          (snapshot?.toolResult && typeof snapshot.toolResult.title === "string"
            ? snapshot.toolResult.title
            : undefined),
        assistantMessage: snapshot?.assistantMessage,
        errorCode: snapshot?.error || null,
        errorMessage: snapshot?.error || null,
        error: snapshot?.error || null,
        events: progressEvents,
      },
    })
  }
  const isZh = payload.isZh !== false

  pushTaskProgressEvent(progressEvents, {
    type: "background_task_queued",
    label: isZh ? "后台任务已创建" : "Background task queued",
    status: "running",
    at: Date.now(),
  })
  await persistProgress(
    {
      stage: "brief_validating",
      stageLabel: isZh ? "已排队，准备校验需求" : "Queued, validating brief",
      progressCurrent: 0,
      progressTotal: 5,
    },
    true,
  )

  pushTaskProgressEvent(progressEvents, {
    type: "background_generation_preparing",
    label: isZh ? "正在准备生成环境" : "Preparing generation runtime",
    status: "running",
    at: Date.now(),
  })
  await persistProgress(
    {
      stage: "story_planning",
      stageLabel: isZh ? "正在规划结构与故事线" : "Planning structure and storyline",
      progressCurrent: 1,
      progressTotal: 5,
    },
    true,
  )

  pushTaskProgressEvent(progressEvents, {
    type: "background_generation_running",
    label: isZh ? "正在后台生成 SVG 预览（导出时再生成 PPTX）" : "Generating SVG preview in background (PPTX on export)",
    status: "running",
    at: Date.now(),
  })
  await persistProgress(
    {
      stage: "variant_generating",
      stageLabel: isZh ? "正在生成预览方向" : "Generating preview variants",
      progressCurrent: 2,
      progressTotal: 5,
    },
    true,
  )
  try {
    const currentUser = await getUserAuthPayload(payload.userId)
    if (!currentUser) {
      throw new Error("ai_entry_user_not_found")
    }

    const previewTools = buildAiEntryPptTools({
      currentUser: currentUser as never,
      agentId: payload.agentId,
    }) as Record<string, { execute?: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }>
    const previewTool = previewTools.preview_ppt_deck
    if (typeof previewTool?.execute !== "function") {
      throw new Error("ai_entry_ppt_preview_tool_unavailable")
    }

    let toolResult: Record<string, unknown> | null = null
    let resultError: string | null = null

    for (let attempt = 1; attempt <= AI_ENTRY_PPT_PREVIEW_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const attemptResult = await withTaskTimeout(
          Promise.resolve(previewTool.execute(payload.input)),
          AI_ENTRY_PPT_PREVIEW_TASK_TIMEOUT_MS,
          "ai_entry_ppt_preview_timeout",
        )
        const toolErrorRecord =
          attemptResult && typeof attemptResult === "object"
            ? ((attemptResult as { error?: unknown }).error as { message?: unknown } | undefined)
            : undefined

        const attemptError =
          attemptResult?.ok === false
            ? typeof toolErrorRecord?.message === "string" && toolErrorRecord.message.trim()
              ? toolErrorRecord.message.trim()
              : "ppt_preview_failed"
            : null

        if (!attemptError) {
          toolResult = attemptResult
          resultError = null
          break
        }

        toolResult = attemptResult
        resultError = attemptError
      } catch (error) {
        resultError = error instanceof Error ? error.message : "ai_entry_ppt_preview_failed"
        toolResult = null
      }

      const shouldRetry =
        attempt < AI_ENTRY_PPT_PREVIEW_RETRY_ATTEMPTS &&
        Boolean(resultError && isRetryableAiEntryPptPreviewError(resultError))

      if (!shouldRetry) {
        break
      }

      pushTaskProgressEvent(progressEvents, {
        type: "background_generation_retry",
        label: isZh
          ? `后台生成失败，正在自动重试（${attempt}/${AI_ENTRY_PPT_PREVIEW_RETRY_ATTEMPTS - 1}）`
          : `Background generation failed, retrying automatically (${attempt}/${AI_ENTRY_PPT_PREVIEW_RETRY_ATTEMPTS - 1})`,
        detail: resultError || undefined,
        status: "running",
        at: Date.now(),
      })
      await persistProgress(
        {
          stage: "variant_generating",
          stageLabel: isZh ? "正在重新生成预览方向" : "Retrying preview variants",
          progressCurrent: 2,
          progressTotal: 5,
          toolResult,
          error: resultError,
        },
        true,
      )
      await sleep(AI_ENTRY_PPT_PREVIEW_RETRY_DELAY_MS)
    }

    if (!resultError) {
      pushTaskProgressEvent(progressEvents, {
        type: "background_preview_rendering",
        label: isZh ? "正在渲染预览" : "Rendering preview",
        status: "running",
        at: Date.now(),
      })
      await persistProgress(
        {
          stage: "preview_rendering",
          stageLabel: isZh ? "正在渲染预览" : "Rendering preview",
          progressCurrent: 3,
          progressTotal: 5,
          previewSessionId:
            toolResult && typeof toolResult.previewSessionId === "string" && toolResult.previewSessionId.trim()
              ? toolResult.previewSessionId.trim()
              : null,
          toolResult,
        },
        true,
      )
    }

    const assistantMessage =
      resultError
        ? buildAiEntryPptPreviewFailureMessage(resultError, isZh)
        : buildPptToolResultMessage({
            toolName: "preview_ppt_deck",
            result: toolResult,
            isZh,
          })?.trim() ||
          (isZh ? "后台预览已完成。" : "Background preview completed.")

    if (assistantMessage.trim()) {
      await persistProgress(
        {
          stage: "session_persisting",
          stageLabel: isZh ? "正在保存预览会话" : "Persisting preview session",
          progressCurrent: 4,
          progressTotal: 5,
          previewSessionId:
            toolResult && typeof toolResult.previewSessionId === "string" && toolResult.previewSessionId.trim()
              ? toolResult.previewSessionId.trim()
              : null,
          toolResult,
          assistantMessage,
          error: resultError,
        },
        true,
      )
      const persisted = await appendAiEntryMessage({
        userId: payload.userId,
        conversationId: payload.conversationId,
        role: "assistant",
        content: assistantMessage,
        idempotencyKey: `ai-entry-task:${taskId}:assistant`,
        scope: payload.conversationScope,
        agentId: payload.agentId,
      })
      if (!persisted) {
        throw new Error("ai_entry_conversation_not_found")
      }
    }

    pushTaskProgressEvent(progressEvents, {
      type: "background_generation_finished",
      label: resultError
        ? isZh
          ? "后台生成失败"
          : "Background generation failed"
        : isZh
          ? "后台生成完成"
          : "Background generation completed",
      detail: resultError || undefined,
      status: resultError ? "failed" : "completed",
      at: Date.now(),
    })

    await updateTaskStatus(taskId, {
      status: resultError ? "failed" : "success",
      result: {
        conversation_id: payload.conversationId,
        toolName: "preview_ppt_deck",
        toolCallId: payload.toolCallId,
        stage: resultError ? "variant_generating" : "session_persisting",
        stageLabel: resultError
          ? isZh
            ? "预览生成失败"
            : "Preview failed"
          : isZh
            ? "预览已完成"
            : "Preview completed",
        progressCurrent: resultError ? 2 : 5,
        progressTotal: 5,
        lastHeartbeatAt: Math.floor(Date.now() / 1000),
        finishedAt: Math.floor(Date.now() / 1000),
        previewSessionId:
          toolResult && typeof toolResult.previewSessionId === "string" && toolResult.previewSessionId.trim()
            ? toolResult.previewSessionId.trim()
            : null,
        resultSummary:
          assistantMessage ||
          (toolResult && typeof toolResult.title === "string" ? toolResult.title : null),
        toolResult,
        assistantMessage,
        errorCode: resultError,
        errorMessage: resultError,
        error: resultError,
        events: progressEvents,
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "ai_entry_ppt_preview_failed"
    pushTaskProgressEvent(progressEvents, {
      type: "background_generation_finished",
      label: isZh ? "后台生成失败" : "Background generation failed",
      detail: errorMessage,
      status: "failed",
      at: Date.now(),
    })
    await updateTaskStatus(taskId, {
      status: "failed",
      result: {
        conversation_id: payload.conversationId,
        toolName: "preview_ppt_deck",
        toolCallId: payload.toolCallId,
        stage: "variant_generating",
        stageLabel: isZh ? "预览生成失败" : "Preview failed",
        progressCurrent: 2,
        progressTotal: 5,
        lastHeartbeatAt: Math.floor(Date.now() / 1000),
        finishedAt: Math.floor(Date.now() / 1000),
        errorCode: errorMessage,
        errorMessage,
        error: errorMessage,
        events: progressEvents,
      },
    })
  }
}

async function handleAdvisorTurn(taskId: number, payload: AdvisorTurnTaskPayload) {
  const difyUser = buildDifyUserIdentity(payload.userEmail, payload.advisorType)
  const normalizedLeadHunterType = normalizeLeadHunterAdvisorType(payload.advisorType)
  const normalizedExecutiveAdvisorType = normalizeExecutiveAdvisorType(payload.advisorType)
  const config = await getDifyConfigByAdvisorType(payload.advisorType, {
    userId: payload.userId,
    userEmail: payload.userEmail,
    enterpriseId: payload.enterpriseId,
    enterpriseCode: payload.enterpriseCode,
  })
  if (!config) {
    throw new Error("advisor_config_missing")
  }

  if (normalizedExecutiveAdvisorType && config.baseUrl === "skill://executive-consulting") {
    await handleExecutiveAdvisorSkillTurn(taskId, payload)
    return
  }

  const fallbackBridge = await buildDifyMemoryBridge({
    userId: payload.userId,
    advisorType: payload.advisorType,
    query: payload.query,
  }).catch(() => ({
    agentType: null,
    memoryContext: null,
    soulCard: null,
    memoryAppliedIds: [],
  }))

  const memoryBridge = {
    ...fallbackBridge,
    ...(payload.memoryContext ? { memoryContext: payload.memoryContext } : {}),
    ...(payload.soulCard ? { soulCard: payload.soulCard } : {}),
    ...(Array.isArray(payload.memoryAppliedIds) && payload.memoryAppliedIds.length
      ? { memoryAppliedIds: payload.memoryAppliedIds }
      : {}),
  }
  const memoryInputs = mergeDifyInputsWithMemoryBridge({}, memoryBridge)

  if (normalizedLeadHunterType) {
    await handleLeadHunterTurn(taskId, payload, config, difyUser, memoryInputs)
    return
  }

  const abortController = new AbortController()
  const abortTimer = setTimeout(() => abortController.abort("advisor_task_timeout"), ADVISOR_TASK_TIMEOUT_MS)

  let answer: string | null | undefined
  let conversationId = payload.conversationId || null
  let agentName = ""

  try {
    let lastUpstreamError: Error | null = null

    for (let attempt = 0; attempt < ADVISOR_UPSTREAM_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const upstream = await sendMessage(
          config,
          {
            inputs: mergeDifyInputsWithMemoryBridge({ contents: payload.query }, memoryBridge),
            query: payload.query,
            response_mode: "blocking",
            user: difyUser,
            advisorType: payload.advisorType,
            ...(payload.conversationId ? { conversation_id: payload.conversationId } : {}),
          },
          { signal: abortController.signal },
        )

        if (!upstream.ok) {
          const details = await upstream.text().catch(() => "")
          const upstreamErrorMessage = details || `advisor_http_${upstream.status}`
          const shouldRetry =
            attempt < ADVISOR_UPSTREAM_RETRY_ATTEMPTS - 1 &&
            shouldRetryAdvisorUpstreamError(upstreamErrorMessage)

          if (shouldRetry) {
            const delayMs = ADVISOR_UPSTREAM_RETRY_BASE_DELAY_MS * Math.max(1, attempt + 1)
            console.warn("advisor.upstream.retrying", {
              taskId,
              attempt: attempt + 1,
              delayMs,
              message: truncateText(upstreamErrorMessage, 320),
            })
            await sleep(delayMs)
            continue
          }

          throw new Error(upstreamErrorMessage)
        }

        const data = (await upstream.json().catch(() => null)) as
          | {
              answer?: unknown
              conversation_id?: string
              metadata?: { agent_name?: string } | null
              agent_name?: string
              data?: { answer?: unknown; outputs?: unknown } | null
            }
          | null

        answer = sanitizeAssistantContent(
          extractText(data?.answer) ||
            extractText(data?.data?.answer) ||
            extractText(data?.data?.outputs),
        )
        conversationId =
          (typeof data?.conversation_id === "string" ? data.conversation_id : null) ||
          conversationId
        agentName =
          (typeof data?.agent_name === "string" ? data.agent_name : "") ||
          (typeof data?.metadata?.agent_name === "string" ? data.metadata.agent_name : "")

        lastUpstreamError = null
        break
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const shouldRetry =
          attempt < ADVISOR_UPSTREAM_RETRY_ATTEMPTS - 1 &&
          shouldRetryAdvisorUpstreamError(message)

        if (shouldRetry) {
          const delayMs = ADVISOR_UPSTREAM_RETRY_BASE_DELAY_MS * Math.max(1, attempt + 1)
          console.warn("advisor.upstream.retrying", {
            taskId,
            attempt: attempt + 1,
            delayMs,
            message: truncateText(message, 320),
          })
          await sleep(delayMs)
          continue
        }

        lastUpstreamError = error instanceof Error ? error : new Error(message)
        break
      }
    }

    if (lastUpstreamError) {
      throw lastUpstreamError
    }

    if (!answer) {
      throw new Error("advisor_empty_response")
    }
  } catch (error) {
    const recovered = await tryRecoverAdvisorAnswer({ payload: { ...payload, conversationId }, config, difyUser }).catch(
      () => null,
    )
    if (recovered?.answer) {
      answer = recovered.answer
      conversationId = recovered.conversation_id || conversationId
    } else {
      const errorMessage =
        error instanceof Error && error.name === "AbortError"
          ? "advisor_task_timeout"
          : error instanceof Error
            ? error.message
            : "advisor_task_failed"
      throw new Error(errorMessage)
    }
  } finally {
    clearTimeout(abortTimer)
  }

  if (!answer) {
    const recovered = await tryRecoverAdvisorAnswer({ payload: { ...payload, conversationId }, config, difyUser }).catch(
      () => null,
    )
    if (recovered?.answer) {
      answer = recovered.answer
      conversationId = recovered.conversation_id || conversationId
    }
  }

  if (!answer) {
    throw new Error("advisor_empty_response")
  }

  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      conversation_id: conversationId,
      answer,
      agent_name: agentName || undefined,
    },
  })
}

async function runTask(taskId: number) {
  const rawTask = await getTaskById(taskId)
  const task = parseTask(rawTask)
  if (!task?.parsedPayload) {
    throw new Error("assistant_task_payload_missing")
  }

  if (task.parsedPayload.kind === "writer_turn") {
    await handleWriterTurn(taskId, task.userId, task.parsedPayload)
    return
  }

  if (task.parsedPayload.kind === "image_turn") {
    await handleImageTurn(taskId, task.parsedPayload)
    return
  }

  if (task.parsedPayload.kind === "ai_entry_ppt_preview") {
    await handleAiEntryPptPreviewTask(taskId, task.parsedPayload)
    return
  }

  await handleAdvisorTurn(taskId, task.parsedPayload)
}

function launchClaimedTask(taskId: number, workerId: string) {
  const next = Promise.resolve()
    .then(async () => {
      const heartbeat = setInterval(() => {
        void renewTaskLease(taskId, workerId, ASSISTANT_TASK_LEASE_MS).catch((error) => {
          console.warn("assistant.task.lease_renew_failed", {
            taskId,
            workerId,
            message: error instanceof Error ? error.message : String(error),
          })
        })
      }, ASSISTANT_TASK_HEARTBEAT_MS)

      try {
        await runTask(taskId)
      } finally {
        clearInterval(heartbeat)
      }
    })
    .catch(async (error) => {
      const primaryErrorMessage = error instanceof Error ? error.message : String(error)
      let task: ParsedTaskRow | null = null

      try {
        const rawTask = await getTaskById(taskId)
        task = parseTask(rawTask)
      } catch (taskReadError) {
        console.error("assistant.task.load_failed_after_run_error", {
          taskId,
          runError: primaryErrorMessage,
          message: taskReadError instanceof Error ? taskReadError.message : String(taskReadError),
        })
      }

      if (task?.parsedPayload?.kind === "writer_turn") {
        await updateWriterLatestAssistantMessage(
          task.userId,
          task.parsedPayload.conversationId,
          `Request failed: ${primaryErrorMessage || "unknown_error"}`,
          {
            status: "failed",
            imagesRequested: false,
          },
        ).catch(() => null)
      }

      const imageTaskError = task?.parsedPayload?.kind === "image_turn" ? toSafeImageAssistantTaskErrorMessage(error) : null
      if (task?.parsedPayload?.kind === "image_turn") {
        await createImageAssistantMessage({
          sessionId: task.parsedPayload.sessionId,
          role: "assistant",
          messageType: "error",
          content: imageTaskError || "image_generation_failed",
          taskType: task.parsedPayload.taskType,
        }).catch(() => null)
      }

      await updateTaskStatus(taskId, {
        status: "failed",
        result: {
          ...(task?.parsedResult || {}),
          error: imageTaskError || primaryErrorMessage || "assistant_task_failed",
        },
      }).catch((statusError) => {
        console.error("assistant.task.status_update_failed", {
          taskId,
          runError: primaryErrorMessage,
          message: statusError instanceof Error ? statusError.message : String(statusError),
        })
      })
    })
    .finally(() => {
      runningTasks.delete(taskId)
    })

  runningTasks.set(taskId, next)
  return next
}

async function kickTaskExecution(taskId: number) {
  if (runningTasks.has(taskId)) {
    return true
  }

  const workerId = createTaskWorkerId(taskId)
  const claimed = await claimTaskExecution(taskId, workerId, ASSISTANT_TASK_LEASE_MS, ASSISTANT_STALE_TASK_MS)
  if (!claimed) {
    return false
  }

  launchClaimedTask(taskId, workerId)
  return true
}

export async function enqueueAssistantTask(input: { userId: number; workflowName: string; payload: AssistantTaskPayload }) {
  const task = await createTask({
    userId: input.userId,
    workflowName: input.workflowName,
    webhookPath: "assistant/async",
    payload: input.payload,
  })

  void kickTaskExecution(task.id).catch(() => null)
  return task
}

async function recoverAssistantTask(
  task: ParsedTaskRow | null,
  options: { waitForCompletion?: boolean; completionTimeoutMs?: number } = {},
) {
  if (!task?.parsedPayload) {
    return { task, launched: false, waited: false, timedOut: false }
  }

  if (!["pending", "running"].includes(task.status || "")) {
    return { task, launched: false, waited: false, timedOut: false }
  }

  if (runningTasks.has(task.id)) {
    if (!options.waitForCompletion) {
      return { task, launched: false, waited: false, timedOut: false }
    }
    const waitResult = await waitForRunningTask(task.id, options.completionTimeoutMs)
    return { task, launched: false, waited: waitResult.waited, timedOut: waitResult.timedOut }
  }

  if (task.status === "pending") {
    const launched = await kickTaskExecution(task.id)
    if (!launched || !options.waitForCompletion) {
      return { task, launched, waited: false, timedOut: false }
    }
    const waitResult = await waitForRunningTask(task.id, options.completionTimeoutMs)
    return { task, launched, waited: waitResult.waited, timedOut: waitResult.timedOut }
  }

  const isDurableRemotePptTask =
    task.parsedPayload.kind === "ai_entry_ppt_preview" &&
    shouldUseDurablePptPreviewQueue() &&
    typeof task.parsedResult?.remoteRequestId === "string" &&
    task.parsedResult.remoteRequestId.trim().length > 0
  if (isDurableRemotePptTask && !hasActiveTaskLease(task)) {
    const launched = await kickTaskExecution(task.id)
    if (!launched || !options.waitForCompletion) {
      return { task, launched, waited: false, timedOut: false }
    }
    const waitResult = await waitForRunningTask(task.id, options.completionTimeoutMs)
    return { task, launched, waited: waitResult.waited, timedOut: waitResult.timedOut }
  }

  const ageMs = getTaskAgeMs(task)
  const recoveryThresholdMs =
    task.parsedPayload.kind === "advisor_turn" && !normalizeLeadHunterAdvisorType(task.parsedPayload.advisorType)
      ? ADVISOR_RECOVERY_CHECK_MS
      : ASSISTANT_STALE_TASK_MS

  if (ageMs < recoveryThresholdMs) {
    return { task, launched: false, waited: false, timedOut: false }
  }

  const claimed = await kickTaskExecution(task.id)
  if (claimed) {
    if (!options.waitForCompletion) {
      return { task, launched: true, waited: false, timedOut: false }
    }
    const waitResult = await waitForRunningTask(task.id, options.completionTimeoutMs)
    return { task, launched: true, waited: waitResult.waited, timedOut: waitResult.timedOut }
  }

  if (task.parsedPayload.kind === "advisor_turn" && !normalizeLeadHunterAdvisorType(task.parsedPayload.advisorType)) {
    // Another worker still owns this task lease or the row is not stale yet.
    // Avoid prematurely converting an in-flight advisor turn into advisor_task_stale.
    if (hasActiveTaskLease(task) || ageMs < ASSISTANT_STALE_TASK_MS) {
      return { task, launched: false, waited: false, timedOut: false }
    }

    const difyUser = buildDifyUserIdentity(task.parsedPayload.userEmail, task.parsedPayload.advisorType)
    const config = await getDifyConfigByAdvisorType(task.parsedPayload.advisorType, {
      userId: task.parsedPayload.userId,
      userEmail: task.parsedPayload.userEmail,
      enterpriseId: task.parsedPayload.enterpriseId,
      enterpriseCode: task.parsedPayload.enterpriseCode,
    }).catch(() => null)

    const recovered = config
      ? await tryRecoverAdvisorAnswer({ payload: task.parsedPayload, config, difyUser }).catch(() => null)
      : null

    if (recovered?.answer) {
      await updateTaskStatus(task.id, {
        status: "success",
        result: {
          ...(task.parsedResult || {}),
          conversation_id: recovered.conversation_id || task.parsedPayload.conversationId || null,
          answer: recovered.answer,
        },
      })
    } else {
      await updateTaskStatus(task.id, {
        status: "failed",
        result: {
          ...(task.parsedResult || {}),
          conversation_id: task.parsedPayload.conversationId || null,
          error: "advisor_task_stale",
        },
      })
    }

    const refreshed = await getTaskById(task.id)
    return { task: parseTask(refreshed), launched: false, waited: false, timedOut: false }
  }

  return { task, launched: false, waited: false, timedOut: false }
}

export async function getAssistantTask(taskId: number, userId?: number) {
  const task = await getTaskById(taskId, userId)
  return parseTask(task)
}

export async function advanceDurableAssistantPptTask(taskId: number, userId: number) {
  const task = parseTask(await getTaskById(taskId, userId))
  if (
    task?.parsedPayload?.kind !== "ai_entry_ppt_preview" ||
    !shouldUseDurablePptPreviewQueue() ||
    !["pending", "running"].includes(task.status || "") ||
    (task.status === "running" && typeof task.parsedResult?.remoteRequestId !== "string")
  ) {
    return false
  }

  const recovery = await recoverAssistantTask(task, {
    waitForCompletion: true,
    completionTimeoutMs: 8_000,
  })
  return recovery.launched || recovery.waited
}

export async function runAssistantTaskRecoveryPass(
  input: {
    limit?: number
    waitForCompletion?: boolean
    completionTimeoutMs?: number
  } = {},
) {
  const limit = Math.max(1, Math.min(30, Number.parseInt(String(input.limit || ASSISTANT_TASK_RECOVERY_BATCH_LIMIT), 10) || 1))
  const candidateIds = await listRecoverableTaskIds(limit, ADVISOR_RECOVERY_CHECK_MS)
  let launched = 0
  let inspected = 0
  let failed = 0
  let waited = 0
  let timedOut = 0

  for (const taskId of candidateIds) {
    inspected += 1
    const wasRunningLocally = runningTasks.has(taskId)

    try {
      const task = parseTask(await getTaskById(taskId))
      const recovery = await recoverAssistantTask(task, {
        waitForCompletion: input.waitForCompletion,
        completionTimeoutMs: input.completionTimeoutMs,
      })
      if (recovery.waited) {
        waited += 1
      }
      if (recovery.timedOut) {
        timedOut += 1
      }
      if (recovery.launched || (!wasRunningLocally && runningTasks.has(taskId))) {
        launched += 1
      }
    } catch (error) {
      failed += 1
      console.error("assistant.task.recovery.failed", {
        taskId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    limit,
    inspected,
    launched,
    failed,
    waited,
    timedOut,
    candidateIds,
  }
}

export async function ensureImageAssistantSessionForTask(params: {
  userId: number
  enterpriseId?: number | null
  sessionId?: string | null
  title: string
}) {
  let sessionId = params.sessionId || null
  let session = sessionId ? await getImageAssistantSession(params.userId, sessionId) : null

  if (sessionId && !session) {
    throw new Error("image_assistant_session_not_found")
  }

  if (!session) {
    const created = await createImageAssistantSession({
      userId: params.userId,
      enterpriseId: params.enterpriseId || null,
      title: params.title,
    })
    sessionId = created.id
    session = await getImageAssistantSession(params.userId, sessionId)
  }

  if (!sessionId || !session) {
    throw new Error("image_assistant_session_create_failed")
  }

  return { sessionId, session }
}

export async function createPendingWriterConversation(params: {
  userId: number
  conversationId?: string | null
  query: string
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
}) {
  return appendWriterConversation({
    userId: params.userId,
    conversationId: params.conversationId,
    query: params.query,
    answer: "",
    diagnostics: null,
    platform: params.platform,
    mode: params.mode,
    language: params.language,
    status: "drafting",
    imagesRequested: false,
  })
}

export type AssistantTaskView = {
  id: number
  status: AssistantTaskStatus
  workflowName: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
}

export function toAssistantTaskView(task: ParsedTaskRow | null): AssistantTaskView | null {
  if (!task) return null
  return {
    id: task.id,
    status: (task.status || "pending") as AssistantTaskStatus,
    workflowName: task.workflowName || null,
    payload: (task.parsedPayload as Record<string, unknown> | null) || null,
    result: task.parsedResult || null,
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
  }
}
