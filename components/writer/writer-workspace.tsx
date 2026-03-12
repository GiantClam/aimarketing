"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { BookText, ChevronLeft, Copy, Download, Eye, ImageIcon, Loader2, MessageSquare, Send, Sparkles, Square } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { useAuth } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { buildPendingWriterAssets, resolveWriterAssetMarkdown, type WriterAsset } from "@/lib/writer/assets"
import { getWriterModeOptions, normalizeWriterMode, normalizeWriterPlatform, WRITER_PLATFORM_CONFIG, WRITER_PLATFORM_ORDER, type WriterMode, type WriterPlatform } from "@/lib/writer/config"
import { emitWriterRefresh, getWriterSessionMeta, saveWriterSessionMeta } from "@/lib/writer/session-store"
import { cn } from "@/lib/utils"

type WriterMessage = { id: string; conversation_id: string; role: "user" | "assistant"; content: string; authorLabel?: string }

const WRITER_ASSISTANT_NAME = "文章写作工作台"
const extractSSEBlocks = (buffer: string) => { const parts = buffer.split(/\r?\n\r?\n/); return { blocks: parts.slice(0, -1), rest: parts.at(-1) ?? "" } }
const getSSEDataFromBlock = (block: string) => { const raw = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim(); if (!raw || raw === "[DONE]") return null; try { return JSON.parse(raw) } catch { return null } }
const extractText = (value: unknown): string => typeof value === "string" ? value.trim() : Array.isArray(value) ? value.map(extractText).find(Boolean) || "" : value && typeof value === "object" ? Object.values(value as Record<string, unknown>).map(extractText).find(Boolean) || "" : ""
const sanitize = (raw: string) => raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
const inferDraft = (messages: WriterMessage[]) => [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim())?.content || ""
const parseThread = (markdown: string) => markdown.split(/^###\s+/gm).map((part) => part.trim()).filter(Boolean)

function renderMarkdown(content: string) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img({ src, alt, ...props }) { if (typeof src !== "string" || !src.trim()) return null; return <img src={src} alt={alt || ""} {...props} className="my-4 w-full rounded-2xl border border-border/60 bg-muted/40 object-cover" /> }, p({ children }) { return <p className="whitespace-pre-wrap break-words">{children}</p> }, code({ children }) { return <code className="break-words rounded bg-muted px-1 py-0.5 text-[0.9em]">{children}</code> } }}>{content}</ReactMarkdown>
}

export function WriterWorkspace({ initialConversationId, initialPlatform, initialMode }: { initialConversationId: string | null; initialPlatform?: string | null; initialMode?: string | null }) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [availabilityReady, setAvailabilityReady] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [platform, setPlatform] = useState<WriterPlatform>(() => normalizeWriterPlatform(initialPlatform))
  const [mode, setMode] = useState<WriterMode>(() => normalizeWriterMode(normalizeWriterPlatform(initialPlatform), initialMode))
  const [inputValue, setInputValue] = useState("")
  const [messages, setMessages] = useState<WriterMessage[]>([])
  const [draft, setDraft] = useState("")
  const [assets, setAssets] = useState<WriterAsset[]>(() => buildPendingWriterAssets("", normalizeWriterPlatform(initialPlatform)))
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isConversationLoading, setIsConversationLoading] = useState(Boolean(initialConversationId))
  const [previewOpen, setPreviewOpen] = useState(false)
  const replaceWriterUrl = (href: string) => {
    if (typeof window === "undefined") return
    window.history.replaceState(window.history.state, "", href)
  }

  useEffect(() => { setConversationId(initialConversationId) }, [initialConversationId])
  useEffect(() => { const nextPlatform = normalizeWriterPlatform(initialPlatform); setPlatform(nextPlatform); setMode(normalizeWriterMode(nextPlatform, initialMode)) }, [initialMode, initialPlatform])
  useEffect(() => { let cancelled = false; const controller = new AbortController(); const verify = async () => { try { const response = await fetch("/api/writer/availability", { signal: controller.signal }); const data = response.ok ? await response.json() : null; if (!cancelled && data?.data?.enabled) { setAvailabilityReady(true); return } if (!cancelled) { router.replace(user ? "/dashboard" : "/login") } } catch (error) { if (controller.signal.aborted) return; if (error instanceof Error && error.name === "AbortError") return; if (!cancelled) router.replace(user ? "/dashboard" : "/login") } finally { if (!cancelled) setAvailabilityLoading(false) } }; void verify(); return () => { cancelled = true; controller.abort() } }, [router, user])

  const writerConfig = WRITER_PLATFORM_CONFIG[platform]
  const writerModeOptions = useMemo(() => getWriterModeOptions(platform), [platform])
  const baseDraft = useMemo(() => draft || inferDraft(messages), [draft, messages])
  const renderableDraft = useMemo(() => resolveWriterAssetMarkdown(baseDraft, assets), [assets, baseDraft])
  const threadSegments = useMemo(() => parseThread(draft), [draft])

  useEffect(() => { if (typeof window === "undefined") return; const nextHref = `${conversationId ? `/dashboard/writer/${conversationId}` : "/dashboard/writer"}?${new URLSearchParams({ platform, mode }).toString()}`; const currentHref = `${window.location.pathname}${window.location.search}`; if (currentHref !== nextHref) replaceWriterUrl(nextHref) }, [conversationId, mode, platform])
  useEffect(() => { if (!conversationId) { setMessages([]); setDraft(""); setIsConversationLoading(false); return } setIsConversationLoading(true); const meta = getWriterSessionMeta(conversationId); if (meta) { setPlatform(meta.platform); setMode(normalizeWriterMode(meta.platform, meta.mode)); if (meta.draft) setDraft(meta.draft) } const controller = new AbortController(); const load = async () => { try { const response = await fetch(`/api/writer/messages?conversation_id=${conversationId}&limit=100`, { signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const data = await response.json(); const nextMessages: WriterMessage[] = []; (data.data || []).reverse().forEach((message: any) => { nextMessages.push({ id: `user_${message.id}`, conversation_id: message.conversation_id, role: "user", content: message.query || message.inputs?.contents || "" }); nextMessages.push({ id: `assistant_${message.id}`, conversation_id: message.conversation_id, role: "assistant", content: sanitize(message.answer || ""), authorLabel: WRITER_ASSISTANT_NAME }) }); setMessages(nextMessages); if (!meta?.draft) setDraft(inferDraft(nextMessages)) } catch (error) { if (controller.signal.aborted) return; if (error instanceof Error && error.name === "AbortError") return; setMessages([{ id: `error_${Date.now()}`, conversation_id: conversationId, role: "assistant", content: "会话历史加载失败，请稍后重试。", authorLabel: WRITER_ASSISTANT_NAME }]) } finally { if (!controller.signal.aborted) setIsConversationLoading(false) } }; void load(); return () => controller.abort() }, [conversationId])
  useEffect(() => { if (conversationId) saveWriterSessionMeta(conversationId, { platform, mode, draft, updatedAt: Date.now() }) }, [conversationId, draft, mode, platform])
  useEffect(() => { const viewport = viewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null; if (viewport) viewport.scrollTop = viewport.scrollHeight }, [isLoading, messages])
  useEffect(() => { if (draft.trim()) setPreviewOpen(true) }, [draft])
  useEffect(() => {
    const pendingAssets = buildPendingWriterAssets(baseDraft, platform)
    setAssets(pendingAssets)
    setAssetsError(null)
    if (!baseDraft.trim()) return
    const controller = new AbortController()
    const loadAssets = async () => {
      try {
        setAssetsLoading(true)
        const response = await fetch("/api/writer/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ markdown: baseDraft, platform }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || `HTTP ${response.status}`)
        }
        if (!controller.signal.aborted && Array.isArray(data?.data?.assets) && data.data.assets.length > 0) {
          setAssets(data.data.assets as WriterAsset[])
        } else if (!controller.signal.aborted) {
          throw new Error("图片生成返回为空")
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setAssetsError(error instanceof Error ? error.message : "图片生成失败")
      } finally {
        if (!controller.signal.aborted) setAssetsLoading(false)
      }
    }
    void loadAssets()
    return () => controller.abort()
  }, [baseDraft, platform])

  const patchAssistantMessage = (id: string, content: string) => setMessages((current) => current.map((message) => message.id === id ? { ...message, content, authorLabel: WRITER_ASSISTANT_NAME } : message))
  const handleCreateConversation = () => { setConversationId(null); setMessages([]); setDraft(""); setInputValue(""); setPreviewOpen(false); setAssetsError(null); setAssets(buildPendingWriterAssets("", platform)); emitWriterRefresh(); router.push(`/dashboard/writer?platform=${platform}&mode=${mode}`) }
  const handleSend = async () => { if (!inputValue.trim() || isLoading) return; const query = inputValue.trim(); const assistantId = `writer_assistant_${Date.now()}`; setInputValue(""); setIsLoading(true); setMessages((current) => [...current, { id: `writer_user_${Date.now()}`, conversation_id: conversationId || "", role: "user", content: query }, { id: assistantId, conversation_id: conversationId || "", role: "assistant", content: "", authorLabel: WRITER_ASSISTANT_NAME }]); try { const response = await fetch("/api/writer/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, inputs: { contents: query }, response_mode: "streaming", conversation_id: conversationId, platform, mode }) }); if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`); const reader = response.body.getReader(); const decoder = new TextDecoder("utf-8"); let streamBuffer = ""; let accumulated = ""; let nextConversationId: string | null = null; const onEvent = (dataObj: any) => { if (dataObj?.task_id) currentTaskIdRef.current = dataObj.task_id; if (dataObj?.conversation_id && !nextConversationId && !conversationId) { nextConversationId = dataObj.conversation_id; setConversationId(dataObj.conversation_id) } if (["message", "agent_message", "text_chunk"].includes(dataObj?.event)) { const chunk = extractText(dataObj.answer) || extractText(dataObj.data?.text); if (chunk) { accumulated += chunk; patchAssistantMessage(assistantId, sanitize(accumulated)) } } else if (dataObj?.event === "workflow_finished" && !accumulated) { const workflowText = extractText(dataObj?.data?.outputs); if (workflowText) { accumulated = workflowText; patchAssistantMessage(assistantId, sanitize(accumulated)) } } }; while (true) { const { done, value } = await reader.read(); if (done) break; streamBuffer += decoder.decode(value, { stream: true }); const parsed = extractSSEBlocks(streamBuffer); streamBuffer = parsed.rest; parsed.blocks.forEach((block) => { const dataObj = getSSEDataFromBlock(block); if (dataObj) onEvent(dataObj) }) } const finalDraft = sanitize(accumulated); if (finalDraft) { setDraft(finalDraft); setPreviewOpen(true) } if (nextConversationId) { saveWriterSessionMeta(nextConversationId, { platform, mode, draft: finalDraft, updatedAt: Date.now() }); replaceWriterUrl(`/dashboard/writer/${nextConversationId}?platform=${platform}&mode=${mode}`) } emitWriterRefresh() } catch (error) { patchAssistantMessage(assistantId, `请求失败：${error instanceof Error ? error.message : "未知错误"}`) } finally { currentTaskIdRef.current = null; setIsLoading(false) } }
  const handleStop = async () => { if (!currentTaskIdRef.current) return; await fetch(`/api/writer/chat/${currentTaskIdRef.current}/stop`, { method: "POST" }); currentTaskIdRef.current = null; setIsLoading(false) }
  const handleCopyText = async () => { if (draft.trim()) await navigator.clipboard.writeText(draft.trim()) }
  const handleCopyMarkdown = async () => { if (draft.trim()) await navigator.clipboard.writeText(renderableDraft || draft) }
  const handleCopyAssetLink = async (asset: WriterAsset) => navigator.clipboard.writeText(asset.dataUrl)
  const handleCopyAssetMarkdown = async (asset: WriterAsset) => navigator.clipboard.writeText(`![${asset.label}](${asset.dataUrl})`)
  const handleDownloadAsset = (asset: WriterAsset) => { const link = document.createElement("a"); link.href = asset.dataUrl; link.download = `${platform}-${asset.id}.png`; link.click() }

  const composerDisabled = loading || availabilityLoading || !availabilityReady
  const hasDraft = Boolean(draft.trim())
  const currentModeLabel = writerModeOptions.find((option) => option.value === mode)?.label || "标准图文"
  const previewMarkdown = mode === "thread" && threadSegments.length > 0 ? resolveWriterAssetMarkdown(threadSegments.map((segment, index) => `### 第 ${index + 1} 段\n${segment}`).join("\n\n"), assets) : renderableDraft || "_文章生成后会在这里实时预览_"

  return <>
    <div className="flex h-[calc(100vh-65px)] flex-col bg-background lg:h-screen">
      <header className="border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm lg:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2"><Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">文章写作</Badge><Badge variant="outline" className="rounded-full px-3 py-1 text-xs">统一入口</Badge></div>
            <h1 className="font-sans text-lg font-bold text-foreground lg:text-xl">多平台图文写作工作台</h1>
            <p className="mt-1 text-sm text-muted-foreground">以对话生成和实时预览为主，平台与发布模式集中在底部输入区，右侧抽屉用于预览和发布包操作。</p>
          </div>
          <Button variant="outline" className="rounded-full" onClick={() => setPreviewOpen(true)} disabled={!hasDraft}><Eye className="mr-2 h-4 w-4" />预览抽屉</Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden bg-muted/10">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 px-4 py-3 lg:px-6 lg:py-4">
          <section className="rounded-3xl border bg-card/90 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageSquare className="h-5 w-5" /></div>
                <div><p className="text-sm font-semibold text-foreground">对话工作流</p><p className="text-xs text-muted-foreground">{loading ? "正在校验登录状态..." : availabilityLoading ? "正在检查写作能力..." : isConversationLoading ? "正在恢复会话内容..." : hasDraft ? "草稿已生成，可随时打开右侧预览抽屉。" : "从下方输入需求开始写作。"}</p></div>
              </div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="rounded-full px-3 py-1 text-xs">{writerConfig.shortLabel}</Badge><Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">{currentModeLabel}</Badge></div>
            </div>
          </section>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border bg-card shadow-sm">
            <ScrollArea className="h-full" ref={viewportRef}>
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5 lg:px-6">
                {messages.length === 0 && !isConversationLoading ? <div className="space-y-4 rounded-[28px] border border-dashed bg-muted/30 p-6"><div className="flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" /><span className="text-sm font-semibold">推荐起稿方式</span></div><div className="grid gap-3 lg:grid-cols-3">{["围绕 AI 客服 Agent 写一篇适合公众号发布的专业长文，包含趋势、案例、落地建议和配图说明。", "围绕 AI 副业工具推荐写一篇适合小红书的图文笔记，标题要有收藏感，正文要有具体工具和行动建议。", "写一组适合 X / Facebook 发布的 AI 创业观察线程，包含 hook、核心观点和结尾 CTA。"].map((prompt) => <button key={prompt} type="button" onClick={() => setInputValue(prompt)} className="rounded-2xl border bg-background px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"><p className="text-xs leading-5 text-muted-foreground">{prompt}</p></button>)}</div></div> : null}
                {isConversationLoading ? <div className="flex items-center gap-2 rounded-2xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在恢复当前会话...</div> : null}
                {messages.map((message) => <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}><div className={cn("max-w-[92%] overflow-hidden rounded-3xl px-4 py-3 text-sm shadow-sm lg:max-w-[82%]", message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/70 bg-background text-foreground")}><div className={cn("prose prose-sm max-w-none break-words overflow-hidden dark:prose-invert", message.role === "assistant" ? "prose-headings:mt-3 prose-p:my-2" : "prose-invert prose-p:my-2")}><div className={message.role === "assistant" ? "mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground" : "mb-2 text-[11px] font-medium opacity-80"}>{message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : null}{message.authorLabel || "你"}</div>{renderMarkdown(message.role === "assistant" ? resolveWriterAssetMarkdown(message.content, assets) : message.content)}</div></div></div>)}
                {isLoading ? <div className="flex justify-start"><div className="rounded-3xl rounded-bl-md border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm"><span className="animate-pulse">正在生成图文草稿...</span></div></div> : null}
              </div>
            </ScrollArea>
          </div>

          <section className="rounded-[28px] border bg-background/95 p-3 shadow-xl backdrop-blur">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <select value={platform} onChange={(event) => { const nextPlatform = event.target.value as WriterPlatform; setPlatform(nextPlatform); setMode(normalizeWriterMode(nextPlatform, mode)) }} className="h-11 rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-colors focus:border-primary" disabled={composerDisabled || isLoading}>{WRITER_PLATFORM_ORDER.map((item) => <option key={item} value={item}>{WRITER_PLATFORM_CONFIG[item].shortLabel}</option>)}</select>
                <select value={mode} onChange={(event) => setMode(event.target.value as WriterMode)} className="h-11 rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-colors focus:border-primary" disabled={composerDisabled || isLoading}>{writerModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                <div className="flex items-center gap-2 lg:ml-auto"><Button variant="ghost" className="rounded-full" onClick={handleCreateConversation}>新建</Button><Button variant="outline" className="rounded-full" onClick={() => setPreviewOpen(true)} disabled={!hasDraft}><Eye className="mr-2 h-4 w-4" />打开预览</Button></div>
              </div>
              <div className="rounded-[24px] border border-border/70 bg-card">
                <Textarea value={inputValue} onChange={(event) => setInputValue(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void handleSend() } }} placeholder={`告诉我你要写什么，我会按 ${writerConfig.shortLabel} 的发布方式起稿。可以补充受众、语气、篇幅、是否要配图和 CTA。`} className="min-h-28 resize-none border-0 bg-transparent px-4 py-4 text-sm shadow-none focus-visible:ring-0" disabled={composerDisabled} />
                <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"><p className="text-xs leading-5 text-muted-foreground">当前生成目标：{writerConfig.shortLabel} · {currentModeLabel}{composerDisabled ? " · 正在准备工作台能力" : " · 支持文字输出、图片建议和发布包复制"}</p>{isLoading ? <Button variant="destructive" className="rounded-full" onClick={handleStop}><Square className="mr-2 h-4 w-4 fill-current" />停止生成</Button> : <Button className="rounded-full" onClick={() => void handleSend()} disabled={!inputValue.trim() || composerDisabled}><Send className="mr-2 h-4 w-4" />发送需求</Button>}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[760px]">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div><SheetTitle>实时预览与发布包</SheetTitle><SheetDescription>右侧抽屉会按 Markdown 真实渲染文章内容，并提供文本复制、Markdown 复制、图片下载和图片链接复制。</SheetDescription></div>
            <Button variant="ghost" className="rounded-full" onClick={() => setPreviewOpen(false)}><ChevronLeft className="mr-2 h-4 w-4" />收起</Button>
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-88px)]">
          <div className="space-y-4 p-5">
            <div className="rounded-3xl border bg-background p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">{writerConfig.shortLabel} 实时预览</p><p className="mt-1 text-xs text-muted-foreground">{writerConfig.copyHint}</p></div><div className="flex items-center gap-2"><Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">{currentModeLabel}</Badge><Button variant="outline" className="rounded-full" onClick={() => void handleCopyText()} disabled={!hasDraft}><BookText className="mr-2 h-4 w-4" />复制纯文本</Button><Button variant="outline" className="rounded-full" onClick={() => void handleCopyMarkdown()} disabled={!hasDraft}><Copy className="mr-2 h-4 w-4" />复制 Markdown</Button></div></div>
              <div className="prose prose-sm prose-headings:mt-4 prose-p:my-3 mt-4 max-w-none break-words dark:prose-invert">{renderMarkdown(previewMarkdown)}</div>
            </div>
            <div className="rounded-3xl border bg-background p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /><p className="text-sm font-semibold text-foreground">图片发布包</p></div>{assetsLoading ? <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]"><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />生成中</Badge> : <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">OpenRouter Images</Badge>}</div>
              <p className="mb-4 text-xs leading-5 text-muted-foreground">图片生成已按参考项目 D:\OpenCode\writer 切换为 OpenRouter 图像模型链路，不再使用占位图 fallback。</p>
              {assetsError ? <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">图片生成失败：{assetsError}</div> : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => <div key={asset.id} className="rounded-2xl border border-border/70 p-3">{asset.dataUrl ? <img src={asset.dataUrl} alt={asset.label} className="h-24 w-full rounded-xl border border-border/60 bg-muted/40 object-cover sm:h-28" /> : <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-xs text-muted-foreground sm:h-28">{assetsLoading ? "正在生成图片..." : "等待图片"}</div>}<div className="mt-3 space-y-2"><div className="flex items-center gap-2"><p className="text-sm font-semibold text-foreground">{asset.label}</p><Badge variant={asset.provider === "openrouter" ? "secondary" : "outline"} className="rounded-full px-2 py-0 text-[10px]">{asset.provider === "openrouter" ? "已生成" : "等待中"}</Badge></div><p className="line-clamp-2 text-xs text-muted-foreground">{asset.title}</p><p className="line-clamp-4 text-[11px] leading-5 text-muted-foreground">{asset.prompt}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="rounded-full" onClick={() => handleDownloadAsset(asset)} disabled={!asset.dataUrl}><Download className="mr-2 h-3.5 w-3.5" />下载</Button><Button size="sm" variant="outline" className="rounded-full" onClick={() => void handleCopyAssetLink(asset)} disabled={!asset.dataUrl}><Copy className="mr-2 h-3.5 w-3.5" />图链</Button><Button size="sm" variant="outline" className="rounded-full" onClick={() => void handleCopyAssetMarkdown(asset)} disabled={!asset.dataUrl}><ImageIcon className="mr-2 h-3.5 w-3.5" />Markdown</Button></div></div></div>)}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  </>
}
