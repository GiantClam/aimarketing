"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, Expand, Eye, LayoutTemplate, Loader2 } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { cn } from "@/lib/utils"

type PptPreviewReportCardProps = {
  previewSessionId: string
  defaultVariantKey?: string | null
  variantKeys?: string[]
  isZh: boolean
}

type PreviewSessionApiResponse = {
  ok?: boolean
  error?: string
  previewSessionId?: string
  deck?: PptPreviewDeck
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
  }
}

export function PptPreviewReportCard({
  previewSessionId,
  defaultVariantKey,
  variantKeys,
  isZh,
}: PptPreviewReportCardProps) {
  const copy = getPreviewCopy(isZh)
  const [deck, setDeck] = useState<PptPreviewDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(defaultVariantKey ?? null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

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
  const slides = selectedVariant?.preview?.slides || []
  const currentSlideCount = slides.length
  const safeSlideIndex = currentSlideCount > 0 ? Math.min(slideIndex, currentSlideCount - 1) : 0
  const currentSlide = slides[safeSlideIndex] || null
  const coverAsset = selectedVariant?.preview?.cover || null

  useEffect(() => {
    if (safeSlideIndex !== slideIndex) {
      setSlideIndex(safeSlideIndex)
    }
  }, [safeSlideIndex, slideIndex])

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
          <div className="artifact-title-text">{deck?.title || copy.title}</div>
          <div className="artifact-subtitle">
            {selectedVariant?.name || selectedVariant?.key || copy.loading}
          </div>

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
                    {variant.name || `${copy.variant} ${variant.key}`}
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
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  disabled={!(currentSlide || selectedVariant?.preview?.htmlDocument)}
                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Expand className="h-4 w-4" />
                  <span>{copy.open}</span>
                </button>
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
                <div className="artifact-title-text">{deck?.title || copy.title}</div>
                <div className="artifact-subtitle">
                  {selectedVariant?.name || selectedVariant?.key || copy.title}
                </div>
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
                      {variant.name || `${copy.variant} ${variant.key}`}
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
