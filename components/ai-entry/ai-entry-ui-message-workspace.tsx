"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DefaultChatTransport } from "ai"
import { useChat } from "@ai-sdk/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowDown,
  Check,
  Clipboard,
  Database,
  Download,
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
import type { MessagePart } from "@/lib/ai-entry/message-parts/types"
import {
  createAiEntryTextMessage,
  getAiEntryUIMessageText,
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

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-[8px] bg-primary text-primary-foreground", small ? "size-8" : "size-10")}>
      <Sparkles className={small ? "size-4" : "size-5"} strokeWidth={2.6} />
    </div>
  )
}

function IconButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick} className="size-8 rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground">
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

function mapPersistedMessages(payload: unknown): AiEntryUIMessage[] {
  const data = asRecord(payload)?.data
  if (!Array.isArray(data)) return []

  return data.flatMap((item): AiEntryUIMessage[] => {
    const record = asRecord(item) as PersistedMessage | null
    const role = record?.role === "assistant" || record?.role === "user" ? record.role : null
    const content = asString(record?.content)
    if (!role || !content) return []
    const persistedParts = Array.isArray(record?.parts) ? record.parts : null
    return [
      persistedParts
        ? {
            id: asString(record?.id) || crypto.randomUUID(),
            role,
            metadata: asRecord(record?.metadata) || undefined,
            parts: persistedParts as AiEntryUIMessage["parts"],
          }
        : createAiEntryTextMessage({
            id: asString(record?.id) || crypto.randomUUID(),
            role,
            text: content,
            createdAt: typeof record?.created_at === "number" ? record.created_at : undefined,
          }),
    ]
  })
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

function ProcessTrace({ parts, isZh, agentId }: { parts: MessagePart[]; isZh: boolean; agentId: string | null }) {
  if (!parts.length) return null
  return (
    <div className="mt-5 border-t border-dashed border-border/70 pt-3">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70"><span>过程记录</span><span className="font-normal normal-case tracking-normal">分析、工具和来源</span></div>
      <div className="opacity-75 transition-opacity hover:opacity-100"><MessagePartViewList parts={parts} isZh={isZh} agentId={agentId} className="mt-2 space-y-2" /></div>
    </div>
  )
}

export function AiEntryUIMessageWorkspace({ initialConversationId }: Props) {
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingConversationRouteRef = useRef<string | null>(null)
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
        uiMessageRequestId: crypto.randomUUID(),
        conversationScope: routeEntryMode === "consulting-advisor" ? "consulting" : "chat",
        modelConfig: selectedModel
          ? {
              providerId: selectedModel.providerId,
              modelId: selectedModel.modelId || selectedModel.runtimeId || selectedModel.canonicalId || selectedModel.id,
            }
          : undefined,
        enterpriseKnowledge: { enabled: knowledgeEnabled, datasetIds: selectedKnowledgeDatasetIds },
        skillConfig: { enabled: true },
        agentConfig: {
          agentId: routeAgentId,
          entryMode: routeEntryMode || undefined,
        },
      }),
    }),
    [conversationId, knowledgeEnabled, routeAgentId, routeEntryMode, selectedKnowledgeDatasetIds, selectedModel],
  )

  const { messages, status, error, sendMessage, stop, regenerate, setMessages, clearError } = useChat<AiEntryUIMessage>({
    id: conversationId || "new-ai-entry",
    transport,
    onData: (data) => {
      const runtimeData = data.type === "data-runtime-status" ? asRecord(data.data) : null
      if (!runtimeData || typeof runtimeData.conversationId !== "string") return
      const nextConversationId = runtimeData.conversationId
      if (!conversationId && pathname === "/dashboard/ai") pendingConversationRouteRef.current = nextConversationId
      setConversationId((current) => current || nextConversationId)
    },
    onFinish: () => {
      const nextConversationId = pendingConversationRouteRef.current
      pendingConversationRouteRef.current = null
      if (nextConversationId && pathname === "/dashboard/ai") router.replace(`/dashboard/ai/${nextConversationId}`)
    },
  })

  const isStreaming = status === "submitted" || status === "streaming"
  const isZh = true

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
            ? [{ family: "all", label: "可用模型", models: fallbackModels }]
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
  }, [])

  const selectModel = (modelId: string) => {
    setSelectedModelId(modelId)
    window.localStorage.setItem("ai-entry-ui-message-model", modelId)
    setModelCatalogOpen(false)
  }

  useEffect(() => {
    if (!initialConversationId) {
      setIsLoadingConversation(false)
      return
    }
    let cancelled = false
    void fetch(`/api/ai/messages?conversation_id=${encodeURIComponent(initialConversationId)}&limit=200${routeAgentId ? `&agent=${encodeURIComponent(routeAgentId)}` : ""}`, { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (cancelled) return
        if (!response.ok) throw new Error(asString(asRecord(payload)?.error) || `http_${response.status}`)
        setMessages(mapPersistedMessages(payload))
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingConversation(false)
      })
    return () => { cancelled = true }
  }, [initialConversationId, routeAgentId, setMessages])

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
    const element = scrollRef.current
    if (!element) return
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    if (distanceToBottom < 180) element.scrollTo({ top: element.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" })
  }, [messages, status])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    setShowScrollButton(element.scrollHeight - element.scrollTop - element.clientHeight > 180)
  }

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    void sendMessage({ text, ...(selectedFiles ? { files: selectedFiles } : {}) })
    setInput("")
    setSelectedFiles(undefined)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const resetConversation = () => {
    clearError()
    setConversationId(null)
    setMessages([])
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
    ? "未选择"
    : selectedKnowledgeDatasetIds.length === 0
      ? "全部知识库"
      : `${selectedKnowledgeDatasetIds.length} 个已选`

  const copyMessage = async (message: AiEntryUIMessage) => {
    try {
      await navigator.clipboard.writeText(getAiEntryUIMessageText(message))
    } catch {
      // Clipboard permissions can be unavailable in embedded previews.
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-sm lg:px-7"><div className="min-w-0"><h1 className="truncate text-sm font-bold">AI 对话</h1><p className="mt-0.5 truncate text-[10px] text-muted-foreground">正式 UIMessage 时间线</p></div><div className="flex min-w-0 items-center gap-1"><Popover open={modelCatalogOpen} onOpenChange={setModelCatalogOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" disabled={isStreaming || modelCatalogLoading || modelOptions.length === 0} className="h-8 min-w-0 max-w-[190px] rounded-[8px] px-2.5 text-xs font-medium sm:max-w-[260px]" title={selectedModel?.name || "选择模型"}><Sparkles className="mr-1.5 size-3.5 shrink-0 text-primary" /><span className="truncate">{modelCatalogLoading ? "加载模型..." : selectedModel?.name || (modelCatalogError ? "模型暂不可用" : "选择模型")}</span></Button></PopoverTrigger><PopoverContent align="end" className="w-[320px] p-0"><Command><div className="border-b border-border px-3 py-3"><div className="text-xs font-semibold">选择模型</div><div className="mt-1 text-[11px] text-muted-foreground">切换后将在下一条消息中生效</div></div><CommandInput placeholder="搜索模型..." /><CommandList><CommandEmpty>{modelCatalogLoading ? "加载模型中..." : modelCatalogError ? "模型列表加载失败" : "暂无可用模型"}</CommandEmpty>{modelGroups.map((group) => <CommandGroup key={group.family} heading={group.label}>{group.models.map((model) => <CommandItem key={model.id} value={`${model.name} ${model.providerLabel || ""} ${model.modelId || ""}`} onSelect={() => selectModel(model.id)} className="cursor-pointer"><div className="min-w-0 flex-1"><div className="truncate text-sm">{model.name}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{model.providerLabel || model.providerId || "默认提供商"} · {model.modelId || model.runtimeId || model.id}</div></div>{model.id === selectedModelId ? <Check className="ml-2 size-4 shrink-0 text-primary" /> : null}</CommandItem>)}</CommandGroup>)}</CommandList></Command></PopoverContent></Popover><span className="hidden items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground sm:flex"><span className={cn("size-1.5 rounded-full", isStreaming ? "animate-pulse bg-primary" : "bg-emerald-500")} />{isStreaming ? "正在生成" : error ? "需要重试" : "已就绪"}</span><IconButton label="新建对话" onClick={resetConversation}><MessageSquarePlus className="size-3.5" /></IconButton><IconButton label="导出"><Download className="size-3.5" /></IconButton><IconButton label="更多"><MoreHorizontal className="size-4" /></IconButton></div></header>

          <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[900px] flex-col gap-7 px-4 py-7 pb-40 sm:px-6 lg:px-8">
              {isLoadingConversation ? <div className="flex items-center justify-center py-20 text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />正在恢复会话...</div> : null}
              {!isLoadingConversation && !messages.length ? <div className="mx-auto flex max-w-[560px] flex-col items-center py-20 text-center"><BrandMark /><h2 className="mt-5 text-xl font-bold">今天想完成什么？</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">AI Marketing 会把分析过程保持为辅助信息，把最终文字和产物放在消息中心。</p></div> : null}
              {messages.map((message, index) => {
                const messageText = getAiEntryUIMessageText(message)
                const { processParts, artifactParts } = message.role === "assistant" ? splitMessageParts(message) : { processParts: [], artifactParts: [] }
                const isLastAssistant = message.role === "assistant" && index === messages.length - 1
                const isMessageStreaming = message.parts.some((part) => (part as { type?: string; state?: string }).type === "text" && (part as { state?: string }).state === "streaming") || (isLastAssistant && isStreaming)
                return <article key={message.id} className={cn("group", message.role === "user" ? "flex justify-end" : "flex gap-3")}>
                  {message.role === "assistant" ? <div className="mt-1 hidden sm:block"><BrandMark small /></div> : null}
                  <div className={cn("min-w-0", message.role === "user" ? "max-w-[82%]" : "w-full")}>
                    {message.role === "user" ? <div className="rounded-[10px] bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-[0_4px_12px_rgba(17,17,17,0.06)]"><p>{messageText}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-primary-foreground/65">刚刚<Check className="size-3" /></div></div> : <div className="rounded-[12px] border border-border bg-card px-4 py-4 shadow-[0_6px_20px_rgba(17,17,17,0.025)] sm:px-5 sm:py-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="text-xs font-bold">AI Marketing</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{routeAgentId || "AI 助手"}</span></div><span className="text-[10px] text-muted-foreground">刚刚</span></div><ProcessTrace parts={processParts} isZh={isZh} agentId={routeAgentId} />{messageText ? <div className="mt-4 whitespace-pre-line text-base leading-8 text-foreground"><Markdown>{messageText}</Markdown>{isMessageStreaming ? <span className="ml-1 inline-block h-5 w-1 animate-pulse bg-primary align-[-2px]" /> : null}</div> : <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在组织回答...</div>}{artifactParts.length ? <div className="mt-5 border-t border-primary/30 pt-4"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70"><FileText className="size-3.5" />最终产物</div><MessagePartViewList parts={artifactParts} isZh={isZh} agentId={routeAgentId} className="space-y-3" /></div> : null}{!isMessageStreaming ? <div className="mt-4 flex items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100"><IconButton label="复制" onClick={() => void copyMessage(message)}><Clipboard className="size-3.5" /></IconButton><IconButton label="重新生成" onClick={() => void regenerate({ messageId: message.id })}><RefreshCw className="size-3.5" /></IconButton></div> : null}</div>}
                  </div>
                </article>
              })}
              {error ? <div className="flex items-center justify-between gap-3 rounded-[8px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><span>{error.message}</span><span className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => { clearError(); void regenerate() }} className="font-semibold underline">重新生成</button><button type="button" onClick={clearError} className="underline">关闭</button></span></div> : null}
            </div>
            {showScrollButton ? <Button type="button" onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })} variant="outline" size="sm" className="sticky bottom-4 left-1/2 z-10 ml-[calc(50%-66px)] h-8 rounded-full bg-card px-3 text-xs shadow-md"><ArrowDown className="size-3.5" />回到最新</Button> : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/90 to-transparent" />
          <div className="relative z-10 mx-auto -mt-28 w-full max-w-[900px] px-4 pb-4 sm:px-6 lg:px-8"><div className="rounded-[13px] border border-border bg-card p-2 shadow-[0_12px_35px_rgba(17,17,17,0.12)] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit() } }} rows={2} placeholder="给 AI Marketing 发消息..." className="max-h-36 min-h-[58px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground" /><div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pb-1"><div className="flex items-center gap-1"><input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => setSelectedFiles(event.target.files || undefined)} /><IconButton label="添加附件" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4" /></IconButton><Popover open={knowledgeMenuOpen} onOpenChange={setKnowledgeMenuOpen}><PopoverTrigger asChild><Button type="button" variant={knowledgeEnabled ? "default" : "secondary"} size="sm" className="h-8 max-w-[220px] rounded-[7px] px-2.5 text-xs"><Database className="size-3.5" /><span>知识库</span><span className="truncate text-muted-foreground">{knowledgeSummary}</span></Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-0"><Command><div className="border-b border-border px-3 py-3"><button type="button" onClick={disableKnowledge} className="flex w-full items-center justify-between rounded-[6px] border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/50"><span>不使用知识库</span>{!knowledgeEnabled ? <Check className="size-4 text-primary" /> : null}</button><button type="button" onClick={() => { setKnowledgeEnabled(true); setSelectedKnowledgeDatasetIds([]) }} className="mt-2 flex w-full items-center justify-between rounded-[6px] px-1 py-1 text-left text-xs text-muted-foreground transition hover:text-foreground"><span>使用全部知识库</span>{knowledgeEnabled && selectedKnowledgeDatasetIds.length === 0 ? <Check className="size-4 text-primary" /> : null}</button></div><CommandInput placeholder="搜索知识库..." /><CommandList><CommandEmpty>{knowledgeDatasetsLoading ? "加载知识库中..." : "暂无可用知识库"}</CommandEmpty><CommandGroup>{knowledgeDatasets.map((dataset) => { const selected = knowledgeEnabled && selectedKnowledgeDatasetIds.includes(dataset.id); return <CommandItem key={dataset.id} onSelect={() => toggleKnowledgeDataset(dataset.id)} className="cursor-pointer"><div className="flex min-w-0 flex-1 items-center gap-2"><Database className="size-4 shrink-0" /><div className="min-w-0"><div className="truncate text-sm">{dataset.name}</div><div className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{dataset.category}</div></div></div>{selected ? <Check className="ml-2 size-4 text-primary" /> : null}</CommandItem> })}</CommandGroup></CommandList></Command></PopoverContent></Popover></div><Button type="button" onClick={isStreaming ? () => void stop() : submit} disabled={!isStreaming && !input.trim()} className="h-9 min-w-[92px] rounded-[7px] px-3 text-xs font-bold">{isStreaming ? <><Square className="size-3.5 fill-current" />停止</> : <><Send className="size-3.5" />发送</>}</Button></div></div><div className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground"><span>Enter 发送</span><span>·</span><span>Shift + Enter 换行</span><span>·</span><span>AI SDK UIMessage</span></div></div>
        </section>
      </div>
    </main>
  )
}
