"use client"

import { useMemo, useState } from "react"
import { Check, Copy, Loader2, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  seoLanguageOptions,
  seoPageTypeOptions,
  type SeoLanguage,
  type SeoMetaPreview,
  type SeoPageType,
} from "@/lib/lead-tools/seo-meta-data"
import { getLeadToolEndpoint } from "@/lib/lead-tools/paths"
import { cn } from "@/lib/utils"
import type { AppLocale } from "@/lib/i18n/config"

type SeoMetaWorkbenchProps = {
  locale?: AppLocale
  titleOnly?: boolean
  initialTopic?: string
  initialAudience?: string
  initialPageType?: SeoPageType
  initialLanguage?: SeoLanguage
  initialPreview?: SeoMetaPreview | null
}

async function parseApiError(response: Response, fallbackMessage: string) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

export function SeoMetaWorkbench({
  locale = "zh",
  titleOnly = false,
  initialTopic = "",
  initialAudience,
  initialPageType = "landing-page",
  initialLanguage,
  initialPreview = null,
}: SeoMetaWorkbenchProps) {
  const toolSlug = "ai-seo-meta-generator"
  const isEnglish = locale === "en"
  const copy = isEnglish
    ? {
        eyebrow: titleOnly ? "SEO TITLE GENERATOR" : "SEO META LEAD GEN TOOL",
        title: titleOnly ? "Generate SEO titles from a keyword" : "Get 3 SEO title and meta directions from one topic",
        description: titleOnly
          ? "Enter a keyword, page type, and audience to generate click-worthy SEO title options you can copy into a live page."
          : "Enter a topic and get three search-intent-aware title, description, H1, and CTA directions without signing in.",
        topicLabel: "Keyword or page topic",
        topicPlaceholder: "For example: AI workspace for marketing teams",
        audienceLabel: "Target audience",
        audiencePlaceholder: "For example: marketing teams, SEO managers, or founders",
        pageTypeLabel: "Page type",
        languageLabel: "Output language",
        noLogin: "No sign-in required",
        resultHint: "Copy the result into your title tag, page brief, or SEO template.",
        generateHint: titleOnly
          ? "Generate three angles: conversion, long-tail coverage, and authority."
          : "Generate three different intent angles for titles, descriptions, keywords, and H1.",
        generating: titleOnly ? "Generating SEO titles..." : "Generating SEO meta...",
        generate: titleOnly ? "Generate SEO titles" : "Generate 3 meta directions",
        resultTitle: titleOnly ? "SEO title results" : "Meta result panel",
        resultDescription: titleOnly
          ? "Choose an angle and copy a title, description, H1, slug, or CTA."
          : "Choose an angle and copy the title, description, keywords, H1, or slug.",
        emptyTitle: titleOnly ? "Generate your first SEO title" : "Generate your first meta direction",
        emptyBody: titleOnly
          ? "The results will appear here as three distinct title angles for the same search intent."
          : "The results will appear here as three distinct SEO directions.",
        copiedTitle: "Copy title",
        labels: { meta: "Meta Description", h1: "H1", slug: "Slug", keywords: "Keywords", cta: "CTA Copy" },
        status: "Generated 3 SEO directions. Copy the best fit into your page.",
      }
    : {
        eyebrow: titleOnly ? "SEO 标题生成器" : "SEO Lead Gen Tool",
        title: titleOnly ? "输入关键词，直接生成 SEO 标题" : "输入主题，直接得到 3 组 Meta 方向",
        description: titleOnly
          ? "输入关键词、页面类型和受众，生成可以直接放进页面的高点击率 SEO 标题。"
          : "把输入压到最少，把结果拉到最前。更像单任务工具，而不是阅读很多说明之后才能开始。",
        topicLabel: "页面主题或关键词",
        topicPlaceholder: "例如：AI PPT generator",
        audienceLabel: "目标受众",
        audiencePlaceholder: "例如：增长负责人、独立开发者、内容团队",
        pageTypeLabel: "页面类型",
        languageLabel: "语言",
        noLogin: "无需登录",
        resultHint: "可直接复制到工具页、落地页或程序化 SEO 模板里。",
        generateHint: "一键生成 3 组不同意图的标题、描述、关键词和 H1。",
        generating: "正在生成 SEO Meta...",
        generate: "生成 3 组 Meta 方向",
        resultTitle: "Meta 结果面板",
        resultDescription: "生成后，3 组结果会直接出现在这里。",
        emptyTitle: "先生成第一组 Meta 结果",
        emptyBody: "这个工具验证的是同一套 lead-tools runtime 能否承载不同结果形态，不再局限于 PPT 预览。",
        copiedTitle: "复制标题",
        labels: { meta: "Meta Description", h1: "H1", slug: "Slug", keywords: "Keywords", cta: "CTA Copy" },
        status: "已生成 3 组 SEO 方向，可直接复制到页面配置。",
      }
  const pageTypeOptions = isEnglish
    ? [
        { value: "landing-page" as const, label: "Landing page", description: "For product, acquisition, and tool pages" },
        { value: "blog-post" as const, label: "Blog post", description: "For long-tail and educational search intent" },
        { value: "product-page" as const, label: "Product page", description: "For product, pricing, and conversion pages" },
        { value: "feature-page" as const, label: "Feature page", description: "For focused capability and programmatic pages" },
      ]
    : seoPageTypeOptions
  const languageOptions = isEnglish
    ? [
        { value: "zh-CN" as const, label: "Chinese" },
        { value: "en-US" as const, label: "English" },
      ]
    : seoLanguageOptions
  const [topic, setTopic] = useState(initialTopic)
  const [audience, setAudience] = useState(initialAudience ?? (isEnglish ? "Marketing teams" : "增长负责人"))
  const [pageType, setPageType] = useState<SeoPageType>(initialPageType)
  const [language, setLanguage] = useState<SeoLanguage>(initialLanguage ?? (isEnglish ? "en-US" : "zh-CN"))
  const [preview, setPreview] = useState<SeoMetaPreview | null>(initialPreview)
  const [selectedVariantKey, setSelectedVariantKey] = useState(initialPreview?.variants[0]?.key ?? "conversion-first")
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const selectedVariant = useMemo(() => {
    if (!preview) {
      return null
    }

    return preview.variants.find((variant) => variant.key === selectedVariantKey) ?? preview.variants[0]
  }, [preview, selectedVariantKey])

  const copyText = async (fieldKey: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedField(fieldKey)
    window.setTimeout(() => setCopiedField(null), 1200)
  }

  const generatePreview = async () => {
    if (!topic.trim()) {
      setStatusMessage("先输入页面主题，再生成 SEO Meta 版本。")
      return
    }

    if (!audience.trim()) {
      setStatusMessage("请输入目标受众。")
      return
    }

    setIsGenerating(true)
    setStatusMessage(null)

    try {
      const response = await fetch(getLeadToolEndpoint(toolSlug, "preview"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          topic,
          audience,
          pageType,
          language,
        }),
      })

      const data = (await response.json()) as { error?: string; preview?: SeoMetaPreview }

      if (!response.ok || !data.preview) {
        throw new Error(await parseApiError(response, "生成 SEO Meta 失败"))
      }

      setPreview(data.preview)
      setSelectedVariantKey(data.preview.variants[0]?.key ?? "conversion-first")
      setStatusMessage(copy.status)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "生成 SEO Meta 失败")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/90 text-foreground shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <Search className="h-5 w-5" />
            <span className="text-sm font-medium">{copy.eyebrow}</span>
          </div>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
          <CardDescription className="max-w-3xl text-muted-foreground">
            {copy.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">{copy.topicLabel}</label>
            <Input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={copy.topicPlaceholder}
              className="h-12 border-border/70 bg-background/80 text-foreground"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">{copy.audienceLabel}</label>
                <Input
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder={copy.audiencePlaceholder}
                  className="h-12 border-border/70 bg-background/80 text-foreground"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">{copy.pageTypeLabel}</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pageTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPageType(option.value)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition",
                        pageType === option.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/70 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-primary/5",
                      )}
                    >
                      <div className="font-medium text-foreground">{option.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-border/70 bg-background/75 p-4">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">{copy.languageLabel}</label>
                <div className="flex flex-col gap-2">
                  {languageOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={language === option.value ? "default" : "outline"}
                      className={cn(
                        "justify-start",
                        language !== option.value
                          ? "border-border/70 bg-background text-foreground hover:bg-primary/5"
                          : "",
                      )}
                      onClick={() => setLanguage(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                {copy.noLogin}. {copy.resultHint}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-6 text-muted-foreground">{copy.generateHint}</div>
            <Button className="sm:min-w-52" size="lg" onClick={() => void generatePreview()} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? copy.generating : copy.generate}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-border/70 bg-card/85 text-foreground">
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl">{preview ? `${preview.topic} · ${copy.resultTitle}` : copy.resultTitle}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {preview ? copy.resultDescription : copy.resultHint}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {copy.noLogin}
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                {isEnglish ? "Built for tool pages and long-tail SEO" : "适合工具页与长尾 SEO"}
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                {isEnglish ? "Copy-ready variants" : "多版本可直接复制"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {statusMessage ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
                {statusMessage}
              </div>
            ) : null}

            {!preview || !selectedVariant ? (
              <div className="rounded-[1.75rem] border border-dashed border-border/70 bg-background/75 p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-xl font-medium text-foreground">{copy.emptyTitle}</h3>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {copy.emptyBody}
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  {preview.variants.map((variant) => (
                    <button
                      key={variant.key}
                      type="button"
                      onClick={() => setSelectedVariantKey(variant.key)}
                      className={cn(
                        "rounded-2xl border px-4 py-4 text-left transition",
                        selectedVariantKey === variant.key
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/70 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-primary/5",
                      )}
                    >
                      <div className="text-sm font-medium text-foreground">{variant.name}</div>
                      <div className="mt-2 text-sm leading-6 text-muted-foreground">{variant.angle}</div>
                    </button>
                  ))}
                </div>

                <div className="rounded-[1.75rem] border border-border/70 bg-background/80 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-primary">{selectedVariant.name}</div>
                      <h3 className="mt-2 text-2xl font-semibold text-foreground">{selectedVariant.title}</h3>
                    </div>
                    <Button
                      variant="outline"
                      className="border-border/70 bg-background text-foreground hover:bg-primary/5"
                      onClick={() => void copyText("title", selectedVariant.title)}
                    >
                      {copiedField === "title" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copy.copiedTitle}
                    </Button>
                  </div>

                  <div className="mt-6 grid gap-4">
                    <div className="rounded-2xl border border-border/70 bg-card p-4">
                        <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.labels.meta}</div>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm leading-7 text-foreground">{selectedVariant.description}</p>
                        <Button
                          variant="ghost"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => void copyText("description", selectedVariant.description)}
                        >
                          {copiedField === "description" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-card p-4">
                        <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.labels.h1}</div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-foreground">{selectedVariant.h1}</p>
                          <Button
                            variant="ghost"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => void copyText("h1", selectedVariant.h1)}
                          >
                            {copiedField === "h1" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-card p-4">
                        <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.labels.slug}</div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-foreground">/{selectedVariant.slug}</p>
                          <Button
                            variant="ghost"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => void copyText("slug", selectedVariant.slug)}
                          >
                            {copiedField === "slug" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-card p-4">
                      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.labels.keywords}</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedVariant.keywords.map((keyword) => (
                          <Badge key={keyword} variant="outline" className="border-primary/20 bg-primary/5 text-foreground">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-card p-4">
                      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.labels.cta}</div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-foreground">{selectedVariant.cta}</p>
                        <Button
                          variant="ghost"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => void copyText("cta", selectedVariant.cta)}
                        >
                          {copiedField === "cta" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
