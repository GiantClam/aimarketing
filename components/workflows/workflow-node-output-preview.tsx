"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Check, Copy, Download, ExternalLink, Link2, Pause, Play } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { copyTextToClipboard } from "@/lib/browser/clipboard"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type WorkflowNodeOutputPreviewProps = {
  locale: "zh" | "en"
  status: string
  outputPayload: Record<string, unknown> | null
  errorMessage?: string | null
  className?: string
}

type OutputFileItem = {
  artifactId?: number
  mimeType: string
  title: string
  url: string | null
  downloadUrl: string | null
}

function getCopy(locale: "zh" | "en") {
  return locale === "zh"
    ? {
        title: "当前输出",
        none: "当前节点还没有可展示的输出。",
        text: "文本",
        image: "图片",
        video: "视频",
        audio: "音频",
        file: "文件",
        copyText: "复制文本",
        copyLink: "复制链接",
        open: "预览",
        download: "下载",
        tapToPreview: "点击查看",
        doubleTapToPreview: "双击播放",
        tapToPlay: "点击播放",
        tapToPause: "点击暂停",
        copied: "已复制到剪贴板。",
        copyFailed: "复制失败，请重试。",
        downloaded: "已开始下载。",
        running: "运行中，等待输出...",
        failed: "本次执行未产出可展示结果。",
        cancelled: "当前节点未执行完成。",
        failedReason: "失败原因",
        cancelledReason: "未执行原因",
        queued: "等待执行...",
      }
    : {
        title: "Current output",
        none: "No output is currently available for this node.",
        text: "Text",
        image: "Images",
        video: "Video",
        audio: "Audio",
        file: "Files",
        copyText: "Copy text",
        copyLink: "Copy link",
        open: "Open",
        download: "Download",
        tapToPreview: "Tap to preview",
        doubleTapToPreview: "Double-click to play",
        tapToPlay: "Tap to play",
        tapToPause: "Tap to pause",
        copied: "Copied to clipboard.",
        copyFailed: "Copy failed. Please try again.",
        downloaded: "Download started.",
        running: "Running, waiting for output...",
        failed: "This execution did not produce a previewable result.",
        cancelled: "This node did not complete execution.",
        failedReason: "Failure reason",
        cancelledReason: "Not executed because",
        queued: "Queued for execution...",
      }
}

function humanizeWorkflowErrorMessage(locale: "zh" | "en", errorMessage: string | null | undefined) {
  if (!errorMessage) return null

  const normalized = errorMessage.trim()
  if (!normalized) return null

  const copy = {
    zh: {
      workflow_upstream_failed: "上游节点执行失败，当前节点未继续执行。",
      workflow_run_cancelled: "当前工作流已取消，节点未执行。",
      workflow_run_stale: "当前运行已失效，节点被终止。",
      workflow_ai_chat_timeout: "对话节点执行超时。",
      workflow_writer_timeout: "文案节点执行超时。",
      workflow_ppt_timeout: "PPT 节点执行超时。",
      workflow_image_timeout: "图片节点执行超时。",
      workflow_image_request_timeout: "图片生成请求超时。",
      workflow_image_task_timeout: "图片生成任务等待超时。",
      workflow_video_timeout: "视频节点执行超时。",
      workflow_audio_timeout: "音频节点执行超时。",
      workflow_image_empty_response: "图片服务没有返回结果。",
      workflow_image_requires_more_detail: "图片描述不够具体，无法生成结果。",
      workflow_image_async_task_missing: "图片任务不存在或已失效。",
      workflow_image_async_session_missing: "图片会话不存在或已失效。",
      workflow_image_async_task_failed: "图片生成任务执行失败。",
      workflow_retry_failed: "节点重试失败。",
    },
    en: {
      workflow_upstream_failed: "An upstream node failed, so this node did not continue.",
      workflow_run_cancelled: "The workflow was cancelled before this node could run.",
      workflow_run_stale: "This run became stale and the node was terminated.",
      workflow_ai_chat_timeout: "The chat node timed out while executing.",
      workflow_writer_timeout: "The writing node timed out while executing.",
      workflow_ppt_timeout: "The PPT node timed out while executing.",
      workflow_image_timeout: "The image node timed out while executing.",
      workflow_image_request_timeout: "The image generation request timed out.",
      workflow_image_task_timeout: "The image generation task timed out while waiting for completion.",
      workflow_video_timeout: "The video node timed out while executing.",
      workflow_audio_timeout: "The audio node timed out while executing.",
      workflow_image_empty_response: "The image service returned no result.",
      workflow_image_requires_more_detail: "The image prompt needs more detail before generation can proceed.",
      workflow_image_async_task_missing: "The image task could not be found or has expired.",
      workflow_image_async_session_missing: "The image session could not be found or has expired.",
      workflow_image_async_task_failed: "The image generation task failed.",
      workflow_retry_failed: "Retrying this node failed.",
    },
  } as const

  const exactMatch = copy[locale][normalized as keyof (typeof copy)[typeof locale]]
  if (exactMatch) return exactMatch

  if (normalized.startsWith("workflow_")) {
    return locale === "zh" ? `执行失败：${normalized}` : `Execution failed: ${normalized}`
  }

  return normalized
}

function normalizeTextItems(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
}

function normalizeFileItems(value: unknown): OutputFileItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map<OutputFileItem | null>((item, index) => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      const artifactId = typeof record.artifactId === "number" ? record.artifactId : undefined
      const mimeType =
        typeof record.mimeType === "string" && record.mimeType.trim()
          ? record.mimeType.trim()
          : "application/octet-stream"
      const titleCandidate =
        typeof record.title === "string"
          ? record.title
          : typeof record.fileName === "string"
            ? record.fileName
            : artifactId
              ? `artifact-${artifactId}`
              : `output-${index + 1}`
      const normalizedTitle = titleCandidate.trim() || `output-${index + 1}`
      const url =
        typeof record.url === "string" && record.url.trim()
          ? record.url.trim()
          : artifactId
            ? `/api/platform/artifacts/${artifactId}/download?download=1`
            : null

      const normalizedItem: OutputFileItem = {
        mimeType,
        title: normalizedTitle,
        url,
        downloadUrl:
          typeof record.downloadUrl === "string" && record.downloadUrl.trim()
            ? record.downloadUrl.trim()
            : artifactId
              ? `/api/platform/artifacts/${artifactId}/download?download=1`
              : url,
      }

      if (artifactId !== undefined) {
        normalizedItem.artifactId = artifactId
      }

      return normalizedItem
    })
    .filter((item): item is OutputFileItem => item !== null)
}

function dedupeFileItems(items: OutputFileItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.artifactId ?? "na"}:${item.url ?? "na"}:${item.downloadUrl ?? "na"}:${item.title}:${item.mimeType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function downloadTextFile(title: string, value: string) {
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = `${title || "workflow-output"}.txt`
  anchor.click()
  URL.revokeObjectURL(href)
}

function triggerDownload(item: OutputFileItem) {
  const targetUrl = item.downloadUrl || item.url
  if (!targetUrl) return
  const anchor = document.createElement("a")
  anchor.href = targetUrl
  anchor.target = "_blank"
  anchor.rel = "noreferrer"
  anchor.download = item.title
  anchor.click()
}

function openFilePreview(item: OutputFileItem) {
  if (!item.url) return
  window.open(item.url, "_blank", "noopener,noreferrer")
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      {children}
    </section>
  )
}

function AudioPreviewCard({
  item,
  index,
  copy,
  activeCopyKey,
  onCopyLink,
}: {
  item: OutputFileItem
  index: number
  copy: ReturnType<typeof getCopy>
  activeCopyKey: string | null
  onCopyLink: (key: string, value: string) => Promise<void>
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncState = () => {
      setIsPlaying(!audio.paused && !audio.ended)
    }

    syncState()
    audio.addEventListener("play", syncState)
    audio.addEventListener("pause", syncState)
    audio.addEventListener("ended", syncState)

    return () => {
      audio.removeEventListener("play", syncState)
      audio.removeEventListener("pause", syncState)
      audio.removeEventListener("ended", syncState)
    }
  }, [item.url])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused || audio.ended) {
      try {
        await audio.play()
      } catch {
        setIsPlaying(false)
      }
      return
    }

    audio.pause()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-[10px] border border-border/70 bg-background/80 p-2.5 transition hover:border-primary/40 hover:bg-background cursor-pointer"
      onClick={() => {
        void togglePlayback()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          void togglePlayback()
        }
      }}
    >
      {item.url ? <audio ref={audioRef} src={item.url} preload="metadata" className="hidden" /> : null}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground/90">{item.title}</div>
          <div className="text-[11px] text-muted-foreground">{isPlaying ? copy.tapToPause : copy.tapToPlay}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground/80">
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
          </div>
          {item.url ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
              onClick={(event) => {
                event.stopPropagation()
                void onCopyLink(`audio-link-${index}`, item.url!)
              }}
            >
              {activeCopyKey === `audio-link-${index}` ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
            onClick={(event) => {
              event.stopPropagation()
              triggerDownload(item)
              toast.success(copy.downloaded)
            }}
            disabled={!item.url}
          >
            <Download className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function WorkflowNodeOutputPreview({
  locale,
  status,
  outputPayload,
  errorMessage,
  className,
}: WorkflowNodeOutputPreviewProps) {
  const copy = getCopy(locale)
  const [activeCopyKey, setActiveCopyKey] = useState<string | null>(null)
  const [activeImageItem, setActiveImageItem] = useState<OutputFileItem | null>(null)
  const [activeVideoItem, setActiveVideoItem] = useState<OutputFileItem | null>(null)

  const content = useMemo(() => {
    const payload = outputPayload ?? {}
    const assetItems = normalizeFileItems(payload.asset)
    const splitAssetImages = assetItems.filter((item) => item.mimeType.startsWith("image/"))
    const splitAssetVideos = assetItems.filter((item) => item.mimeType.startsWith("video/"))
    const splitAssetAudios = assetItems.filter((item) => item.mimeType.startsWith("audio/"))
    const splitAssetFiles = assetItems.filter(
      (item) =>
        !item.mimeType.startsWith("image/") &&
        !item.mimeType.startsWith("video/") &&
        !item.mimeType.startsWith("audio/"),
    )

    const textItems = normalizeTextItems(payload.text)
    const imageItems = dedupeFileItems([...splitAssetImages, ...normalizeFileItems(payload.image)])
    const videoItems = dedupeFileItems([...splitAssetVideos, ...normalizeFileItems(payload.video)])
    const audioItems = dedupeFileItems([...splitAssetAudios, ...normalizeFileItems(payload.audio)])
    const fileItems = dedupeFileItems([...splitAssetFiles, ...normalizeFileItems(payload.ppt)])

    return {
      textItems,
      imageItems,
      videoItems,
      audioItems,
      fileItems,
      hasAny:
        textItems.length > 0 ||
        imageItems.length > 0 ||
        videoItems.length > 0 ||
        audioItems.length > 0 ||
        fileItems.length > 0,
    }
  }, [outputPayload])

  const copyText = async (key: string, value: string) => {
    try {
      await copyTextToClipboard(value)
      setActiveCopyKey(key)
      toast.success(copy.copied)
      window.setTimeout(() => setActiveCopyKey((current) => (current === key ? null : current)), 1200)
    } catch {
      toast.error(copy.copyFailed)
    }
  }

  const resolvedErrorMessage = humanizeWorkflowErrorMessage(locale, errorMessage)

  const placeholder =
    status === "running"
      ? copy.running
      : status === "queued"
        ? copy.queued
        : status === "failed"
          ? copy.failed
          : status === "cancelled"
            ? copy.cancelled
          : copy.none

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{copy.title}</div>
        <div className="rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {status}
        </div>
      </div>

      {content.hasAny ? (
        <>
          {content.textItems.length > 0 ? (
            <Section title={copy.text}>
              <div className="space-y-2">
                {content.textItems.map((value, index) => (
                  <div key={`text-${index}`} className="rounded-[10px] border border-border/70 bg-background/80 p-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                        onClick={(event) => {
                          event.stopPropagation()
                          void copyText(`text-${index}`, value)
                        }}
                      >
                        {activeCopyKey === `text-${index}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                        onClick={(event) => {
                          event.stopPropagation()
                          downloadTextFile(`node-output-${index + 1}`, value)
                          toast.success(copy.downloaded)
                        }}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </div>
                    <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground/85">
                      {value}
                    </pre>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {content.imageItems.length > 0 ? (
            <Section title={copy.image}>
              <div className="grid grid-cols-1 gap-2">
                {content.imageItems.map((item, index) => (
                  <div
                    key={`image-${item.url || item.title}-${index}`}
                    className="overflow-hidden rounded-[10px] border border-border/70 bg-background/80 transition hover:border-primary/40 hover:bg-background"
                  >
                    {item.url ? (
                      <button
                        type="button"
                        className="block w-full cursor-zoom-in"
                        onClick={() => {
                          setActiveImageItem(item)
                        }}
                      >
                        <img src={item.url} alt={item.title} className="aspect-video w-full object-cover" />
                      </button>
                    ) : null}
                    <div className="flex items-center justify-between gap-2 p-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-foreground/85">{item.title}</div>
                        <div className="text-[11px] text-muted-foreground">{copy.tapToPreview}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.url ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                            onClick={(event) => {
                              event.stopPropagation()
                              void copyText(`image-link-${index}`, item.url!)
                            }}
                          >
                            {activeCopyKey === `image-link-${index}` ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                          onClick={(event) => {
                            event.stopPropagation()
                            triggerDownload(item)
                            toast.success(copy.downloaded)
                          }}
                          disabled={!item.url}
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {content.videoItems.length > 0 ? (
            <Section title={copy.video}>
              <div className="space-y-2">
                {content.videoItems.map((item, index) => (
                  <div
                    key={`video-${item.url || item.title}-${index}`}
                    className="overflow-hidden rounded-[10px] border border-border/70 bg-background/80 transition hover:border-primary/40 hover:bg-background"
                  >
                    {item.url ? (
                      <div
                        className="cursor-pointer"
                        onDoubleClick={() => {
                          setActiveVideoItem(item)
                        }}
                      >
                        <video src={item.url} muted playsInline preload="metadata" className="aspect-video w-full bg-black/80 object-cover" />
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2 p-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-foreground/85">{item.title}</div>
                        <div className="text-[11px] text-muted-foreground">{copy.doubleTapToPreview}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.url ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                            onClick={(event) => {
                              event.stopPropagation()
                              void copyText(`video-link-${index}`, item.url!)
                            }}
                          >
                            {activeCopyKey === `video-link-${index}` ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                          onClick={(event) => {
                            event.stopPropagation()
                            triggerDownload(item)
                            toast.success(copy.downloaded)
                          }}
                          disabled={!item.url}
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {content.audioItems.length > 0 ? (
            <Section title={copy.audio}>
              <div className="space-y-2">
                {content.audioItems.map((item, index) => (
                  <AudioPreviewCard
                    key={`audio-${item.url || item.title}-${index}`}
                    item={item}
                    index={index}
                    copy={copy}
                    activeCopyKey={activeCopyKey}
                    onCopyLink={copyText}
                  />
                ))}
              </div>
            </Section>
          ) : null}

          {content.fileItems.length > 0 ? (
            <Section title={copy.file}>
              <div className="space-y-2">
                {content.fileItems.map((item, index) => (
                  <div key={`file-${item.url || item.title}-${index}`} className="flex items-center justify-between gap-2 rounded-[10px] border border-border/70 bg-background/80 px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-foreground/90">{item.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{item.mimeType}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.url ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                          onClick={() => {
                            void copyText(`file-link-${index}`, item.url!)
                          }}
                        >
                          {activeCopyKey === `file-link-${index}` ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                        onClick={() => {
                          openFilePreview(item)
                        }}
                        disabled={!item.url}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-[8px] border-border bg-background/80 px-2 text-[11px]"
                        onClick={() => {
                          triggerDownload(item)
                          toast.success(copy.downloaded)
                        }}
                        disabled={!item.url}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      ) : (
        <div className="rounded-[10px] border border-dashed border-border/70 bg-background/65 px-3 py-2.5 text-xs leading-6 text-muted-foreground">
          <div>{placeholder}</div>
          {resolvedErrorMessage && (status === "failed" || status === "cancelled") ? (
            <div className="mt-2 rounded-[8px] border border-border/70 bg-background/80 px-2.5 py-2 text-[11px] leading-5 text-foreground/80">
              <span className="font-semibold text-foreground/90">
                {status === "cancelled" ? copy.cancelledReason : copy.failedReason}
              </span>
              {": "}
              <span>{resolvedErrorMessage}</span>
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={Boolean(activeImageItem)} onOpenChange={(open) => (!open ? setActiveImageItem(null) : null)}>
        <DialogContent className="max-w-5xl border-border bg-background/95 p-3 sm:p-4">
          <DialogTitle className="sr-only">{activeImageItem?.title ?? copy.image}</DialogTitle>
          <DialogDescription className="sr-only">{copy.title}</DialogDescription>
          {activeImageItem?.url ? (
            <img
              src={activeImageItem.url}
              alt={activeImageItem.title}
              className="max-h-[80vh] w-full rounded-[12px] object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeVideoItem)} onOpenChange={(open) => (!open ? setActiveVideoItem(null) : null)}>
        <DialogContent className="max-w-5xl border-border bg-background/95 p-3 sm:p-4">
          <DialogTitle className="sr-only">{activeVideoItem?.title ?? copy.video}</DialogTitle>
          <DialogDescription className="sr-only">{copy.title}</DialogDescription>
          {activeVideoItem?.url ? (
            <video
              key={activeVideoItem.url}
              src={activeVideoItem.url}
              controls
              autoPlay
              playsInline
              className="max-h-[80vh] w-full rounded-[12px] bg-black"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
