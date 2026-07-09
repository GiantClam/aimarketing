"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Expand,
  Eye,
  LayoutTemplate,
  LibraryBig,
  Loader2,
} from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"
import {
  resolvePptPreviewDisplayTitle,
  resolvePptPreviewVariantDisplayLabel,
} from "@/lib/ai-entry/ppt-preview-display"
import { cn } from "@/lib/utils"

type PptPreviewReportCardProps = {
  previewSessionId: string
  defaultVariantKey?: string | null
  variantKeys?: string[]
  isZh: boolean
  agentId?: string | null
}

type PreviewSessionApiResponse = {
  ok?: boolean
  error?: string
  previewSessionId?: string
  deck?: PptPreviewDeck
}

type PptExportApiResponse = {
  ok?: boolean
  error?: string | { code?: string; message?: string }
  artifactId?: number | null
  fileName?: string | null
  downloadUrl?: string | null
  previewUrl?: string | null
  assetLibrary?: {
    saved?: boolean
    href?: string
  } | null
}

function getPreviewCopy(isZh: boolean) {
  return {
    title: isZh ? "PPT 预览" : "PPT preview",
    loading: isZh ? "正在加载 SVG 预览..." : "Loading SVG preview...",
    failed: isZh ? "预览加载失败" : "Preview failed to load",
    empty: isZh ? "当前预览没有可展示的页面。" : "This preview has no slides to display.",
    variant: isZh ? "方案" : "Variant",
    slide: isZh ? "页" : "Slide",
    previous: isZh ? "上一页" : "Previous",
    next: isZh ? "下一页" : "Next",
    htmlOnly: isZh ? "当前方案仅提供 HTML 预览，请在工具页查看。" : "This variant only exposes an HTML preview. Open it from the tool page.",
    open: isZh ? "打开预览" : "Open preview",
    previewTitle: isZh ? "PPT 大图预览" : "PPT large preview",
    slideCount: isZh ? "页数" : "Slides",
    download: isZh ? "导出并下载 PPTX" : "Export and download PPTX",
    downloading: isZh ? "导出中..." : "Exporting...",
    saveToAssets: isZh ? "导出到资产库" : "Export to assets",
    savingToAssets: isZh ? "存储中..." : "Saving...",
    savedToAssets: isZh ? "已存入资产库" : "Saved to assets",
    exportFailed: isZh ? "导出失败，请稍后重试。" : "Export failed. Please try again.",
    exportSucceeded: isZh ? "PPTX 已生成。" : "PPTX export is ready.",
    retryDownload: isZh ? "重新下载" : "Download again",
    openAssetLibrary: isZh ? "打开资产库" : "Open asset library",
    generatedFile: isZh ? "文件" : "File",
    exportHint: isZh
      ? "预览确认后，可导出正式可编辑 PPTX，或直接存入资产库。"
      : "After reviewing the preview, export the editable PPTX or save it to the asset library.",
  }
}

function readExportErrorMessage(data: PptExportApiResponse, fallback: string) {
  if (typeof data.error === "string" && data.error.trim()) return data.error
  if (data.error && typeof data.error === "object") {
    if (typeof data.error.message === "string" && data.error.message.trim()) return data.error.message
    if (typeof data.error.code === "string" && data.error.code.trim()) return data.error.code
  }
  return fallback
}

function openDownloadUrl(downloadUrl: string) {
  const anchor = document.createElement("a")
  anchor.href = downloadUrl
  anchor.rel = "noreferrer"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function PptPreviewReportCard({
  previewSessionId,
  defaultVariantKey,
  variantKeys,
  isZh,
  agentId,
}: PptPreviewReportCardProps) {
  const copy = getPreviewCopy(isZh)
  const [deck, setDeck] = useState<PptPreviewDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(defaultVariantKey ?? null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [exportedArtifact, setExportedArtifact] = useState<PptExportApiResponse | null>(null)
  const [exportAction, setExportAction] = useState<"download" | "assets" | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isSavedToAssets, setIsSavedToAssets] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadPreview() {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({ previewSessionId })
        const response = await fetch(`/api/tools/ai-ppt-preview/preview-session?${params.toString()}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })
        const data = (await response.json()) as PreviewSessionApiResponse

        if (!response.ok || !data.deck) {
          throw new Error(data.error || copy.failed)
        }

        if (cancelled) return
        setDeck(data.deck)
      } catch (loadError) {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : copy.failed)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [copy.failed, previewSessionId])

  const visibleVariants = useMemo(() => {
    if (!deck) return []
    const allowed = new Set((variantKeys || []).filter((value) => value.trim()))
    const variants = allowed.size
      ? deck.variants.filter((variant) => allowed.has(variant.key))
      : deck.variants
    return variants
  }, [deck, variantKeys])

  useEffect(() => {
    if (!visibleVariants.length) {
      setSelectedVariantKey(null)
      setSlideIndex(0)
      return
    }

    if (selectedVariantKey && visibleVariants.some((variant) => variant.key === selectedVariantKey)) {
      return
    }

    const nextVariantKey =
      (defaultVariantKey && visibleVariants.find((variant) => variant.key === defaultVariantKey)?.key) ||
      visibleVariants[0]?.key ||
      null
    setSelectedVariantKey(nextVariantKey)
    setSlideIndex(0)
  }, [defaultVariantKey, selectedVariantKey, visibleVariants])

  const selectedVariant =
    visibleVariants.find((variant) => variant.key === selectedVariantKey) || visibleVariants[0] || null
  const displayTitle = resolvePptPreviewDisplayTitle(deck?.title, deck?.language || "zh-CN")
  const displayVariantLabel =
    resolvePptPreviewVariantDisplayLabel(deck, selectedVariant) || copy.loading
  const slides = selectedVariant?.preview?.slides || []
  const currentSlideCount = slides.length
  const safeSlideIndex = currentSlideCount > 0 ? Math.min(slideIndex, currentSlideCount - 1) : 0
  const currentSlide = slides[safeSlideIndex] || null
  const coverAsset = selectedVariant?.preview?.cover || null
  const canExport = Boolean(selectedVariant?.key && !isLoading && !error)

  useEffect(() => {
    setExportedArtifact(null)
    setExportError(null)
    setIsSavedToAssets(false)
  }, [selectedVariant?.key])

  useEffect(() => {
    if (safeSlideIndex !== slideIndex) {
      setSlideIndex(safeSlideIndex)
    }
  }, [safeSlideIndex, slideIndex])

  async function requestExport(saveToAssets: boolean) {
    const variantKey = selectedVariant?.key || selectedVariantKey || defaultVariantKey || undefined
    if (!variantKey) {
      throw new Error(copy.exportFailed)
    }

    const response = await fetch("/api/ai/ppt-preview/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        previewSessionId,
        selectedVariantKey: variantKey,
        saveToAssets,
        agentId,
      }),
    })
    const data = (await response.json().catch(() => ({}))) as PptExportApiResponse

    if (!response.ok || data.ok === false) {
      throw new Error(readExportErrorMessage(data, copy.exportFailed))
    }

    setExportedArtifact(data)
    if (data.assetLibrary?.saved) {
      setIsSavedToAssets(true)
    }
    return data
  }

  async function moveExistingArtifactToAssets(artifactId: number) {
    const response = await fetch(`/api/platform/artifacts/${artifactId}/move-to-assets`, {
      method: "POST",
      credentials: "include",
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string; data?: unknown }
    if (!response.ok) {
      throw new Error(data.error || copy.exportFailed)
    }
    setIsSavedToAssets(true)
  }

  async function handleDownload() {
    if (!canExport || exportAction) return

    setExportAction("download")
    setExportError(null)
    try {
      const artifact = exportedArtifact?.downloadUrl ? exportedArtifact : await requestExport(false)
      if (!artifact.downloadUrl) throw new Error(copy.exportFailed)
      openDownloadUrl(artifact.downloadUrl)
    } catch (downloadError) {
      setExportError(downloadError instanceof Error ? downloadError.message : copy.exportFailed)
    } finally {
      setExportAction(null)
    }
  }

  async function handleSaveToAssets() {
    if (!canExport || exportAction || isSavedToAssets) return

    setExportAction("assets")
    setExportError(null)
    try {
      if (typeof exportedArtifact?.artifactId === "number") {
        await moveExistingArtifactToAssets(exportedArtifact.artifactId)
      } else {
        await requestExport(true)
      }
    } catch (saveError) {
      setExportError(saveError instanceof Error ? saveError.message : copy.exportFailed)
    } finally {
      setExportAction(null)
    }
  }

  return (
    <>
      <div className="artifact-card artifact-card-wide overflow-hidden">
        <button
          type="button"
          onClick={() => !isLoading && !error && (currentSlide || selectedVariant?.preview?.htmlDocument) ? setIsPreviewOpen(true) : null}
          className="relative flex h-[160px] w-[128px] items-center justify-center overflow-hidden rounded-[8px] border border-border bg-[#f5f3ec] transition hover:border-primary/40"
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">SVG</span>
            </div>
          ) : coverAsset ? (
            <>
              <img
                src={coverAsset.dataUrl}
                alt={selectedVariant?.name || copy.title}
                className="h-full w-full object-cover object-top"
              />
              <div className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1 rounded-[8px] bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
                <Expand className="h-3 w-3" />
                <span>{copy.open}</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <LayoutTemplate className="h-8 w-8" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">SVG</span>
            </div>
          )}
        </button>
        <div className="artifact-meta">
          <div className="artifact-eyebrow">{copy.title}</div>
          <div className="artifact-title-text">{displayTitle}</div>
          <div className="artifact-subtitle">{displayVariantLabel}</div>

          {visibleVariants.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {visibleVariants.map((variant) => {
                const active = variant.key === selectedVariant?.key
                return (
                  <button
                    key={variant.key}
                    type="button"
                    onClick={() => {
                      setSelectedVariantKey(variant.key)
                      setSlideIndex(0)
                    }}
                    className={cn(
                      "inline-flex h-8 items-center rounded-[8px] border px-3 text-xs font-semibold transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40",
                    )}
                  >
                    {resolvePptPreviewVariantDisplayLabel(deck, variant) || `${copy.variant} ${variant.key}`}
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="mt-3 rounded-[10px] border border-border bg-background/70 p-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{copy.loading}</span>
              </div>
            ) : error ? (
              <div className="text-sm text-muted-foreground">{error}</div>
            ) : selectedVariant?.preview?.htmlDocument && !currentSlide ? (
              <div className="text-sm text-muted-foreground">{copy.htmlOnly}</div>
            ) : (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  <span>{`${copy.slideCount}: ${currentSlideCount}`}</span>
                </div>
                <div className="text-xs text-muted-foreground">{copy.exportHint}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    disabled={!(currentSlide || selectedVariant?.preview?.htmlDocument)}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Expand className="h-4 w-4" />
                    <span>{copy.open}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownload()}
                    disabled={!canExport || Boolean(exportAction)}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {exportAction === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <span>{exportAction === "download" ? copy.downloading : copy.download}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveToAssets()}
                    disabled={!canExport || Boolean(exportAction) || isSavedToAssets}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSavedToAssets ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : exportAction === "assets" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LibraryBig className="h-4 w-4" />
                    )}
                    <span>
                      {isSavedToAssets
                        ? copy.savedToAssets
                        : exportAction === "assets"
                          ? copy.savingToAssets
                          : copy.saveToAssets}
                    </span>
                  </button>
                </div>
                {exportError ? (
                  <div className="text-xs text-destructive">{exportError}</div>
                ) : exportedArtifact?.downloadUrl ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">{copy.exportSucceeded}</div>
                    {exportedArtifact.fileName ? (
                      <div>
                        {copy.generatedFile}: {exportedArtifact.fileName}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <a
                        href={exportedArtifact.downloadUrl}
                        className="text-primary underline underline-offset-4"
                        download
                      >
                        {copy.retryDownload}
                      </a>
                      {isSavedToAssets || exportedArtifact.assetLibrary?.href ? (
                        <a
                          href={exportedArtifact.assetLibrary?.href || "/dashboard/assets"}
                          className="text-primary underline underline-offset-4"
                        >
                          {copy.openAssetLibrary}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-6xl border-border bg-background/95 p-3 sm:p-4">
          <DialogTitle className="sr-only">{copy.previewTitle}</DialogTitle>
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
              <div>
                <div className="artifact-title-text">{displayTitle}</div>
                <div className="artifact-subtitle">{displayVariantLabel || copy.title}</div>
              </div>
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                <span>{`${copy.slide} ${safeSlideIndex + 1} / ${currentSlideCount}`}</span>
              </div>
            </div>

            {visibleVariants.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {visibleVariants.map((variant) => {
                  const active = variant.key === selectedVariant?.key
                  return (
                    <button
                      key={variant.key}
                      type="button"
                      onClick={() => {
                        setSelectedVariantKey(variant.key)
                        setSlideIndex(0)
                      }}
                      className={cn(
                        "inline-flex h-8 items-center rounded-[8px] border px-3 text-xs font-semibold transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/40",
                    )}
                  >
                    {resolvePptPreviewVariantDisplayLabel(deck, variant) || `${copy.variant} ${variant.key}`}
                  </button>
                )
              })}
              </div>
            ) : null}

            {currentSlide ? (
              <>
                <div className="overflow-hidden rounded-[10px] border border-border bg-white">
                  <img
                    src={currentSlide.dataUrl}
                    alt={`${selectedVariant?.name || copy.title} ${safeSlideIndex + 1}`}
                    className="block h-auto max-h-[75vh] w-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSlideIndex((current) => Math.max(0, current - 1))}
                    disabled={safeSlideIndex <= 0}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-background px-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={copy.previous}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{copy.previous}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlideIndex((current) => Math.min(currentSlideCount - 1, current + 1))}
                    disabled={safeSlideIndex >= currentSlideCount - 1}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-background px-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={copy.next}
                  >
                    <span>{copy.next}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-[10px] border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                {selectedVariant?.preview?.htmlDocument ? copy.htmlOnly : copy.empty}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
