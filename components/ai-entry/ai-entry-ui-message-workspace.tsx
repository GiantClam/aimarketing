"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DefaultChatTransport } from "ai"
import { useChat } from "@ai-sdk/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowDown,
  Check,
  Clipboard,
  Database,
  FileText,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  Square,
} from "lucide-react"

import { Markdown } from "@/components/ai-entry/prompt-kit/markdown"
import { MessagePartViewList } from "@/components/ai-entry/message-parts/message-part-view"
import { useI18n } from "@/components/locale-provider"
import { buildConversationArtifactParts } from "@/lib/ai-entry/conversation-artifacts"
import { formatMessageDate, formatMessageDateTime, getRelativeMessageTime, resolveBrowserTimeZone } from "@/lib/ai-entry/message-time"
import type { MessagePart } from "@/lib/ai-entry/message-parts/types"
import { mergeTaskRunSummariesIntoMessages, type AiEntryTaskRunStatusPatch } from "@/lib/ai-entry/ui-message-task-sync"
import {
  createAiEntryTextMessage,
  getAiEntryUIMessageText,
  mergeAiEntryUIMessageDuplicates,
  messagePartsToAiEntryUIMessageParts,
  type AiEntryMessageMetadata,
  type AiEntryUIMessage,
  type AiEntryUIMessagePart,
} from "@/lib/ai-entry/ui-message"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Props = {
  initialConversationId: string | null
}

type PersistedMessage = {
  id?: unknown
  role?: unknown
  content?: unknown
  parts?: unknown
  metadata?: unknown
  idempotency_key?: unknown
  created_at?: unknown
}

type KnowledgeDatasetOption = {
  id: number
  name: string
  category: string
}

type AiEntryModelOption = {
  id: string
  name: string
  modelId?: string
  providerId?: string
  providerLabel?: string
  runtimeId?: string
  canonicalId?: string
}

type AiEntryModelGroup = {
  family: string
  label: string
  models: AiEntryModelOption[]
}

type AiEntryModelsResponse = {
  models?: AiEntryModelOption[]
  modelGroups?: AiEntryModelGroup[]
  selectedModelId?: string | null
}

type AiEntryTaskRunSummary = AiEntryTaskRunStatusPatch

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-[8px] bg-primary text-primary-foreground", small ? "size-8" : "size-10")}>
      <Sparkles className={small ? "size-4" : "size-5"} strokeWidth={2.6} />
    </div>
  )
}

function IconButton({ label, children, onClick, disabled = false }: { label: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="size-8 rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </Button>
  )
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function normalizeTaskRun(value: unknown): AiEntryTaskRunSummary | null {
  const valueRecord = asRecord(value)
  const record = asRecord(valueRecord?.taskRun) || valueRecord
  const taskId = asString(record?.task_id)
  if (!taskId) return null
  const taskSource = record?.task_source === "runtime" || record?.task_source === "legacy"
    ? record.task_source
    : record?.task_type === "opencode_agent_run"
      ? "runtime"
      : "legacy"
  return {
    task_id: taskId,
    task_source: taskSource,
    status: asString(record?.status) || "pending",
    stage: asString(record?.stage) || null,
    stage_label: asString(record?.stage_label) || null,
    error_message: asString(record?.error_message) || null,
    error: asString(record?.error) || null,
    finished_at: typeof record?.finished_at === "number" ? record.finished_at : null,
    conversation_id: asString(record?.conversation_id) || null,
    agent_id: asString(record?.agent_id) || null,
  }
}

function getConversationTaskRuns(payload: unknown) {
  const record = asRecord(payload)
  const candidates = [
    ...(Array.isArray(record?.task_runs) ? record.task_runs : []),
    record?.pending_task,
  ]
  const byId = new Map<string, AiEntryTaskRunSummary>()
  for (const candidate of candidates) {
    const task = normalizeTaskRun(candidate)
    if (task) byId.set(`${task.task_source || "unknown"}:${task.task_id}`, task)
  }
  return [...byId.values()]
}

function isTaskRunning(task: AiEntryTaskRunSummary | null) {
  return task?.status === "pending" || task?.status === "running" || task?.status === "queued"
}

function getMessageCreatedAt(message: Pick<AiEntryUIMessage, "metadata">) {
  const metadata = asRecord(message.metadata)
  return typeof metadata?.createdAt === "number" && Number.isFinite(metadata.createdAt) ? metadata.createdAt : undefined
}

function getConversationIdFromMessages(messages: AiEntryUIMessage[]) {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      const record = asRecord(part)
      if (record?.type !== "data-runtime-status") continue
      const data = asRecord(record.data)
      const conversationId = asString(data?.conversationId).trim()
      if (conversationId) return conversationId
    }
  }
  return null
}

function normalizePersistedParts(value: unknown): AiEntryUIMessage["parts"] | null {
  if (!Array.isArray(value)) return null

  const normalized = value.flatMap((part) => {
    const record = asRecord(part)
    const type = asString(record?.type)
    const isUiMessagePart =
      type.startsWith("data-") ||
      type.startsWith("tool-") ||
      type === "file" ||
      type === "source-url" ||
      type === "source-document" ||
      (type === "text" && typeof record?.state === "string") ||
      (type === "reasoning" && typeof record?.state === "string")

    if (isUiMessagePart) return [part as AiEntryUIMessagePart]
    if (!type) return []
    return messagePartsToAiEntryUIMessageParts([part as MessagePart])
  })

  return normalized
}

function getPersistedArtifactId(part: AiEntryUIMessagePart) {
  const record = asRecord(part)
  if (record?.type !== "data-artifact") return null
  const data = asRecord(record.data)
  return typeof data?.artifactId === "number" && Number.isInteger(data.artifactId) ? data.artifactId : null
}

function normalizeArtifactToken(value: string | null | undefined) {
  if (!value) return ""
  const normalized = value.replaceAll("\\", "/").split("/").at(-1)?.trim().toLowerCase() || ""
  return normalized.length >= 4 ? normalized : ""
}

function attachConversationArtifactsToUiMessages(
  messages: AiEntryUIMessage[],
  artifacts: ReturnType<typeof buildConversationArtifactParts>,
) {
  if (artifacts.length === 0) return messages

  const nextMessages = messages.map((message) => ({
    ...message,
    parts: [...message.parts],
  }))
  const attachedArtifactIds = new Set(
    nextMessages.flatMap((message) => message.parts.map(getPersistedArtifactId).filter((id): id is number => id !== null)),
  )
  const unplacedArtifacts = [] as typeof artifacts

  for (const artifact of artifacts) {
    if (artifact.artifactId !== null && attachedArtifactIds.has(artifact.artifactId)) continue

    const fileNameToken = normalizeArtifactToken(artifact.fileName)
    const titleToken = normalizeArtifactToken(artifact.title)
    const messageIndex = nextMessages.findIndex((message) => {
      if (message.role !== "assistant") return false
      const content = getAiEntryUIMessageText(message).toLowerCase()
      return Boolean(
        (fileNameToken && content.includes(fileNameToken)) ||
        (titleToken && content.includes(titleToken)),
      )
    })
    const uiArtifact = messagePartsToAiEntryUIMessageParts([artifact])[0]
    if (!uiArtifact) continue

    if (messageIndex >= 0) {
      nextMessages[messageIndex].parts = [...nextMessages[messageIndex].parts, uiArtifact]
      if (artifact.artifactId !== null) attachedArtifactIds.add(artifact.artifactId)
    } else {
      unplacedArtifacts.push(artifact)
    }
  }

  if (unplacedArtifacts.length > 0) {
    nextMessages.push({
      id: "conversation-artifacts",
      role: "assistant",
      metadata: { createdAt: unplacedArtifacts[0]?.createdAt },
      parts: unplacedArtifacts.flatMap((artifact) => messagePartsToAiEntryUIMessageParts([artifact])),
    })
  }

  return nextMessages
}

function mapPersistedMessages(payload: unknown): AiEntryUIMessage[] {
  const payloadRecord = asRecord(payload)
  const data = payloadRecord?.data
  if (!Array.isArray(data)) return []

  const messages = data.flatMap((item): AiEntryUIMessage[] => {
    const record = asRecord(item) as PersistedMessage | null
    const role = record?.role === "assistant" || record?.role === "user" ? record.role : null
    const content = asString(record?.content)
    const normalizedParts = normalizePersistedParts(record?.parts)
    const persistedParts = normalizedParts?.length ? normalizedParts : null
    const persistedMetadata = asRecord(record?.metadata) || {}
    const metadataCreatedAt = typeof persistedMetadata.createdAt === "number" && Number.isFinite(persistedMetadata.createdAt)
      ? persistedMetadata.createdAt
      : undefined
    const databaseCreatedAt = typeof record?.created_at === "number" && Number.isFinite(record.created_at)
      ? record.created_at
      : undefined
    const createdAt = metadataCreatedAt ?? databaseCreatedAt
    const idempotencyKey = asString(record?.idempotency_key)
    const metadata = {
      ...persistedMetadata,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(createdAt !== undefined ? { createdAt } : {}),
    }
    if (!role || (!content && !persistedParts?.length)) return []
    return [
      persistedParts
        ? {
            id: asString(record?.id) || crypto.randomUUID(),
            role,
            metadata,
            parts: persistedParts,
          }
        : createAiEntryTextMessage({
            id: asString(record?.id) || crypto.randomUUID(),
            role,
            text: content,
            createdAt,
            metadata: metadata as AiEntryMessageMetadata,
          }),
    ]
  })

  const conversationState = asRecord(payloadRecord?.conversation_state)
  const artifacts = buildConversationArtifactParts(conversationState?.artifacts)
  return attachConversationArtifactsToUiMessages(mergeAiEntryUIMessageDuplicates(messages), artifacts)
}

function dataPartToLegacyPart(part: AiEntryUIMessagePart): MessagePart | null {
  const raw = part as unknown as { type: string; id?: string; data?: unknown; text?: string; state?: string; title?: string; url?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown; errorText?: string }
  if (raw.type === "reasoning") {
    return { type: "reasoning", id: raw.id || crypto.randomUUID(), text: raw.text || "", status: raw.state === "streaming" ? "running" : "done" }
  }
  if (raw.type === "source-url" || raw.type === "source-document") {
    return { type: "source", id: raw.id || crypto.randomUUID(), sourceType: raw.type === "source-url" ? "url" : "document", title: asString(raw.title) || null, url: asString(raw.url) || null, snippet: null }
  }
  if (raw.type.startsWith("tool-")) {
    const state = raw.type === "tool-output-error" ? "output-error" : raw.type === "tool-output-available" ? "output-available" : "input-streaming"
    return { type: "tool-call", id: raw.toolCallId || crypto.randomUUID(), toolName: raw.toolName || "tool", toolCallId: raw.toolCallId || crypto.randomUUID(), args: raw.input, state, ...(raw.output !== undefined ? { output: raw.output } : {}), ...(raw.errorText ? { output: { error: raw.errorText } } : {}) }
  }
  if (raw.type.startsWith("data-")) {
    const dataType = raw.type.slice(5)
    const data = asRecord(raw.data)
    const id = raw.id || crypto.randomUUID()
    if (dataType === "artifact" || dataType === "report" || dataType === "template-recommendation" || dataType === "validation" || dataType === "task-progress" || dataType === "task-run" || dataType === "workflow-status" || dataType === "tool-call") {
      return { type: dataType, id, ...(data || {}) } as MessagePart
    }
  }
  return null
}

function splitMessageParts(message: AiEntryUIMessage) {
  const processParts: MessagePart[] = []
  const artifactParts: MessagePart[] = []
  for (const part of message.parts) {
    const mapped = dataPartToLegacyPart(part)
    if (!mapped) continue
    if (mapped.type === "artifact" || mapped.type === "report" || mapped.type === "template-recommendation") artifactParts.push(mapped)
    else processParts.push(mapped)
  }
  return { processParts, artifactParts }
}

function hasTerminalProcess(parts: MessagePart[]) {
  return parts.some((part) => {
    if (part.type === "task-run") return ["success", "succeeded", "failed", "cancelled", "timed_out"].includes(part.taskRun.status)
    if (part.type === "task-progress") return part.status === "done"
    if (part.type === "workflow-status") return ["succeeded", "failed", "cancelled"].includes(part.status)
    return false
  })
}

function ProcessTrace({ parts, isZh, agentId, copy }: { parts: MessagePart[]; isZh: boolean; agentId: string | null; copy: { processRecord: string; processRecordHint: string } }) {
  if (!parts.length) return null
  return (
    <div className="mt-5 border-t border-dashed border-border/70 pt-3">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70"><span>{copy.processRecord}</span><span className="font-normal normal-case tracking-normal">{copy.processRecordHint}</span></div>
      <div className="opacity-75 transition-opacity hover:opacity-100"><MessagePartViewList parts={parts} isZh={isZh} agentId={agentId} className="mt-2 space-y-2" /></div>
    </div>
  )
}

export function AiEntryUIMessageWorkspace({ initialConversationId }: Props) {
  const { locale, messages: i18nMessages } = useI18n()
  const copy = i18nMessages.aiEntry
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeAgentId = searchParams.get("agent")?.trim() || null
  const routeEntryMode = searchParams.get("entry")?.trim() || ""
  const [conversationId, setConversationId] = useState(initialConversationId)
  const [input, setInput] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<FileList | undefined>()
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false)
  const [knowledgeMenuOpen, setKnowledgeMenuOpen] = useState(false)
  const [knowledgeDatasets, setKnowledgeDatasets] = useState<KnowledgeDatasetOption[]>([])
  const [knowledgeDatasetsLoading, setKnowledgeDatasetsLoading] = useState(false)
  const [selectedKnowledgeDatasetIds, setSelectedKnowledgeDatasetIds] = useState<number[]>([])
  const [modelCatalogOpen, setModelCatalogOpen] = useState(false)
  const [modelCatalogLoading, setModelCatalogLoading] = useState(true)
  const [modelCatalogError, setModelCatalogError] = useState(false)
  const [modelGroups, setModelGroups] = useState<AiEntryModelGroup[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [isLoadingConversation, setIsLoadingConversation] = useState(Boolean(initialConversationId))
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [timeZone] = useState(() => resolveBrowserTimeZone())
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingConversationRouteRef = useRef<string | null>(null)
  const pendingTurnIdRef = useRef<string | null>(null)
  const initialScrollCompletedRef = useRef(false)
  const modelOptions = useMemo(() => modelGroups.flatMap((group) => group.models), [modelGroups])
  const selectedModel = useMemo(
    () => modelOptions.find((model) => model.id === selectedModelId) || null,
    [modelOptions, selectedModelId],
  )

  const transport = useMemo(
    () => new DefaultChatTransport<AiEntryUIMessage>({
      api: "/api/ai/chat/ui",
      body: () => ({
        conversationId,
        uiMessageRequestId: pendingTurnIdRef.current || crypto.randomUUID(),
        conversationScope: routeEntryMode === "consulting-advisor" ? "consulting" : "chat",
        modelConfig: selectedModel
          ? {
              providerId: selectedModel.providerId,
              modelId: selectedModel.modelId || selectedModel.runtimeId || selectedModel.canonicalId || selectedModel.id,
            }
          : undefined,
        enterpriseKnowledge: { enabled: knowledgeEnabled, datasetIds: selectedKnowledgeDatasetIds },
        skillConfig: { enabled: true },
        durableTask: routeAgentId === "executive-ppt",
        agentConfig: {
          agentId: routeAgentId,
          entryMode: routeEntryMode || undefined,
        },
      }),
    }),
    [conversationId, knowledgeEnabled, routeAgentId, routeEntryMode, selectedKnowledgeDatasetIds, selectedModel],
  )

  const [activeTask, setActiveTask] = useState<AiEntryTaskRunSummary | null>(null)
  const [streamInterrupted, setStreamInterrupted] = useState(false)
  const { messages, status, error, sendMessage, stop, regenerate, setMessages, clearError } = useChat<AiEntryUIMessage>({
    id: conversationId || "new-ai-entry",
    transport,
    onData: (data) => {
      if (data.type === "data-task-run") {
        const task = normalizeTaskRun(data.data)
        if (task) setActiveTask(task)
      }
      const runtimeData = data.type === "data-runtime-status" ? asRecord(data.data) : null
      if (!runtimeData || typeof runtimeData.conversationId !== "string") return
      const nextConversationId = runtimeData.conversationId
      if (!conversationId && pathname === "/dashboard/ai") pendingConversationRouteRef.current = nextConversationId
      setConversationId((current) => current || nextConversationId)
    },
    onError: () => setStreamInterrupted(true),
    onFinish: ({ messages: finishedMessages }) => {
      setStreamInterrupted(false)
      const finishedAt = Date.now()
      setMessages((currentMessages) => currentMessages.map((message) => {
        if (message.role !== "assistant" || getMessageCreatedAt(message) !== undefined) return message
        const finishedMessage = finishedMessages.find((candidate) => candidate.id === message.id)
        if (!finishedMessage) return message
        return {
          ...message,
          metadata: { ...(asRecord(message.metadata) || {}), createdAt: finishedAt },
        }
      }))
      const nextConversationId = pendingConversationRouteRef.current || getConversationIdFromMessages(finishedMessages)
      pendingConversationRouteRef.current = null
      if (nextConversationId) {
        setConversationId((current) => current || nextConversationId)
        if (pathname === "/dashboard/ai") router.replace(`/dashboard/ai/${nextConversationId}`)
      }
    },
  })

  const isStreaming = status === "submitted" || status === "streaming"
  const displayMessages = useMemo(() => mergeAiEntryUIMessageDuplicates(messages), [messages])
  const taskIsRunning = isTaskRunning(activeTask)
  const executionLocked = isStreaming || taskIsRunning || streamInterrupted
  const isZh = locale === "zh"

  const clearChatError = () => {
    clearError()
    setStreamInterrupted(false)
  }

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    setModelCatalogLoading(true)
    setModelCatalogError(false)

    void fetch("/api/ai/models", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)

        const data = payload as AiEntryModelsResponse
        const groups = Array.isArray(data.modelGroups)
          ? data.modelGroups.filter((group) => Array.isArray(group.models) && group.models.length > 0)
          : []
        const fallbackModels = Array.isArray(data.models) ? data.models : []
        const normalizedGroups = groups.length > 0
          ? groups
          : fallbackModels.length > 0
            ? [{ family: "all", label: copy.availableModels, models: fallbackModels }]
            : []
        const models = normalizedGroups.flatMap((group) => group.models)
        const storedModelId = window.localStorage.getItem("ai-entry-ui-message-model")
        const preferredModelId = storedModelId && models.some((model) => model.id === storedModelId)
          ? storedModelId
          : typeof data.selectedModelId === "string" && models.some((model) => model.id === data.selectedModelId)
            ? data.selectedModelId
            : models[0]?.id || null

        setModelGroups(normalizedGroups)
        setSelectedModelId(preferredModelId)
      })
      .catch(() => {
        if (!cancelled) {
          setModelCatalogError(true)
          setModelGroups([])
          setSelectedModelId(null)
        }
      })
      .finally(() => {
        if (!cancelled) setModelCatalogLoading(false)
      })

    return () => { cancelled = true }
  }, [copy.availableModels])

  const selectModel = (modelId: string) => {
    setSelectedModelId(modelId)
    window.localStorage.setItem("ai-entry-ui-message-model", modelId)
    setModelCatalogOpen(false)
  }

  const refreshConversation = useCallback(async (showLoading = false) => {
    if (!initialConversationId) {
      setIsLoadingConversation(false)
      setActiveTask(null)
      return
    }
    if (showLoading) setIsLoadingConversation(true)
    try {
      const response = await fetch(`/api/ai/messages?conversation_id=${encodeURIComponent(initialConversationId)}&limit=200${routeAgentId ? `&agent=${encodeURIComponent(routeAgentId)}` : ""}`, { credentials: "same-origin", cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(asString(asRecord(payload)?.error) || `http_${response.status}`)
      const conversationTasks = getConversationTaskRuns(payload)
      setMessages(mergeTaskRunSummariesIntoMessages(mapPersistedMessages(payload), conversationTasks))
      const runningTask = conversationTasks.filter(isTaskRunning).at(-1) || null
      setActiveTask(runningTask)
    } catch {
      if (showLoading) setMessages([])
    } finally {
      if (showLoading) setIsLoadingConversation(false)
    }
  }, [initialConversationId, routeAgentId, setMessages])

  const retryConnection = () => {
    clearChatError()
    void refreshConversation(false)
  }

  useEffect(() => {
    void refreshConversation(true)
  }, [refreshConversation])

  useEffect(() => {
    const activeTaskId = activeTask?.task_id
    if (!taskIsRunning || !activeTaskId) return
    let cancelled = false
    const poll = async () => {
      try {
        const response = await fetch("/api/ai/task-runs/status", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            taskRunIds: [activeTaskId],
            taskRunSources: activeTask?.task_source ? [activeTask.task_source] : undefined,
          }),
          cache: "no-store",
        })
        const payload = await response.json()
        if (cancelled || !response.ok) return
        const task = Array.isArray(asRecord(payload)?.data)
          ? (asRecord(payload)?.data as unknown[]).map(normalizeTaskRun).find((candidate) =>
              candidate?.task_id === activeTaskId &&
              (!activeTask?.task_source || candidate.task_source === activeTask.task_source),
            ) || null
          : null
        if (!task) return
        setActiveTask(task)
        if (!isTaskRunning(task)) {
          await refreshConversation(false)
          if (!cancelled) setActiveTask(null)
        }
      } catch {
        // Keep the task locked. The next poll or a page refresh can recover it.
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeTask?.task_id, activeTask?.task_source, refreshConversation, taskIsRunning])

  useEffect(() => {
    let cancelled = false
    setKnowledgeDatasetsLoading(true)

    void fetch("/api/knowledge/datasets", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (cancelled || !response.ok) return
        const items = asRecord(asRecord(payload)?.data)?.items
        const datasets = Array.isArray(items)
          ? items.flatMap((item): KnowledgeDatasetOption[] => {
              const record = asRecord(item)
              return typeof record?.id === "number" && typeof record.name === "string" && typeof record.category === "string"
                ? [{ id: record.id, name: record.name, category: record.category }]
                : []
            })
          : []
        setKnowledgeDatasets(datasets)
        setSelectedKnowledgeDatasetIds((current) => current.filter((id) => datasets.some((dataset) => dataset.id === id)))
      })
      .catch(() => {
        if (!cancelled) setKnowledgeDatasets([])
      })
      .finally(() => {
        if (!cancelled) setKnowledgeDatasetsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    initialScrollCompletedRef.current = false
  }, [initialConversationId])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || isLoadingConversation || displayMessages.length === 0) return

    if (!initialScrollCompletedRef.current) {
      initialScrollCompletedRef.current = true
      setShowScrollButton(false)
      const frame = window.requestAnimationFrame(() => {
        element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
      })
      return () => window.cancelAnimationFrame(frame)
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setShowScrollButton(distanceToBottom > 180)
    if (distanceToBottom < 180) element.scrollTo({ top: element.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" })
  }, [displayMessages, isLoadingConversation, status])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    setShowScrollButton(element.scrollHeight - element.scrollTop - element.clientHeight > 180)
  }

  const scrollToLatest = () => {
    setShowScrollButton(false)
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }

  const submit = () => {
    const text = input.trim()
    if (!text || executionLocked) return
    setStreamInterrupted(false)
    const turnId = crypto.randomUUID()
    pendingTurnIdRef.current = turnId
    void sendMessage({ text, metadata: { createdAt: Date.now(), turnId }, ...(selectedFiles ? { files: selectedFiles } : {}) })
      .finally(() => {
        if (pendingTurnIdRef.current === turnId) pendingTurnIdRef.current = null
      })
    setInput("")
    setSelectedFiles(undefined)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const resetConversation = () => {
    clearChatError()
    setConversationId(null)
    setMessages([])
    setActiveTask(null)
    setInput("")
    router.push("/dashboard/ai")
  }

  const disableKnowledge = () => {
    setKnowledgeEnabled(false)
    setSelectedKnowledgeDatasetIds([])
    setKnowledgeMenuOpen(false)
  }

  const toggleKnowledgeDataset = (datasetId: number) => {
    setKnowledgeEnabled(true)
    setSelectedKnowledgeDatasetIds((current) => current.includes(datasetId)
      ? current.filter((id) => id !== datasetId)
      : [...current, datasetId])
  }

  const knowledgeSummary = !knowledgeEnabled
    ? copy.notSelected
    : selectedKnowledgeDatasetIds.length === 0
      ? copy.allKnowledgeBases
      : copy.selectedKnowledgeBases(selectedKnowledgeDatasetIds.length)

  const copyMessage = async (message: AiEntryUIMessage) => {
    try {
      await navigator.clipboard.writeText(getAiEntryUIMessageText(message))
    } catch {
      // Clipboard permissions can be unavailable in embedded previews.
    }
  }

  const formatMessageTimestamp = (message: AiEntryUIMessage) => {
    const createdAt = getMessageCreatedAt(message)
    const relative = getRelativeMessageTime(createdAt, currentTime)
    const label = relative.kind === "just-now"
      ? copy.justNow
      : relative.kind === "minutes"
        ? copy.minutesAgo(relative.count)
        : relative.kind === "hours"
          ? copy.hoursAgo(relative.count)
          : relative.kind === "yesterday"
            ? copy.yesterday
            : relative.kind === "days"
              ? copy.daysAgo(relative.count)
              : formatMessageDate(relative.timestampMs, isZh ? "zh" : "en", timeZone)
    return {
      label,
      exact: formatMessageDateTime(createdAt, isZh ? "zh" : "en", timeZone),
    }
  }

  const modelPicker = <Popover open={modelCatalogOpen} onOpenChange={setModelCatalogOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" disabled={executionLocked || modelCatalogLoading || modelOptions.length === 0} className="h-8 min-w-0 max-w-[190px] rounded-[8px] px-2.5 text-xs font-medium sm:max-w-[260px]" title={selectedModel?.name || copy.selectModel}><Sparkles className="mr-1.5 size-3.5 shrink-0 text-primary" /><span className="truncate">{modelCatalogLoading ? copy.loadingModel : selectedModel?.name || (modelCatalogError ? copy.unavailableModel : copy.selectModel)}</span></Button></PopoverTrigger><PopoverContent align="start" className="w-[320px] p-0"><Command><div className="border-b border-border px-3 py-3"><div className="text-xs font-semibold">{copy.modelSelectionTitle}</div><div className="mt-1 text-[11px] text-muted-foreground">{copy.modelSelectionHint}</div></div><CommandInput placeholder={copy.searchModels} /><CommandList><CommandEmpty>{modelCatalogLoading ? copy.loadingModels : modelCatalogError ? copy.modelListFailed : copy.noModels}</CommandEmpty>{modelGroups.map((group) => <CommandGroup key={group.family} heading={group.label}>{group.models.map((model) => <CommandItem key={model.id} value={`${model.name} ${model.providerLabel || ""} ${model.modelId || ""}`} onSelect={() => selectModel(model.id)} className="cursor-pointer"><div className="min-w-0 flex-1"><div className="truncate text-sm">{model.name}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{model.providerLabel || model.providerId || copy.defaultProvider} · {model.modelId || model.runtimeId || model.id}</div></div>{model.id === selectedModelId ? <Check className="ml-2 size-4 shrink-0 text-primary" /> : null}</CommandItem>)}</CommandGroup>)}</CommandList></Command></PopoverContent></Popover>
  const showPendingAssistant = isStreaming && displayMessages.at(-1)?.role === "user"

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-sm lg:px-7"><div className="min-w-0"><h1 className="truncate text-sm font-bold">{copy.title}</h1><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{copy.subtitle}</p></div><div className="flex min-w-0 items-center gap-1"><span className="hidden max-w-[280px] items-center gap-1.5 truncate rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground sm:flex"><span className={cn("size-1.5 shrink-0 rounded-full", taskIsRunning || isStreaming ? "animate-pulse bg-primary" : streamInterrupted || error ? "bg-destructive" : "bg-emerald-500")} />{taskIsRunning ? activeTask?.stage_label || copy.taskRunning : streamInterrupted ? copy.connectionInterrupted : isStreaming ? copy.generating : error ? copy.retryRequired : copy.ready}</span><IconButton label={copy.newConversation} onClick={resetConversation}><MessageSquarePlus className="size-3.5" /></IconButton><IconButton label={copy.more}><MoreHorizontal className="size-4" /></IconButton></div></header>

          <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[900px] flex-col gap-7 px-4 py-7 pb-40 sm:px-6 lg:px-8">
              {isLoadingConversation ? <div className="flex items-center justify-center py-20 text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{copy.restoringConversation}</div> : null}
              {taskIsRunning ? <div className="flex items-center gap-2 rounded-[9px] border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin text-primary" />{activeTask?.stage_label || copy.taskRunning}{copy.taskLocked}</div> : null}
              {streamInterrupted ? <div className="flex items-center justify-between gap-3 rounded-[9px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><span>{copy.connectionInterrupted}</span><button type="button" onClick={retryConnection} className="shrink-0 font-semibold underline underline-offset-2">{copy.retryToReconnect}</button></div> : null}
              {!isLoadingConversation && !displayMessages.length ? <div className="mx-auto flex max-w-[560px] flex-col items-center py-20 text-center"><BrandMark /><h2 className="mt-5 text-xl font-bold">{copy.emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.emptyDescription}</p></div> : null}
              {displayMessages.map((message, index) => {
                const messageText = getAiEntryUIMessageText(message)
                const messageTimestamp = formatMessageTimestamp(message)
                const { processParts, artifactParts } = message.role === "assistant" ? splitMessageParts(message) : { processParts: [], artifactParts: [] }
                const hasCompletedProcess = hasTerminalProcess(processParts)
                const isLastAssistant = message.role === "assistant" && index === messages.length - 1
                const isMessageStreaming = message.parts.some((part) => (part as { type?: string; state?: string }).type === "text" && (part as { state?: string }).state === "streaming") || (isLastAssistant && isStreaming)
                return <article key={message.id} className={cn("group", message.role === "user" ? "flex justify-end" : "flex gap-3")}>
                  {message.role === "assistant" ? <div className="mt-1 hidden sm:block"><BrandMark small /></div> : null}
                  <div className={cn("min-w-0", message.role === "user" ? "max-w-[82%]" : "w-full")}>
                    {message.role === "user" ? <div className="rounded-[10px] bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-[0_4px_12px_rgba(17,17,17,0.06)]"><p>{messageText}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-primary-foreground/65" title={messageTimestamp.exact || undefined}>{messageTimestamp.label}<Check className="size-3" /></div></div> : <div className="rounded-[12px] border border-border bg-card px-4 py-4 shadow-[0_6px_20px_rgba(17,17,17,0.025)] sm:px-5 sm:py-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="text-xs font-bold">AI Marketing</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{routeAgentId || copy.assistant}</span></div><span className="text-[10px] text-muted-foreground" title={messageTimestamp.exact || undefined}>{messageTimestamp.label}</span></div><ProcessTrace parts={processParts} isZh={isZh} agentId={routeAgentId} copy={copy} />{messageText ? <div className="mt-4 whitespace-pre-line text-base leading-8 text-foreground"><Markdown>{messageText}</Markdown>{isMessageStreaming ? <span className="ml-1 inline-block h-5 w-1 animate-pulse bg-primary align-[-2px]" /> : null}</div> : artifactParts.length || hasCompletedProcess ? null : <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{copy.organizingAnswer}</div>}{artifactParts.length ? <div className="mt-5 border-t border-primary/30 pt-4"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70"><FileText className="size-3.5" />{copy.finalDeliverable}</div><MessagePartViewList parts={artifactParts} isZh={isZh} agentId={routeAgentId} className="space-y-3" /></div> : null}{!isMessageStreaming ? <div className="mt-4 flex items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100"><IconButton label={copy.copy} onClick={() => void copyMessage(message)}><Clipboard className="size-3.5" /></IconButton><IconButton label={copy.regenerate} disabled={executionLocked} onClick={() => void regenerate({ messageId: message.id })}><RefreshCw className="size-3.5" /></IconButton></div> : null}</div>}
                  </div>
                </article>
              })}
              {showPendingAssistant ? <article className="flex gap-3"><div className="mt-1 hidden sm:block"><BrandMark small /></div><div className="min-w-0 w-full"><div className="rounded-[12px] border border-border bg-card px-4 py-4 shadow-[0_6px_20px_rgba(17,17,17,0.025)] sm:px-5 sm:py-5"><div className="flex items-center gap-2"><span className="text-xs font-bold">AI Marketing</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{routeAgentId || copy.assistant}</span></div><div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin text-primary" />{copy.organizingAnswer}</div></div></div></article> : null}
              {error ? <div className="flex items-center justify-between gap-3 rounded-[8px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><span>{error.message}</span><span className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => { clearChatError(); void regenerate() }} className="font-semibold underline">{copy.retry}</button><button type="button" onClick={clearChatError} className="underline">{copy.close}</button></span></div> : null}
            </div>
            {showScrollButton ? <Button type="button" onClick={scrollToLatest} variant="outline" size="icon" aria-label={copy.backToLatest} title={copy.backToLatest} className="absolute bottom-28 left-1/2 z-20 size-9 -translate-x-1/2 rounded-full border-primary/30 bg-card shadow-[0_6px_18px_rgba(17,17,17,0.14)]"><ArrowDown className="size-4" /></Button> : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/90 to-transparent" />
          <div className="relative z-10 mx-auto -mt-28 w-full max-w-[900px] px-4 pb-4 sm:px-6 lg:px-8"><div className="rounded-[13px] border border-border bg-card p-2 shadow-[0_12px_35px_rgba(17,17,17,0.12)] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"><textarea disabled={executionLocked} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && event.ctrlKey && !event.shiftKey) { event.preventDefault(); submit() } }} rows={2} placeholder={copy.inputPlaceholder} className="max-h-36 min-h-[58px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60" /><div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pb-1"><div className="flex items-center gap-1"><input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => setSelectedFiles(event.target.files || undefined)} /><IconButton disabled={executionLocked} label={copy.addAttachment} onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4" /></IconButton>{modelPicker}<Popover open={knowledgeMenuOpen} onOpenChange={setKnowledgeMenuOpen}><PopoverTrigger asChild><Button disabled={executionLocked} type="button" variant={knowledgeEnabled ? "default" : "secondary"} size="sm" className="h-8 max-w-[220px] rounded-[7px] px-2.5 text-xs"><Database className="size-3.5" /><span>{copy.knowledgeBase}</span><span className="truncate text-muted-foreground">{knowledgeSummary}</span></Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-0"><Command><div className="border-b border-border px-3 py-3"><button type="button" onClick={disableKnowledge} className="flex w-full items-center justify-between rounded-[6px] border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/50"><span>{copy.noKnowledgeBase}</span>{!knowledgeEnabled ? <Check className="size-4 text-primary" /> : null}</button><button type="button" onClick={() => { setKnowledgeEnabled(true); setSelectedKnowledgeDatasetIds([]) }} className="mt-2 flex w-full items-center justify-between rounded-[6px] px-1 py-1 text-left text-xs text-muted-foreground transition hover:text-foreground"><span>{copy.useAllKnowledgeBases}</span>{knowledgeEnabled && selectedKnowledgeDatasetIds.length === 0 ? <Check className="size-4 text-primary" /> : null}</button></div><CommandInput placeholder={copy.searchKnowledgeBases} /><CommandList><CommandEmpty>{knowledgeDatasetsLoading ? copy.loadingKnowledgeBases : copy.noKnowledgeBases}</CommandEmpty><CommandGroup>{knowledgeDatasets.map((dataset) => { const selected = knowledgeEnabled && selectedKnowledgeDatasetIds.includes(dataset.id); return <CommandItem key={dataset.id} onSelect={() => toggleKnowledgeDataset(dataset.id)} className="cursor-pointer"><div className="flex min-w-0 flex-1 items-center gap-2"><Database className="size-4 shrink-0" /><div className="min-w-0"><div className="truncate text-sm">{dataset.name}</div><div className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{dataset.category}</div></div></div>{selected ? <Check className="ml-2 size-4 text-primary" /> : null}</CommandItem> })}</CommandGroup></CommandList></Command></PopoverContent></Popover></div><Button type="button" onClick={isStreaming ? () => void stop() : submit} disabled={!isStreaming && (executionLocked || !input.trim())} className="h-9 min-w-[92px] rounded-[7px] px-3 text-xs font-bold">{isStreaming ? <><Square className="size-3.5 fill-current" />{copy.stop}</> : <><Send className="size-3.5" />{copy.send}</>}</Button></div></div><div className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground"><span>{copy.enterToSend}</span><span>·</span><span>{copy.shiftEnterToNewline}</span><span>·</span><span>AI SDK UIMessage</span></div></div>
        </section>
      </div>
    </main>
  )
}
