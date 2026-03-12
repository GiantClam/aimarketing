"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BookText,
  Bookmark,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  Heart,
  ImageIcon,
  Loader2,
  MessageCircleMore,
  MessageSquare,
  Repeat2,
  Send,
  Share2,
  Sparkles,
  Square,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { useAuth } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  buildPendingWriterAssets,
  extractWriterAssetsFromMarkdown,
  hasWriterAssetPlaceholders,
  markWriterAssetsFailed,
  resolveWriterAssetMarkdown,
  type WriterAsset,
} from "@/lib/writer/assets"
import {
  getWriterModeOptions,
  normalizeWriterMode,
  normalizeWriterPlatform,
  WRITER_PLATFORM_CONFIG,
  WRITER_PLATFORM_ORDER,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import { emitWriterRefresh, getWriterSessionMeta, saveWriterSessionMeta } from "@/lib/writer/session-store"
import { cn } from "@/lib/utils"

type WriterMessage = {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  authorLabel?: string
}

const WRITER_ASSISTANT_NAME = "文章写作助手"

const extractSSEBlocks = (buffer: string) => {
  const parts = buffer.split(/\r?\n\r?\n/)
  return { blocks: parts.slice(0, -1), rest: parts.at(-1) ?? "" }
}

const getSSEDataFromBlock = (block: string) => {
  const raw = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim()

  if (!raw || raw === "[DONE]") return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const extractText = (value: unknown): string =>
  typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.map(extractText).find((item) => item.length > 0) || ""
      : value && typeof value === "object"
        ? Object.values(value as Record<string, unknown>).map(extractText).find((item) => item.length > 0) || ""
        : ""

const sanitize = (raw: string) => raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
const inferDraft = (messages: WriterMessage[]) =>
  [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim())?.content || ""
const parseThread = (markdown: string) =>
  markdown
    .split(/^###\s+/gm)
    .map((part) => part.trim())
    .filter(Boolean)

const stripMarkdown = (markdown: string) =>
  markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim()

const extractTitle = (markdown: string) =>
  (markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("![")) || "未命名文章")
    .replace(/^#+\s*/, "")
    .trim()

const extractLead = (markdown: string) =>
  markdown
    .split(/\r?\n\r?\n/)
    .map((block) => stripMarkdown(block))
    .find((block) => block && block !== extractTitle(markdown)) || "生成完成后，这里会展示完整的图文排版预览。"

const estimateReadingTime = (markdown: string) => `${Math.max(3, Math.ceil(stripMarkdown(markdown).length / 320))} 分钟`

const findWriterAsset = (src: string, assets: WriterAsset[]) => {
  const match = /^writer-asset:\/\/(.+)$/.exec(src.trim())
  if (!match) return null
  return assets.find((asset) => asset.id === match[1]) ?? null
}

const findRenderableWriterAsset = (src: string, assets: WriterAsset[]) => {
  if (!src.trim()) return null
  return assets.find((asset) => asset.url === src.trim()) ?? null
}

const getPlatformPreviewPalette = (platform: WriterPlatform) => {
  if (platform === "wechat") return "from-emerald-50 via-white to-emerald-100/70"
  if (platform === "xiaohongshu") return "from-rose-50 via-white to-orange-50"
  if (platform === "x") return "from-slate-950 via-slate-900 to-slate-950"
  return "from-blue-50 via-white to-indigo-100/70"
}

const getPlatformShellClass = (platform: WriterPlatform) => {
  if (platform === "x") return "border-slate-200 bg-white/86 text-slate-950"
  if (platform === "facebook") return "border-blue-100 bg-white/88 text-slate-950"
  if (platform === "xiaohongshu") return "border-rose-100 bg-white/88 text-slate-950"
  return "border-emerald-100 bg-white/90 text-slate-950"
}

function renderMarkdown(content: string, assets: WriterAsset[], className?: string) {
  return (
    <div
      className={cn(
        "prose prose-neutral prose-lg max-w-none break-words",
        "prose-headings:font-semibold prose-headings:tracking-[-0.025em] prose-headings:text-slate-950",
        "prose-h1:mb-6 prose-h1:text-center prose-h1:font-serif prose-h1:text-[2.45rem] prose-h1:leading-[1.18]",
        "prose-h2:mt-12 prose-h2:border-t prose-h2:border-slate-200 prose-h2:pt-8 prose-h2:text-[1.55rem]",
        "prose-h3:mt-9 prose-h3:text-[1.18rem]",
        "prose-p:my-5 prose-p:text-[17px] prose-p:leading-[2] prose-p:text-slate-900",
        "prose-li:text-slate-900 prose-strong:text-slate-950 prose-a:text-blue-600",
        "prose-blockquote:border-l-4 prose-blockquote:border-slate-300 prose-blockquote:text-slate-700",
        "prose-hr:my-8 prose-hr:border-slate-200 prose-img:rounded-[28px] prose-img:shadow-sm",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img({ src, alt, ...props }) {
            if (typeof src !== "string" || !src.trim()) return null
            if (src.startsWith("data:image")) return null

            const writerAsset = findWriterAsset(src, assets) || findRenderableWriterAsset(src, assets)
            if (writerAsset) {
              return (
                <figure className="my-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="flex min-h-56 items-center justify-center bg-slate-100/60">
                    {writerAsset.url ? (
                      <img
                        src={writerAsset.url}
                        alt={alt || writerAsset.label}
                        {...props}
                        className="max-h-[420px] w-full object-cover"
                      />
                    ) : (
                      <div className="flex w-full flex-col items-center justify-center gap-2 px-5 py-12 text-center text-slate-500">
                        {writerAsset.status === "failed" ? null : <Loader2 className="h-5 w-5 animate-spin" />}
                        <p className="text-sm font-medium text-slate-700">{writerAsset.label}</p>
                        <p className="max-w-md text-xs leading-6">
                          {writerAsset.status === "failed"
                            ? "配图生成失败，请稍后重试。"
                            : `${writerAsset.title} 正在生成，完成后会直接出现在正文对应位置。`}
                        </p>
                      </div>
                    )}
                  </div>
                  <figcaption className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{writerAsset.label}</p>
                      <p className="text-xs text-slate-500">{writerAsset.title}</p>
                    </div>
                    <Badge
                      variant={writerAsset.url ? "secondary" : writerAsset.status === "failed" ? "destructive" : "outline"}
                      className="rounded-full px-2.5 py-0.5 text-[10px]"
                    >
                      {writerAsset.url ? "已生成" : writerAsset.status === "failed" ? "失败" : "生成中"}
                    </Badge>
                  </figcaption>
                </figure>
              )
            }

            return (
              <img
                src={src}
                alt={alt || ""}
                {...props}
                className="my-6 max-h-[420px] w-full rounded-[24px] border border-slate-200 bg-slate-50 object-cover shadow-sm"
              />
            )
          },
          p({ children }) {
            return <p className="whitespace-pre-wrap break-words">{children}</p>
          },
          ul({ children }) {
            return <ul className="my-4 space-y-2">{children}</ul>
          },
          ol({ children }) {
            return <ol className="my-4 space-y-2">{children}</ol>
          },
          hr() {
            return <hr className="my-8 border-slate-200" />
          },
          code({ children }) {
            return <code className="break-words rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] text-slate-900">{children}</code>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function SocialStatRow() {
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircleMore className="h-3.5 w-3.5" />
          128
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Repeat2 className="h-3.5 w-3.5" />
          42
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5" />
          316
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5" />
          9
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        分享
      </span>
    </div>
  )
}

function PlatformPreview({
  platform,
  mode,
  markdown,
  assets,
  copyHint,
}: {
  platform: WriterPlatform
  mode: WriterMode
  markdown: string
  assets: WriterAsset[]
  copyHint: string
}) {
  const title = extractTitle(markdown)
  const lead = extractLead(markdown)
  const threadPosts = mode === "thread" ? parseThread(markdown) : []

  if (platform === "wechat") {
    return (
      <div className="mx-auto max-w-[760px] rounded-[40px] border border-emerald-100/80 bg-white px-10 py-12 shadow-[0_30px_100px_-52px_rgba(16,185,129,0.22)]">
        <div className="border-b border-emerald-100 pb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <BookText className="h-6 w-6" />
          </div>
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-700">微信公众号文章预览</p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance font-serif text-[2.3rem] font-semibold leading-tight text-black">{title}</h2>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-8 text-slate-600">{lead}</p>
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400">
            <span>AI Marketing Weekly</span>
            <span>·</span>
            <span>{estimateReadingTime(markdown)}</span>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-[640px]">
          {renderMarkdown(
            markdown,
            assets,
            "prose-p:text-black prose-li:text-black prose-strong:text-black prose-blockquote:bg-emerald-50/70 prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:not-italic",
          )}
        </div>
      </div>
    )
  }

  if (platform === "xiaohongshu") {
    return (
      <div className="mx-auto max-w-[430px] rounded-[40px] border border-rose-100 bg-[#fff7f6] p-4 shadow-[0_28px_90px_-48px_rgba(244,114,182,0.32)]">
        <div className="overflow-hidden rounded-[30px] bg-white shadow-sm">
          <div className="border-b border-rose-100/80 px-5 py-5">
            <div className="mb-4 flex items-center justify-between">
              <Badge className="rounded-full bg-rose-500 px-3 py-1 text-[11px] text-white hover:bg-rose-500">小红书图文</Badge>
              <span className="text-[11px] text-slate-400">适合收藏的图文笔记</span>
            </div>
            <h2 className="text-center text-balance font-serif text-[1.95rem] font-semibold leading-tight text-black">{title}</h2>
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-[15px] leading-7 text-slate-700">{lead}</p>
          </div>
          <div className="px-5 py-5">
            {renderMarkdown(
              markdown,
              assets,
              "prose-p:text-black prose-li:text-black prose-strong:text-rose-700 prose-h1:text-center prose-h2:border-0 prose-h2:pt-0 prose-blockquote:bg-rose-50 prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:not-italic",
            )}
          </div>
          <div className="border-t border-rose-100/80 px-5 py-3 text-xs text-slate-500">#AI营销 #内容创作 #效率工具</div>
        </div>
      </div>
    )
  }

  if (platform === "x") {
    const posts = mode === "thread" && threadPosts.length > 0 ? threadPosts : [markdown]
    return (
      <div className="mx-auto max-w-[760px] space-y-4">
        {posts.map((post, index) => (
          <div key={`${index}_${post.slice(0, 12)}`} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-11 w-11 rounded-full bg-slate-900" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-black">AI Marketing Site</p>
                  <p className="text-xs text-slate-500">@aimarketingsite</p>
                  <span className="text-slate-300">·</span>
                  <p className="text-xs text-slate-500">{mode === "thread" ? `Thread ${index + 1}` : "Just now"}</p>
                </div>
                {mode === "article" && index === 0 ? <p className="mt-2 text-xs text-slate-500">{lead}</p> : null}
                <div className="mt-4">
                  {renderMarkdown(
                    post,
                    assets,
                    "prose-p:text-black prose-li:text-black prose-strong:text-black prose-h1:text-left prose-h1:text-[1.8rem] prose-h2:border-0 prose-h2:pt-0",
                  )}
                </div>
                <SocialStatRow />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const posts = mode === "thread" && threadPosts.length > 0 ? threadPosts : [markdown]
  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      {posts.map((post, index) => (
        <div key={`${index}_${post.slice(0, 12)}`} className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-[0_28px_90px_-48px_rgba(59,130,246,0.25)]">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-11 w-11 rounded-full bg-blue-600/90" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-black">AI Marketing Site</p>
                <p className="text-xs text-slate-500">Follow</p>
                <span className="text-slate-300">·</span>
                <p className="text-xs text-slate-500">{mode === "thread" ? `Post ${index + 1}` : estimateReadingTime(post)}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">{index === 0 ? lead : "多段帖文预览"}</p>
              <div className="mt-4">
                {renderMarkdown(
                  post,
                  assets,
                  "prose-p:text-black prose-li:text-black prose-strong:text-black prose-h1:text-left prose-h1:text-[1.8rem] prose-h2:border-0 prose-h2:pt-0",
                )}
              </div>
              <SocialStatRow />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PreviewResourceStrip({
  assets,
  assetsLoading,
  assetsError,
  onDownload,
  onCopyLink,
  onCopyMarkdown,
}: {
  assets: WriterAsset[]
  assetsLoading: boolean
  assetsError: string | null
  onDownload: (asset: WriterAsset) => void | Promise<void>
  onCopyLink: (asset: WriterAsset) => Promise<void>
  onCopyMarkdown: (asset: WriterAsset) => Promise<void>
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">发布资源工具条</p>
          <p className="mt-1 text-xs text-slate-500">图片已经内联到正文预览。这里仅保留下载、图链复制和 Markdown 图片片段复制。</p>
        </div>
        <Badge variant={assetsLoading ? "outline" : "secondary"} className="rounded-full px-3 py-1 text-[11px]">
          {assetsLoading ? "图片生成中" : "OpenRouter · Nano Banana"}
        </Badge>
      </div>
      {assetsError ? (
        <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
          图片生成失败：{assetsError}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {assets.map((asset) => (
          <div key={asset.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
            {asset.url ? (
              <img src={asset.url} alt={asset.label} className="h-20 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-3 text-center text-xs text-slate-500">
                {asset.status === "failed" ? "该配图生成失败" : assetsLoading ? "生成中..." : "等待图片"}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{asset.label}</p>
                <p className="text-[11px] text-slate-500">{asset.title}</p>
              </div>
              <Badge
                variant={asset.url ? "secondary" : asset.status === "failed" ? "destructive" : "outline"}
                className="rounded-full px-2 py-0 text-[10px]"
              >
                {asset.url ? "完成" : asset.status === "failed" ? "失败" : "等待"}
              </Badge>
            </div>
            {asset.error ? <p className="mt-2 text-[11px] leading-5 text-destructive">{asset.error}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="rounded-full border-slate-400 bg-slate-950 text-white hover:bg-slate-800 hover:text-white" onClick={() => onDownload(asset)} disabled={!asset.url}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载
              </Button>
              <Button size="sm" variant="outline" className="rounded-full border-slate-300 bg-white text-slate-950 hover:bg-slate-100" onClick={() => void onCopyLink(asset)} disabled={!asset.url}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                图链
              </Button>
              <Button size="sm" variant="outline" className="rounded-full border-slate-300 bg-white text-slate-950 hover:bg-slate-100" onClick={() => void onCopyMarkdown(asset)} disabled={!asset.url}>
                <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                Markdown
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function WriterWorkspace({
  initialConversationId,
  initialPlatform,
  initialMode,
}: {
  initialConversationId: string | null
  initialPlatform?: string | null
  initialMode?: string | null
}) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [availabilityReady, setAvailabilityReady] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [platform, setPlatform] = useState<WriterPlatform>(() => normalizeWriterPlatform(initialPlatform))
  const [mode, setMode] = useState<WriterMode>(() =>
    normalizeWriterMode(normalizeWriterPlatform(initialPlatform), initialMode),
  )
  const [inputValue, setInputValue] = useState("")
  const [messages, setMessages] = useState<WriterMessage[]>([])
  const [draft, setDraft] = useState("")
  const [assets, setAssets] = useState<WriterAsset[]>(() =>
    buildPendingWriterAssets("", normalizeWriterPlatform(initialPlatform)),
  )
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isConversationLoading, setIsConversationLoading] = useState(Boolean(initialConversationId))
  const [previewOpen, setPreviewOpen] = useState(false)

  const replaceWriterUrl = (href: string) => {
    if (typeof window === "undefined") return
    window.history.replaceState(window.history.state, "", href)
  }

  useEffect(() => {
    setConversationId(initialConversationId)
  }, [initialConversationId])

  useEffect(() => {
    const nextPlatform = normalizeWriterPlatform(initialPlatform)
    setPlatform(nextPlatform)
    setMode(normalizeWriterMode(nextPlatform, initialMode))
  }, [initialMode, initialPlatform])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const verify = async () => {
      try {
        const response = await fetch("/api/writer/availability", { signal: controller.signal })
        const data = response.ok ? await response.json() : null
        if (!cancelled && data?.data?.enabled) {
          setAvailabilityReady(true)
          return
        }
        if (!cancelled) router.replace(user ? "/dashboard" : "/login")
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === "AbortError") return
        if (!cancelled) router.replace(user ? "/dashboard" : "/login")
      } finally {
        if (!cancelled) setAvailabilityLoading(false)
      }
    }

    void verify()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [router, user])

  const writerConfig = WRITER_PLATFORM_CONFIG[platform]
  const writerModeOptions = useMemo(() => getWriterModeOptions(platform), [platform])
  const baseDraft = useMemo(() => draft || inferDraft(messages), [draft, messages])
  const renderableDraft = useMemo(() => resolveWriterAssetMarkdown(baseDraft, assets), [assets, baseDraft])
  const threadSegments = useMemo(() => parseThread(renderableDraft || draft), [draft, renderableDraft])

  useEffect(() => {
    if (typeof window === "undefined") return
    const nextHref = `${conversationId ? `/dashboard/writer/${conversationId}` : "/dashboard/writer"}?${new URLSearchParams({ platform, mode }).toString()}`
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (currentHref !== nextHref) replaceWriterUrl(nextHref)
  }, [conversationId, mode, platform])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setDraft("")
      setIsConversationLoading(false)
      return
    }

    setIsConversationLoading(true)
    const meta = getWriterSessionMeta(conversationId)
    if (meta) {
      setPlatform(meta.platform)
      setMode(normalizeWriterMode(meta.platform, meta.mode))
      if (meta.draft) setDraft(meta.draft)
    }

    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/writer/messages?conversation_id=${conversationId}&limit=100`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        const nextMessages: WriterMessage[] = []
        ;(data.data || []).reverse().forEach((message: any) => {
          nextMessages.push({
            id: `user_${message.id}`,
            conversation_id: message.conversation_id,
            role: "user",
            content: message.query || message.inputs?.contents || "",
          })
          nextMessages.push({
            id: `assistant_${message.id}`,
            conversation_id: message.conversation_id,
            role: "assistant",
            content: sanitize(message.answer || ""),
            authorLabel: WRITER_ASSISTANT_NAME,
          })
        })
        setMessages(nextMessages)
        if (!meta?.draft) setDraft(inferDraft(nextMessages))
      } catch {
        if (cancelled) return
        setMessages([
          {
            id: `error_${Date.now()}`,
            conversation_id: conversationId,
            role: "assistant",
            content: "会话历史加载失败，请稍后重试。",
            authorLabel: WRITER_ASSISTANT_NAME,
          },
        ])
      } finally {
        if (!cancelled) setIsConversationLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    if (conversationId) {
      saveWriterSessionMeta(conversationId, { platform, mode, draft, updatedAt: Date.now() })
    }
  }, [conversationId, draft, mode, platform])

  useEffect(() => {
    const viewport = viewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [isLoading, messages])

  useEffect(() => {
    if (draft.trim()) setPreviewOpen(true)
  }, [draft])

  useEffect(() => {
    setAssetsError(null)
    if (!baseDraft.trim()) {
      setAssets(buildPendingWriterAssets("", platform))
      setAssetsLoading(false)
      return
    }

    if (!hasWriterAssetPlaceholders(baseDraft)) {
      setAssets(extractWriterAssetsFromMarkdown(baseDraft, platform))
      setAssetsLoading(false)
      return
    }

    const pendingAssets = buildPendingWriterAssets(baseDraft, platform)
    setAssets(pendingAssets)

    let cancelled = false

    const loadAssets = async () => {
      try {
        setAssetsLoading(true)
        const response = await fetch("/api/writer/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: baseDraft, platform, conversationId }),
        })
        const data = await response.json().catch(() => null)
        const nextAssets = Array.isArray(data?.data?.assets) ? (data.data.assets as WriterAsset[]) : []

        if (!cancelled && nextAssets.length > 0) {
          setAssets(nextAssets)

          const resolvedMarkdown = resolveWriterAssetMarkdown(baseDraft, nextAssets)
          if (resolvedMarkdown && resolvedMarkdown !== baseDraft) {
            setDraft(resolvedMarkdown)
            setMessages((current) => {
              const next = [...current]
              for (let index = next.length - 1; index >= 0; index -= 1) {
                if (next[index]?.role === "assistant") {
                  next[index] = {
                    ...next[index],
                    content: resolvedMarkdown,
                    authorLabel: WRITER_ASSISTANT_NAME,
                  }
                  break
                }
              }
              return next
            })

            if (conversationId) {
              void fetch("/api/writer/messages", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversation_id: conversationId, content: resolvedMarkdown }),
              }).catch(() => null)
            }
          }
        }

        if (!response.ok) {
          throw new Error(data?.error || `HTTP ${response.status}`)
        }

        if (!cancelled && nextAssets.length === 0) {
          throw new Error("图片生成结果为空")
        }
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "图片生成失败"
        setAssetsError(message)
        setAssets(markWriterAssetsFailed(pendingAssets, message))
      } finally {
        if (!cancelled) setAssetsLoading(false)
      }
    }

    void loadAssets()
    return () => {
      cancelled = true
    }
  }, [baseDraft, conversationId, platform])

  const patchAssistantMessage = (id: string, content: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content, authorLabel: WRITER_ASSISTANT_NAME } : message,
      ),
    )
  }

  const handleCreateConversation = () => {
    setConversationId(null)
    setMessages([])
    setDraft("")
    setInputValue("")
    setPreviewOpen(false)
    setAssetsError(null)
    setAssets(buildPendingWriterAssets("", platform))
    emitWriterRefresh()
    router.push(`/dashboard/writer?platform=${platform}&mode=${mode}`)
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const query = inputValue.trim()
    const assistantId = `writer_assistant_${Date.now()}`
    setInputValue("")
    setIsLoading(true)
    setMessages((current) => [
      ...current,
      { id: `writer_user_${Date.now()}`, conversation_id: conversationId || "", role: "user", content: query },
      { id: assistantId, conversation_id: conversationId || "", role: "assistant", content: "", authorLabel: WRITER_ASSISTANT_NAME },
    ])

    try {
      const response = await fetch("/api/writer/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          inputs: { contents: query },
          response_mode: "streaming",
          conversation_id: conversationId,
          platform,
          mode,
        }),
      })

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let streamBuffer = ""
      let accumulated = ""
      let nextConversationId: string | null = null

      const onEvent = (dataObj: any) => {
        if (dataObj?.task_id) currentTaskIdRef.current = dataObj.task_id
        if (dataObj?.conversation_id && !nextConversationId && !conversationId) {
          nextConversationId = dataObj.conversation_id
          setConversationId(dataObj.conversation_id)
        }
        if (["message", "agent_message", "text_chunk"].includes(dataObj?.event)) {
          const chunk = extractText(dataObj.answer) || extractText(dataObj.data?.text)
          if (chunk) {
            accumulated += chunk
            patchAssistantMessage(assistantId, sanitize(accumulated))
          }
        } else if (dataObj?.event === "workflow_finished" && !accumulated) {
          const workflowText = extractText(dataObj?.data?.outputs)
          if (workflowText) {
            accumulated = workflowText
            patchAssistantMessage(assistantId, sanitize(accumulated))
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        streamBuffer += decoder.decode(value, { stream: true })
        const parsed = extractSSEBlocks(streamBuffer)
        streamBuffer = parsed.rest
        parsed.blocks.forEach((block) => {
          const dataObj = getSSEDataFromBlock(block)
          if (dataObj) onEvent(dataObj)
        })
      }

      const finalDraft = sanitize(accumulated)
      if (finalDraft) {
        setDraft(finalDraft)
        setPreviewOpen(true)
      }
      if (nextConversationId) {
        saveWriterSessionMeta(nextConversationId, { platform, mode, draft: finalDraft, updatedAt: Date.now() })
        replaceWriterUrl(`/dashboard/writer/${nextConversationId}?platform=${platform}&mode=${mode}`)
      }
      emitWriterRefresh()
    } catch (error) {
      patchAssistantMessage(assistantId, `请求失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      currentTaskIdRef.current = null
      setIsLoading(false)
    }
  }

  const handleStop = async () => {
    if (!currentTaskIdRef.current) return
    await fetch(`/api/writer/chat/${currentTaskIdRef.current}/stop`, { method: "POST" })
    currentTaskIdRef.current = null
    setIsLoading(false)
  }

  const handleCopyText = async () => {
    if (draft.trim()) await navigator.clipboard.writeText(stripMarkdown(draft))
  }

  const handleCopyMarkdown = async () => {
    if (draft.trim()) await navigator.clipboard.writeText(renderableDraft || draft)
  }

  const handleCopyAssetLink = async (asset: WriterAsset) => {
    if (!asset.url) return
    await navigator.clipboard.writeText(asset.url)
  }

  const handleCopyAssetMarkdown = async (asset: WriterAsset) => {
    if (!asset.url) return
    await navigator.clipboard.writeText(`![${asset.label}](${asset.url})`)
  }

  const handleDownloadAsset = async (asset: WriterAsset) => {
    if (!asset.url) return
    const response = await fetch(asset.url)
    if (!response.ok) return
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = blobUrl
    link.download = `${platform}-${asset.id}.png`
    link.click()
    URL.revokeObjectURL(blobUrl)
  }

  const composerDisabled = loading || availabilityLoading || !availabilityReady
  const hasDraft = Boolean(draft.trim())
  const currentModeLabel = writerModeOptions.find((option) => option.value === mode)?.label || "标准图文"
  const previewMarkdown =
    mode === "thread" && threadSegments.length > 0
      ? resolveWriterAssetMarkdown(
          threadSegments.map((segment, index) => `### 第 ${index + 1} 段\n${segment}`).join("\n\n"),
          assets,
        )
      : renderableDraft || "_文章生成后，这里会展示和目标平台更接近的图文排版预览。_"

  return (
    <>
      <div className="flex h-[calc(100vh-65px)] flex-col bg-background lg:h-screen">
        <header className="border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm lg:px-6">
          <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">文章写作</Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">统一入口</Badge>
              </div>
              <h1 className="font-sans text-lg font-bold text-foreground lg:text-xl">多平台图文写作工作台</h1>
              <p className="mt-1 text-sm text-muted-foreground">预览区会按目标平台的视觉结构渲染成图文合一的成品，而不是单纯的 Markdown 文档。</p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={() => setPreviewOpen(true)} disabled={!hasDraft}>
              <Eye className="mr-2 h-4 w-4" />
              预览抽屉
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden bg-muted/10">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 px-4 py-3 lg:px-6 lg:py-4">
            <section className="rounded-3xl border bg-card/90 px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">对话工作流</p>
                    <p className="text-xs text-muted-foreground">
                      {loading
                        ? "正在校验登录状态..."
                        : availabilityLoading
                          ? "正在检查写作能力..."
                          : isConversationLoading
                            ? "正在恢复会话内容..."
                            : hasDraft
                              ? "草稿已生成，右侧会展示图文合一的平台化预览。"
                              : "从下方输入需求开始写作。"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">{writerConfig.shortLabel}</Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">{currentModeLabel}</Badge>
                </div>
              </div>
            </section>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border bg-card shadow-sm">
              <ScrollArea className="h-full" ref={viewportRef}>
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5 lg:px-6">
                  {messages.length === 0 && !isConversationLoading ? (
                    <div className="space-y-4 rounded-[28px] border border-dashed bg-muted/30 p-6">
                      <div className="flex items-center gap-2 text-primary">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-sm font-semibold">推荐起稿方式</span>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        {[
                          "围绕 AI 客服 Agent 写一篇适合公众号发布的专业长文，包含趋势、案例、落地建议和配图说明。",
                          "围绕 AI 副业工具推荐写一篇适合小红书的图文笔记，标题要有收藏感，正文要有具体工具和行动建议。",
                          "写一组适合 X / Facebook 发布的 AI 创业观察线程，包含 hook、核心观点和结尾 CTA。",
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => setInputValue(prompt)}
                            className="rounded-2xl border bg-background px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                          >
                            <p className="text-xs leading-5 text-muted-foreground">{prompt}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {isConversationLoading ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在恢复当前会话...
                    </div>
                  ) : null}

                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[92%] overflow-hidden rounded-3xl px-4 py-3 text-sm shadow-sm lg:max-w-[82%]",
                          message.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border/70 bg-background text-foreground",
                        )}
                      >
                        <div className={cn(message.role === "assistant" ? "mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground" : "mb-2 text-[11px] font-medium opacity-80")}>
                          {message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                          {message.authorLabel || "你"}
                        </div>
                        {renderMarkdown(
                          message.role === "assistant" ? resolveWriterAssetMarkdown(message.content, assets) : message.content,
                          assets,
                          message.role === "assistant"
                            ? "prose-headings:mt-3 prose-p:my-2 prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground"
                            : "prose-invert prose-p:my-2 prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-li:text-primary-foreground",
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoading ? (
                    <div className="flex justify-start">
                      <div className="rounded-3xl rounded-bl-md border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm">
                        <span className="animate-pulse">正在生成图文草稿...</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>

            <section className="rounded-[28px] border bg-background/95 p-3 shadow-xl backdrop-blur">
              <div className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <select
                    value={platform}
                    onChange={(event) => {
                      const nextPlatform = event.target.value as WriterPlatform
                      setPlatform(nextPlatform)
                      setMode(normalizeWriterMode(nextPlatform, mode))
                    }}
                    className="h-11 rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-colors focus:border-primary"
                    disabled={composerDisabled || isLoading}
                  >
                    {WRITER_PLATFORM_ORDER.map((item) => (
                      <option key={item} value={item}>{WRITER_PLATFORM_CONFIG[item].shortLabel}</option>
                    ))}
                  </select>
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as WriterMode)}
                    className="h-11 rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition-colors focus:border-primary"
                    disabled={composerDisabled || isLoading}
                  >
                    {writerModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 lg:ml-auto">
                    <Button variant="ghost" className="rounded-full" onClick={handleCreateConversation}>新建</Button>
                    <Button variant="outline" className="rounded-full" onClick={() => setPreviewOpen(true)} disabled={!hasDraft}>
                      <Eye className="mr-2 h-4 w-4" />
                      打开预览
                    </Button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-border/70 bg-card">
                  <Textarea
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder={`告诉我你要写什么，我会按 ${writerConfig.shortLabel} 的发布方式起稿。可以补充受众、语气、篇幅、是否要配图和 CTA。`}
                    className="min-h-28 resize-none border-0 bg-transparent px-4 py-4 text-sm shadow-none focus-visible:ring-0"
                    disabled={composerDisabled}
                  />
                  <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <p className="text-xs leading-5 text-muted-foreground">
                      当前生成目标：{writerConfig.shortLabel} · {currentModeLabel}
                      {composerDisabled ? " · 正在准备工作台能力" : " · 支持图文成品预览、配图生成和发布包复制"}
                    </p>
                    {isLoading ? (
                      <Button variant="destructive" className="rounded-full" onClick={handleStop}>
                        <Square className="mr-2 h-4 w-4 fill-current" />
                        停止生成
                      </Button>
                    ) : (
                      <Button className="rounded-full" onClick={() => void handleSend()} disabled={!inputValue.trim() || composerDisabled}>
                        <Send className="mr-2 h-4 w-4" />
                        发送需求
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[880px]">
          <div className={cn("h-full bg-gradient-to-b", getPlatformPreviewPalette(platform))}>
            <SheetHeader className="border-b bg-white/80 px-5 py-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div>
                  <SheetTitle>{writerConfig.shortLabel} 成品预览</SheetTitle>
                  <SheetDescription>图文已合并为单一预览视图，并尽量贴近目标平台的阅读和排版方式。</SheetDescription>
                </div>
                <Button variant="outline" className="rounded-full border-slate-300 bg-white text-slate-950 hover:bg-slate-100" onClick={() => setPreviewOpen(false)}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  收起
                </Button>
              </div>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-88px)]">
              <div className="space-y-5 p-5">
                <div
                  className={cn(
                    "space-y-4 rounded-[32px] border p-5 shadow-[0_30px_100px_-60px_rgba(15,23,42,0.55)]",
                    getPlatformShellClass(platform),
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{writerConfig.shortLabel} 平台化成品预览</p>
                      <p className="mt-1 text-xs text-slate-500">正文和图片已经合并在同一阅读流里，下面就是最终发布形态的近似预览。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">{currentModeLabel}</Badge>
                      <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">{estimateReadingTime(previewMarkdown)}</Badge>
                      <Button
                        variant="default"
                        className="rounded-full border border-slate-950 bg-slate-950 text-white shadow-sm hover:bg-slate-800"
                        onClick={() => void handleCopyText()}
                        disabled={!hasDraft}
                      >
                        <BookText className="mr-2 h-4 w-4" />
                        复制纯文本
                      </Button>
                      <Button
                        variant="secondary"
                        className="rounded-full border border-slate-400 bg-white text-slate-950 shadow-sm hover:bg-slate-100"
                        onClick={() => void handleCopyMarkdown()}
                        disabled={!hasDraft}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        复制 Markdown
                      </Button>
                    </div>
                  </div>

                  <PlatformPreview
                    platform={platform}
                    mode={mode}
                    markdown={previewMarkdown}
                    assets={assets}
                    copyHint={writerConfig.copyHint}
                  />
                  <PreviewResourceStrip
                    assets={assets}
                    assetsLoading={assetsLoading}
                    assetsError={assetsError}
                    onDownload={handleDownloadAsset}
                    onCopyLink={handleCopyAssetLink}
                    onCopyMarkdown={handleCopyAssetMarkdown}
                  />
                </div>
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
