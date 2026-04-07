"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Bot, Check, Copy, Loader2, Send, Sparkles } from "lucide-react"

import {
  Message,
  MessageAction,
  MessageActions,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-entry/prompt-kit/message"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ai-entry/prompt-kit/prompt-input"
import { useI18n } from "@/components/locale-provider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TextMorph } from "@/components/ui/text-morph"
import { TypingIndicator } from "@/components/ui/typing-indicator"
import { WorkspaceTaskEvents } from "@/components/workspace/workspace-message-primitives"
import type { PendingTaskEvent } from "@/lib/assistant-task-events"
import {
  AI_ENTRY_CONSULTING_ENTRY_MODE,
  AI_ENTRY_SONNET_46_MODEL_HINT,
  pickSonnet46ModelId,
  shouldLockConsultingAdvisorModel,
} from "@/lib/ai-entry/model-policy"
import { cn } from "@/lib/utils"

type ChatMessage = { id: string; role: "user" | "assistant"; content: string }
type ModelOption = { id: string; name: string }
type ModelGroupOption = { family: string; label: string; models: ModelOption[] }
type AgentOption = { id: string; category: string; name: string; description: string }
type AgentGroupOption = { id: string; label: string; agents: AgentOption[] }

type MessageApiResponse = {
  data?: Array<{ id?: string; role?: "user" | "assistant"; content?: string }>
  conversation?: {
    current_model_id?: string | null
  } | null
}
type ChatApiResponse = {
  message?: string
  conversationId?: string
  agentId?: string | null
  error?: string
}
type ChatStreamApiResponse = {
  event?: string
  conversation_id?: string
  answer?: string
  provider?: string
  provider_model?: string
  agent_id?: string | null
  error?: string
  data?: {
    toolName?: string
    toolCallId?: string
  } | null
}
type ModelApiResponse = {
  providerId?: string | null
  selectedModelId?: string | null
  modelGroups?: Array<{ family?: string; label?: string; models?: Array<{ id?: string; name?: string }> }>
  models?: Array<{ id?: string; name?: string }>
}
type AgentApiResponse = {
  defaultAgentId?: string | null
  agents?: Array<{ id?: string; category?: string; name?: { zh?: string; en?: string }; description?: { zh?: string; en?: string } }>
  groups?: Array<{ id?: string; label?: { zh?: string; en?: string } }>
}

const AI_ENTRY_SELECTED_MODEL_STORAGE_KEY = "ai-entry-selected-model-id-v1"

function readInitialAgentFromLocation() {
  if (typeof window === "undefined") return null
  const raw = new URLSearchParams(window.location.search).get("agent")
  if (!raw) return null
  const normalized = raw.trim()
  return normalized.length > 0 ? normalized : null
}

function readPersistedSelectedModelId() {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(AI_ENTRY_SELECTED_MODEL_STORAGE_KEY)
    const normalized = typeof raw === "string" ? raw.trim() : ""
    return normalized || null
  } catch {
    return null
  }
}

function consumeSseBuffer<T extends object>(buffer: string) {
  const blocks = buffer.split(/\r?\n\r?\n/)
  const rest = blocks.pop() ?? ""
  const events: T[] = []

  for (const block of blocks) {
    const payload = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim()

    if (!payload || payload === "[DONE]") continue

    try {
      events.push(JSON.parse(payload) as T)
    } catch {
      continue
    }
  }

  return { events, rest }
}

export function AiEntryWorkspace({ initialConversationId }: { initialConversationId: string | null }) {
  const { locale } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isZh = locale === "zh"

  const copy = useMemo(
    () =>
      isZh
        ? {
            title: "AI 对话",
            subtitle: "企业 AI 营销对话入口",
            placeholder: "输入你的问题...",
            send: "发送",
            loading: "正在生成...",
            restoring: "正在恢复会话...",
            quickStart: "快速提问",
            modelLabel: "模型",
            modelLoading: "加载模型中...",
            modelEmpty: "无可用模型",
            agentLabel: "顾问",
            agentLoading: "加载顾问中...",
            agentEmpty: "无可用顾问",
            agentRecommended: "推荐 Agent",
            selectedAgent: "已选择顾问",
            landingHint: "你说需求，我来生成第一版方案",
            copy: "复制",
            copied: "已复制",
            copyReply: "复制回复",
            copiedReply: "已复制",
            unknownError: "未知错误",
            errorPrefix: "请求失败：",
          }
        : {
            title: "AI Chat",
            subtitle: "Enterprise AI marketing chat entry",
            placeholder: "Ask anything...",
            send: "Send",
            loading: "Generating...",
            restoring: "Restoring conversation...",
            quickStart: "Quick tips",
            modelLabel: "Model",
            modelLoading: "Loading models...",
            modelEmpty: "No models",
            agentLabel: "Advisor",
            agentLoading: "Loading advisors...",
            agentEmpty: "No advisors",
            agentRecommended: "Recommended Agent",
            selectedAgent: "Selected advisor",
            landingHint: "Describe it once, and I'll generate the first draft",
            copy: "Copy",
            copied: "Copied",
            copyReply: "Copy reply",
            copiedReply: "Copied",
            unknownError: "Unknown error",
            errorPrefix: "Request failed: ",
          },
    [isZh],
  )

  const quickPrompts = useMemo(
    () =>
      isZh
        ? [
            "先调研市场，再给我 30 天执行计划",
            "给我一套高转化落地页文案框架",
            "请用专家顾问模式给出经营诊断与优先动作",
          ]
        : [
            "Research this market first, then give me a 30-day plan",
            "Create a conversion-focused landing page copy framework",
            "Use executive advisor mode and provide diagnosis plus top priorities",
          ],
    [isZh],
  )

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isConversationLoading, setIsConversationLoading] = useState(Boolean(initialConversationId))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [pendingTaskEvents, setPendingTaskEvents] = useState<PendingTaskEvent[]>([])

  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelProviderId, setModelProviderId] = useState<string | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelGroups, setModelGroups] = useState<ModelGroupOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() =>
    readPersistedSelectedModelId(),
  )
  const [modelSelectOpen, setModelSelectOpen] = useState(false)

  const [agentLoading, setAgentLoading] = useState(true)
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [agentGroups, setAgentGroups] = useState<AgentGroupOption[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [agentQueryReady, setAgentQueryReady] = useState(false)
  const [initialAgentFromQuery] = useState<string | null>(() => readInitialAgentFromLocation())

  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const search = searchParams.toString()
  const routeEntryMode = (searchParams.get("entry") || "").trim()
  const shouldLockModel = useMemo(
    () =>
      shouldLockConsultingAdvisorModel({
        entryMode: routeEntryMode,
      }),
    [routeEntryMode],
  )
  const lockedSonnetModelId = useMemo(
    () => pickSonnet46ModelId(models) || AI_ENTRY_SONNET_46_MODEL_HINT,
    [models],
  )
  const showLanding =
    !isConversationLoading &&
    messages.length === 0 &&
    !(shouldLockModel && Boolean(conversationId))
  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedModelId) || null,
    [models, selectedModelId],
  )

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  useEffect(() => {
    if (shouldLockModel) return
    if (typeof window === "undefined") return
    try {
      const normalized = typeof selectedModelId === "string" ? selectedModelId.trim() : ""
      if (normalized) {
        window.localStorage.setItem(AI_ENTRY_SELECTED_MODEL_STORAGE_KEY, normalized)
      } else {
        window.localStorage.removeItem(AI_ENTRY_SELECTED_MODEL_STORAGE_KEY)
      }
    } catch {
      // ignore localStorage write failures
    }
  }, [selectedModelId, shouldLockModel])

  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === selectedAgentId) || null,
    [agents, selectedAgentId],
  )
  const loadingEventSummary = useMemo(() => {
    const totalCount = pendingTaskEvents.length
    const completedCount = pendingTaskEvents.filter((item) => item.status === "completed").length
    const currentLabel = pendingTaskEvents.at(-1)?.label || copy.loading
    const progressPercent =
      totalCount > 0
        ? Math.round((completedCount / totalCount) * 100)
        : 0

    return {
      totalCount,
      completedCount,
      currentLabel,
      progressPercent: Math.min(100, Math.max(0, progressPercent)),
    }
  }, [copy.loading, pendingTaskEvents])

  const recommendedAgents = useMemo(() => {
    if (agentGroups.length > 0) {
      const seen = new Set<string>()
      const merged: AgentOption[] = []
      for (const group of agentGroups) {
        for (const agent of group.agents) {
          if (seen.has(agent.id)) continue
          seen.add(agent.id)
          merged.push(agent)
        }
      }
      return merged
    }

    return agents
  }, [agentGroups, agents])

  useEffect(() => {
    const targetPath = conversationId ? `/dashboard/ai/${conversationId}` : "/dashboard/ai"
    if (pathname !== targetPath) {
      router.replace(search ? `${targetPath}?${search}` : targetPath)
    }
  }, [conversationId, pathname, router, search])

  useEffect(() => {
    if (!agentQueryReady) return
    const fromRoute = (searchParams.get("agent") || "").trim() || null
    setSelectedAgentId((current) => (current === fromRoute ? current : fromRoute))
  }, [agentQueryReady, searchParams])

  useEffect(() => {
    if (!agentQueryReady) return
    const params = new URLSearchParams(search)
    if (shouldLockModel) {
      params.delete("agent")
    } else if (selectedAgentId) {
      params.set("agent", selectedAgentId)
    } else {
      params.delete("agent")
    }
    const nextSearch = params.toString()
    if (nextSearch !== search) router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname)
  }, [agentQueryReady, pathname, router, search, selectedAgentId, shouldLockModel])

  useEffect(() => {
    let cancelled = false
    const loadModels = async () => {
      setModelsLoading(true)
      try {
        const response = await fetch("/api/ai/models", { cache: "no-store", credentials: "same-origin" })
        const payload = (await response.json().catch(() => null)) as ModelApiResponse | null
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)

        const normalizeModel = (item: { id?: string; name?: string } | null | undefined) => {
          const id = typeof item?.id === "string" ? item.id.trim() : ""
          if (!id) return null
          const name = typeof item?.name === "string" && item.name.trim() ? item.name.trim() : id
          return { id, name } as ModelOption
        }

        const normalizedGroups = (payload?.modelGroups || [])
          .map((group) => {
            const family = typeof group.family === "string" && group.family.trim() ? group.family.trim() : "other"
            const label = typeof group.label === "string" && group.label.trim() ? group.label.trim() : family
            const groupModels = (group.models || []).map(normalizeModel).filter((item): item is ModelOption => Boolean(item))
            if (groupModels.length === 0) return null
            return { family, label, models: groupModels } as ModelGroupOption
          })
          .filter((item): item is ModelGroupOption => Boolean(item))

        const normalizedModels = normalizedGroups.length > 0
          ? normalizedGroups.flatMap((group) => group.models)
          : (payload?.models || []).map(normalizeModel).filter((item): item is ModelOption => Boolean(item))

        setModelProviderId(typeof payload?.providerId === "string" ? payload.providerId : null)
        setModels(normalizedModels)
        setModelGroups(
          normalizedGroups.length > 0
            ? normalizedGroups
            : normalizedModels.length > 0
              ? [{ family: "all", label: "All models", models: normalizedModels }]
              : [],
        )
        const preferredFromCatalog =
          typeof payload?.selectedModelId === "string" ? payload.selectedModelId : null
        const sonnet46Fallback = pickSonnet46ModelId(normalizedModels)
        const lockedModelFallback = sonnet46Fallback || AI_ENTRY_SONNET_46_MODEL_HINT

        setSelectedModelId((current) => {
          if (shouldLockModel) {
            return lockedModelFallback
          }

          const normalizedCurrent =
            typeof current === "string" && current.trim() ? current.trim() : null
          if (
            normalizedCurrent &&
            normalizedModels.some((item) => item.id === normalizedCurrent)
          ) {
            return normalizedCurrent
          }

          if (
            preferredFromCatalog &&
            normalizedModels.some((item) => item.id === preferredFromCatalog)
          ) {
            return preferredFromCatalog
          }

          if (
            sonnet46Fallback &&
            normalizedModels.some((item) => item.id === sonnet46Fallback)
          ) {
            return sonnet46Fallback
          }

          return normalizedModels[0]?.id || null
        })
      } catch (error) {
        if (cancelled) return
        console.error("ai-entry.models.load.failed", error)
        setModelProviderId(null)
        setModels([])
        setModelGroups([])
        setSelectedModelId(null)
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }

    void loadModels()
    return () => {
      cancelled = true
    }
  }, [isZh, shouldLockModel])

  useEffect(() => {
    let cancelled = false
    const loadAgents = async () => {
      setAgentLoading(true)
      try {
        const response = await fetch("/api/ai/agents", { cache: "no-store", credentials: "same-origin" })
        const payload = (await response.json().catch(() => null)) as AgentApiResponse | null
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)

        const normalizedAgents = (payload?.agents || [])
          .map((item) => {
            const id = typeof item?.id === "string" ? item.id.trim() : ""
            if (!id) return null
            const category = typeof item?.category === "string" && item.category.trim() ? item.category.trim() : "general"
            const name = (isZh ? item?.name?.zh : item?.name?.en) || item?.name?.en || item?.name?.zh || id
            const description = (isZh ? item?.description?.zh : item?.description?.en) || item?.description?.en || item?.description?.zh || ""
            return { id, category, name: String(name), description: String(description) } as AgentOption
          })
          .filter((item): item is AgentOption => Boolean(item))

        const normalizedGroups = (payload?.groups || [])
          .map((group) => {
            const id = typeof group?.id === "string" ? group.id.trim() : ""
            if (!id) return null
            const label = (isZh ? group?.label?.zh : group?.label?.en) || group?.label?.en || group?.label?.zh || id
            return { id, label: String(label) }
          })
          .filter((item): item is { id: string; label: string } => Boolean(item))

        const groups: AgentGroupOption[] = normalizedGroups
          .map((group) => {
            const list = normalizedAgents.filter((agent) => agent.category === group.id)
            if (list.length === 0) return null
            return { id: group.id, label: group.label, agents: list } as AgentGroupOption
          })
          .filter((item): item is AgentGroupOption => Boolean(item))

        const leftovers = normalizedAgents.filter((agent) => !normalizedGroups.some((group) => group.id === agent.category))
        if (leftovers.length > 0) groups.push({ id: "other", label: "Other", agents: leftovers })

        const validIds = new Set(normalizedAgents.map((item) => item.id))
        const fromQuery = initialAgentFromQuery && validIds.has(initialAgentFromQuery) ? initialAgentFromQuery : null

        setAgents(normalizedAgents)
        setAgentGroups(groups)
        setSelectedAgentId(fromQuery)
      } catch (error) {
        if (cancelled) return
        console.error("ai-entry.agents.load.failed", error)
        setAgents([])
        setAgentGroups([])
        setSelectedAgentId(null)
      } finally {
        if (!cancelled) {
          setAgentLoading(false)
          setAgentQueryReady(true)
        }
      }
    }

    void loadAgents()
    return () => {
      cancelled = true
    }
  }, [initialAgentFromQuery, isZh, shouldLockModel])

  useEffect(() => {
    if (shouldLockModel) {
      if (selectedModelId !== lockedSonnetModelId) {
        setSelectedModelId(lockedSonnetModelId)
      }
      return
    }

    if (models.length === 0) {
      if (selectedModelId !== null) setSelectedModelId(null)
      return
    }

    if (!selectedModelId || !models.some((item) => item.id === selectedModelId)) {
      setSelectedModelId(models[0]?.id || null)
    }
  }, [lockedSonnetModelId, models, selectedModelId, shouldLockModel])

  useEffect(() => {
    setConversationId(initialConversationId)
    setErrorMessage(null)

    if (!initialConversationId) {
      setMessages([])
      setIsConversationLoading(false)
      return
    }

    let cancelled = false
    const loadMessages = async () => {
      setIsConversationLoading(true)
      try {
        const params = new URLSearchParams({ conversation_id: initialConversationId, limit: "200" })
        if (routeEntryMode) params.set("entryMode", routeEntryMode)
        const response = await fetch(`/api/ai/messages?${params.toString()}`, { cache: "no-store", credentials: "same-origin" })
        const payload = (await response.json().catch(() => null)) as MessageApiResponse | null
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)

        const restored = (payload?.data || [])
          .map((item) => {
            const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null
            const content = typeof item.content === "string" ? item.content : ""
            const id = typeof item.id === "string" ? item.id : `${role || "msg"}-${Math.random()}`
            if (!role || !content.trim()) return null
            return { id, role, content } as ChatMessage
          })
          .filter((item): item is ChatMessage => Boolean(item))

        setMessages(restored)

        const conversationModelId =
          typeof payload?.conversation?.current_model_id === "string" &&
          payload.conversation.current_model_id.trim()
            ? payload.conversation.current_model_id.trim()
            : null

        if (conversationModelId && !shouldLockModel) {
          setSelectedModelId(conversationModelId)
        }
      } catch (error) {
        if (cancelled) return
        setMessages([])
        setErrorMessage(`${copy.errorPrefix}${error instanceof Error ? error.message : copy.unknownError}`)
      } finally {
        if (!cancelled) setIsConversationLoading(false)
      }
    }

    void loadMessages()
    return () => {
      cancelled = true
    }
  }, [copy.errorPrefix, copy.unknownError, initialConversationId, routeEntryMode, shouldLockModel])

  const renderModelSelectContent = useCallback(() => {
    if (modelsLoading) return <SelectItem value="__loading" disabled>{copy.modelLoading}</SelectItem>
    if (models.length === 0) return <SelectItem value="__empty" disabled>{copy.modelEmpty}</SelectItem>
    return modelGroups.map((group, idx) => (
      <SelectGroup key={`${group.family}-${idx}`}>
        <SelectLabel>{group.label}</SelectLabel>
        {group.models.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
        {idx < modelGroups.length - 1 ? <SelectSeparator /> : null}
      </SelectGroup>
    ))
  }, [copy.modelEmpty, copy.modelLoading, modelGroups, models.length, modelsLoading])

  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 1200)
    } catch {
      setCopiedMessageId(null)
    }
  }, [])

  const handleSend = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || isLoading || isConversationLoading) return
    const requestedAgentId =
      typeof selectedAgentId === "string" && selectedAgentId.trim()
        ? selectedAgentId.trim()
        : null

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: prompt }
    const assistantMessageId = `assistant-${Date.now()}`
    const contextMessages = [
      ...messages.filter((message) => message.content.trim()).map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: prompt },
    ]

    setInput("")
    setErrorMessage(null)
    setPendingTaskEvents([
      {
        type: "request_start",
        label: "Request sent",
        status: "running",
        at: Date.now(),
      },
    ])
    setMessages((previous) => [...previous, userMessage, { id: assistantMessageId, role: "assistant", content: "" }])
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          stream: true,
          messages: contextMessages,
          conversationId,
          conversationScope: shouldLockModel ? "consulting" : "chat",
          modelConfig: modelProviderId && selectedModelId ? { providerId: modelProviderId, modelId: selectedModelId } : undefined,
          agentConfig:
            selectedAgentId || shouldLockModel
              ? {
                  ...(!shouldLockModel && selectedAgentId ? { agentId: selectedAgentId } : {}),
                  ...(shouldLockModel ? { entryMode: AI_ENTRY_CONSULTING_ENTRY_MODE } : {}),
                }
              : undefined,
        }),
      })

      const pushTaskEvent = (nextEvent: PendingTaskEvent) => {
        setPendingTaskEvents((current) => [...current, nextEvent].slice(-12))
      }

      const upsertTaskEvent = (nextEvent: PendingTaskEvent) => {
        setPendingTaskEvents((current) => {
          const targetIndex = current.findIndex((item) => item.type === nextEvent.type)
          if (targetIndex < 0) return [...current, nextEvent].slice(-12)
          const next = [...current]
          next[targetIndex] = nextEvent
          return next.slice(-12)
        })
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ChatApiResponse | null
        throw new Error(payload?.error || `http_${response.status}`)
      }

      const contentType = response.headers.get("content-type") || ""
      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ""
        let streamedText = ""
        let streamError: string | null = null

        const processEvent = (event: ChatStreamApiResponse) => {
          const now = Date.now()
          const streamConversationId =
            typeof event.conversation_id === "string" && event.conversation_id.trim()
              ? event.conversation_id.trim()
              : null
          if (streamConversationId) setConversationId(streamConversationId)

          if (event.event === "conversation_init") {
            if (!requestedAgentId && event.agent_id && typeof event.agent_id === "string") {
              setSelectedAgentId(event.agent_id)
            }
            upsertTaskEvent({
              type: "conversation_init",
              label: "Conversation ready",
              status: "completed",
              at: now,
            })
            return
          }

          if (event.event === "provider_selected" || event.event === "provider_fallback") {
            const detail = [event.provider, event.provider_model].filter(Boolean).join(" / ")
            upsertTaskEvent({
              type: "provider",
              label: "Model routing",
              detail: detail || undefined,
              status: event.event === "provider_fallback" ? "info" : "running",
              at: now,
            })
            return
          }

          if (event.event === "tool_call") {
            const toolName = event.data?.toolName || "tool"
            const toolId = event.data?.toolCallId || toolName
            upsertTaskEvent({
              type: `tool:${toolId}`,
              label: `Tool: ${toolName}`,
              status: "running",
              at: now,
            })
            return
          }

          if (event.event === "tool_result") {
            const toolName = event.data?.toolName || "tool"
            const toolId = event.data?.toolCallId || toolName
            upsertTaskEvent({
              type: `tool:${toolId}`,
              label: `Tool: ${toolName}`,
              status: "completed",
              at: now,
            })
            return
          }

          if (event.event === "message") {
            const delta = typeof event.answer === "string" ? event.answer : ""
            if (!delta) return
            streamedText += delta
            setMessages((previous) =>
              previous.map((item) =>
                item.id === assistantMessageId
                  ? { ...item, content: streamedText }
                  : item,
              ),
            )
            return
          }

          if (event.event === "message_end") {
            const finalText = typeof event.answer === "string" && event.answer.trim()
              ? event.answer.trim()
              : streamedText.trim()

            if (!requestedAgentId && event.agent_id && typeof event.agent_id === "string") {
              setSelectedAgentId(event.agent_id)
            }

            if (event.provider_model && models.some((item) => item.id === event.provider_model)) {
              setSelectedModelId(event.provider_model)
            }

            upsertTaskEvent({
              type: "response",
              label: "Response complete",
              detail: [event.provider, event.provider_model].filter(Boolean).join(" / ") || undefined,
              status: "completed",
              at: now,
            })

            upsertTaskEvent({
              type: "request_start",
              label: "Request sent",
              status: "completed",
              at: now,
            })

            setMessages((previous) =>
              previous.map((item) =>
                item.id === assistantMessageId
                  ? { ...item, content: finalText || copy.unknownError }
                  : item,
              ),
            )
            return
          }

          if (event.event === "error") {
            streamError =
              typeof event.error === "string" && event.error.trim()
                ? event.error
                : copy.unknownError
            upsertTaskEvent({
              type: "request_start",
              label: "Request sent",
              status: "completed",
              at: now,
            })
            pushTaskEvent({
              type: "stream_error",
              label: "Request failed",
              detail: streamError || undefined,
              status: "failed",
              at: now,
            })
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          sseBuffer += decoder.decode(value || new Uint8Array(), { stream: !done })
          const parsed = consumeSseBuffer<ChatStreamApiResponse>(sseBuffer)
          sseBuffer = parsed.rest
          parsed.events.forEach(processEvent)
          if (done) break
        }

        const flushed = consumeSseBuffer<ChatStreamApiResponse>(sseBuffer)
        flushed.events.forEach(processEvent)

        if (streamError) throw new Error(streamError)
        if (!streamedText.trim()) {
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId
                ? { ...item, content: copy.unknownError }
                : item,
            ),
          )
        }
      } else {
        const payload = (await response.json().catch(() => null)) as ChatApiResponse | null
        const assistantText = (payload?.message || "").trim()
        setMessages((previous) => previous.map((item) => item.id === assistantMessageId ? { ...item, content: assistantText || copy.unknownError } : item))
        if (typeof payload?.conversationId === "string" && payload.conversationId) setConversationId(payload.conversationId)
        if (!requestedAgentId && typeof payload?.agentId === "string" && payload.agentId.trim()) {
          setSelectedAgentId(payload.agentId.trim())
        }
        setPendingTaskEvents((current) => [
          ...current.filter((event) => event.type !== "request_start"),
          {
            type: "request_start",
            label: "Request sent",
            status: "completed",
            at: Date.now(),
          },
        ])
      }
    } catch (error) {
      const renderedError = `${copy.errorPrefix}${error instanceof Error ? error.message : copy.unknownError}`
      setErrorMessage(renderedError)
      setMessages((previous) => previous.map((item) => item.id === assistantMessageId ? { ...item, content: renderedError } : item))
      setPendingTaskEvents((current) => [
        ...current,
        {
          type: "request_failed",
          label: "Request failed",
          detail: renderedError,
          status: "failed",
          at: Date.now(),
        },
      ].slice(-12))
    } finally {
      setIsLoading(false)
    }
  }, [conversationId, copy.errorPrefix, copy.unknownError, input, isConversationLoading, isLoading, messages, modelProviderId, models, selectedAgentId, selectedModelId, shouldLockModel])

  const renderSelectors = (buttonHeight: "h-10" | "h-9") => (
    <div className="flex flex-wrap items-center gap-2 px-1">
      {shouldLockModel ? (
        <div
          className={`inline-flex max-w-[260px] items-center rounded-full border border-border bg-background px-3 text-xs text-foreground ${buttonHeight}`}
          title={selectedModel?.name || lockedSonnetModelId}
        >
          <span className="truncate">
            {copy.modelLabel}: {selectedModel?.name || lockedSonnetModelId}
          </span>
        </div>
      ) : (
      <Select
        open={modelSelectOpen}
        onOpenChange={setModelSelectOpen}
        value={selectedModelId ?? undefined}
        onValueChange={(nextValue) => {
          setSelectedModelId(nextValue || null)
          setModelSelectOpen(false)
        }}
        disabled={isLoading || modelsLoading || models.length === 0}
      >
        <SelectTrigger className={`w-[220px] max-w-[220px] rounded-full border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary ${buttonHeight}`}>
          <SelectValue placeholder={`${copy.modelLabel}: ${modelsLoading ? copy.modelLoading : copy.modelEmpty}`} />
        </SelectTrigger>
        <SelectContent>{renderModelSelectContent()}</SelectContent>
      </Select>
      )}
    </div>
  )

  const renderRecommendedAgents = (size: "landing" | "inline") => {
    const containerClassName = size === "landing" ? "mx-auto mt-8 max-w-5xl" : "mt-3"
    const tabClassName =
      size === "landing"
        ? "h-9 rounded-full px-4 text-sm"
        : "h-8 rounded-full px-3 text-xs"

    return (
      <div className={containerClassName}>
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {copy.agentRecommended}
        </div>
        {agentLoading ? (
          <div className="text-xs text-muted-foreground">{copy.agentLoading}</div>
        ) : recommendedAgents.length === 0 ? (
          <div className="text-xs text-muted-foreground">{copy.agentEmpty}</div>
        ) : (
          <div className="rounded-2xl border border-border bg-card px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {recommendedAgents.map((agent) => {
                const isSelected = selectedAgentId === agent.id
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId((current) => (current === agent.id ? null : agent.id))}
                    className={cn(
                      "inline-flex items-center border transition",
                      tabClassName,
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-primary/5",
                    )}
                    title={agent.description}
                  >
                    {agent.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (showLanding) {
    return (
      <div className="flex h-full min-h-0 justify-center overflow-y-auto bg-background">
        <section className="w-full max-w-6xl px-4 py-10 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-foreground lg:text-6xl">{copy.title}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{copy.landingHint}</p>
          </div>

          <div className="mx-auto mt-10 max-w-5xl rounded-[30px] border border-border bg-card p-4 shadow-sm">
            <PromptInput value={input} onValueChange={setInput} onSubmit={handleSend} isLoading={isLoading} maxHeight={220} className="border-0 bg-transparent p-0 shadow-none">
              {selectedAgent ? (
                <div className="px-1 pb-2 text-xs text-muted-foreground">
                  {copy.selectedAgent}: <span className="font-medium text-foreground">{selectedAgent.name}</span>
                </div>
              ) : null}
              <PromptInputTextarea placeholder={copy.placeholder} className="min-h-[120px] text-base" />
              <PromptInputActions>
                {renderSelectors("h-10")}
                <PromptInputAction tooltip={copy.send}>
                  <Button type="button" size="sm" className="h-10 rounded-full px-4" onClick={() => void handleSend()} disabled={(!input.trim() && !isLoading) || isConversationLoading || modelsLoading}>
                    {isLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="mr-1.5 h-3.5 w-3.5" />}
                    {copy.send}
                  </Button>
                </PromptInputAction>
              </PromptInputActions>
            </PromptInput>
          </div>

          {!shouldLockModel ? renderRecommendedAgents("landing") : null}

          <div className="mx-auto mt-10 grid max-w-5xl gap-3 lg:grid-cols-3">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/60 hover:bg-primary/5" onClick={() => setInput(prompt)}>
                <div className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {copy.quickStart}
                </div>
                <div className="text-sm leading-6 text-foreground">{prompt}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 justify-center">
      <section className="flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-b-[28px] border-x border-b border-border/70 bg-background">
        <header className="border-b border-border/70 bg-card/60 px-4 py-3 backdrop-blur">
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground"><Bot className="h-4 w-4" />{copy.title}</h1>
          <p className="text-xs text-muted-foreground">{copy.subtitle}</p>
        </header>

        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 lg:px-4">
              {isConversationLoading ? <div className="rounded-[24px] border border-border bg-card/60 p-4 text-sm text-muted-foreground"><div className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{copy.restoring}</div></div> : null}

              {messages.map((message, index) => {
                const isAssistant = message.role === "assistant"
                const copied = copiedMessageId === message.id
                return (
                  <Message key={message.id} className={cn(isAssistant ? "justify-start" : "justify-end")}>
                    {isAssistant ? <MessageAvatar alt="AI" fallback="AI" /> : null}
                    <div className={cn("flex max-w-[min(80ch,88%)] flex-col gap-1.5", isAssistant ? "items-start" : "items-end")}>
                      <MessageContent markdown={isAssistant} role={isAssistant ? "assistant" : "user"}>{message.content || (isAssistant && isLoading ? copy.loading : "")}</MessageContent>
                      {isAssistant && isLoading && index === messages.length - 1 ? (
                        <div className="w-full rounded-xl border border-border/70 bg-card/70 p-3">
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <TypingIndicator />
                            <span className="truncate">{loadingEventSummary.currentLabel}</span>
                          </div>
                          {loadingEventSummary.totalCount > 0 ? (
                            <div className="mb-2 rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
                              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="truncate">Processing</span>
                                <span>{`${loadingEventSummary.completedCount}/${loadingEventSummary.totalCount}`}</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-300"
                                  style={{ width: `${loadingEventSummary.progressPercent}%` }}
                                />
                              </div>
                            </div>
                          ) : null}
                          <WorkspaceTaskEvents events={pendingTaskEvents} limit={4} className="pl-0" />
                        </div>
                      ) : null}
                      {isAssistant && message.content.trim() ? (
                        <MessageActions>
                          <MessageAction tooltip={copied ? copy.copiedReply : copy.copyReply}>
                            <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-accent/10 hover:text-foreground" onClick={() => void handleCopyMessage(message.id, message.content)}>
                              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              <TextMorph text={copied ? copy.copied : copy.copy} />
                            </button>
                          </MessageAction>
                        </MessageActions>
                      ) : null}
                    </div>
                    {!isAssistant ? <MessageAvatar alt="User" fallback="U" /> : null}
                  </Message>
                )
              })}

              {errorMessage ? <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">{errorMessage}</div> : null}
              <div ref={scrollAnchorRef} className="h-px w-full shrink-0 scroll-mt-4" aria-hidden="true" />
            </div>
          </ScrollArea>
        </div>

        <div className="border-t border-border/70 bg-card/70 px-3 py-3 lg:px-4">
          <div className="mx-auto w-full max-w-5xl">
            {!isConversationLoading && messages.length === 0 ? (
              <div className="mb-2">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{copy.quickStart}</div>
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button key={prompt} type="button" className="max-w-[260px] truncate rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary" title={prompt} onClick={() => setInput(prompt)} disabled={isLoading}>{prompt}</button>
                  ))}
                </div>
              </div>
            ) : null}

            <PromptInput value={input} onValueChange={setInput} onSubmit={handleSend} isLoading={isLoading} maxHeight={220} className="border-2">
              {selectedAgent ? (
                <div className="px-1 pb-2 text-xs text-muted-foreground">
                  {copy.selectedAgent}: <span className="font-medium text-foreground">{selectedAgent.name}</span>
                </div>
              ) : null}
              <PromptInputTextarea placeholder={copy.placeholder} />
              <PromptInputActions>
                {renderSelectors("h-9")}
                <PromptInputAction tooltip={copy.send}>
                  <Button type="button" size="sm" className="h-9 rounded-full px-4" onClick={() => void handleSend()} disabled={(!input.trim() && !isLoading) || isConversationLoading || modelsLoading}>
                    {isLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                    {copy.send}
                  </Button>
                </PromptInputAction>
              </PromptInputActions>
            </PromptInput>

            {!shouldLockModel && !isConversationLoading && messages.length === 0
              ? renderRecommendedAgents("inline")
              : null}
          </div>
        </div>
      </section>
    </div>
  )
}

