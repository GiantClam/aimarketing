import { createTask, getTaskById, updateTaskStatus } from "@/lib/services/tasks"
import { sendMessage } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import {
  createImageAssistantSession,
  createImageAssistantMessage,
  getImageAssistantSession,
} from "@/lib/image-assistant/repository"
import { runImageAssistantConversationTurn } from "@/lib/image-assistant/service"
import { runWriterSkillsTurn } from "@/lib/writer/skills"
import { appendWriterConversation, updateWriterLatestAssistantMessage } from "@/lib/writer/repository"
import type { WriterLanguage, WriterMode, WriterPlatform } from "@/lib/writer/config"
import type { WriterConversationStatus, WriterHistoryEntry } from "@/lib/writer/types"
import type { ImageAssistantBrief, ImageAssistantTaskType } from "@/lib/image-assistant/types"

type AssistantTaskStatus = "pending" | "running" | "success" | "failed"

type WriterTurnTaskPayload = {
  kind: "writer_turn"
  enterpriseId?: number | null
  conversationId: string
  query: string
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

async function handleWriterTurn(taskId: number, userId: number, payload: WriterTurnTaskPayload) {
  const turnResult = await runWriterSkillsTurn({
    query: payload.query,
    platform: payload.platform,
    mode: payload.mode,
    preferredLanguage: payload.language,
    history: payload.history,
    conversationStatus: payload.conversationStatus,
    enterpriseId: payload.enterpriseId,
  })

  await updateWriterLatestAssistantMessage(userId, payload.conversationId, turnResult.answer, {
    status: turnResult.outcome === "needs_clarification" ? "drafting" : "text_ready",
    imagesRequested: false,
    language: payload.language,
    platform: payload.platform,
    mode: payload.mode,
    diagnostics: turnResult.outcome === "draft_ready" ? turnResult.diagnostics : null,
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

async function handleAdvisorTurn(taskId: number, payload: AdvisorTurnTaskPayload) {
  const difyUser = buildDifyUserIdentity(payload.userEmail, payload.advisorType)
  const config = await getDifyConfigByAdvisorType(payload.advisorType, {
    userId: payload.userId,
    userEmail: payload.userEmail,
  })

  if (!config) {
    throw new Error("advisor_config_missing")
  }

  const upstream = await sendMessage(config, {
    inputs: { contents: payload.query },
    query: payload.query,
    response_mode: "streaming",
    user: difyUser,
    advisorType: payload.advisorType,
    ...(payload.conversationId ? { conversation_id: payload.conversationId } : {}),
  })

  if (!upstream.ok || !upstream.body) {
    const details = await upstream.text().catch(() => "")
    throw new Error(details || `advisor_http_${upstream.status}`)
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let accumulated = ""
  let conversationId = payload.conversationId || null
  let agentName = ""

  const publishProgress = async () => {
    await updateTaskStatus(taskId, {
      status: "running",
      result: {
        conversation_id: conversationId,
        answer: sanitizeAssistantContent(accumulated),
        agent_name: agentName || undefined,
      },
    })
  }

  const handleEvent = async (data: Record<string, unknown>) => {
    const nextConversationId = typeof data.conversation_id === "string" ? data.conversation_id : null
    if (nextConversationId && nextConversationId !== conversationId) {
      conversationId = nextConversationId
      await publishProgress()
    }

    const nextAgentName =
      typeof data.agent_name === "string"
        ? data.agent_name
        : typeof (data.metadata as { agent_name?: string } | undefined)?.agent_name === "string"
          ? ((data.metadata as { agent_name?: string }).agent_name as string)
          : ""
    if (nextAgentName) {
      agentName = nextAgentName
    }

    const event = typeof data.event === "string" ? data.event : ""
    if (event === "workflow_finished" && !accumulated) {
      const workflowText = extractText((data.data as { outputs?: unknown } | undefined)?.outputs)
      if (workflowText) {
        accumulated = workflowText
      }
      return
    }

    if (["message", "agent_message", "text_chunk"].includes(event)) {
      const chunk = extractText((data as { answer?: unknown }).answer) || extractText((data.data as { text?: unknown } | undefined)?.text)
      if (chunk) {
        accumulated += chunk
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = extractSseBlocks(buffer)
    buffer = parsed.rest
    for (const block of parsed.blocks) {
      const data = getSseDataFromBlock(block)
      if (data) {
        await handleEvent(data)
      }
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    const parsed = extractSseBlocks(`${buffer}\n\n`)
    for (const block of parsed.blocks) {
      const data = getSseDataFromBlock(block)
      if (data) {
        await handleEvent(data)
      }
    }
  }

  await updateTaskStatus(taskId, {
    status: "success",
    result: {
      conversation_id: conversationId,
      answer: sanitizeAssistantContent(accumulated),
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

  await updateTaskStatus(taskId, {
    status: "running",
    result: task.parsedResult || null,
  })

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

function scheduleTask(taskId: number) {
  if (runningTasks.has(taskId)) return

  const next = Promise.resolve()
    .then(() => runTask(taskId))
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

export async function enqueueAssistantTask(input: { userId: number; workflowName: string; payload: AssistantTaskPayload }) {
  const task = await createTask({
    userId: input.userId,
    workflowName: input.workflowName,
    webhookPath: "assistant/async",
    payload: input.payload,
  })

  scheduleTask(task.id)
  return task
}

export async function getAssistantTask(taskId: number, userId?: number) {
  const task = await getTaskById(taskId, userId)
  return parseTask(task)
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
