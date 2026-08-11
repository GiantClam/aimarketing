"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Download,
  FileText,
  Globe2,
  History,
  Lightbulb,
  Loader2,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Play,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type MessageRole = "user" | "assistant"
type DemoMessage = {
  id: string
  role: MessageRole
  text: string
  time: string
  isStreaming?: boolean
  branch?: number
}

type DemoPhase = "idle" | "reading" | "thinking" | "tool" | "writing" | "done"

const starterMessages: DemoMessage[] = [
  {
    id: "user-1",
    role: "user",
    text: "帮我为 B2B SaaS 产品制定一份内容增长策略，重点关注官网流量和线索转化。",
    time: "10:23",
  },
  {
    id: "assistant-1",
    role: "assistant",
    text: "我会先拆解目标受众和转化路径，再结合行业内容趋势给出一份可执行的内容增长策略。\n\n这份方案会覆盖内容支柱、分发节奏、落地页结构和 KPI 评估方式。",
    time: "10:24",
  },
]

const suggestedPrompts = [
  "继续拆解内容支柱",
  "给我一个 30 天执行计划",
  "把方案改成汇报大纲",
]

const timelineItems = [
  { label: "理解目标与受众", state: "done" },
  { label: "研究行业与竞品内容", state: "done" },
  { label: "识别内容机会与主题方向", state: "active" },
  { label: "制定内容结构与分发计划", state: "queued" },
]

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[8px] bg-primary text-primary-foreground shadow-[3px_3px_0_rgba(17,17,17,0.12)]",
        small ? "size-8" : "size-10",
      )}
      aria-label="AI Marketing"
    >
      <Sparkles className={small ? "size-4" : "size-5"} strokeWidth={2.6} />
    </div>
  )
}

function IconButton({
  label,
  children,
  onClick,
  className,
}: {
  label: string
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("size-8 rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground", className)}
    >
      {children}
    </Button>
  )
}

function StatusDot({ state }: { state: "done" | "active" | "queued" }) {
  if (state === "done") return <Check className="size-3 text-primary-foreground" strokeWidth={3} />
  if (state === "active") return <span className="size-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(255,208,0,0.18)]" />
  return <span className="size-2 rounded-full bg-muted-foreground/35" />
}

function ReasoningCard({
  open,
  onToggle,
  activeIndex = 2,
  isWorking = false,
}: {
  open: boolean
  onToggle: () => void
  activeIndex?: number
  isWorking?: boolean
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-[8px] border border-dashed border-border/80 bg-muted/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        aria-expanded={open}
      >
          <span className="flex items-center gap-2">
          <Lightbulb className="size-3.5 text-muted-foreground" />
          <span>分析过程</span>
          <span className="text-muted-foreground/70">· 约 6 秒</span>
        </span>
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="border-t border-border/70 px-3 py-2.5">
          <div className="flex flex-col gap-3">
            {timelineItems.map((item, index) => {
              const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "queued"
              return (
              <div key={item.label} className="animate-in fade-in slide-in-from-left-1 flex items-center gap-3 text-xs duration-300" style={{ animationDelay: `${index * 70}ms` }}>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full",
                    state === "done" ? "bg-primary text-primary-foreground" : "bg-background",
                  )}
                >
                  <StatusDot state={state} />
                </span>
                <span className={cn(state === "queued" ? "text-muted-foreground" : "text-foreground")}>{item.label}</span>
                {state === "active" && isWorking ? <Loader2 className="ml-auto size-3 animate-spin text-muted-foreground" /> : null}
                {state === "done" ? <Check className="ml-auto size-3 text-muted-foreground" /> : null}
              </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ToolCard({ open, onToggle, running = false }: { open: boolean; onToggle: () => void; running?: boolean }) {
  return (
    <div className="mt-2 overflow-hidden rounded-[8px] border border-dashed border-border/80 bg-muted/15">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/45"
        aria-expanded={open}
      >
        <span className={cn("flex size-7 items-center justify-center rounded-[6px]", running ? "bg-primary/35 text-foreground" : "bg-muted text-muted-foreground")}>
          <Wrench className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            已使用 内容研究工具
            <span className={cn("flex items-center gap-1 font-medium", running ? "text-muted-foreground" : "text-emerald-700")}>
              {running ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              {running ? "执行中" : "完成"}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">关键词研究、主题聚类、竞品内容对比</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          {running ? "实时日志" : "查看详情"} {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border/70 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
          <div className="grid gap-2 sm:grid-cols-3">
            <div><div className="text-foreground">已扫描</div><div className="mt-1">42 个主题</div></div>
            <div><div className="text-foreground">已筛选</div><div className="mt-1">18 个机会</div></div>
            <div><div className="text-foreground">执行耗时</div><div className="mt-1">5.8 秒</div></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SourcesCard({ onOpen, expanded = false }: { onOpen: () => void; expanded?: boolean }) {
  const sources = [
    ["01", "2024 B2B 内容营销趋势", "contentmarketing.example.com"],
    ["02", "SaaS 官网转化基准", "growthinsights.example.com"],
    ["03", "竞品内容策略分析", "research.example.com"],
  ]

  return (
    <div className="mt-2 rounded-[8px] border border-dashed border-border/80 bg-muted/15 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground"><Globe2 className="size-3.5" />引用来源 <span className="text-muted-foreground/70">· 3</span></span>
        <button type="button" onClick={onOpen} className="text-[11px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{expanded ? "收起引用" : "查看来源"}</button>
      </div>
      {expanded ? <div className="mt-2 grid gap-1.5 md:grid-cols-3">
        {sources.map(([number, title, domain]) => (
          <button key={number} type="button" onClick={onOpen} className="group min-w-0 rounded-[6px] border border-border/70 bg-card/70 px-2.5 py-2 text-left transition-colors hover:border-primary/70 hover:bg-card">
            <div className="flex items-start gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-primary/20 text-[9px] font-bold text-foreground">{number}</span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-foreground">{title}</span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{domain}</span>
              </span>
            </div>
          </button>
        ))}
      </div> : null}
    </div>
  )
}

function ArtifactCard({ onPreview, onDownload }: { onPreview: () => void; onDownload: () => void }) {
  return (
    <div className="mt-5 rounded-[11px] border border-primary/45 bg-primary/5 p-4 shadow-[0_10px_28px_rgba(17,17,17,0.07)] transition-shadow hover:shadow-[0_14px_34px_rgba(17,17,17,0.1)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-primary text-primary-foreground"><FileText className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-bold">B2B 内容增长策略</span>
            <span className="text-xs text-muted-foreground">· v1.0</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">生成报告 · 10:24 · 共 18 页</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={onPreview} className="h-8 rounded-[7px] px-2.5 text-xs">预览</Button>
          <IconButton label="下载报告" onClick={onDownload}><Download className="size-3.5" /></IconButton>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["目标与受众", "内容主题矩阵", "内容形式与分发", "转化路径设计", "KPI 与评估"].map((tag) => <span key={tag} className="rounded-[5px] bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">{tag}</span>)}
      </div>
    </div>
  )
}

function AssistantActions({ onRetry, onCopy }: { onRetry: () => void; onCopy: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
      <IconButton label="有帮助"><ThumbsUp className="size-3.5" /></IconButton>
      <IconButton label="没帮助"><ThumbsDown className="size-3.5" /></IconButton>
      <IconButton label="复制" onClick={onCopy}><Clipboard className="size-3.5" /></IconButton>
      <IconButton label="重新生成" onClick={onRetry}><RefreshCw className="size-3.5" /></IconButton>
      <IconButton label="更多"><MoreHorizontal className="size-3.5" /></IconButton>
    </div>
  )
}

export function AiTimelineDemo() {
  const [messages, setMessages] = useState(starterMessages)
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(true)
  const [toolOpen, setToolOpen] = useState(false)
  const [artifactOpen, setArtifactOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [webSearch, setWebSearch] = useState(true)
  const [toolsEnabled, setToolsEnabled] = useState(true)
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("done")
  const [demoVisibleParts, setDemoVisibleParts] = useState(4)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState("content-strategy")
  const [branch, setBranch] = useState(1)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const demoTimersRef = useRef<number[]>([])
  const demoRunRef = useRef<() => void>(() => undefined)

  const lastAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === "assistant"), [messages])

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current)
      demoTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const clearDemoTimers = () => {
    demoTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    demoTimersRef.current = []
  }

  const scrollToLatest = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    setShowScrollButton(false)
  }

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setShowScrollButton(distanceToBottom > 180)
  }

  const startStream = (prompt: string) => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isStreaming) return
    clearDemoTimers()
    setDemoPhase("idle")
    setDemoVisibleParts(0)
    const userMessage: DemoMessage = { id: `user-${Date.now()}`, role: "user", text: trimmedPrompt, time: "刚刚" }
    const assistantId = `assistant-${Date.now()}`
    const response = "我已经把这个问题拆成了目标、内容支柱和执行节奏三个层面。接下来可以继续补充具体的渠道分配、团队协作方式和每周复盘指标。"
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", text: "", time: "刚刚", isStreaming: true }])
    setInput("")
    setShowSuggestions(false)
    setIsStreaming(true)
    let index = 0
    streamTimerRef.current = setInterval(() => {
      index += 1
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, text: response.slice(0, index), isStreaming: index < response.length } : message))
      if (index >= response.length) {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current)
        streamTimerRef.current = null
        setIsStreaming(false)
        setReasoningOpen(false)
      }
    }, 24)
    window.setTimeout(scrollToLatest, 80)
  }

  const stopStream = () => {
    if (streamTimerRef.current) clearInterval(streamTimerRef.current)
    streamTimerRef.current = null
    clearDemoTimers()
    setIsStreaming(false)
    setDemoPhase("idle")
    setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, isStreaming: false, text: message.text || "已停止生成。你可以继续补充要求，或重新生成这条回答。" } : message))
  }

  const retryLast = () => {
    if (isStreaming || !lastAssistant) return
    clearDemoTimers()
    setDemoPhase("writing")
    setMessages((current) => current.map((message) => message.id === lastAssistant.id ? { ...message, text: "", isStreaming: true } : message))
    setIsStreaming(true)
    const response = "我重新整理了这份回答：先明确增长目标，再建立内容支柱，最后用渠道节奏和转化指标验证效果。"
    let index = 0
    streamTimerRef.current = setInterval(() => {
      index += 1
      setMessages((current) => current.map((message) => message.id === lastAssistant.id ? { ...message, text: response.slice(0, index), isStreaming: index < response.length } : message))
      if (index >= response.length) {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current)
        streamTimerRef.current = null
        setIsStreaming(false)
      }
    }, 24)
  }

  const copyLast = async () => {
    if (!lastAssistant) return
    try {
      await navigator.clipboard.writeText(lastAssistant.text)
    } catch {
      // Clipboard permissions can be unavailable in a local preview.
    }
  }

  const resetConversation = () => {
    stopStream()
    setMessages(starterMessages)
    setShowSuggestions(true)
    setReasoningOpen(true)
    setDemoPhase("done")
    setDemoVisibleParts(4)
    setBranch(1)
    window.setTimeout(scrollToLatest, 20)
  }

  const runDemo = () => {
    if (isStreaming) stopStream()
    clearDemoTimers()
    if (streamTimerRef.current) clearInterval(streamTimerRef.current)
    streamTimerRef.current = null

    const userMessage: DemoMessage = {
      id: "demo-user",
      role: "user",
      text: "帮我为 B2B SaaS 产品制定一份内容增长策略，重点关注官网流量和线索转化。",
      time: "刚刚",
    }
    const assistantId = "demo-assistant"
    const response = "我已经把这份策略拆成了目标、内容支柱和执行节奏三个层面。结合行业趋势与竞品内容，我建议先用一组高意图主题建立自然流量，再通过场景化案例把访问转化为有效线索。\n\n下面是可以直接进入执行的第一版方案。"
    setMessages([userMessage])
    setInput("")
    setShowSuggestions(false)
    setReasoningOpen(true)
    setToolOpen(false)
    setArtifactOpen(false)
    setSourcesOpen(false)
    setDemoVisibleParts(0)
    setDemoPhase("reading")
    setIsStreaming(true)

    const addTimer = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay)
      demoTimersRef.current.push(timer)
    }

    addTimer(() => {
      setMessages([userMessage, { id: assistantId, role: "assistant", text: "", time: "刚刚", isStreaming: true }])
      setDemoPhase("thinking")
      setDemoVisibleParts(1)
    }, 520)
    addTimer(() => setDemoVisibleParts(2), 1420)
    addTimer(() => {
      setDemoPhase("tool")
      setToolOpen(true)
    }, 1880)
    addTimer(() => setDemoVisibleParts(3), 2550)
    addTimer(() => setDemoVisibleParts(4), 3140)
    addTimer(() => {
      setDemoPhase("writing")
      setReasoningOpen(false)
      setToolOpen(false)
      let index = 0
      streamTimerRef.current = setInterval(() => {
        index += 1
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, text: response.slice(0, index), isStreaming: index < response.length } : message))
        if (index >= response.length) {
          if (streamTimerRef.current) clearInterval(streamTimerRef.current)
          streamTimerRef.current = null
          setIsStreaming(false)
          setDemoPhase("done")
          setReasoningOpen(false)
          setShowSuggestions(true)
        }
      }, 20)
    }, 3370)
    addTimer(scrollToLatest, 600)
  }

  demoRunRef.current = runDemo

  useEffect(() => {
    const timer = window.setTimeout(() => demoRunRef.current(), 900)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <aside className={cn("absolute inset-y-0 left-0 z-30 flex w-[276px] -translate-x-full flex-col border-r border-border bg-card transition-transform lg:relative lg:translate-x-0", mobileHistoryOpen && "translate-x-0")}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div className="flex items-center gap-2.5"><BrandMark small /><div><div className="text-sm font-bold tracking-tight">AI Marketing</div><div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Conversation Lab</div></div></div>
            <IconButton label="关闭对话列表" onClick={() => setMobileHistoryOpen(false)} className="lg:hidden"><X className="size-4" /></IconButton>
          </div>
          <div className="p-3">
            <Button type="button" onClick={resetConversation} className="h-10 w-full justify-start rounded-[7px] font-semibold"><MessageSquarePlus className="size-4" />新建对话</Button>
            <label className="relative mt-3 block">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input className="h-9 w-full rounded-[7px] border border-border bg-background pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="搜索对话" />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">今天</div>
            <button type="button" onClick={() => setSelectedHistory("content-strategy")} className={cn("group w-full rounded-[8px] px-3 py-3 text-left transition-colors", selectedHistory === "content-strategy" ? "bg-primary/20" : "hover:bg-muted")}>
              <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold">内容增长策略</span><span className="text-[10px] text-muted-foreground">10:24</span></div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">为 B2B 产品制定内容增长策略...</div>
            </button>
            <div className="my-4 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">昨天</div>
            {["邮件活动优化方案", "着陆页文案建议", "社媒内容日历", "客户画像分析"].map((title, index) => (
              <button key={title} type="button" onClick={() => setSelectedHistory(title)} className={cn("group mb-1 w-full rounded-[8px] px-3 py-3 text-left transition-colors", selectedHistory === title ? "bg-primary/20" : "hover:bg-muted")}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold">{title}</span><span className="text-[10px] text-muted-foreground">{index + 1}天前</span></div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">分析最近的营销活动并提出优化建议...</div>
              </button>
            ))}
            <Button type="button" variant="outline" className="mt-3 h-9 w-full rounded-[7px] text-xs"><History className="size-3.5" />查看全部对话</Button>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-[11px] text-muted-foreground">演示模式 · 本地状态</span><IconButton label="演示设置"><Settings2 className="size-3.5" /></IconButton></div>
        </aside>

        {mobileHistoryOpen ? <button type="button" aria-label="关闭对话列表" onClick={() => setMobileHistoryOpen(false)} className="absolute inset-0 z-20 bg-foreground/20 lg:hidden" /> : null}

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-sm lg:px-7">
            <div className="flex min-w-0 items-center gap-3"><IconButton label="打开对话列表" onClick={() => setMobileHistoryOpen(true)} className="lg:hidden"><Menu className="size-4" /></IconButton><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-bold">内容增长策略</h1><ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /></div><div className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">AI 对话时间线 · 交互演示</div></div></div>
            <div className="flex items-center gap-1.5"><span className="hidden items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground md:flex"><span className={cn("size-1.5 rounded-full", demoPhase === "done" || demoPhase === "idle" ? "bg-emerald-500" : "animate-pulse bg-primary")} />{demoPhase === "reading" ? "读取需求" : demoPhase === "thinking" ? "分析中" : demoPhase === "tool" ? "调用工具" : demoPhase === "writing" ? "流式输出" : "可交互演示"}</span><Button type="button" variant="outline" size="sm" onClick={runDemo} className="h-8 rounded-[7px] border-primary/60 bg-primary/10 px-2.5 text-xs font-semibold hover:bg-primary/25"><Play className="size-3.5 fill-current" />播放演示</Button><Button type="button" variant="ghost" size="sm" className="hidden h-8 rounded-[7px] text-xs text-muted-foreground sm:flex"><Download className="size-3.5" />导出</Button><IconButton label="更多操作"><MoreHorizontal className="size-4" /></IconButton></div>
          </header>

          <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[840px] flex-col gap-7 px-4 py-7 pb-40 sm:px-6 lg:px-8">
              {messages.map((message, index) => {
                const isLastAssistant = message.role === "assistant" && index === messages.length - 1
                const visibleParts = message.id === "assistant-1" ? 4 : message.id === "demo-assistant" ? demoVisibleParts : 0
                return (
                  <article key={message.id} className={cn("group", message.role === "user" ? "flex justify-end" : "flex gap-3")}>
                    {message.role === "assistant" ? <div className="mt-1 hidden sm:block"><BrandMark small /></div> : null}
                    <div className={cn("min-w-0", message.role === "user" ? "max-w-[82%]" : "w-full")}>
                      {message.role === "user" ? (
                        <div className="rounded-[10px] bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-[0_4px_12px_rgba(17,17,17,0.06)]"><p>{message.text}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-primary-foreground/65">{message.time}<Check className="size-3" /></div></div>
                      ) : (
                        <div className="relative rounded-[12px] border border-border bg-card px-4 py-4 shadow-[0_6px_20px_rgba(17,17,17,0.025)] sm:px-5 sm:py-5">
                          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="text-xs font-bold">AI Marketing</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">内容策略专家</span></div><span className="text-[10px] text-muted-foreground">{message.time}</span></div>
                          {visibleParts > 0 ? <div className="mt-5 border-t border-dashed border-border/70 pt-3">
                            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70"><span>过程记录</span><span className="font-normal normal-case tracking-normal">分析、工具和来源</span></div>
                            {visibleParts >= 1 ? <ReasoningCard open={reasoningOpen} onToggle={() => setReasoningOpen((value) => !value)} activeIndex={message.id === "assistant-1" ? 2 : demoPhase === "thinking" ? 2 : 3} isWorking={demoPhase === "thinking"} /> : null}
                            {visibleParts >= 2 ? <ToolCard open={toolOpen} onToggle={() => setToolOpen((value) => !value)} running={demoPhase === "tool"} /> : null}
                            {visibleParts >= 3 ? <SourcesCard expanded={sourcesOpen} onOpen={() => setSourcesOpen((value) => !value)} /> : null}
                          </div> : null}
                          {message.text ? <div className="mt-4 whitespace-pre-line text-base leading-8 text-foreground">{message.text}{message.isStreaming ? <span className="ml-1 inline-block h-5 w-1 animate-pulse bg-primary align-[-2px]" /> : null}</div> : <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在组织回答...</div>}
                          {visibleParts >= 4 ? <ArtifactCard onPreview={() => setArtifactOpen(true)} onDownload={() => window.alert("演示：报告已加入下载队列")} /> : null}
                          {isLastAssistant && !message.isStreaming && messages.length > 2 ? <div className="mt-4 rounded-[8px] bg-muted/45 px-3 py-2 text-xs text-muted-foreground">这条回答是根据刚刚的补充要求生成的，内容可以继续编辑或重新生成。</div> : null}
                          {!message.isStreaming ? <div className="flex items-center justify-between"><AssistantActions onRetry={retryLast} onCopy={copyLast} />{message.branch ? <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><IconButton label="上一分支" onClick={() => setBranch(Math.max(1, branch - 1))}><ArrowUp className="size-3" /></IconButton><span>{branch} / 3</span><IconButton label="下一分支" onClick={() => setBranch(Math.min(3, branch + 1))}><ArrowDown className="size-3" /></IconButton></div> : null}</div> : null}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}

              {showSuggestions && !isStreaming ? <div className="flex flex-wrap gap-2 pl-0 sm:pl-11"><span className="mr-1 flex items-center text-xs text-muted-foreground"><Sparkles className="mr-1.5 size-3.5 text-primary-foreground" />继续探索</span>{suggestedPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => startStream(prompt)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-foreground">{prompt}</button>)}</div> : null}
            </div>
            {showScrollButton ? <Button type="button" onClick={scrollToLatest} variant="outline" size="sm" className="sticky bottom-4 left-1/2 z-10 ml-[calc(50%-66px)] h-8 rounded-full bg-card px-3 text-xs shadow-md"><ArrowDown className="size-3.5" />回到最新</Button> : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/90 to-transparent" />
          <div className="relative z-10 mx-auto -mt-28 w-full max-w-[840px] px-4 pb-4 sm:px-6 lg:px-8">
            <div className="rounded-[13px] border border-border bg-card p-2 shadow-[0_12px_35px_rgba(17,17,17,0.12)] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); startStream(input) } }} rows={2} placeholder="给 AI Marketing 发消息..." className="max-h-36 min-h-[58px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground" />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pb-1">
                <div className="flex items-center gap-1">
                  <IconButton label="添加附件"><Paperclip className="size-4" /></IconButton>
                  <Button type="button" variant={webSearch ? "secondary" : "ghost"} size="sm" onClick={() => setWebSearch((value) => !value)} className={cn("h-8 rounded-[7px] px-2.5 text-xs", webSearch && "bg-muted") }><Globe2 className="size-3.5" />联网搜索</Button>
                  <Button type="button" variant={toolsEnabled ? "secondary" : "ghost"} size="sm" onClick={() => setToolsEnabled((value) => !value)} className={cn("h-8 rounded-[7px] px-2.5 text-xs", toolsEnabled && "bg-muted") }><Wrench className="size-3.5" />使用工具</Button>
                  <Button type="button" variant="ghost" size="sm" className="hidden h-8 rounded-[7px] px-2.5 text-xs text-muted-foreground md:flex"><Bot className="size-3.5" />Sonnet 4.6<ChevronDown className="size-3" /></Button>
                </div>
                <Button type="button" onClick={isStreaming ? stopStream : () => startStream(input)} disabled={!isStreaming && !input.trim()} className="h-9 min-w-[92px] rounded-[7px] px-3 text-xs font-bold">{isStreaming ? <><Square className="size-3.5 fill-current" />停止</> : <><Send className="size-3.5" />发送</>}</Button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground"><span>Enter 发送</span><span>·</span><span>Shift + Enter 换行</span><span>·</span><span>这是交互演示，不会调用真实模型</span></div>
          </div>
        </section>

        {artifactOpen || sourcesOpen ? <aside className="hidden w-[300px] shrink-0 border-l border-border bg-card xl:flex xl:flex-col">
          <div className="flex h-[60px] items-center justify-between border-b border-border px-4"><div className="flex items-center gap-2 text-sm font-bold">{artifactOpen ? <FileText className="size-4 text-primary-foreground" /> : <Globe2 className="size-4 text-primary-foreground" />}{artifactOpen ? "报告预览" : "引用来源"}</div><IconButton label="关闭侧栏" onClick={() => { setArtifactOpen(false); setSourcesOpen(false) }}><X className="size-4" /></IconButton></div>
          <div className="flex-1 overflow-y-auto p-4">
            {artifactOpen ? <><div className="rounded-[9px] border border-border bg-muted/35 p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">报告预览</span><span className="rounded bg-primary/25 px-1.5 py-0.5 text-[10px] font-bold">v1.0</span></div><div className="mt-5 aspect-[3/4] rounded-[7px] border border-border bg-card p-4 shadow-sm"><div className="h-2 w-1/3 rounded-full bg-primary" /><div className="mt-5 h-4 w-4/5 rounded bg-foreground/80" /><div className="mt-2 h-2 w-3/5 rounded bg-muted-foreground/25" /><div className="mt-8 grid grid-cols-2 gap-2"><div className="h-16 rounded border border-border bg-muted/50" /><div className="h-16 rounded border border-border bg-muted/50" /></div><div className="mt-4 h-2 w-full rounded bg-muted" /><div className="mt-2 h-2 w-5/6 rounded bg-muted" /><div className="mt-2 h-2 w-4/6 rounded bg-muted" /></div></div><Button type="button" className="mt-3 w-full rounded-[7px] text-xs" onClick={() => window.alert("演示：已打开报告编辑器")}><PenLine className="size-3.5" />编辑报告</Button></> : <div className="flex flex-col gap-2">{["2024 B2B 内容营销趋势", "SaaS 官网转化基准", "竞品内容策略分析"].map((source, index) => <div key={source} className="rounded-[8px] border border-border p-3"><div className="flex items-start gap-2"><span className="flex size-5 items-center justify-center rounded bg-primary/25 text-[10px] font-bold">0{index + 1}</span><div><div className="text-xs font-semibold">{source}</div><div className="mt-1 text-[10px] text-muted-foreground">研究资料 · 已引用</div></div></div></div>)}</div>}
          </div>
        </aside> : null}
      </div>
    </main>
  )
}
