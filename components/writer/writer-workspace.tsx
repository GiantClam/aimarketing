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
import {
  findWriterPendingTask,
  removePendingAssistantTask,
  savePendingAssistantTask,
} from "@/lib/assistant-task-store"
import type { AppMessages } from "@/lib/i18n/messages"
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
import type { WriterConversationSummary, WriterHistoryEntry, WriterMessagePage, WriterTurnDiagnostics } from "@/lib/writer/types"
import { cn } from "@/lib/utils"

type WriterMessage = {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  authorLabel?: string
}

type WriterCopy = AppMessages["writer"]

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
                        alt={alt || copy?.imageAlt || "Article image"}
                        loading="lazy"
                        decoding="async"
                        {...props}
                        className="max-h-[420px] w-full object-cover"
                      />
                    ) : (
                      <div className="flex w-full flex-col items-center justify-center gap-2 px-5 py-12 text-center text-slate-500">
                        {writerAsset.status === "failed" ? null : <Loader2 className="h-5 w-5 animate-spin" />}
                        <p className="text-sm font-medium text-slate-700">
                          {writerAsset.status === "failed"
                            ? copy?.imageUnavailable || "Image unavailable"
                            : copy?.imageGenerating || "Generating image"}
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
                loading="lazy"
                decoding="async"
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
      <div className="mx-auto max-w-[760px] rounded-[40px] border border-emerald-100/80 bg-white px-10 py-12 shadow-[0_30px_100px_-52px_rgba(16,185,129,0.22)]">
        <div className="border-b border-emerald-100 pb-8 text-center">
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
      <div className="mx-auto max-w-[430px] rounded-[40px] border border-rose-100 bg-[#fff7f6] p-4 shadow-[0_28px_90px_-48px_rgba(244,114,182,0.32)]">
        <div className="overflow-hidden rounded-[30px] bg-white shadow-sm">
          <div className="border-b border-rose-100/80 px-5 py-5">
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

function PreviewResourceStrip({
  copy,
  assets,
  assetsLoading,
  assetsError,
  onDownload,
  onCopyLink,
  onCopyMarkdown,
}: {
  copy: WriterCopy
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
          <p className="text-sm font-semibold text-slate-950">{copy.imageActionsTitle}</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">{copy.imageActionsDescription}</p>
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
          {assetsLoading ? copy.imageGenerating : "Gemini 3.1 Flash Image Preview"}
        </Badge>
      </div>
      {assetsError ? (
        <div className="mt-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium leading-5 text-destructive">
          {copy.imageGenerationFailedPrefix}
          {assetsError}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(visibleAssets.length > 0 ? visibleAssets : assets).map((asset) => (
          <div key={asset.id} className="rounded-2xl border border-slate-300 bg-slate-50 p-3 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.35)]">
            {asset.url ? (
              <img src={asset.url} alt={copy.imageAlt} loading="lazy" decoding="async" className="h-24 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-3 text-center text-xs font-medium text-slate-700">
                {asset.status === "failed" ? copy.imageUnavailable : assetsLoading ? copy.generatingImages : copy.waitingImage}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="rounded-full border-slate-950 bg-slate-950 text-white hover:bg-slate-800 hover:text-white" onClick={() => onDownload(asset)} disabled={!asset.url}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {copy.download}
              </Button>
              <Button size="sm" variant="outline" className="rounded-full border-slate-400 bg-white text-slate-950 hover:bg-slate-100" onClick={() => void onCopyLink(asset)} disabled={!asset.url}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copy.imageLink}
              </Button>
              <Button size="sm" variant="outline" className="rounded-full border-slate-400 bg-white text-slate-950 hover:bg-slate-100" onClick={() => void onCopyMarkdown(asset)} disabled={!asset.url}>
                <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                {copy.markdown}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getGroundingStrategyLabel(copy: WriterCopy, diagnostics: WriterTurnDiagnostics) {
  if (diagnostics.retrievalStrategy === "rewrite_only") return copy.groundingStrategyRewrite
  if (diagnostics.retrievalStrategy === "enterprise_grounded") return copy.groundingStrategyEnterprise
  if (diagnostics.retrievalStrategy === "fresh_external") return copy.groundingStrategyFresh
  return copy.groundingStrategyHybrid
}

function WriterGroundingSummary({
  copy,
  diagnostics,
}: {
  copy: WriterCopy
  diagnostics: WriterTurnDiagnostics
}) {
  const hasEnterprise = diagnostics.enterpriseKnowledgeUsed && diagnostics.enterpriseSourceCount > 0
  const hasWeb = diagnostics.webResearchUsed && diagnostics.webSourceCount > 0

  return (
    <div className="rounded-[22px] border border-slate-300 bg-white/92 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
          {copy.groundingSummary}
        </Badge>
        <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
          {getGroundingStrategyLabel(copy, diagnostics)}
        </Badge>
        <Badge variant={hasEnterprise ? "default" : "outline"} className="rounded-full px-2.5 py-0.5 text-[10px]">
          {copy.enterpriseSources} {hasEnterprise ? diagnostics.enterpriseSourceCount : 0}
        </Badge>
        <Badge variant={hasWeb ? "default" : "outline"} className="rounded-full px-2.5 py-0.5 text-[10px]">
          {copy.webSources} {hasWeb ? diagnostics.webSourceCount : 0}
        </Badge>
      </div>
      {diagnostics.enterpriseDatasets.length > 0 ? (
        <p className="mt-2 text-[11px] leading-5 text-slate-600">
          {copy.datasetsLabel}: {diagnostics.enterpriseDatasets.join(" / ")}
        </p>
      ) : null}
      {diagnostics.enterpriseTitles.length > 0 ? (
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          {copy.referencesLabel}: {diagnostics.enterpriseTitles.join(" / ")}
        </p>
      ) : null}
    </div>
  )
}

function getKnowledgeScopeLabel(copy: WriterCopy, scope: KnowledgeScope | "mixed" | "unknown") {
  if (scope === "general") return copy.knowledgeScopeGeneral
  if (scope === "brand") return copy.knowledgeScopeBrand
  if (scope === "product") return copy.knowledgeScopeProduct
  if (scope === "case-study") return copy.knowledgeScopeCaseStudy
  if (scope === "compliance") return copy.knowledgeScopeCompliance
  if (scope === "campaign") return copy.knowledgeScopeCampaign
  if (scope === "mixed") return copy.knowledgeScopeMixed
  return ""
}

function WriterInlineImageActionBar({
  copy,
  state,
  error,
  onPreview,
  onGenerate,
  onDismiss,
}: {
  copy: WriterCopy
  state: "confirm" | "generating" | "ready" | "failed"
  error?: string | null
  onPreview: () => void
  onGenerate: () => void
  onDismiss?: () => void
}) {
  const description =
    state === "confirm"
      ? copy.finalPreviewWithoutImages
      : state === "generating"
        ? copy.imageGenerationMerging
        : state === "ready"
          ? copy.finalPreviewWithImages
          : `${copy.imageGenerationFailedPrefix}${error || copy.imageGenerationFailed}`

  return (
    <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50/90 p-3 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[520px] text-[12px] leading-5 text-slate-700">{description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full border-slate-300 bg-white px-3 text-[11px] text-slate-950 hover:bg-slate-100"
            onClick={onPreview}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {copy.preview}
          </Button>
          {state === "confirm" ? (
            <>
              <Button size="sm" className="h-8 rounded-full px-3 text-[11px]" onClick={onGenerate}>
                <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                {copy.generateImages}
              </Button>
              {onDismiss ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-3 text-[11px] text-slate-600 hover:text-slate-950"
                  onClick={onDismiss}
                >
                  {copy.done}
                </Button>
              ) : null}
            </>
          ) : null}
          {state === "generating" ? (
            <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-[11px]" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {copy.generatingImages}
            </Button>
          ) : null}
          {state === "failed" ? (
            <Button size="sm" className="h-8 rounded-full px-3 text-[11px]" onClick={onGenerate}>
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              {copy.regenerateImages}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
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
    },
  ])

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
      <div className="rounded-[24px] border border-slate-950/10 bg-white px-5 py-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.38)] ring-2 ring-slate-950/5">
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
      className="group block w-full rounded-[24px] border border-transparent text-left transition hover:border-slate-200 hover:bg-white/70 hover:shadow-[0_14px_36px_-30px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
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
  const { user, loading } = useAuth()
  const { messages: i18n } = useI18n()
  const writerCopy = i18n.writer
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const previewContentRef = useRef<HTMLDivElement | null>(null)
  const historyRestoreRef = useRef<{ height: number; top: number } | null>(null)
  const shouldScrollToBottomRef = useRef(false)

  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [availabilityReady, setAvailabilityReady] = useState(false)
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeStatus | null>(null)
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
  const [latestDiagnostics, setLatestDiagnostics] = useState<WriterTurnDiagnostics | null>(null)
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [imagesRequested, setImagesRequested] = useState(false)
  const [imageConfirmationDismissed, setImageConfirmationDismissed] = useState(false)
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
  const baseDraft = useMemo(
    () => draft || (conversationStatus === "drafting" ? "" : inferDraft(messages)),
    [conversationStatus, draft, messages],
  )
  const renderableDraft = useMemo(() => resolveWriterAssetMarkdown(baseDraft, assets, platform, mode), [assets, baseDraft, mode, platform])
  const threadSegments = useMemo(() => parseThread(renderableDraft || draft), [draft, renderableDraft])
  const latestAssistantMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.id || null,
    [messages],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const nextHref = `${conversationId ? `/dashboard/writer/${conversationId}` : "/dashboard/writer"}?${new URLSearchParams({ platform, mode, language }).toString()}`
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (currentHref !== nextHref) replaceWriterUrl(nextHref)
  }, [conversationId, language, mode, platform])

  useEffect(() => {
    if (!baseDraft.trim()) {
      setImageConfirmationDismissed(false)
      return
    }

    if (conversationStatus === "text_ready" && !imagesRequested) {
      setImageConfirmationDismissed(false)
    }
  }, [baseDraft, conversationStatus, conversationId, imagesRequested])

  useEffect(() => {
    if (!conversationId) {
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
    if (meta) {
      setPlatform(meta.platform)
      setMode(normalizeWriterMode(meta.platform, meta.mode))
      setLanguage(meta.language || DEFAULT_WRITER_LANGUAGE)
      if (meta.draft) setDraft(meta.draft)
      setImagesRequested(Boolean(meta.imagesRequested))
      setConversationStatus(meta.status || "drafting")
      setLatestDiagnostics(meta.diagnostics || null)
    } else {
      setLatestDiagnostics(null)
    }

    let cancelled = false

    const applyConversationPayload = (data: WriterMessagePage, reset: boolean) => {
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
            content: writerCopy.conversationLoadFailed,
            authorLabel: writerCopy.assistantName,
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
  }, [conversationId, writerCopy.assistantName, writerCopy.conversationLoadFailed])

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
      const nextMessages = mapHistoryEntriesToMessages(data.data || [], writerCopy.assistantName)
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
      const response = await fetch(`/api/writer/messages?conversation_id=${conversationId}&limit=20`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as WriterMessagePage
      if (cancelled) return

      const nextMessages = mapHistoryEntriesToMessages(data.data || [], writerCopy.assistantName)
      const nextDiagnostics = getLatestHistoryDiagnostics(data.data || [])
      setMessages(nextMessages)
      setLatestDiagnostics(nextDiagnostics)
      setHistoryCursor(data.next_cursor || null)
      setHasMoreHistory(Boolean(data.has_more))
      setDraft(inferDraft(nextMessages))
      shouldScrollToBottomRef.current = true

      if (data.conversation) {
        const nextPlatform = normalizeWriterPlatform(data.conversation.platform)
        const nextMode = normalizeWriterMode(nextPlatform, data.conversation.mode)
        const nextLanguage = normalizeWriterLanguage(data.conversation.language)
        setPlatform(nextPlatform)
        setMode(nextMode)
        setLanguage(nextLanguage)
        setImagesRequested(Boolean(data.conversation.images_requested))
        setConversationStatus(data.conversation.status || "drafting")
        saveWriterSessionMeta(conversationId, {
          platform: nextPlatform,
          mode: nextMode,
          language: nextLanguage,
          draft: data.conversation.status === "drafting" ? "" : inferDraft(nextMessages),
          imagesRequested: Boolean(data.conversation.images_requested),
          status: data.conversation.status || "drafting",
          diagnostics: nextDiagnostics,
          updatedAt: Date.now(),
        })
        emitWriterRefresh({
          action: "upsert",
          conversation: data.conversation,
        })
      }
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
            await refreshConversation()
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              setPreviewOpen(true)
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
  }, [conversationId, pendingTaskRefreshKey, writerCopy.assistantName])

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

  const handleCreateConversation = () => {
    setConversationId(null)
    setMessages([])
    setDraft("")
    setInputValue("")
    setPreviewOpen(false)
    setAssetsError(null)
    setAssets([])
    setImagesRequested(false)
    setImageConfirmationDismissed(false)
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
    setImageConfirmationDismissed(false)
    setConversationStatus("drafting")
    setLatestDiagnostics(null)
    setAssets([])
    setAssetsError(null)
    setMessages((current) => [
      ...current,
      { id: `writer_user_${Date.now()}`, conversation_id: conversationId || "", role: "user", content: query },
      {
        id: assistantId,
        conversation_id: conversationId || "",
        role: "assistant",
        content: writerCopy.generatingDraft,
        authorLabel: writerCopy.assistantName,
      },
    ])

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
      setPendingTaskRefreshKey(Date.now())
      emitWriterRefresh({
        action: "upsert",
        conversation: payload.conversation,
      })

      if (!conversationId) {
        replaceWriterUrl(
          `/dashboard/writer/${payload.conversation_id}?platform=${payload.conversation.platform}&mode=${payload.conversation.mode}&language=${payload.conversation.language}`,
        )
      }
    } catch (error) {
      setConversationStatus("failed")
      patchAssistantMessage(
        assistantId,
        `${writerCopy.requestFailedPrefix}${error instanceof Error ? error.message : writerCopy.unknownError}`,
      )
    } finally {
      setIsLoading(false)
    }
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
    setImageConfirmationDismissed(true)
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
        throw new Error(writerCopy.emptyImageResult)
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
                authorLabel: writerCopy.assistantName,
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
      const message = error instanceof Error ? error.message : writerCopy.imageGenerationFailed
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
  const currentModeLabel = writerModeOptions.find((option) => option.value === mode)?.label || "Standard"
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
  const previewMarkdown =
    mode === "thread" && threadSegments.length > 0
      ? imagesRequested || hasGeneratedImages
        ? resolveWriterAssetMarkdown(
            threadSegments
              .map(
                (segment, index) =>
                  `### ${writerCopy.threadSectionPrefix}${index + 1}${writerCopy.threadSectionSuffix}\n${segment}`,
              )
              .join("\n\n"),
            assets,
            platform,
            mode,
          )
        : threadSegments
            .map(
              (segment, index) =>
                `### ${writerCopy.threadSectionPrefix}${index + 1}${writerCopy.threadSectionSuffix}\n${segment}`,
            )
            .join("\n\n")
      : imagesRequested || hasGeneratedImages
        ? renderableDraft || baseDraft || writerCopy.imagePreviewReadyHint
        : baseDraft || writerCopy.textPreviewHint
  const canConfirmImages = hasDraft && conversationStatus === "text_ready" && !imagesRequested && !hasGeneratedImages
  const inlineImageActionState =
    assetsLoading || conversationStatus === "image_generating"
      ? ("generating" as const)
      : imagesRequested && (assetsError || conversationStatus === "failed")
        ? ("failed" as const)
        : imagesRequested && hasGeneratedImages
          ? ("ready" as const)
          : canConfirmImages && !imageConfirmationDismissed
            ? ("confirm" as const)
            : null

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
                  ? `${writerCopy.enterpriseKnowledge} ${knowledgeStatus.datasetCount || 0}`
                  : writerCopy.noEnterpriseKnowledge}
              </Badge>
              {knowledgeStatus?.enabled && knowledgeStatus.profile?.configuredScopes?.length ? (
                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                  {writerCopy.knowledgeProfile}{" "}
                  {knowledgeStatus.profile.configuredScopes
                    .slice(0, 2)
                    .map((scope) => getKnowledgeScopeLabel(writerCopy, scope))
                    .filter(Boolean)
                    .join("/")}
                </Badge>
              ) : null}
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
            {latestDiagnostics ? <WriterGroundingSummary copy={writerCopy} diagnostics={latestDiagnostics} /> : null}
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
                        {isHistoryLoading ? writerCopy.loadingOlderMessages : writerCopy.loadOlderMessages}
                      </Button>
                    </div>
                  ) : null}

                  {messages.length === 0 && !isConversationLoading ? (
                    <div className="space-y-3 rounded-[24px] border border-dashed bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-primary">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase tracking-[0.18em]">{writerCopy.quickStart}</span>
                      </div>
                      <div className="grid gap-2.5 lg:grid-cols-3">
                        {writerCopy.quickStartPrompts.map((prompt) => (
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
                      {writerCopy.restoringConversation}
                    </div>
                  ) : null}

                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[94%] overflow-hidden rounded-[24px] px-3.5 py-3 shadow-sm lg:max-w-[84%]",
                          message.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-slate-200/90 bg-white text-slate-950 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.35)]",
                        )}
                      >
                        <div
                          className={cn(
                            "mb-2 text-[10px] font-medium",
                            message.role === "assistant"
                              ? "flex items-center gap-1.5 text-slate-600"
                              : "opacity-80",
                          )}
                        >
                          {message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                          {message.authorLabel || writerCopy.you}
                        </div>
                        {renderMarkdown(
                          message.role === "assistant"
                            ? resolveWriterAssetMarkdown(message.content, assets, platform, mode)
                            : message.content,
                          assets,
                          message.role === "assistant"
                            ? "prose prose-sm max-w-none prose-headings:text-slate-950 prose-p:text-slate-900 prose-li:text-slate-900 prose-strong:text-slate-950 prose-a:text-blue-700 prose-h1:text-[1.9rem] prose-h2:mt-8 prose-h2:pt-5 prose-h2:text-[1.25rem] prose-p:my-3 prose-p:text-[15px] prose-p:leading-7 prose-li:text-[15px] prose-blockquote:text-slate-700"
                            : "prose prose-sm max-w-none prose-invert prose-p:my-2 prose-p:text-[14px] prose-p:leading-6 prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-li:text-primary-foreground",
                          writerCopy,
                        )}
                        {message.role === "assistant" &&
                        message.id === latestAssistantMessageId &&
                        inlineImageActionState ? (
                          <WriterInlineImageActionBar
                            copy={writerCopy}
                            state={inlineImageActionState}
                            error={assetsError}
                            onPreview={() => setPreviewOpen(true)}
                            onGenerate={() => void handleGenerateAssets()}
                            onDismiss={inlineImageActionState === "confirm" ? () => setImageConfirmationDismissed(true) : undefined}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {isLoading ? (
                    <div className="flex justify-start">
                      <div className="rounded-[24px] rounded-bl-md border border-slate-200/90 bg-white px-3.5 py-3 text-xs text-slate-700 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.35)]">
                        <span className="animate-pulse">{writerCopy.generatingDraft}</span>
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
                    {writerCopy.newChat}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full border-slate-300 bg-white px-3 text-[11px] text-slate-950 hover:bg-slate-100"
                    onClick={() => setPreviewOpen(true)}
                    disabled={!hasDraft}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    {writerCopy.preview}
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
                  placeholder={`${writerCopy.composerPlaceholderPrefix} ${writerConfig.shortLabel} ${writerCopy.composerPlaceholderSuffix}`}
                  className="min-h-14 resize-none border-0 bg-transparent px-3.5 py-3 text-[13px] leading-6 shadow-none focus-visible:ring-0"
                  disabled={composerDisabled}
                />
                <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3.5 py-2.5">
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    {writerConfig.shortLabel} / {currentModeLabel} / {currentLanguageLabel}
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
                    {estimateReadingTime(previewMarkdown, writerCopy)}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full border-slate-950 bg-slate-950 px-3 text-[11px] text-white hover:bg-slate-800"
                  onClick={() => setPreviewOpen(false)}
                >
                  <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                  {writerCopy.collapse}
                </Button>
              </div>
              <SheetTitle className="sr-only">{`${writerConfig.shortLabel} ${writerCopy.previewSheetTitle}`}</SheetTitle>
              <SheetDescription className="sr-only">{writerCopy.previewSheetDescription}</SheetDescription>
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
                      <p className="text-sm font-semibold text-slate-950">{writerCopy.finalPreviewTitle}</p>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-slate-700">
                        {imagesRequested || hasGeneratedImages
                          ? writerCopy.finalPreviewWithImages
                          : writerCopy.finalPreviewWithoutImages}
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
                          {assetsLoading
                            ? writerCopy.generatingImages
                            : imagesRequested || hasGeneratedImages
                              ? writerCopy.regenerateImages
                              : writerCopy.generateImages}
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
                        className="h-8 rounded-full border border-slate-950 bg-slate-950 px-3 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800"
                        onClick={() => void handleCopyText()}
                        disabled={!hasDraft}
                      >
                        <BookText className="mr-1.5 h-3.5 w-3.5" />
                        {writerCopy.copyRichText}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full border-slate-400 bg-white px-3 text-[11px] font-medium text-slate-950 hover:bg-slate-100"
                        onClick={() => void handleCopyMarkdown()}
                        disabled={!hasDraft}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        {writerCopy.copyMarkdown}
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.32)] ring-1 ring-slate-950/8">
                    <div ref={previewContentRef} className="p-6">
                      <PlatformPreview
                        copy={writerCopy}
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
                    copy={writerCopy}
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
