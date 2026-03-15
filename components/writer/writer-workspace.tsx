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
  markWriterAssetsFailed,
  resolveWriterAssetMarkdown,
  type WriterAsset,
} from "@/lib/writer/assets"
import {
  DEFAULT_WRITER_LANGUAGE,
  WRITER_LANGUAGE_CONFIG,
  WRITER_LANGUAGE_ORDER,
  normalizeWriterLanguage,
  getWriterModeOptions,
  normalizeWriterMode,
  normalizeWriterPlatform,
  WRITER_PLATFORM_CONFIG,
  WRITER_PLATFORM_ORDER,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import { emitWriterRefresh, getWriterSessionMeta, saveWriterSessionMeta } from "@/lib/writer/session-store"
import type { WriterConversationSummary, WriterHistoryEntry, WriterMessagePage } from "@/lib/writer/types"
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
    .find((block) => block && block !== extractTitle(markdown)) || "文章生成后，这里会展示完整的图文排版预览。"

const estimateReadingTime = (markdown: string) => `${Math.max(3, Math.ceil(stripMarkdown(markdown).length / 320))} 分钟`
const composeThreadMarkdown = (segments: string[]) =>
  segments.map((segment, index) => `### 第 ${index + 1} 段\n${segment.trim()}`).join("\n\n")

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
                <figure className="my-8 overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-black/5">
                  <div className="flex min-h-56 items-center justify-center bg-slate-100/60">
                    {writerAsset.url ? (
                      <img
                        src={writerAsset.url}
                        alt={alt || "文章配图"}
                        {...props}
                        className="max-h-[420px] w-full object-cover"
                      />
                    ) : (
                      <div className="flex w-full flex-col items-center justify-center gap-2 px-5 py-12 text-center text-slate-500">
                        {writerAsset.status === "failed" ? null : <Loader2 className="h-5 w-5 animate-spin" />}
                        <p className="text-sm font-medium text-slate-700">
                          {writerAsset.status === "failed" ? "配图暂时不可用" : "配图生成中"}
                        </p>
                      </div>
                    )}
                  </div>
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
  editable = false,
  onEditChange,
  onEditCommit,
  saveState,
}: {
  platform: WriterPlatform
  mode: WriterMode
  markdown: string
  assets: WriterAsset[]
  editable?: boolean
  onEditChange?: (next: string) => void
  onEditCommit?: () => void
  saveState?: "idle" | "saving" | "saved" | "error"
}) {
  const lead = extractLead(markdown)
  const threadPosts = mode === "thread" ? parseThread(markdown) : []
  const renderArticleBody = (value: string, className?: string) =>
    editable && onEditChange && onEditCommit ? (
      <InlineMarkdownCanvas markdown={value} assets={assets} onChange={onEditChange} onCommit={onEditCommit} saveState={saveState} />
    ) : (
      renderMarkdown(value, assets, className)
    )

  if (platform === "wechat") {
    return (
      <div className="mx-auto max-w-[760px] rounded-[40px] border border-emerald-100/80 bg-white px-10 py-12 shadow-[0_30px_100px_-52px_rgba(16,185,129,0.22)]">
        <div className="border-b border-emerald-100 pb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <BookText className="h-6 w-6" />
          </div>
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-700">微信公众号文章预览</p>
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400">
            <span>AI Marketing Weekly</span>
            <span>·</span>
            <span>{estimateReadingTime(markdown)}</span>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-[640px]">
          {renderArticleBody(
            markdown,
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
          </div>
          <div className="px-5 py-5">
            {renderArticleBody(
              markdown,
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
                  {editable && onEditChange && onEditCommit ? (
                    <InlineMarkdownCanvas
                      markdown={post}
                      assets={assets}
                      onChange={(next) => {
                        const nextPosts = [...posts]
                        nextPosts[index] = next
                        onEditChange(composeThreadMarkdown(nextPosts))
                      }}
                      onCommit={onEditCommit}
                      saveState={saveState}
                    />
                  ) : (
                    renderMarkdown(
                      post,
                      assets,
                      "prose-p:text-black prose-li:text-black prose-strong:text-black prose-h1:text-left prose-h1:text-[1.8rem] prose-h2:border-0 prose-h2:pt-0",
                    )
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
                {editable && onEditChange && onEditCommit ? (
                  <InlineMarkdownCanvas
                    markdown={post}
                    assets={assets}
                    onChange={(next) => {
                      const nextPosts = [...posts]
                      nextPosts[index] = next
                      onEditChange(composeThreadMarkdown(nextPosts))
                    }}
                    onCommit={onEditCommit}
                    saveState={saveState}
                  />
                ) : (
                  renderMarkdown(
                    post,
                    assets,
                    "prose-p:text-black prose-li:text-black prose-strong:text-black prose-h1:text-left prose-h1:text-[1.8rem] prose-h2:border-0 prose-h2:pt-0",
                  )
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
  const visibleAssets = assets.filter((asset) => asset.url)

  if (!assetsLoading && !assetsError && visibleAssets.length === 0) return null

  return (
    <div className="rounded-[24px] border border-slate-300 bg-white p-4 shadow-[0_18px_60px_-36px_rgba(15,23,42,0.28)] ring-1 ring-slate-950/6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">图片操作</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">正文中已经按文章样式展示图片，这里只保留发布时需要的下载与复制操作。</p>
        </div>
        <Badge
          variant={assetsLoading ? "outline" : "secondary"}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-medium",
            assetsLoading
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-900",
          )}
        >
          {assetsLoading ? "图片生成中" : "Gemini 3.1 Flash Image Preview"}
        </Badge>
      </div>
      {assetsError ? (
        <div className="mt-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium leading-5 text-destructive">
          图片生成失败：{assetsError}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(visibleAssets.length > 0 ? visibleAssets : assets).map((asset) => (
          <div key={asset.id} className="rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.35)]">
            {asset.url ? (
              <img src={asset.url} alt="发布配图" className="h-24 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-3 text-center text-xs font-medium text-slate-700">
                {asset.status === "failed" ? "配图暂不可用" : assetsLoading ? "生成中..." : "等待图片"}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="rounded-full border-slate-950 bg-slate-950 text-white hover:bg-slate-800 hover:text-white" onClick={() => onDownload(asset)} disabled={!asset.url}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载
              </Button>
              <Button size="sm" variant="outline" className="rounded-full border-slate-400 bg-white text-slate-950 hover:bg-slate-100" onClick={() => void onCopyLink(asset)} disabled={!asset.url}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                图链
              </Button>
              <Button size="sm" variant="outline" className="rounded-full border-slate-400 bg-white text-slate-950 hover:bg-slate-100" onClick={() => void onCopyMarkdown(asset)} disabled={!asset.url}>
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

const mapHistoryEntriesToMessages = (entries: WriterHistoryEntry[]): WriterMessage[] =>
  entries.flatMap((message) => [
    {
      id: `user_${message.id}`,
      conversation_id: message.conversation_id,
      role: "user" as const,
      content: message.query || message.inputs?.contents || "",
    },
    {
      id: `assistant_${message.id}`,
      conversation_id: message.conversation_id,
      role: "assistant" as const,
      content: sanitize(message.answer || ""),
      authorLabel: WRITER_ASSISTANT_NAME,
    },
  ])

const COPYABLE_STYLE_PROPS = [
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "display",
  "gap",
  "justify-content",
  "align-items",
  "max-width",
  "min-height",
  "box-shadow",
  "white-space",
  "list-style-type",
] as const

function buildClipboardHtmlFromPreview(node: HTMLElement) {
  const clone = node.cloneNode(true) as HTMLElement
  const originalElements = [node, ...Array.from(node.querySelectorAll<HTMLElement>("*"))]
  const clonedElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]

  originalElements.forEach((original, index) => {
    const target = clonedElements[index]
    if (!target) return

    const computed = window.getComputedStyle(original)
    const style = COPYABLE_STYLE_PROPS.map((prop) => `${prop}:${computed.getPropertyValue(prop)};`).join("")
    target.setAttribute("style", style)
    target.removeAttribute("class")
  })

  return `
    <html>
      <body style="margin:0;padding:24px;background:#ffffff;">
        ${clone.outerHTML}
      </body>
    </html>
  `.trim()
}

function InlineMarkdownCanvas({
  markdown,
  assets,
  onChange,
  onCommit,
  saveState,
}: {
  markdown: string
  assets: WriterAsset[]
  onChange: (next: string) => void
  onCommit: () => void
  saveState?: "idle" | "saving" | "saved" | "error"
}) {
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [activeValue, setActiveValue] = useState(markdown)

  useEffect(() => {
    if (!isEditing) {
      setActiveValue(markdown)
    }
  }, [isEditing, markdown])

  useEffect(() => {
    if (!isEditing || !editorRef.current) return
    const element = editorRef.current
    element.style.height = "0px"
    element.style.height = `${Math.max(element.scrollHeight, 320)}px`
  }, [isEditing, activeValue])

  const commitDraft = () => {
    onChange(activeValue)
    onCommit()
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="rounded-[24px] border border-slate-950/10 bg-white px-5 py-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.38)] ring-2 ring-slate-950/5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium tracking-[0.16em] text-slate-500">编辑文章内容</p>
            {saveState === "saving" ? (
              <span className="text-[11px] text-slate-400">保存中...</span>
            ) : saveState === "saved" ? (
              <span className="text-[11px] text-emerald-600">已保存</span>
            ) : saveState === "error" ? (
              <span className="text-[11px] text-destructive">保存失败</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Ctrl/Cmd + Enter</span>
            <Button
              size="sm"
              className="h-8 rounded-full bg-slate-950 px-3 text-[11px] text-white hover:bg-slate-800"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitDraft}
            >
              完成
            </Button>
          </div>
        </div>
        <Textarea
          ref={editorRef}
          autoFocus
          value={activeValue}
          onChange={(event) => setActiveValue(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault()
              commitDraft()
            }
            if (event.key === "Escape") {
              event.preventDefault()
              setActiveValue(markdown)
              setIsEditing(false)
            }
          }}
          className="min-h-[320px] resize-none rounded-[20px] border-0 bg-transparent px-0 py-0 font-serif text-[18px] leading-[2.05] tracking-[0.01em] text-slate-950 shadow-none focus-visible:ring-0"
        />
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="group block w-full rounded-[24px] border border-transparent text-left transition hover:border-slate-200 hover:bg-white/70 hover:shadow-[0_14px_36px_-30px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      onClick={() => setIsEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          setIsEditing(true)
        }
      }}
      aria-label="点击编辑整篇文章"
    >
      <div className="pointer-events-none px-2 py-1">
        <div className="mb-2 opacity-0 transition group-hover:opacity-100">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] tracking-[0.14em] text-slate-500">
            点击编辑整篇
          </span>
        </div>
        {renderMarkdown(markdown, assets)}
      </div>
    </div>
  )
}

export function WriterWorkspace({
  initialConversationId,
  initialPlatform,
  initialMode,
  initialLanguage,
}: {
  initialConversationId: string | null
  initialPlatform?: string | null
  initialMode?: string | null
  initialLanguage?: string | null
}) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const previewContentRef = useRef<HTMLDivElement | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)
  const historyRestoreRef = useRef<{ height: number; top: number } | null>(null)
  const shouldScrollToBottomRef = useRef(false)

  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [availabilityReady, setAvailabilityReady] = useState(false)
  const [knowledgeStatus, setKnowledgeStatus] = useState<{ enabled: boolean; datasetCount?: number; source?: string } | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [platform, setPlatform] = useState<WriterPlatform>(() => normalizeWriterPlatform(initialPlatform))
  const [mode, setMode] = useState<WriterMode>(() =>
    normalizeWriterMode(normalizeWriterPlatform(initialPlatform), initialMode),
  )
  const [language, setLanguage] = useState<WriterLanguage>(() => normalizeWriterLanguage(initialLanguage))
  const [inputValue, setInputValue] = useState("")
  const [messages, setMessages] = useState<WriterMessage[]>([])
  const [draft, setDraft] = useState("")
  const [assets, setAssets] = useState<WriterAsset[]>(() =>
    buildPendingWriterAssets(
      "",
      normalizeWriterPlatform(initialPlatform),
      normalizeWriterMode(normalizeWriterPlatform(initialPlatform), initialMode),
    ),
  )
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isConversationLoading, setIsConversationLoading] = useState(Boolean(initialConversationId))
  const [previewOpen, setPreviewOpen] = useState(false)
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [imagesRequested, setImagesRequested] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [conversationStatus, setConversationStatus] = useState<
    "drafting" | "text_ready" | "image_generating" | "ready" | "failed"
  >("drafting")

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
    setLanguage(normalizeWriterLanguage(initialLanguage))
  }, [initialLanguage, initialMode, initialPlatform])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const verify = async () => {
      try {
        const response = await fetch("/api/writer/availability", { signal: controller.signal })
        const data = response.ok ? await response.json() : null
        if (!cancelled && data?.data?.enabled) {
          setAvailabilityReady(true)
          setKnowledgeStatus(data?.data?.knowledge || null)
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
  const renderableDraft = useMemo(() => resolveWriterAssetMarkdown(baseDraft, assets, platform, mode), [assets, baseDraft, mode, platform])
  const threadSegments = useMemo(() => parseThread(renderableDraft || draft), [draft, renderableDraft])

  useEffect(() => {
    if (typeof window === "undefined") return
    const nextHref = `${conversationId ? `/dashboard/writer/${conversationId}` : "/dashboard/writer"}?${new URLSearchParams({ platform, mode, language }).toString()}`
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (currentHref !== nextHref) replaceWriterUrl(nextHref)
  }, [conversationId, language, mode, platform])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setDraft("")
      setHistoryCursor(null)
      setHasMoreHistory(false)
      setIsConversationLoading(false)
      return
    }

    setIsConversationLoading(true)
    setHistoryCursor(null)
    setHasMoreHistory(false)
    const meta = getWriterSessionMeta(conversationId)
    if (meta) {
      setPlatform(meta.platform)
      setMode(normalizeWriterMode(meta.platform, meta.mode))
      setLanguage(meta.language || DEFAULT_WRITER_LANGUAGE)
      if (meta.draft) setDraft(meta.draft)
      setImagesRequested(Boolean(meta.imagesRequested))
      setConversationStatus(meta.status || "drafting")
    }

    let cancelled = false

    const applyConversationPayload = (data: WriterMessagePage, reset: boolean) => {
      const nextMessages = mapHistoryEntriesToMessages(data.data || [])
      if (data.conversation) {
        setPlatform(normalizeWriterPlatform(data.conversation.platform))
        setMode(normalizeWriterMode(normalizeWriterPlatform(data.conversation.platform), data.conversation.mode))
        setLanguage(normalizeWriterLanguage(data.conversation.language))
        setImagesRequested(Boolean(data.conversation.images_requested))
        setConversationStatus(data.conversation.status || "drafting")
      }
      setHistoryCursor(data.next_cursor || null)
      setHasMoreHistory(Boolean(data.has_more))
      if (reset) shouldScrollToBottomRef.current = true
      setMessages((current) => (reset ? nextMessages : [...nextMessages, ...current]))
      if (reset && !meta?.draft) setDraft(inferDraft(nextMessages))
    }

    const load = async () => {
      try {
        const response = await fetch(`/api/writer/messages?conversation_id=${conversationId}&limit=20`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as WriterMessagePage
        if (cancelled) return
        applyConversationPayload(data, true)
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

  const loadOlderMessages = async () => {
    if (!conversationId || !historyCursor || isHistoryLoading) return

    const viewport = viewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (viewport) {
      historyRestoreRef.current = {
        height: viewport.scrollHeight,
        top: viewport.scrollTop,
      }
    }

    setIsHistoryLoading(true)
    try {
      const response = await fetch(`/api/writer/messages?conversation_id=${conversationId}&limit=20&cursor=${historyCursor}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as WriterMessagePage
      const nextMessages = mapHistoryEntriesToMessages(data.data || [])
      setHistoryCursor(data.next_cursor || null)
      setHasMoreHistory(Boolean(data.has_more))
      setMessages((current) => [...nextMessages, ...current])
    } catch (error) {
      console.error("Failed to load older writer messages", error)
      historyRestoreRef.current = null
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (conversationId) {
      saveWriterSessionMeta(conversationId, {
        platform,
        mode,
        language,
        draft,
        imagesRequested,
        status: conversationStatus,
        updatedAt: Date.now(),
      })
    }
  }, [conversationId, conversationStatus, draft, imagesRequested, language, mode, platform])

  useEffect(() => {
    const viewport = viewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (!viewport) return

    if (historyRestoreRef.current) {
      const { height, top } = historyRestoreRef.current
      viewport.scrollTop = viewport.scrollHeight - height + top
      historyRestoreRef.current = null
      return
    }

    if (shouldScrollToBottomRef.current || isLoading) {
      viewport.scrollTop = viewport.scrollHeight
      shouldScrollToBottomRef.current = false
    }
  }, [isLoading, messages])

  useEffect(() => {
    const element = composerRef.current
    if (!element) return
    element.style.height = "0px"
    element.style.height = `${Math.min(180, Math.max(56, element.scrollHeight))}px`
  }, [inputValue])

  useEffect(() => {
    if (!baseDraft.trim()) {
      setAssets([])
      setAssetsLoading(false)
      setImagesRequested(false)
      return
    }

    const extractedAssets = extractWriterAssetsFromMarkdown(baseDraft, platform, mode)
    if (extractedAssets.some((asset) => asset.url)) {
      setAssets(extractedAssets)
      setAssetsLoading(false)
      return
    }

    if (!imagesRequested) {
      setAssets([])
      setAssetsLoading(false)
      setAssetsError(null)
      return
    }

    setAssets(buildPendingWriterAssets(baseDraft, platform, mode))
    setAssetsLoading(false)
  }, [baseDraft, imagesRequested, mode, platform])

  const patchAssistantMessage = (id: string, content: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content, authorLabel: WRITER_ASSISTANT_NAME } : message,
      ),
    )
  }

  const replaceLatestAssistantMessage = (content: string) => {
    setMessages((current) => {
      const next = [...current]
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index]?.role === "assistant") {
          next[index] = {
            ...next[index],
            content,
            authorLabel: WRITER_ASSISTANT_NAME,
          }
          break
        }
      }
      return next
    })
  }

  const handleCreateConversation = () => {
    setConversationId(null)
    setMessages([])
    setDraft("")
    setInputValue("")
    setPreviewOpen(false)
    setAssetsError(null)
    setAssets([])
    setImagesRequested(false)
    setConversationStatus("drafting")
    setDraftSaveState("idle")
    router.push(`/dashboard/writer?platform=${platform}&mode=${mode}&language=${language}`)
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const query = inputValue.trim()
    const assistantId = `writer_assistant_${Date.now()}`
    setInputValue("")
    setIsLoading(true)
    setImagesRequested(false)
    setConversationStatus("drafting")
    setAssets([])
    setAssetsError(null)
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
          language,
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
        if (dataObj?.event === "conversation_init" && dataObj?.conversation) {
          const syncedConversation = dataObj.conversation as WriterConversationSummary
          emitWriterRefresh({
            action: "upsert",
            conversation: syncedConversation,
          })
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
        setConversationStatus("text_ready")
      }
      if (nextConversationId) {
        saveWriterSessionMeta(nextConversationId, {
          platform,
          mode,
          language,
          draft: finalDraft,
          imagesRequested: false,
          status: "text_ready",
          updatedAt: Date.now(),
        })
        replaceWriterUrl(`/dashboard/writer/${nextConversationId}?platform=${platform}&mode=${mode}&language=${language}`)
      }
    } catch (error) {
      setConversationStatus("failed")
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
    if (!draft.trim()) return

    const plainText = stripMarkdown(renderableDraft || draft)
    const previewNode = previewContentRef.current

    if (!previewNode || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      await navigator.clipboard.writeText(plainText)
      return
    }

    const richHtml = buildClipboardHtmlFromPreview(previewNode)
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([richHtml], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      }),
    ])
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

  const handleDraftChange = (nextDraft: string) => {
    setDraft(nextDraft)
    setDraftSaveState("idle")
    replaceLatestAssistantMessage(nextDraft)
  }

  const handleDraftBlur = () => {
    if (!conversationId || !draft.trim()) return
    setDraftSaveState("saving")
    void fetch("/api/writer/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, content: draft, status: imagesRequested ? "ready" : "text_ready", imagesRequested }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("save failed")
        setDraftSaveState("saved")
      })
      .catch(() => {
        setDraftSaveState("error")
      })
  }

  const handleGenerateAssets = async () => {
    if (!baseDraft.trim() || assetsLoading) return

    const pendingAssets = buildPendingWriterAssets(baseDraft, platform, mode)
    setPreviewOpen(true)
    setImagesRequested(true)
    setConversationStatus("image_generating")
    setAssetsError(null)
    setAssetsLoading(true)
    setAssets(pendingAssets)

    try {
      const response = await fetch("/api/writer/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: baseDraft, platform, mode, conversationId }),
      })
      const data = await response.json().catch(() => null)
      const nextAssets = Array.isArray(data?.data?.assets) ? (data.data.assets as WriterAsset[]) : []

      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`)
      }

      if (nextAssets.length === 0) {
        throw new Error("图片生成结果为空")
      }

      setAssets(nextAssets)
      setConversationStatus("ready")

      const resolvedMarkdown = resolveWriterAssetMarkdown(baseDraft, nextAssets, platform, mode)
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
            body: JSON.stringify({ conversation_id: conversationId, content: resolvedMarkdown, status: "ready", imagesRequested: true }),
          }).catch(() => null)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片生成失败"
      setConversationStatus("failed")
      setAssetsError(message)
      setAssets(markWriterAssetsFailed(pendingAssets, message))
    } finally {
      setAssetsLoading(false)
    }
  }

  const composerDisabled = loading || availabilityLoading || !availabilityReady
  const hasDraft = Boolean(draft.trim())
  const hasGeneratedImages = assets.some((asset) => Boolean(asset.url))
  const currentModeLabel = writerModeOptions.find((option) => option.value === mode)?.label || "标准图文"
  const currentLanguageLabel = WRITER_LANGUAGE_CONFIG[language].label
  const workspaceStatus = loading
    ? "正在校验登录状态..."
    : availabilityLoading
      ? "正在检查写作能力..."
      : isConversationLoading
        ? "正在恢复会话内容..."
        : conversationStatus === "image_generating"
          ? "图片生成中，生成完成后会自动合并到成品预览。"
          : conversationStatus === "ready"
            ? "图文稿已就绪，可继续微调并复制发布。"
            : conversationStatus === "failed"
              ? "本次生成失败，可修改要求后重新生成。"
              : hasDraft
                ? "文本草稿已生成，请确认文案后再生成配图。"
                : "输入主题、受众、语气或结构要求后开始生成。"
  const previewMarkdown =
    mode === "thread" && threadSegments.length > 0
      ? imagesRequested || hasGeneratedImages
        ? resolveWriterAssetMarkdown(
            threadSegments.map((segment, index) => `### 第 ${index + 1} 段\n${segment}`).join("\n\n"),
            assets,
            platform,
            mode,
          )
        : threadSegments.map((segment, index) => `### 第 ${index + 1} 段\n${segment}`).join("\n\n")
      : imagesRequested || hasGeneratedImages
        ? renderableDraft || baseDraft || "_文案确认后，可生成配图并查看图文合并预览。_"
        : baseDraft || "_文章生成后，这里先展示文本预览；确认文案无误后再生成配图。_"

  return (
    <>
      <div className="flex h-[calc(100vh-65px)] flex-col bg-background lg:h-screen">
        <header className="border-b border-border/60 bg-background/90 px-3 py-2 backdrop-blur-sm lg:px-5">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              <p className="truncate text-xs text-muted-foreground">{workspaceStatus}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                {writerConfig.shortLabel}
              </Badge>
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                {currentModeLabel}
              </Badge>
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                {currentLanguageLabel}
              </Badge>
              <Badge
                variant={knowledgeStatus?.enabled ? "default" : "outline"}
                className="rounded-full px-2.5 py-0.5 text-[10px]"
              >
                {knowledgeStatus?.enabled
                  ? `企业知识 ${knowledgeStatus.datasetCount || 0}`
                  : "未接入企业知识"}
              </Badge>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                onClick={() => setPreviewOpen(true)}
                disabled={!hasDraft}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden bg-muted/10">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-2 px-3 py-2 lg:px-5 lg:py-3">
            <div className="min-h-0 flex-1 overflow-hidden rounded-[26px] border bg-card shadow-sm">
              <ScrollArea className="h-full" ref={viewportRef}>
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-4 lg:px-5">
                  {hasMoreHistory ? (
                    <div className="flex justify-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        data-testid="writer-load-older-button"
                        onClick={() => void loadOlderMessages()}
                        disabled={isHistoryLoading}
                      >
                        {isHistoryLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                        {isHistoryLoading ? "加载更早消息中" : "加载更早消息"}
                      </Button>
                    </div>
                  ) : null}

                  {messages.length === 0 && !isConversationLoading ? (
                    <div className="space-y-3 rounded-[24px] border border-dashed bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-primary">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase tracking-[0.18em]">Quick Start</span>
                      </div>
                      <div className="grid gap-2.5 lg:grid-cols-3">
                        {[
                          "围绕 AI 客服 Agent 写一篇适合公众号发布的深度文章，包含趋势、案例、落地建议和配图说明。",
                          "围绕 AI 副业工具推荐写一篇适合小红书的图文笔记，标题要有收藏感，正文给出具体工具和行动建议。",
                          "写一组适合 X / Facebook 发布的 AI 创业观察线程，包含 hook、核心观点和结尾 CTA。",
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => setInputValue(prompt)}
                            className="rounded-2xl border bg-background px-3.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                          >
                            <p className="text-[12px] leading-5 text-muted-foreground">{prompt}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {isConversationLoading ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-dashed bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在恢复当前会话...
                    </div>
                  ) : null}

                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[94%] overflow-hidden rounded-[24px] px-3.5 py-3 shadow-sm lg:max-w-[84%]",
                          message.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border/70 bg-background text-foreground",
                        )}
                      >
                        <div
                          className={cn(
                            "mb-2 text-[10px] font-medium",
                            message.role === "assistant"
                              ? "flex items-center gap-1.5 text-muted-foreground"
                              : "opacity-80",
                          )}
                        >
                          {message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                          {message.authorLabel || "你"}
                        </div>
                        {renderMarkdown(
                          message.role === "assistant"
                            ? resolveWriterAssetMarkdown(message.content, assets, platform, mode)
                            : message.content,
                          assets,
                          message.role === "assistant"
                            ? "prose prose-sm max-w-none prose-h1:text-[1.9rem] prose-h2:mt-8 prose-h2:pt-5 prose-h2:text-[1.25rem] prose-p:my-3 prose-p:text-[15px] prose-p:leading-7 prose-li:text-[15px]"
                            : "prose prose-sm max-w-none prose-invert prose-p:my-2 prose-p:text-[14px] prose-p:leading-6 prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-li:text-primary-foreground",
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoading ? (
                    <div className="flex justify-start">
                      <div className="rounded-[24px] rounded-bl-md border border-border/70 bg-background px-3.5 py-3 text-xs text-muted-foreground shadow-sm">
                        <span className="animate-pulse">正在生成图文草稿...</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>

            <section className="rounded-[24px] border bg-background/96 p-2.5 shadow-lg backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={platform}
                  onChange={(event) => {
                    const nextPlatform = event.target.value as WriterPlatform
                    setPlatform(nextPlatform)
                    setMode(normalizeWriterMode(nextPlatform, mode))
                  }}
                  className="h-9 rounded-2xl border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
                  disabled={composerDisabled || isLoading}
                >
                  {WRITER_PLATFORM_ORDER.map((item) => (
                    <option key={item} value={item}>
                      {WRITER_PLATFORM_CONFIG[item].shortLabel}
                    </option>
                  ))}
                </select>
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as WriterMode)}
                  className="h-9 rounded-2xl border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
                  disabled={composerDisabled || isLoading}
                >
                  {writerModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={language}
                  onChange={(event) => setLanguage(normalizeWriterLanguage(event.target.value))}
                  className="h-9 rounded-2xl border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
                  disabled={composerDisabled || isLoading}
                >
                  {WRITER_LANGUAGE_ORDER.map((item) => (
                    <option key={item} value={item}>
                      {WRITER_LANGUAGE_CONFIG[item].label}
                    </option>
                  ))}
                </select>
                <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px] text-muted-foreground">
                  {workspaceStatus}
                </Badge>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-full px-3 text-[11px]"
                    data-testid="writer-inline-new-session-trigger"
                    onClick={handleCreateConversation}
                  >
                    新建
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full border-slate-300 bg-white px-3 text-[11px] text-slate-950 hover:bg-slate-100"
                    onClick={() => setPreviewOpen(true)}
                    disabled={!hasDraft}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    预览
                  </Button>
                </div>
              </div>

              <div className="mt-2 rounded-[22px] border border-border/70 bg-card">
                <Textarea
                  ref={composerRef}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder={`告诉我你要写什么，我会按 ${writerConfig.shortLabel} 的发布方式起稿。可补充受众、语气、篇幅、配图和 CTA。`}
                  className="min-h-14 resize-none border-0 bg-transparent px-3.5 py-3 text-[13px] leading-6 shadow-none focus-visible:ring-0"
                  disabled={composerDisabled}
                />
                <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3.5 py-2.5">
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    {writerConfig.shortLabel} / {currentModeLabel} / {currentLanguageLabel}
                    {composerDisabled ? " / 正在准备能力" : " / 支持图文合一预览与配图生成"}
                  </p>
                  {isLoading ? (
                    <Button size="sm" variant="destructive" className="h-8 rounded-full px-3 text-[11px]" onClick={handleStop}>
                      <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
                      停止
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-8 rounded-full px-3 text-[11px]"
                      data-testid="writer-send-button"
                      onClick={() => void handleSend()}
                      disabled={!inputValue.trim() || composerDisabled}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      发送
                    </Button>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[920px]">
          <div className={cn("h-full bg-gradient-to-b", getPlatformPreviewPalette(platform))}>
            <SheetHeader className="border-b border-slate-300 bg-white/96 px-4 py-3 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 pr-8">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="rounded-full border border-slate-300 bg-slate-950 px-2.5 py-1 text-[10px] font-medium text-white">
                    {writerConfig.shortLabel}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-slate-400 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-900">
                    {estimateReadingTime(previewMarkdown)}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full border-slate-950 bg-slate-950 px-3 text-[11px] text-white hover:bg-slate-800"
                  onClick={() => setPreviewOpen(false)}
                >
                  <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                  收起
                </Button>
              </div>
              <SheetTitle className="sr-only">{writerConfig.shortLabel} 预览</SheetTitle>
              <SheetDescription className="sr-only">可直接编辑草稿并实时查看平台化图文预览。</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-73px)]">
              <div className="space-y-4 p-4">
                <div
                  className={cn(
                    "space-y-4 rounded-[32px] border border-slate-300 p-5 shadow-[0_30px_100px_-60px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/5",
                    getPlatformShellClass(platform),
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">成品预览与编辑</p>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-slate-700">
                        {imagesRequested || hasGeneratedImages
                          ? "图文已合并到同一条文章流；继续调整文案时不会重复生成图片。"
                          : "当前先预览并确认文本，确认无误后再生成配图。"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasDraft ? (
                        <Button
                          size="sm"
                          variant={imagesRequested || hasGeneratedImages ? "outline" : "default"}
                          className={cn(
                            "h-8 rounded-full border px-3 text-[11px] font-medium shadow-sm",
                            imagesRequested || hasGeneratedImages
                              ? "border-slate-500 bg-white text-slate-950 hover:bg-slate-100"
                              : "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
                          )}
                          onClick={() => void handleGenerateAssets()}
                          disabled={assetsLoading}
                        >
                          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                          {assetsLoading ? "生成配图中" : imagesRequested || hasGeneratedImages ? "重新生成配图" : "确认文案并生成配图"}
                        </Button>
                      ) : null}
                      {hasDraft ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[10px] font-medium",
                            draftSaveState === "saving"
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : draftSaveState === "saved"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : draftSaveState === "error"
                                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                                  : "border-slate-400 bg-white text-slate-900",
                          )}
                        >
                          {draftSaveState === "saving"
                            ? "保存中"
                            : draftSaveState === "saved"
                              ? "已保存"
                              : draftSaveState === "error"
                                ? "保存失败"
                                : "可编辑"}
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 rounded-full border border-slate-950 bg-slate-950 px-3 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800"
                        onClick={() => void handleCopyText()}
                        disabled={!hasDraft}
                      >
                        <BookText className="mr-1.5 h-3.5 w-3.5" />
                        复制富文本
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full border-slate-400 bg-white px-3 text-[11px] font-medium text-slate-950 hover:bg-slate-100"
                        onClick={() => void handleCopyMarkdown()}
                        disabled={!hasDraft}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        复制 Markdown
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.32)] ring-1 ring-slate-950/8">
                    <div ref={previewContentRef} className="p-6">
                      <PlatformPreview
                        platform={platform}
                        mode={mode}
                        markdown={previewMarkdown}
                        assets={assets}
                        editable={hasDraft}
                        onEditChange={handleDraftChange}
                        onEditCommit={handleDraftBlur}
                        saveState={draftSaveState}
                      />
                    </div>
                  </div>
                  <PreviewResourceStrip
                    assets={imagesRequested || hasGeneratedImages ? assets : []}
                    assetsLoading={imagesRequested && assetsLoading}
                    assetsError={imagesRequested ? assetsError : null}
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
