import { claimTaskExecution, createTask, getTaskById, renewTaskLease, updateTaskStatus } from "@/lib/services/tasks"
import { getMessages, sendMessage } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import {
  createImageAssistantSession,
  createImageAssistantMessage,
  getImageAssistantSession,
} from "@/lib/image-assistant/repository"
import { appendLeadHunterMessage } from "@/lib/lead-hunter/repository"
import { buildLeadHunterChatPayload, formatLeadHunterChatOutput } from "@/lib/lead-hunter/chat"
import { runImageAssistantConversationTurn } from "@/lib/image-assistant/service"
import { runWriterSkillsTurn } from "@/lib/writer/skills"
import { appendWriterConversation, updateWriterLatestAssistantMessage } from "@/lib/writer/repository"
import type { WriterLanguage, WriterMode, WriterPlatform } from "@/lib/writer/config"
import type { WriterConversationStatus, WriterHistoryEntry, WriterPreloadedBrief } from "@/lib/writer/types"
import type { ImageAssistantBrief, ImageAssistantTaskType } from "@/lib/image-assistant/types"

type AssistantTaskStatus = "pending" | "running" | "success" | "failed"

type WriterTurnTaskPayload = {
  kind: "writer_turn"
  enterpriseId?: number | null
  conversationId: string
  query: string
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
  requestIp: string
  sessionId: string
  prompt: string
  brief?: Partial<ImageAssistantBrief> | null
  taskType: ImageAssistantTaskType
  referenceAssetIds?: string[]
  candidateCount?: number
  sizePreset?: string | null
  resolution?: string | null
  parentVersionId?: string | null
  extraInstructions?: string | null
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  versionMeta?: Record<string, unknown> | null
}

type AdvisorTurnTaskPayload = {
  kind: "advisor_turn"
  userId: number
  userEmail: string
  advisorType: string
  query: string
  conversationId?: string | null
}

export type AssistantTaskPayload = WriterTurnTaskPayload | ImageTurnTaskPayload | AdvisorTurnTaskPayload

type ParsedTaskRow = Awaited<ReturnType<typeof getTaskById>> & {
  parsedPayload?: AssistantTaskPayload | null
  parsedResult?: Record<string, unknown> | null
}

const taskRunnerState = globalThis as typeof globalThis & {
  __assistantTaskPromises__?: Map<number, Promise<void>>
}

const runningTasks = taskRunnerState.__assistantTaskPromises__ || new Map<number, Promise<void>>()
taskRunnerState.__assistantTaskPromises__ = runningTasks

const WRITER_TASK_TIMEOUT_MS = 180_000
const ADVISOR_TASK_TIMEOUT_MS = 120_000
const ASSISTANT_STALE_TASK_MS = 45_000
const ADVISOR_RECOVERY_CHECK_MS = 12_000
const ASSISTANT_TASK_LEASE_MS = 30_000
const ASSISTANT_TASK_HEARTBEAT_MS = 10_000

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

function getTaskAgeMs(task: ParsedTaskRow | null) {
  if (!task?.updatedAt) return Number.POSITIVE_INFINITY
  const updatedAt = task.updatedAt instanceof Date ? task.updatedAt.getTime() : new Date(task.updatedAt).getTime()
  if (!Number.isFinite(updatedAt)) return Number.POSITIVE_INFINITY
  return Math.max(0, Date.now() - updatedAt)
}

function createTaskWorkerId(taskId: number) {
  return [
    process.env.VERCEL_REGION || "local",
    process.pid,
    taskId,
    crypto.randomUUID(),
  ].join(":")
}

async function withTaskTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string) {
  if (timeoutMs <= 0) {
    return promise
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
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
  const turnResult = await withTaskTimeout(
    runWriterSkillsTurn({
      query: payload.query,
      preloadedBrief: payload.brief,
      platform: payload.platform,
      mode: payload.mode,
      preferredLanguage: payload.language,
      history: payload.history,
      conversationStatus: payload.conversationStatus,
      enterpriseId: payload.enterpriseId,
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

  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      conversation_id: payload.conversationId,
      outcome: turnResult.outcome,
    },
  })
}

async function handleImageTurn(taskId: number, payload: ImageTurnTaskPayload) {
  console.info("image-assistant.task.image.start", {
    taskId,
    sessionId: payload.sessionId,
    taskType: payload.taskType,
    referenceAssetCount: payload.referenceAssetIds?.length || 0,
    sizePreset: payload.sizePreset,
    resolution: payload.resolution,
  })
  const result = await runImageAssistantConversationTurn({
    userId: payload.userId,
    enterpriseId: payload.enterpriseId,
    requestIp: payload.requestIp,
    sessionId: payload.sessionId,
    prompt: payload.prompt,
    brief: payload.brief,
    taskType: payload.taskType,
    referenceAssetIds: payload.referenceAssetIds,
    candidateCount: payload.candidateCount,
    sizePreset: payload.sizePreset,
    resolution: payload.resolution,
    parentVersionId: payload.parentVersionId,
    extraInstructions: payload.extraInstructions,
    snapshotAssetId: payload.snapshotAssetId,
    maskAssetId: payload.maskAssetId,
    versionMeta: payload.versionMeta,
  })

  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      session_id: payload.sessionId,
      outcome: result.outcome,
      version_id: result.version_id,
    },
  })
  console.info("image-assistant.task.image.success", {
    taskId,
    sessionId: payload.sessionId,
    outcome: result.outcome,
    versionId: result.version_id,
  })
}

async function handleLeadHunterTurn(taskId: number, payload: AdvisorTurnTaskPayload, config: { baseUrl: string; apiKey: string }, difyUser: string) {
  if (!payload.conversationId) {
    throw new Error("lead_hunter_conversation_missing")
  }

  const chatResponse = await sendMessage(
    config,
    buildLeadHunterChatPayload({
      query: payload.query,
      responseMode: "streaming",
      user: difyUser,
    }),
  )

  if (!chatResponse.ok || !chatResponse.body) {
    const chatError = await chatResponse.text().catch(() => "")
    throw new Error(chatError || `lead_hunter_chat_http_${chatResponse.status}`)
  }

  const reader = chatResponse.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let accumulated = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = extractSseBlocks(buffer)
    buffer = parsed.rest
    for (const block of parsed.blocks) {
      const data = getSseDataFromBlock(block)
      if (!data) continue
      const event = typeof data.event === "string" ? data.event : ""
      if (["message", "agent_message", "text_chunk"].includes(event)) {
        const chunk =
          extractText((data as { answer?: unknown }).answer) ||
          extractText((data.data as { text?: unknown } | undefined)?.text)
        if (chunk) {
          accumulated += chunk
        }
      }
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    const parsed = extractSseBlocks(`${buffer}\n\n`)
    for (const block of parsed.blocks) {
      const data = getSseDataFromBlock(block)
      if (!data) continue
      const event = typeof data.event === "string" ? data.event : ""
      if (["message", "agent_message", "text_chunk"].includes(event)) {
        const chunk =
          extractText((data as { answer?: unknown }).answer) ||
          extractText((data.data as { text?: unknown } | undefined)?.text)
        if (chunk) {
          accumulated += chunk
        }
      }
    }
  }

  const answer = sanitizeAssistantContent(formatLeadHunterChatOutput(accumulated))

  await appendLeadHunterMessage(payload.userId, payload.conversationId, payload.query, answer || "未返回客户信息列表。")

  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      conversation_id: payload.conversationId,
      answer: answer || "未返回客户信息列表。",
      agent_name: "海外猎客",
    },
  })
}

async function handleAdvisorTurn(taskId: number, payload: AdvisorTurnTaskPayload) {
  const difyUser = buildDifyUserIdentity(payload.userEmail, payload.advisorType)
  const config = await getDifyConfigByAdvisorType(payload.advisorType, {
    userId: payload.userId,
    userEmail: payload.userEmail,
  })

  if (!config) {
    throw new Error("advisor_config_missing")
  }

  if (payload.advisorType === "lead-hunter") {
    await handleLeadHunterTurn(taskId, payload, config, difyUser)
    return
  }

  const abortController = new AbortController()
  const abortTimer = setTimeout(() => abortController.abort("advisor_task_timeout"), ADVISOR_TASK_TIMEOUT_MS)

  let answer: string | null | undefined
  let conversationId = payload.conversationId || null
  let agentName = ""

  try {
    const upstream = await sendMessage(
      config,
      {
        inputs: { contents: payload.query },
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
      throw new Error(details || `advisor_http_${upstream.status}`)
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
      const rawTask = await getTaskById(taskId)
      const task = parseTask(rawTask)
      if (task?.parsedPayload?.kind === "writer_turn") {
        await updateWriterLatestAssistantMessage(task.userId, task.parsedPayload.conversationId, `请求失败：${error instanceof Error ? error.message : "unknown_error"}`, {
          status: "failed",
          imagesRequested: false,
        }).catch(() => null)
      }
      if (task?.parsedPayload?.kind === "image_turn") {
        await createImageAssistantMessage({
          sessionId: task.parsedPayload.sessionId,
          role: "assistant",
          messageType: "error",
          content: error instanceof Error ? error.message : "image_generation_failed",
          taskType: task.parsedPayload.taskType,
        }).catch(() => null)
      }
      await updateTaskStatus(taskId, {
        status: "failed",
        result: {
          ...(task?.parsedResult || {}),
          error: error instanceof Error ? error.message : "assistant_task_failed",
        },
      }).catch(() => null)
    })
    .finally(() => {
      runningTasks.delete(taskId)
    })

  runningTasks.set(taskId, next)
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

async function recoverAssistantTask(task: ParsedTaskRow | null) {
  if (!task?.parsedPayload) {
    return task
  }

  if (!["pending", "running"].includes(task.status || "")) {
    return task
  }

  if (runningTasks.has(task.id)) {
    return task
  }

  if (task.status === "pending") {
    void kickTaskExecution(task.id).catch(() => null)
    return task
  }

  const ageMs = getTaskAgeMs(task)
  const recoveryThresholdMs =
    task.parsedPayload.kind === "advisor_turn" && task.parsedPayload.advisorType !== "lead-hunter"
      ? ADVISOR_RECOVERY_CHECK_MS
      : ASSISTANT_STALE_TASK_MS

  if (ageMs < recoveryThresholdMs) {
    return task
  }

  const claimed = await kickTaskExecution(task.id)
  if (claimed) {
    return task
  }

  if (task.parsedPayload.kind === "advisor_turn" && task.parsedPayload.advisorType !== "lead-hunter") {
    const difyUser = buildDifyUserIdentity(task.parsedPayload.userEmail, task.parsedPayload.advisorType)
    const config = await getDifyConfigByAdvisorType(task.parsedPayload.advisorType, {
      userId: task.parsedPayload.userId,
      userEmail: task.parsedPayload.userEmail,
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
    return parseTask(refreshed)
  }

  return task
}

export async function getAssistantTask(taskId: number, userId?: number) {
  const task = await getTaskById(taskId, userId)
  return recoverAssistantTask(parseTask(task))
}

export async function ensureImageAssistantSessionForTask(params: {
  userId: number
  enterpriseId?: number | null
  sessionId?: string | null
  title: string
}) {
  let sessionId = params.sessionId || null
  let session = sessionId ? await getImageAssistantSession(params.userId, sessionId) : null

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
