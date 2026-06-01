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

type SeoMetaWorkbenchProps = {
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
  initialTopic = "",
  initialAudience = "增长负责人",
  initialPageType = "landing-page",
  initialLanguage = "zh-CN",
  initialPreview = null,
}: SeoMetaWorkbenchProps) {
  const toolSlug = "ai-seo-meta-generator"
  const [topic, setTopic] = useState(initialTopic)
  const [audience, setAudience] = useState(initialAudience)
  const [pageType, setPageType] = useState<SeoPageType>(initialPageType)
  const [language, setLanguage] = useState<SeoLanguage>(initialLanguage)
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
      setStatusMessage("已生成 3 组 SEO Meta 方向，可直接复制到页面配置或程序化 SEO 模板。")
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
            <span className="text-sm font-medium">SEO Lead Gen Tool</span>
          </div>
          <CardTitle className="text-2xl">输入主题，直接得到 3 组 Meta 方向</CardTitle>
          <CardDescription className="max-w-3xl text-muted-foreground">
            把输入压到最少，把结果拉到最前。更像单任务工具，而不是阅读很多说明之后才能开始。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">页面主题</label>
            <Input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="例如：AI PPT generator"
              className="h-12 border-border/70 bg-background/80 text-foreground"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">目标受众</label>
                <Input
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="例如：增长负责人、独立开发者、内容团队"
                  className="h-12 border-border/70 bg-background/80 text-foreground"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">页面类型</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {seoPageTypeOptions.map((option) => (
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
                <label className="text-sm font-medium text-foreground">语言</label>
                <div className="flex flex-col gap-2">
                  {seoLanguageOptions.map((option) => (
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
                结果无需登录，可直接复制到工具页、落地页或程序化 SEO 模板里。
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-6 text-muted-foreground">一键生成 3 组不同意图的标题、描述、关键词和 H1。</div>
            <Button className="sm:min-w-52" size="lg" onClick={() => void generatePreview()} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? "正在生成 SEO Meta..." : "生成 3 组 Meta 方向"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-border/70 bg-card/85 text-foreground">
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl">{preview ? `${preview.topic} · SEO Meta 预览` : "Meta 结果面板"}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {preview ? "选择一个方向后，可直接复制标题、描述、关键词和 slug。" : "生成后，3 组结果会直接出现在这里。"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                无需登录
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                适合工具页与长尾 SEO
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                多版本可直接复制
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
                <h3 className="mt-4 text-xl font-medium text-foreground">先生成第一组 Meta 结果</h3>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  这个工具验证的是同一套 lead-tools runtime 能否承载不同结果形态，不再局限于 PPT 预览。
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
                      复制标题
                    </Button>
                  </div>

                  <div className="mt-6 grid gap-4">
                    <div className="rounded-2xl border border-border/70 bg-card p-4">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta Description</div>
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
                        <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">H1</div>
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
                        <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Slug</div>
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
                      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Keywords</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedVariant.keywords.map((keyword) => (
                          <Badge key={keyword} variant="outline" className="border-primary/20 bg-primary/5 text-foreground">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-card p-4">
                      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">CTA Copy</div>
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
