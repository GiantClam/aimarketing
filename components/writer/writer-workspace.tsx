"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import {
  BookText,
  Bookmark,
  ChevronLeft,
  Copy,
  Eye,
  Heart,
  ImageIcon,
  Loader2,
  MessageCircleMore,
  Repeat2,
  Send,
  Share2,
  Sparkles,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { WorkspaceComposerPanel, WorkspacePromptGrid } from "@/components/workspace/workspace-primitives"
import {
  WorkspaceActionRow,
  WorkspaceLoadingMessage,
  WorkspaceMessageFrame,
} from "@/components/workspace/workspace-message-primitives"
import {
  findWriterPendingTask,
  removePendingAssistantTask,
  savePendingAssistantTask,
} from "@/lib/assistant-task-store"
import type { AppMessages } from "@/lib/i18n/messages"
import {
  ensureWorkspaceQueryData,
  fetchWorkspaceQueryData,
  getWriterMessagesPage,
  getWriterMessagesQueryKey,
  invalidateWriterConversationQueries,
} from "@/lib/query/workspace-cache"
import {
  buildPendingWriterAssets,
  buildWriterAssetBlueprints,
  extractWriterAssetsFromMarkdown,
  markWriterAssetsFailed,
  resolveWriterAssetMarkdown,
  type WriterAsset,
} from "@/lib/writer/assets"
import {
  DEFAULT_WRITER_LANGUAGE,
  WRITER_LANGUAGE_CONFIG,
  WRITER_LANGUAGE_ORDER,
  WRITER_CONTENT_TYPE_CONFIG,
  normalizeWriterLanguage,
  normalizeWriterMode,
  normalizeWriterPlatform,
  WRITER_PLATFORM_CONFIG,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import {
  emitWriterRefresh,
  getWriterConversationCache,
  getWriterSessionMeta,
  isWriterConversationCacheFresh,
  saveWriterConversationCache,
  saveWriterSessionMeta,
} from "@/lib/writer/session-store"
import type {
  WriterConversationStatus,
  WriterConversationSummary,
  WriterHistoryEntry,
  WriterMessagePage,
  WriterTurnDiagnostics,
} from "@/lib/writer/types"
import { cn } from "@/lib/utils"

type WriterMessage = {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  authorLabel?: string
  diagnostics?: WriterTurnDiagnostics | null
}

type WriterCopy = AppMessages["writer"]

type WriterVersionAssetState = {
  assets: WriterAsset[]
  loading: boolean
  error: string | null
}

type WriterPreviewContext = {
  messageId: string | null
  sourceMarkdown: string
  previewMarkdown: string
  platform: WriterPlatform
  mode: WriterMode
  routing: WriterTurnDiagnostics["routing"] | null
  assets: WriterAsset[]
  assetsLoading: boolean
  assetsError: string | null
  hasDraft: boolean
  hasGeneratedImages: boolean
  imagesRequested: boolean
  isLatest: boolean
}

const WRITER_INITIAL_TURN_LIMIT = 8
const WRITER_HISTORY_PAGE_SIZE = 10
const EMPTY_VERSION_ASSET_STATE: WriterVersionAssetState = { assets: [], loading: false, error: null }

type KnowledgeScope = "general" | "brand" | "product" | "case-study" | "compliance" | "campaign"

type KnowledgeStatus = {
  enabled: boolean
  datasetCount?: number
  source?: string
  profile?: {
    configuredScopes?: KnowledgeScope[]
    primaryScope?: KnowledgeScope | "mixed" | "unknown"
    hasGeneralDataset?: boolean
  } | null
}

const sanitize = (raw: string) => raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
const normalizeWriterMessageContent = (content: string) => content.trim()
const getWriterRoutingSignature = (diagnostics?: WriterTurnDiagnostics | null) => {
  const routing = diagnostics?.routing
  if (!routing) return ""
  return [
    routing.contentType,
    routing.targetPlatform,
    routing.outputForm,
    routing.lengthTarget,
    routing.renderPlatform,
    routing.renderMode,
  ].join("|")
}
const getWriterMessageSignature = (message: WriterMessage) =>
  [
    message.role,
    normalizeWriterMessageContent(message.content),
    message.authorLabel || "",
    getWriterRoutingSignature(message.diagnostics),
  ].join("|")
const areWriterMessageListsEquivalent = (left: WriterMessage[], right: WriterMessage[]) => {
  if (left.length !== right.length) return false
  return left.every((message, index) => getWriterMessageSignature(message) === getWriterMessageSignature(right[index]))
}
const isWriterMessageListPrefix = (prefix: WriterMessage[], full: WriterMessage[]) => {
  if (prefix.length > full.length) return false
  return prefix.every((message, index) => getWriterMessageSignature(message) === getWriterMessageSignature(full[index]))
}
const inferDraft = (messages: WriterMessage[]) =>
  [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim())?.content || ""
const inferFinalDraft = (messages: WriterMessage[], status: WriterConversationStatus) =>
  status === "drafting" ? "" : inferDraft(messages)
const THREAD_SEGMENT_LABEL_RE =
  /^(?:(?:segment|part|thread|post)\s*\d+|第\s*\d+\s*(?:段|条|帖|部分))(?:\s*[:：-])?(?:\r?\n+|$)/i
const stripThreadSegmentLabel = (segment: string) => segment.replace(THREAD_SEGMENT_LABEL_RE, "").trim()
const parseThread = (markdown: string) =>
  markdown
    .split(/^###\s+/gm)
    .map((part) => stripThreadSegmentLabel(part.trim()))
    .filter(Boolean)

const stripMarkdown = (markdown: string) =>
  markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim()

const isPreviewableWriterDraft = (content: string, copy: WriterCopy) => {
  const sanitized = sanitize(content)
  if (!sanitized) return false
  if (sanitized === copy.generatingDraft || sanitized === copy.conversationLoadFailed) return false
  if (sanitized.startsWith(copy.requestFailedPrefix)) return false
  if (/^#{1,3}\s+/m.test(sanitized)) return true
  return stripMarkdown(sanitized).length >= 280 && sanitized.split(/\n{2,}/).length >= 3
}

const buildPreviewMarkdown = ({
  markdown,
  assets,
  mode,
  platform,
  copy,
}: {
  markdown: string
  assets: WriterAsset[]
  mode: WriterMode
  platform: WriterPlatform
  copy: WriterCopy
}) => {
  const normalizedMarkdown = markdown.trim()
  if (!normalizedMarkdown) return copy.textPreviewHint

  const resolvedAssets =
    assets.length > 0
      ? assets
      : buildWriterAssetBlueprints(normalizedMarkdown, platform, mode).length > 0
        ? buildPendingWriterAssets(normalizedMarkdown, platform, mode)
        : []

  const threadSegments = mode === "thread" ? parseThread(normalizedMarkdown) : []
  if (mode === "thread" && threadSegments.length > 0) {
    const threadMarkdown = threadSegments
      .map(
        (segment, index) =>
          `### ${copy.threadSectionPrefix}${index + 1}${copy.threadSectionSuffix}\n${segment}`,
      )
      .join("\n\n")
    return resolvedAssets.length > 0 ? resolveWriterAssetMarkdown(threadMarkdown, resolvedAssets, platform, mode) : threadMarkdown
  }

  return resolvedAssets.length > 0 ? resolveWriterAssetMarkdown(normalizedMarkdown, resolvedAssets, platform, mode) : normalizedMarkdown
}

const extractTitle = (markdown: string, copy: WriterCopy) =>
  (markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("![")) || copy.untitledArticle)
    .replace(/^#+\s*/, "")
    .trim()

const extractLead = (markdown: string, copy: WriterCopy) =>
  markdown
    .split(/\r?\n\r?\n/)
    .map((block) => stripMarkdown(block))
    .find((block) => block && block !== extractTitle(markdown, copy)) || copy.emptyPreviewLead

const estimateReadingTime = (markdown: string, copy: WriterCopy) =>
  `${Math.max(3, Math.ceil(stripMarkdown(markdown).length / 320))} ${copy.readingTimeUnit}`
const composeThreadMarkdown = (segments: string[], copy: WriterCopy) =>
  segments
    .map((segment, index) => `### ${copy.threadSectionPrefix}${index + 1}${copy.threadSectionSuffix}\n${segment.trim()}`)
    .join("\n\n")

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
  if (platform === "wechat") return "bg-emerald-50/70"
  if (platform === "xiaohongshu") return "bg-rose-50/70"
  if (platform === "x" || platform === "weibo" || platform === "generic") return "bg-slate-100"
  return "bg-blue-50/70"
}

const getPlatformShellClass = (platform: WriterPlatform) => {
  if (platform === "x" || platform === "weibo" || platform === "generic") return "border-slate-300 bg-card text-slate-950"
  if (platform === "facebook") return "border-blue-200 bg-card text-slate-950"
  if (platform === "xiaohongshu") return "border-rose-200 bg-card text-slate-950"
  return "border-emerald-200 bg-card text-slate-950"
}

function WriterAssetPlaceholder({
  asset,
  copy,
  compact = false,
}: {
  asset: WriterAsset
  copy?: WriterCopy
  compact?: boolean
}) {
  const isFailed = asset.status === "failed"
  const statusLabel = isFailed
    ? copy?.imageUnavailable || "Image unavailable"
    : asset.status === "loading"
      ? copy?.imageGenerating || "Generating image"
      : copy?.waitingImage || "Waiting for image"
  const accentClass = isFailed
    ? "border-destructive/30 bg-destructive/5"
    : asset.id === "cover"
      ? "border-sky-200 bg-sky-50/70"
      : "border-violet-200 bg-violet-50/70"
  const labelClass = isFailed
    ? "bg-destructive/10 text-destructive"
    : asset.id === "cover"
      ? "bg-sky-100 text-sky-700"
      : "bg-violet-100 text-violet-700"

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-2",
        compact ? "h-24" : "min-h-56",
        accentClass,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.06),transparent_55%,rgba(15,23,42,0.08))]" />
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(135deg,rgba(148,163,184,0.12)_25%,transparent_25%,transparent_50%,rgba(148,163,184,0.12)_50%,rgba(148,163,184,0.12)_75%,transparent_75%,transparent)] [background-size:24px_24px]" />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <Badge className={cn("rounded-full border-0 px-2.5 py-1 text-[10px] font-medium", labelClass)}>
            {asset.label}
          </Badge>
          <div className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-slate-600 backdrop-blur">
            {isFailed ? <Sparkles className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
            {statusLabel}
          </div>
        </div>
        <div className="max-w-[85%]">
          <p className={cn("font-medium text-slate-800", compact ? "text-xs leading-5" : "text-sm leading-6")}>
            {asset.title}
          </p>
          {!compact ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {isFailed ? copy?.imageGenerationFailedPrefix || "Image generation failed: " : "Placeholder visible while the image is being prepared."}
              {isFailed && asset.error ? asset.error : ""}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function renderMarkdown(content: string, assets: WriterAsset[], className?: string, copy?: WriterCopy) {
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
        "prose-hr:my-8 prose-hr:border-slate-200 prose-img:rounded-[28px]",
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
                <figure className="my-8 overflow-hidden rounded-[28px] border-2 border-border bg-card">
                  <div className="flex min-h-56 items-center justify-center bg-slate-100/60">
                    {writerAsset.url ? (
                      <img
                        src={writerAsset.url}
                        alt={alt || copy?.imageAlt || "Article image"}
                        loading="lazy"
                        decoding="async"
                        {...props}
                        className="max-h-[420px] w-full object-cover"
                      />
                    ) : (
                      <WriterAssetPlaceholder asset={writerAsset} copy={copy} />
                    )}
                  </div>
                </figure>
              )
            }

            return (
              <img
                src={src}
                alt={alt || ""}
                loading="lazy"
                decoding="async"
                {...props}
                className="my-6 max-h-[420px] w-full rounded-[24px] border-2 border-border bg-slate-50 object-cover"
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

function SocialStatRow({ copy }: { copy: WriterCopy }) {
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
        {copy.share}
      </span>
    </div>
  )
}

function PlatformPreview({
  copy,
  platform,
  mode,
  markdown,
  assets,
  editable = false,
  onEditChange,
  onEditCommit,
  saveState,
}: {
  copy: WriterCopy
  platform: WriterPlatform
  mode: WriterMode
  markdown: string
  assets: WriterAsset[]
  editable?: boolean
  onEditChange?: (next: string) => void
  onEditCommit?: () => void
  saveState?: "idle" | "saving" | "saved" | "error"
}) {
  const lead = extractLead(markdown, copy)
  const threadPosts = mode === "thread" ? parseThread(markdown) : []
  const renderArticleBody = (value: string, className?: string) =>
    editable && onEditChange && onEditCommit ? (
      <InlineMarkdownCanvas copy={copy} markdown={value} assets={assets} onChange={onEditChange} onCommit={onEditCommit} saveState={saveState} />
    ) : (
      renderMarkdown(value, assets, className, copy)
    )

  if (platform === "wechat") {
    return (
      <div className="mx-auto max-w-[760px] rounded-[40px] border-2 border-emerald-200 bg-card px-10 py-12">
        <div className="border-b-2 border-emerald-100 pb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <BookText className="h-6 w-6" />
          </div>
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-700">{copy.wechatPreview}</p>
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400">
            <span>AI Marketing Weekly</span>
            <span>·</span>
            <span>{estimateReadingTime(markdown, copy)}</span>
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
      <div className="mx-auto max-w-[430px] rounded-[40px] border-2 border-rose-200 bg-[#fff7f6] p-4">
        <div className="overflow-hidden rounded-[30px] border-2 border-rose-100 bg-white">
          <div className="border-b-2 border-rose-100/80 px-5 py-5">
            <div className="mb-4 flex items-center justify-between">
              <Badge className="rounded-full bg-rose-500 px-3 py-1 text-[11px] text-white hover:bg-rose-500">{copy.xiaohongshuPreview}</Badge>
              <span className="text-[11px] text-slate-400">{copy.xiaohongshuBadge}</span>
            </div>
          </div>
          <div className="px-5 py-5">
            {renderArticleBody(
              markdown,
              "prose-p:text-black prose-li:text-black prose-strong:text-rose-700 prose-h1:text-center prose-h2:border-0 prose-h2:pt-0 prose-blockquote:bg-rose-50 prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:not-italic",
            )}
          </div>
          <div className="border-t border-rose-100/80 px-5 py-3 text-xs text-slate-500">{copy.xiaohongshuFooterTags}</div>
        </div>
      </div>
    )
  }

  if (platform === "x" || platform === "weibo") {
    const posts = mode === "thread" && threadPosts.length > 0 ? threadPosts : [markdown]
    return (
      <div className="mx-auto max-w-[760px] space-y-4">
        {posts.map((post, index) => (
          <div key={`${index}_${post.slice(0, 12)}`} className="rounded-[28px] border-2 border-slate-300 bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-11 w-11 rounded-full bg-slate-900" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-black">AI Marketing Site</p>
                  <p className="text-xs text-slate-500">{platform === "weibo" ? "@aimarketing" : "@aimarketingsite"}</p>
                  <span className="text-slate-300">·</span>
                  <p className="text-xs text-slate-500">{mode === "thread" ? `Thread ${index + 1}` : platform === "weibo" ? "Weibo" : "Just now"}</p>
                </div>
                {mode === "article" && index === 0 ? <p className="mt-2 text-xs text-slate-500">{lead}</p> : null}
                <div className="mt-4">
                  {editable && onEditChange && onEditCommit ? (
                    <InlineMarkdownCanvas
                      copy={copy}
                      markdown={post}
                      assets={assets}
                      onChange={(next) => {
                        const nextPosts = [...posts]
                        nextPosts[index] = next
                        onEditChange(composeThreadMarkdown(nextPosts, copy))
                      }}
                      onCommit={onEditCommit}
                      saveState={saveState}
                    />
                  ) : (
                    renderMarkdown(
                      post,
                      assets,
                      "prose-p:text-black prose-li:text-black prose-strong:text-black prose-h1:text-left prose-h1:text-[1.8rem] prose-h2:border-0 prose-h2:pt-0",
                      copy,
                    )
                  )}
                </div>
                <SocialStatRow copy={copy} />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (platform === "generic" || platform === "douyin" || platform === "tiktok") {
    return (
      <div className="mx-auto max-w-[760px] rounded-[32px] border-2 border-slate-300 bg-card px-8 py-10">
        <div className="mb-6 border-b border-slate-200 pb-4">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{copy.finalPreviewTitle}</p>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
            <span>{estimateReadingTime(markdown, copy)}</span>
            <span>/</span>
            <span>{platform === "generic" ? "Document" : "Script"}</span>
          </div>
        </div>
        {renderArticleBody(
          markdown,
          "prose-p:text-black prose-li:text-black prose-strong:text-black prose-h1:text-left prose-h2:border-0 prose-h2:pt-0",
        )}
      </div>
    )
  }

  const posts = mode === "thread" && threadPosts.length > 0 ? threadPosts : [markdown]
  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      {posts.map((post, index) => (
        <div key={`${index}_${post.slice(0, 12)}`} className="rounded-[28px] border-2 border-blue-200 bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-11 w-11 rounded-full bg-blue-600/90" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-black">AI Marketing Site</p>
                <p className="text-xs text-slate-500">Follow</p>
                <span className="text-slate-300">·</span>
                <p className="text-xs text-slate-500">{mode === "thread" ? `Post ${index + 1}` : estimateReadingTime(post, copy)}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">{index === 0 ? lead : copy.multiPostPreview}</p>
              <div className="mt-4">
                {editable && onEditChange && onEditCommit ? (
                  <InlineMarkdownCanvas
                    copy={copy}
                    markdown={post}
                    assets={assets}
                    onChange={(next) => {
                      const nextPosts = [...posts]
                      nextPosts[index] = next
                      onEditChange(composeThreadMarkdown(nextPosts, copy))
                    }}
                    onCommit={onEditCommit}
                    saveState={saveState}
                  />
                ) : (
                  renderMarkdown(
                    post,
                    assets,
                    "prose-p:text-black prose-li:text-black prose-strong:text-black prose-h1:text-left prose-h1:text-[1.8rem] prose-h2:border-0 prose-h2:pt-0",
                    copy,
                  )
                )}
              </div>
              <SocialStatRow copy={copy} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function _getKnowledgeScopeLabel(copy: WriterCopy, scope: KnowledgeScope | "mixed" | "unknown") {
  if (scope === "general") return copy.knowledgeScopeGeneral
  if (scope === "brand") return copy.knowledgeScopeBrand
  if (scope === "product") return copy.knowledgeScopeProduct
  if (scope === "case-study") return copy.knowledgeScopeCaseStudy
  if (scope === "compliance") return copy.knowledgeScopeCompliance
  if (scope === "campaign") return copy.knowledgeScopeCampaign
  if (scope === "mixed") return copy.knowledgeScopeMixed
  return ""
}

function getGroundingStrategyLabel(copy: WriterCopy, strategy: WriterTurnDiagnostics["retrievalStrategy"]) {
  if (strategy === "rewrite_only") return copy.groundingStrategyRewrite
  if (strategy === "enterprise_grounded") return copy.groundingStrategyEnterprise
  if (strategy === "fresh_external") return copy.groundingStrategyFresh
  return copy.groundingStrategyHybrid
}

const mapHistoryEntriesToMessages = (entries: WriterHistoryEntry[], assistantName: string): WriterMessage[] =>
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
      authorLabel: assistantName,
      diagnostics: message.diagnostics || null,
    },
  ])

const buildOptimisticWriterHistoryEntry = (
  id: string,
  conversationId: string,
  query: string,
  answer: string,
  createdAt: number,
): WriterHistoryEntry => ({
  id,
  conversation_id: conversationId,
  query,
  answer,
  diagnostics: null,
  inputs: { contents: query },
  created_at: createdAt,
})

const hasMessagesForWriterConversation = (messages: WriterMessage[], conversationId: string) =>
  messages.some((message) => !message.conversation_id || message.conversation_id === conversationId)

const getLatestHistoryDiagnostics = (entries: WriterHistoryEntry[]) =>
  [...entries].reverse().find((entry) => entry.diagnostics)?.diagnostics || null

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
  copy,
  markdown,
  assets,
  onChange,
  onCommit,
  saveState,
}: {
  copy: WriterCopy
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
      <div className="rounded-[24px] border-2 border-border bg-card px-5 py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium tracking-[0.16em] text-slate-500">{copy.editContent}</p>
            {saveState === "saving" ? (
              <span className="text-[11px] text-slate-400">{copy.saving}</span>
            ) : saveState === "saved" ? (
              <span className="text-[11px] text-emerald-600">{copy.saved}</span>
            ) : saveState === "error" ? (
              <span className="text-[11px] text-destructive">{copy.saveFailed}</span>
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
              {copy.done}
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
      className="group block w-full rounded-[24px] border-2 border-transparent text-left transition hover:border-border hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      onClick={() => setIsEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          setIsEditing(true)
        }
      }}
      aria-label={copy.clickToEditArticleAria}
    >
      <div className="pointer-events-none px-2 py-1">
        <div className="mb-2 opacity-0 transition group-hover:opacity-100">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] tracking-[0.14em] text-slate-500">
            {copy.clickToEditArticle}
          </span>
        </div>
        {renderMarkdown(markdown, assets, undefined, copy)}
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
  const queryClient = useQueryClient()
  const { user, loading } = useAuth()
  const { messages: i18n } = useI18n()
  const writerCopy = i18n.writer
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const previewContentRef = useRef<HTMLDivElement | null>(null)
  const historyRestoreRef = useRef<{ height: number; top: number } | null>(null)
  const shouldScrollToBottomRef = useRef(false)
  const historyEntriesRef = useRef<WriterHistoryEntry[]>([])
  const messagesRef = useRef<WriterMessage[]>([])

  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [availabilityReady, setAvailabilityReady] = useState(false)
  const [_knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeStatus | null>(null)
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
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null)
  const [versionAssetState, setVersionAssetState] = useState<Record<string, WriterVersionAssetState>>({})
  const [pendingRichCopyMessageId, setPendingRichCopyMessageId] = useState<string | null>(null)
  const [latestDiagnostics, setLatestDiagnostics] = useState<WriterTurnDiagnostics | null>(null)
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [imagesRequested, setImagesRequested] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [pendingTaskRefreshKey, setPendingTaskRefreshKey] = useState(0)
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
    setPreviewMessageId(null)
    setVersionAssetState({})
    setPendingRichCopyMessageId(null)
  }, [conversationId])

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
  const baseDraft = useMemo(
    () => draft || (conversationStatus === "drafting" ? "" : inferDraft(messages)),
    [conversationStatus, draft, messages],
  )
  const latestAssistantMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.id || null,
    [messages],
  )
  const activePreviewMessage = useMemo(() => {
    if (previewMessageId) {
      const selectedMessage = messages.find(
        (message) => message.id === previewMessageId && message.role === "assistant",
      )
      if (selectedMessage) return selectedMessage
    }
    return [...messages].reverse().find((message) => message.role === "assistant") || null
  }, [messages, previewMessageId])

  const buildPreviewContextForMessage = (message: WriterMessage | null): WriterPreviewContext => {
    const isLatest = Boolean(message?.id && message.id === latestAssistantMessageId)
    const previewRouting =
      message?.diagnostics?.routing || (isLatest ? latestDiagnostics?.routing || null : null)
    const previewPlatform = previewRouting?.renderPlatform
      ? normalizeWriterPlatform(previewRouting.renderPlatform)
      : platform
    const previewMode = previewRouting?.renderMode
      ? normalizeWriterMode(previewPlatform, previewRouting.renderMode)
      : mode
    const sourceMarkdown = message
      ? isLatest
        ? (baseDraft.trim() || sanitize(message.content))
        : sanitize(message.content)
      : baseDraft
    const scopedAssetState = message && !isLatest ? (versionAssetState[message.id] ?? EMPTY_VERSION_ASSET_STATE) : null
    const extractedAssets =
      message && !isLatest ? extractWriterAssetsFromMarkdown(sourceMarkdown, previewPlatform, previewMode) : []
    const scopedAssets = isLatest
      ? assets
      : scopedAssetState && scopedAssetState.assets.length > 0
        ? scopedAssetState.assets
        : extractedAssets
    const markdownAssets = isLatest
      ? scopedAssets
      : scopedAssets.length > 0
        ? scopedAssets
        : []
    const hasGeneratedImages = scopedAssets.some((asset) => Boolean(asset.url))
    const imagesWereRequested = isLatest
      ? imagesRequested
      : Boolean(scopedAssetState && (scopedAssetState.assets.length > 0 || scopedAssetState.loading || scopedAssetState.error))

    return {
      messageId: message?.id || null,
      sourceMarkdown,
      previewMarkdown: buildPreviewMarkdown({
        markdown: sourceMarkdown,
        assets: markdownAssets,
        mode: previewMode,
        platform: previewPlatform,
        copy: writerCopy,
      }),
      platform: previewPlatform,
      mode: previewMode,
      routing: previewRouting,
      assets: scopedAssets,
      assetsLoading: isLatest ? assetsLoading : scopedAssetState?.loading ?? false,
      assetsError: isLatest ? assetsError : scopedAssetState?.error ?? null,
      hasDraft: Boolean(sourceMarkdown.trim()),
      hasGeneratedImages,
      imagesRequested: imagesWereRequested,
      isLatest,
    }
  }

  const activePreview = buildPreviewContextForMessage(activePreviewMessage)
  const _groundingBadges = useMemo(() => {
    if (!latestDiagnostics) return []

    const items = [`${writerCopy.groundingSummary}: ${getGroundingStrategyLabel(writerCopy, latestDiagnostics.retrievalStrategy)}`]

    if (latestDiagnostics.enterpriseKnowledgeEnabled) {
      items.push(`${writerCopy.enterpriseSources} ${latestDiagnostics.enterpriseSourceCount}`)
    }

    if (latestDiagnostics.webResearchUsed || latestDiagnostics.webResearchStatus === "ready") {
      items.push(`${writerCopy.webSources} ${latestDiagnostics.webSourceCount}`)
    }

    return items
  }, [latestDiagnostics, writerCopy])
  const routingBadges = useMemo(() => {
    const routing = latestDiagnostics?.routing
    if (!routing) return []

    return [
      WRITER_CONTENT_TYPE_CONFIG[routing.contentType]?.label || routing.selectedSkillLabel,
      routing.targetPlatform,
      routing.outputForm,
      routing.lengthTarget,
    ].filter(Boolean)
  }, [latestDiagnostics])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (typeof window === "undefined") return
    const nextHref = conversationId ? `/dashboard/writer/${conversationId}` : "/dashboard/writer"
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (currentHref !== nextHref) replaceWriterUrl(nextHref)
  }, [conversationId])

  useEffect(() => {
    if (!baseDraft.trim()) {
      return
    }
  }, [baseDraft])

  useEffect(() => {
    if (!conversationId) {
      historyEntriesRef.current = []
      setMessages([])
      setDraft("")
      setLatestDiagnostics(null)
      setHistoryCursor(null)
      setHasMoreHistory(false)
      setIsConversationLoading(false)
      return
    }

    setIsConversationLoading(true)
    setHistoryCursor(null)
    setHasMoreHistory(false)
    const meta = getWriterSessionMeta(conversationId)
    const cachedConversation = getWriterConversationCache(conversationId)
    const keepOptimisticMessagesVisible =
      !cachedConversation && hasMessagesForWriterConversation(messagesRef.current, conversationId)
    if (!cachedConversation) {
      historyEntriesRef.current = []
      if (!keepOptimisticMessagesVisible) {
        setMessages([])
      }
    }
    if (meta) {
      setPlatform(meta.platform)
      setMode(normalizeWriterMode(meta.platform, meta.mode))
      setLanguage(meta.language || DEFAULT_WRITER_LANGUAGE)
      const nextStatus = meta.status || "drafting"
      setDraft(nextStatus === "drafting" ? "" : meta.draft || "")
      setImagesRequested(Boolean(meta.imagesRequested))
      setConversationStatus(nextStatus)
      setLatestDiagnostics(meta.diagnostics || null)
    } else {
      setLatestDiagnostics(null)
    }

    const applyCachedConversation = () => {
      if (!cachedConversation) return false

      historyEntriesRef.current = cachedConversation.entries
      const cachedMessages = mapHistoryEntriesToMessages(cachedConversation.entries, writerCopy.assistantName)
      setMessages(cachedMessages)
      setHistoryCursor(cachedConversation.historyCursor || null)
      setHasMoreHistory(Boolean(cachedConversation.hasMoreHistory))
      setLatestDiagnostics(getLatestHistoryDiagnostics(cachedConversation.entries))

      if (cachedConversation.conversation) {
        const nextPlatform = normalizeWriterPlatform(cachedConversation.conversation.platform)
        const nextMode = normalizeWriterMode(nextPlatform, cachedConversation.conversation.mode)
        const nextLanguage = normalizeWriterLanguage(cachedConversation.conversation.language)
        const nextStatus = cachedConversation.conversation.status || "drafting"
        setPlatform(nextPlatform)
        setMode(nextMode)
        setLanguage(nextLanguage)
        setImagesRequested(Boolean(cachedConversation.conversation.images_requested))
        setConversationStatus(nextStatus)
        if (!meta?.draft) {
          setDraft(inferFinalDraft(cachedMessages, nextStatus))
        }
      } else if (!meta?.draft) {
        setDraft(inferFinalDraft(cachedMessages, meta?.status || "drafting"))
      }

      shouldScrollToBottomRef.current = true
      setIsConversationLoading(false)
      return true
    }

    let cancelled = false

    const applyConversationPayload = (
      data: WriterMessagePage,
      options: { reset: boolean; background?: boolean },
    ) => {
      const reset = options.reset
      const nextEntries = reset ? data.data || [] : [...(data.data || []), ...historyEntriesRef.current]
      historyEntriesRef.current = nextEntries
      const nextMessages = mapHistoryEntriesToMessages(data.data || [], writerCopy.assistantName)
      const nextDiagnostics = getLatestHistoryDiagnostics(data.data || [])
      if (data.conversation) {
        setPlatform(normalizeWriterPlatform(data.conversation.platform))
        setMode(normalizeWriterMode(normalizeWriterPlatform(data.conversation.platform), data.conversation.mode))
        setLanguage(normalizeWriterLanguage(data.conversation.language))
        setImagesRequested(Boolean(data.conversation.images_requested))
        setConversationStatus(data.conversation.status || "drafting")
      }
      if (reset) {
        setLatestDiagnostics(nextDiagnostics)
      }
      setHistoryCursor(data.next_cursor || null)
      setHasMoreHistory(Boolean(data.has_more))
      if (reset && !options.background) shouldScrollToBottomRef.current = true
      setMessages((current) => {
        if (!reset) {
          return [...nextMessages, ...current]
        }

        if (options.background) {
          if (areWriterMessageListsEquivalent(current, nextMessages)) {
            return current
          }
          if (isWriterMessageListPrefix(nextMessages, current)) {
            return current
          }
        }

        return nextMessages
      })
      if (reset && !meta?.draft) {
        const currentMessages = messagesRef.current
        const resolvedMessages =
          options.background &&
          (areWriterMessageListsEquivalent(currentMessages, nextMessages) ||
            isWriterMessageListPrefix(nextMessages, currentMessages))
            ? currentMessages
            : nextMessages
        setDraft(inferFinalDraft(resolvedMessages, data.conversation?.status || "drafting"))
      }
      saveWriterConversationCache(conversationId, {
        entries: nextEntries,
        conversation: data.conversation,
        historyCursor: data.next_cursor || null,
        hasMoreHistory: Boolean(data.has_more),
        loadedTurnCount: nextEntries.length,
        updatedAt: Date.now(),
      })
    }

    const load = async (options?: { background?: boolean; forceRefresh?: boolean }) => {
      try {
        const turnLimit = Math.max(WRITER_INITIAL_TURN_LIMIT, cachedConversation?.loadedTurnCount || 0)
        const queryOptions = {
          queryKey: getWriterMessagesQueryKey(conversationId, turnLimit),
          queryFn: () => getWriterMessagesPage(conversationId, turnLimit),
        }
        const data = options?.background || options?.forceRefresh
          ? await fetchWorkspaceQueryData(queryClient, queryOptions)
          : await ensureWorkspaceQueryData(queryClient, queryOptions)
        if (cancelled) return
        applyConversationPayload(data, { reset: true, background: options?.background })
      } catch {
        if (cancelled) return
        setMessages([
          {
            id: `error_${Date.now()}`,
            conversation_id: conversationId,
            role: "assistant",
            content: writerCopy.conversationLoadFailed,
            authorLabel: writerCopy.assistantName,
          },
        ])
      } finally {
        if (!cancelled) setIsConversationLoading(false)
      }
    }

    const hasCache = applyCachedConversation()
    if (hasCache && cachedConversation) {
      void load({
        background: true,
        forceRefresh: true,
      })
    } else if (keepOptimisticMessagesVisible) {
      shouldScrollToBottomRef.current = true
      setIsConversationLoading(false)
      void load({
        background: true,
        forceRefresh: true,
      })
    } else if (!cachedConversation || !isWriterConversationCacheFresh(cachedConversation)) {
      void load()
    }
    return () => {
      cancelled = true
    }
  }, [conversationId, queryClient, writerCopy.assistantName, writerCopy.conversationLoadFailed])

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
      const data = await fetchWorkspaceQueryData(queryClient, {
        queryKey: getWriterMessagesQueryKey(conversationId, WRITER_HISTORY_PAGE_SIZE, historyCursor),
        queryFn: () => getWriterMessagesPage(conversationId, WRITER_HISTORY_PAGE_SIZE, historyCursor),
      })
      const nextMessages = mapHistoryEntriesToMessages(data.data || [], writerCopy.assistantName)
      historyEntriesRef.current = [...(data.data || []), ...historyEntriesRef.current]
      setHistoryCursor(data.next_cursor || null)
      setHasMoreHistory(Boolean(data.has_more))
      setMessages((current) => [...nextMessages, ...current])
      saveWriterConversationCache(conversationId, {
        entries: historyEntriesRef.current,
        conversation: data.conversation,
        historyCursor: data.next_cursor || null,
        hasMoreHistory: Boolean(data.has_more),
        loadedTurnCount: historyEntriesRef.current.length,
        updatedAt: Date.now(),
      })
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
        diagnostics: latestDiagnostics,
        updatedAt: Date.now(),
      })
    }
  }, [conversationId, conversationStatus, draft, imagesRequested, language, latestDiagnostics, mode, platform])

  useEffect(() => {
    const pendingTask = findWriterPendingTask(conversationId)
    if (!conversationId || !pendingTask) return

    let cancelled = false
    setIsLoading(true)

    const refreshConversation = async () => {
      const cachedConversation = getWriterConversationCache(conversationId)
      const turnLimit = Math.max(WRITER_INITIAL_TURN_LIMIT, cachedConversation?.loadedTurnCount || 0)
      await invalidateWriterConversationQueries(queryClient, conversationId)
      const data = await fetchWorkspaceQueryData(queryClient, {
        queryKey: getWriterMessagesQueryKey(conversationId, turnLimit),
        queryFn: () => getWriterMessagesPage(conversationId, turnLimit),
      })
      if (cancelled) return "drafting" as const

      const nextMessages = mapHistoryEntriesToMessages(data.data || [], writerCopy.assistantName)
      const nextDiagnostics = getLatestHistoryDiagnostics(data.data || [])
      historyEntriesRef.current = data.data || []
      setMessages(nextMessages)
      setLatestDiagnostics(nextDiagnostics)
      setHistoryCursor(data.next_cursor || null)
      setHasMoreHistory(Boolean(data.has_more))
      shouldScrollToBottomRef.current = true

      if (data.conversation) {
        const nextPlatform = normalizeWriterPlatform(data.conversation.platform)
        const nextMode = normalizeWriterMode(nextPlatform, data.conversation.mode)
        const nextLanguage = normalizeWriterLanguage(data.conversation.language)
        const nextStatus = data.conversation.status || "drafting"
        const nextDraft = inferFinalDraft(nextMessages, nextStatus)
        setDraft(nextDraft)
        setPlatform(nextPlatform)
        setMode(nextMode)
        setLanguage(nextLanguage)
        setImagesRequested(Boolean(data.conversation.images_requested))
        setConversationStatus(nextStatus)
        saveWriterSessionMeta(conversationId, {
          platform: nextPlatform,
          mode: nextMode,
          language: nextLanguage,
          draft: nextDraft,
          imagesRequested: Boolean(data.conversation.images_requested),
          status: nextStatus,
          diagnostics: nextDiagnostics,
          updatedAt: Date.now(),
        })
        emitWriterRefresh({
          action: "upsert",
          conversation: data.conversation,
        })
      }
      saveWriterConversationCache(conversationId, {
        entries: historyEntriesRef.current,
        conversation: data.conversation,
        historyCursor: data.next_cursor || null,
        hasMoreHistory: Boolean(data.has_more),
        loadedTurnCount: historyEntriesRef.current.length,
        updatedAt: Date.now(),
      })

      return data.conversation?.status || "drafting"
    }

    const poll = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(`/api/tasks/${pendingTask.taskId}`)
          const payload = (await response.json().catch(() => null)) as {
            data?: { status?: string }
          } | null
          const status = payload?.data?.status

          if (status === "success") {
            const conversationStatusAfterRefresh = await refreshConversation()
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              if (conversationStatusAfterRefresh !== "drafting") {
                setPreviewMessageId(null)
                setPreviewOpen(true)
              }
              setIsLoading(false)
            }
            return
          }

          if (status === "failed") {
            await refreshConversation().catch(() => null)
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              setConversationStatus("failed")
              setIsLoading(false)
            }
            return
          }
        } catch (error) {
          console.error("writer.pending-task.poll-failed", error)
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1200))
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [conversationId, pendingTaskRefreshKey, queryClient, writerCopy.assistantName])

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
        message.id === id ? { ...message, content, authorLabel: writerCopy.assistantName } : message,
      ),
    )
  }

  const extractAssistantDbMessageId = (messageId: string | null) => {
    if (!messageId) return null
    const normalized = messageId.trim()
    const prefixedMatch = /^assistant_(\d+)$/i.exec(normalized)
    const numericId = prefixedMatch ? prefixedMatch[1] : normalized
    return /^\d+$/.test(numericId) ? numericId : null
  }

  const patchAssistantHistoryEntry = (messageId: string | null, content: string) => {
    const assistantDbId = extractAssistantDbMessageId(messageId)
    if (!assistantDbId) return

    historyEntriesRef.current = historyEntriesRef.current.map((entry) =>
      String(entry.id) === assistantDbId
        ? {
            ...entry,
            answer: content,
          }
        : entry,
    )

    if (!conversationId) return

    const cachedConversation = getWriterConversationCache(conversationId)
    saveWriterConversationCache(conversationId, {
      entries: historyEntriesRef.current,
      conversation: cachedConversation?.conversation || null,
      historyCursor,
      hasMoreHistory,
      loadedTurnCount: historyEntriesRef.current.length,
      updatedAt: Date.now(),
    })
  }

  const replaceLatestAssistantMessage = (content: string) => {
    setMessages((current) => {
      const next = [...current]
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index]?.role === "assistant") {
          next[index] = {
            ...next[index],
            content,
            authorLabel: writerCopy.assistantName,
          }
          break
        }
      }
      return next
    })
  }

  const openPreviewForMessage = (messageId: string | null) => {
    setPreviewMessageId(messageId)
    setPreviewOpen(true)
  }

  const openLatestPreview = () => {
    openPreviewForMessage(latestAssistantMessageId)
  }

  const requestRichTextCopyForMessage = (messageId: string | null) => {
    setPreviewMessageId(messageId)
    setPreviewOpen(true)
    setPendingRichCopyMessageId(messageId)
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
    setPreviewMessageId(null)
    setVersionAssetState({})
    setPendingRichCopyMessageId(null)
    setConversationStatus("drafting")
    setDraftSaveState("idle")
    router.push("/dashboard/writer")
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const query = inputValue.trim()
    const optimisticCreatedAt = Math.floor(Date.now() / 1000)
    const userMessageId = `writer_user_${Date.now()}`
    const assistantId = `writer_assistant_${Date.now()}`
    const pendingHistoryEntryId = `pending_${assistantId}`
    let taskAccepted = false
    setInputValue("")
    setIsLoading(true)
    setImagesRequested(false)
    setConversationStatus("drafting")
    setLatestDiagnostics(null)
    setAssets([])
    setAssetsError(null)
    setPreviewMessageId(null)
    setPendingRichCopyMessageId(null)
    shouldScrollToBottomRef.current = true
    setMessages((current) => [
      ...current,
      { id: userMessageId, conversation_id: conversationId || "", role: "user", content: query },
      {
        id: assistantId,
        conversation_id: conversationId || "",
        role: "assistant",
        content: writerCopy.generatingDraft,
        authorLabel: writerCopy.assistantName,
      },
    ])

    if (conversationId) {
      const optimisticCacheEntries = [
        ...historyEntriesRef.current,
        buildOptimisticWriterHistoryEntry(
          pendingHistoryEntryId,
          conversationId,
          query,
          writerCopy.generatingDraft,
          optimisticCreatedAt,
        ),
      ]
      historyEntriesRef.current = optimisticCacheEntries
      saveWriterConversationCache(conversationId, {
        entries: optimisticCacheEntries,
        conversation: getWriterConversationCache(conversationId)?.conversation || null,
        historyCursor,
        hasMoreHistory,
        loadedTurnCount: optimisticCacheEntries.length,
        updatedAt: Date.now(),
      })
    }

    try {
      const response = await fetch("/api/writer/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          inputs: { contents: query },
          conversation_id: conversationId,
          platform,
          mode,
          language,
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        task_id?: string
        conversation_id?: string
        conversation?: WriterConversationSummary
        error?: string
      } | null

      if (!response.ok || !payload?.task_id || !payload.conversation_id || !payload.conversation) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      const resolvedConversationId = payload.conversation_id
      const optimisticCacheEntries = historyEntriesRef.current.some((entry) => entry.id === pendingHistoryEntryId)
        ? historyEntriesRef.current.map((entry) =>
            entry.id === pendingHistoryEntryId
              ? {
                  ...entry,
                  conversation_id: resolvedConversationId,
                }
              : entry,
          )
        : [
            ...historyEntriesRef.current,
            buildOptimisticWriterHistoryEntry(
              pendingHistoryEntryId,
              resolvedConversationId,
              query,
              writerCopy.generatingDraft,
              optimisticCreatedAt,
            ),
          ]

      historyEntriesRef.current = optimisticCacheEntries
      setMessages((current) =>
        current.map((message) =>
          message.conversation_id
            ? message
            : {
                ...message,
                conversation_id: resolvedConversationId,
              },
        ),
      )
      saveWriterConversationCache(resolvedConversationId, {
        entries: optimisticCacheEntries,
        conversation: payload.conversation,
        historyCursor,
        hasMoreHistory,
        loadedTurnCount: optimisticCacheEntries.length,
        updatedAt: Date.now(),
      })
      setConversationId(payload.conversation_id)
      setConversationStatus(payload.conversation.status || "drafting")
      saveWriterSessionMeta(payload.conversation_id, {
        platform: payload.conversation.platform,
        mode: payload.conversation.mode,
        language: payload.conversation.language,
        draft: "",
        imagesRequested: false,
        status: payload.conversation.status || "drafting",
        diagnostics: null,
        updatedAt: Date.now(),
      })
      savePendingAssistantTask({
        taskId: payload.task_id,
        scope: "writer",
        conversationId: payload.conversation_id,
        prompt: query,
        createdAt: Date.now(),
      })
      taskAccepted = true
      setPendingTaskRefreshKey(Date.now())
      emitWriterRefresh({
        action: "upsert",
        conversation: payload.conversation,
      })

      if (!conversationId) {
        replaceWriterUrl(`/dashboard/writer/${payload.conversation_id}`)
      }
    } catch (error) {
      const failedMessage = `${writerCopy.requestFailedPrefix}${error instanceof Error ? error.message : writerCopy.unknownError}`
      setConversationStatus("failed")
      patchAssistantMessage(assistantId, failedMessage)
      if (conversationId && historyEntriesRef.current.some((entry) => entry.id === pendingHistoryEntryId)) {
        const failedEntries = historyEntriesRef.current.map((entry) =>
          entry.id === pendingHistoryEntryId
            ? {
                ...entry,
                answer: failedMessage,
              }
            : entry,
        )
        historyEntriesRef.current = failedEntries
        saveWriterConversationCache(conversationId, {
          entries: failedEntries,
          conversation: getWriterConversationCache(conversationId)?.conversation || null,
          historyCursor,
          hasMoreHistory,
          loadedTurnCount: failedEntries.length,
          updatedAt: Date.now(),
        })
      }
    } finally {
      if (!taskAccepted) {
        setIsLoading(false)
      }
    }
  }

  const writePreviewContentToClipboard = async (markdown: string) => {
    if (!markdown.trim()) return

    const plainText = stripMarkdown(markdown)
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

  const handleCopyText = async () => {
    await writePreviewContentToClipboard(activePreview.previewMarkdown)
  }

  const handleCopyMarkdown = async (markdown = activePreview.previewMarkdown) => {
    if (markdown.trim()) await navigator.clipboard.writeText(markdown)
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
        void invalidateWriterConversationQueries(queryClient, conversationId)
        setDraftSaveState("saved")
      })
      .catch(() => {
        setDraftSaveState("error")
      })
  }

  const handleGenerateAssets = async (target: WriterPreviewContext = activePreview) => {
    if (!target.hasDraft || target.assetsLoading || !target.messageId) return

    const pendingAssets = buildPendingWriterAssets(target.sourceMarkdown, platform, mode)
    setPreviewMessageId(target.messageId)
    setPreviewOpen(true)

    if (target.isLatest) {
      setImagesRequested(true)
      setConversationStatus("image_generating")
      setAssetsError(null)
      setAssetsLoading(true)
      setAssets(pendingAssets)
    } else {
      setVersionAssetState((current) => ({
        ...current,
        [target.messageId!]: {
          assets: pendingAssets,
          loading: true,
          error: null,
        },
      }))
    }

    try {
      console.log("writer.client.generate_assets_start", {
        platform,
        mode,
        conversationId,
        targetMessageId: target.messageId,
        targetIsLatest: target.isLatest,
        markdownLength: target.sourceMarkdown.length,
      })
      const response = await fetch("/api/writer/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: target.sourceMarkdown,
          platform,
          mode,
          conversationId: target.isLatest ? conversationId : null,
        }),
      })
      const data = await response.json().catch(() => null)
      console.log("writer.client.generate_assets_response", { status: response.status, ok: response.ok, error: data?.error, assetCount: data?.data?.assets?.length })
      const nextAssets = Array.isArray(data?.data?.assets) ? (data.data.assets as WriterAsset[]) : []

      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`)
      }

      if (nextAssets.length === 0) {
        throw new Error(writerCopy.emptyImageResult)
      }

      if (target.isLatest) {
        setAssets(nextAssets)
        setConversationStatus("ready")
      } else {
        setVersionAssetState((current) => ({
          ...current,
          [target.messageId!]: {
            assets: nextAssets,
            loading: false,
            error: null,
          },
        }))
      }

      const resolvedMarkdown = resolveWriterAssetMarkdown(target.sourceMarkdown, nextAssets, platform, mode)
      if (resolvedMarkdown && resolvedMarkdown !== target.sourceMarkdown) {
        if (target.isLatest) {
          setDraft(resolvedMarkdown)
        }

        patchAssistantMessage(target.messageId, resolvedMarkdown)
        patchAssistantHistoryEntry(target.messageId, resolvedMarkdown)

        if (conversationId) {
          const assistantDbMessageId = extractAssistantDbMessageId(target.messageId)
          const patchPayload: Record<string, unknown> = {
            conversation_id: conversationId,
            content: resolvedMarkdown,
          }
          if (assistantDbMessageId) {
            patchPayload.message_id = assistantDbMessageId
          }
          if (target.isLatest) {
            patchPayload.status = "ready"
            patchPayload.imagesRequested = true
          }

          void fetch("/api/writer/messages", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchPayload),
          })
            .then(() => invalidateWriterConversationQueries(queryClient, conversationId))
            .catch(() => null)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : writerCopy.imageGenerationFailed
      if (target.isLatest) {
        setConversationStatus("failed")
        setAssetsError(message)
        setAssets(markWriterAssetsFailed(pendingAssets, message))
      } else {
        setVersionAssetState((current) => ({
          ...current,
          [target.messageId!]: {
            assets: markWriterAssetsFailed(pendingAssets, message),
            loading: false,
            error: message,
          },
        }))
      }
    } finally {
      if (target.isLatest) {
        setAssetsLoading(false)
      } else {
        setVersionAssetState((current) => ({
          ...current,
          [target.messageId!]: {
            assets: current[target.messageId!]?.assets ?? pendingAssets,
            loading: false,
            error: current[target.messageId!]?.error ?? null,
          },
        }))
      }
    }
  }

  useEffect(() => {
    if (!previewOpen || !pendingRichCopyMessageId || activePreview.messageId !== pendingRichCopyMessageId) return

    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return
      void writePreviewContentToClipboard(activePreview.previewMarkdown).finally(() => {
        if (!cancelled) {
          setPendingRichCopyMessageId((current) => (current === pendingRichCopyMessageId ? null : current))
        }
      })
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [activePreview.messageId, activePreview.previewMarkdown, pendingRichCopyMessageId, previewOpen])

  const composerDisabled = loading || availabilityLoading || !availabilityReady
  const hasDraft = Boolean(baseDraft.trim())
  const activeRouting = latestDiagnostics?.routing || null
  const currentPlatformLabel = activeRouting?.targetPlatform || writerConfig.shortLabel
  const currentModeLabel = activeRouting?.outputForm || (mode === "thread" ? "Thread" : "Standard")
  const currentLengthLabel = activeRouting?.lengthTarget || writerConfig.wordRange
  const activePreviewRouting = activePreview.routing || activeRouting
  const activePreviewPlatformLabel =
    activePreviewRouting?.targetPlatform || WRITER_PLATFORM_CONFIG[activePreview.platform].shortLabel
  const currentLanguageLabel = WRITER_LANGUAGE_CONFIG[language].label
  const workspaceStatus = loading
    ? "Checking sign-in..."
    : availabilityLoading
      ? "Checking writer availability..."
      : isConversationLoading
        ? writerCopy.restoringConversation
        : conversationStatus === "image_generating"
          ? writerCopy.imageGenerationMerging
          : conversationStatus === "ready"
            ? "Draft ready to refine and publish."
            : conversationStatus === "failed"
              ? "Generation failed. Update the prompt and try again."
              : hasDraft
                ? "Copy draft ready. Confirm the text before generating images."
                : "Describe the topic, audience, tone, or structure to start."
  return (
    <>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="min-h-0 flex-1 overflow-hidden bg-muted/30">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-2 pb-2 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[28px] rounded-t-none border-x border-b border-t-0 border-border/70 bg-[#f7f7f7] shadow-none">
              <div className="min-h-0 flex-1 bg-[#f7f7f7]">
                <ScrollArea className="h-full" ref={viewportRef}>
                <div className="space-y-0">
                  {hasMoreHistory ? (
                    <div className="flex justify-center px-3 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        data-testid="writer-load-older-button"
                        onClick={() => void loadOlderMessages()}
                        disabled={isHistoryLoading}
                      >
                        {isHistoryLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                        {isHistoryLoading ? writerCopy.loadingOlderMessages : writerCopy.loadOlderMessages}
                      </Button>
                    </div>
                  ) : null}

                  {messages.length === 0 && !isConversationLoading ? (
                    <div className="px-3 py-3">
                      <WorkspacePromptGrid
                        eyebrow={writerCopy.quickStart}
                        prompts={writerCopy.quickStartPrompts}
                        onSelect={(prompt) => setInputValue(prompt)}
                        gridClassName="lg:grid-cols-3"
                      />
                    </div>
                  ) : null}

                  {isConversationLoading ? (
                    <div className="mx-3 my-3 flex items-center gap-2 rounded-[20px] border-2 border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {writerCopy.restoringConversation}
                    </div>
                  ) : null}

                  {messages.map((message, index) => {
                    const messagePreview =
                      message.role === "assistant" ? buildPreviewContextForMessage(message) : null
                    const messageIsPreviewable =
                      message.role === "assistant" && isPreviewableWriterDraft(message.content, writerCopy)

                    return (
                      <WorkspaceMessageFrame
                        key={message.id}
                        role={message.role}
                        className={cn(index === 0 && "border-b border-border/40 bg-transparent pt-5 lg:pt-6")}
                        label={message.authorLabel || (message.role === "assistant" ? writerCopy.assistantName : writerCopy.you)}
                        icon={message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                        bodyClassName="space-y-3"
                      >
                        <div className={cn("rounded-[24px] border-2 p-4", message.role === "user" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>
                          {renderMarkdown(
                            messagePreview?.previewMarkdown || message.content,
                            messagePreview?.assets || [],
                            message.role === "assistant"
                              ? "prose prose-sm max-w-none prose-headings:text-slate-950 prose-p:text-slate-900 prose-li:text-slate-900 prose-strong:text-slate-950 prose-a:text-blue-700 prose-h1:text-[1.9rem] prose-h2:mt-8 prose-h2:pt-5 prose-h2:text-[1.25rem] prose-p:my-3 prose-p:text-[15px] prose-p:leading-7 prose-li:text-[15px] prose-blockquote:text-slate-700"
                              : "prose prose-sm max-w-none prose-invert prose-p:my-2 prose-p:text-[14px] prose-p:leading-6 prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-li:text-primary-foreground",
                            writerCopy,
                          )}
                          {messageIsPreviewable && messagePreview ? (
                            <WorkspaceActionRow>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-full border-2 border-border bg-card px-3 text-[11px] text-foreground hover:bg-muted"
                                onClick={() => openPreviewForMessage(message.id)}
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                {writerCopy.preview}
                              </Button>
                              <Button
                                size="sm"
                                variant={messagePreview.imagesRequested || messagePreview.hasGeneratedImages ? "outline" : "default"}
                                className={cn(
                                  "h-8 rounded-full px-3 text-[11px]",
                                  messagePreview.imagesRequested || messagePreview.hasGeneratedImages
                                    ? "border-2 border-border bg-card text-foreground hover:bg-muted"
                                    : "",
                                )}
                                onClick={() => void handleGenerateAssets(messagePreview)}
                                disabled={messagePreview.assetsLoading}
                                data-testid={`writer-generate-images-${message.id}`}
                              >
                                {messagePreview.assetsLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1.5 h-3.5 w-3.5" />}
                                {messagePreview.assetsLoading
                                  ? writerCopy.generatingImages
                                  : messagePreview.imagesRequested || messagePreview.hasGeneratedImages
                                    ? writerCopy.regenerateImages
                                    : writerCopy.generateImages}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-full border-2 border-border bg-card px-3 text-[11px] text-foreground hover:bg-muted"
                                onClick={() => requestRichTextCopyForMessage(message.id)}
                              >
                                <BookText className="mr-1.5 h-3.5 w-3.5" />
                                {writerCopy.copyRichText}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-full border-2 border-border bg-card px-3 text-[11px] text-foreground hover:bg-muted"
                                onClick={() => void handleCopyMarkdown(messagePreview.previewMarkdown)}
                              >
                                <Copy className="mr-1.5 h-3.5 w-3.5" />
                                {writerCopy.copyMarkdown}
                              </Button>
                            </WorkspaceActionRow>
                          ) : null}
                        </div>
                      </WorkspaceMessageFrame>
                    )
                  })}

                  {isLoading ? (
                    <WorkspaceMessageFrame
                      role="assistant"
                      label={writerCopy.assistantName}
                      icon={<Sparkles className="h-3.5 w-3.5" />}
                    >
                      <WorkspaceLoadingMessage label={<span className="animate-pulse">{writerCopy.generatingDraft}</span>} />
                    </WorkspaceMessageFrame>
                  ) : null}
                </div>
                </ScrollArea>
              </div>

              <div className="border-t border-border/70 bg-[#f7f7f7] px-3 py-2.5 lg:px-4 lg:py-3">
                <WorkspaceComposerPanel
                  className="border-none bg-transparent p-0"
                  toolbar={
                    <>
                      {routingBadges.map((item) => (
                        <Badge key={item} variant="outline" className="rounded-full px-2.5 py-1 text-[10px] text-muted-foreground">
                          {item}
                        </Badge>
                      ))}
                      <select
                        value={language}
                        onChange={(event) => setLanguage(normalizeWriterLanguage(event.target.value))}
                        className="h-9 rounded-[18px] border-2 border-border bg-background px-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
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
                          {writerCopy.newChat}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full border-2 border-border bg-card px-3 text-[11px] text-foreground hover:bg-muted"
                          onClick={openLatestPreview}
                          disabled={!hasDraft}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          {writerCopy.preview}
                        </Button>
                      </div>
                    </>
                  }
                  bodyClassName="px-0"
                  footer={
                    <>
                      <p className="text-[11px] leading-5 text-muted-foreground">
                        {currentPlatformLabel} / {currentModeLabel} / {currentLengthLabel} / {currentLanguageLabel}
                        {composerDisabled ? ` / ${writerCopy.preparingCapabilities}` : ` / ${writerCopy.supportsPreviewAndImages}`}
                      </p>
                      {isLoading ? (
                        <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-[11px]" disabled>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          {writerCopy.generatingDraft}
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
                          {writerCopy.send}
                        </Button>
                      )}
                    </>
                  }
                >
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
                    placeholder={`${writerCopy.composerPlaceholderPrefix} ${currentPlatformLabel} ${writerCopy.composerPlaceholderSuffix}`}
                    className="min-h-12 resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] leading-6 shadow-none focus-visible:ring-0"
                    disabled={composerDisabled}
                  />
                </WorkspaceComposerPanel>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Sheet
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open)
          if (!open) setPendingRichCopyMessageId(null)
        }}
      >
        <SheetContent side="right" className="w-full gap-0 overflow-hidden border-l-2 border-border bg-card p-0 sm:max-w-[920px]">
          <div className={cn("h-full", getPlatformPreviewPalette(activePreview.platform))}>
            <SheetHeader className="border-b-2 border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-3 pr-8">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="rounded-full border-2 border-border bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-foreground">
                    {activePreviewPlatformLabel}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-2 border-border bg-background px-2.5 py-1 text-[10px] font-medium text-slate-900">
                    {estimateReadingTime(activePreview.previewMarkdown, writerCopy)}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full border-2 border-border bg-card px-3 text-[11px] text-foreground hover:bg-muted"
                  onClick={() => setPreviewOpen(false)}
                >
                  <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                  {writerCopy.collapse}
                </Button>
              </div>
              <SheetTitle className="sr-only">{`${activePreviewPlatformLabel} ${writerCopy.previewSheetTitle}`}</SheetTitle>
              <SheetDescription className="sr-only">{writerCopy.previewSheetDescription}</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-73px)]">
              <div className="space-y-4 p-4">
                <div
                  className={cn(
                    "space-y-4 rounded-[32px] border-2 p-5",
                    getPlatformShellClass(activePreview.platform),
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{writerCopy.finalPreviewTitle}</p>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-slate-700">
                        {activePreview.imagesRequested || activePreview.hasGeneratedImages
                          ? writerCopy.finalPreviewWithImages
                          : writerCopy.finalPreviewWithoutImages}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {activePreview.hasDraft ? (
                        <Button
                          size="sm"
                          variant={activePreview.imagesRequested || activePreview.hasGeneratedImages ? "outline" : "default"}
                          className={cn(
                            "h-8 rounded-full border-2 px-3 text-[11px] font-medium",
                            activePreview.imagesRequested || activePreview.hasGeneratedImages
                              ? "border-border bg-card text-slate-950 hover:bg-muted"
                              : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                          )}
                          onClick={() => void handleGenerateAssets(activePreview)}
                          disabled={activePreview.assetsLoading}
                        >
                          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                          {activePreview.assetsLoading
                            ? writerCopy.generatingImages
                            : activePreview.imagesRequested || activePreview.hasGeneratedImages
                              ? writerCopy.regenerateImages
                              : writerCopy.generateImages}
                        </Button>
                      ) : null}
                      {activePreview.isLatest && activePreview.hasDraft ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full border-2 px-2.5 py-1 text-[10px] font-medium",
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
                            ? writerCopy.saving
                            : draftSaveState === "saved"
                              ? writerCopy.saved
                              : draftSaveState === "error"
                                ? writerCopy.saveFailed
                                : writerCopy.editable}
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 rounded-full border-2 border-primary bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                        onClick={() => void handleCopyText()}
                        disabled={!activePreview.hasDraft}
                      >
                        <BookText className="mr-1.5 h-3.5 w-3.5" />
                        {writerCopy.copyRichText}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full border-2 border-border bg-card px-3 text-[11px] font-medium text-slate-950 hover:bg-muted"
                        onClick={() => void handleCopyMarkdown()}
                        disabled={!activePreview.hasDraft}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        {writerCopy.copyMarkdown}
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-[28px] border-2 border-border bg-card">
                    <div ref={previewContentRef} className="p-6">
                      <PlatformPreview
                        copy={writerCopy}
                        platform={activePreview.platform}
                        mode={activePreview.mode}
                        markdown={activePreview.previewMarkdown}
                        assets={activePreview.assets}
                        editable={activePreview.isLatest && activePreview.hasDraft}
                        onEditChange={handleDraftChange}
                        onEditCommit={handleDraftBlur}
                        saveState={draftSaveState}
                      />
                    </div>
                  </div>

                </div>
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
