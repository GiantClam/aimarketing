"use client"

import { startTransition, useEffect, useMemo, useState } from "react"
import { Download, FileStack, Loader2, Lock, Play, Sparkles, WandSparkles } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { LoginGateDialog } from "@/components/lead-tools/login-gate-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  pptLanguageOptions,
  pptScenarioOptions,
  type PptLanguage,
  type PptPreviewDeck,
  type PptPreviewRequest,
  type PptScenario,
} from "@/lib/lead-tools/ppt-preview-data"
import {
  type ProtectedAction,
  getToolReturnPath,
  loadPptPreviewSession,
  savePptPreviewSession,
} from "@/lib/lead-tools/session"
import { getLeadToolEndpoint } from "@/lib/lead-tools/paths"
import { cn } from "@/lib/utils"

type PptPreviewWorkbenchProps = {
  initialPrompt?: string
  initialScenario?: PptScenario
  initialLanguage?: PptLanguage
  initialAction?: ProtectedAction
  initialDeck?: PptPreviewDeck | null
  skipSavedSession?: boolean
}

async function parseApiError(response: Response, fallbackMessage: string) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

export function PptPreviewWorkbench({
  initialPrompt = "",
  initialScenario = "marketing-campaign",
  initialLanguage = "zh-CN",
  initialAction,
  initialDeck = null,
  skipSavedSession = false,
}: PptPreviewWorkbenchProps) {
  const toolSlug = "ai-ppt-preview"
  const { user, isDemoMode } = useAuth()
  const [prompt, setPrompt] = useState(initialPrompt)
  const [scenario, setScenario] = useState<PptScenario>(initialScenario)
  const [language, setLanguage] = useState<PptLanguage>(initialLanguage)
  const [deck, setDeck] = useState<PptPreviewDeck | null>(initialDeck)
  const [selectedVariantKey, setSelectedVariantKey] = useState<string>(
    initialDeck?.variants[0]?.key ?? "professional-business",
  )
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRunningProtectedAction, setIsRunningProtectedAction] = useState(false)
  const [loginGateAction, setLoginGateAction] = useState<ProtectedAction | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    if (skipSavedSession) {
      return
    }

    const savedSession = loadPptPreviewSession()
    if (!savedSession) {
      return
    }

    setPrompt((currentPrompt) => currentPrompt || savedSession.request.prompt)
    setScenario(savedSession.request.scenario)
    setLanguage(savedSession.request.language)
    setDeck(savedSession.generatedDeck ?? null)
    setSelectedVariantKey(savedSession.selectedVariantKey ?? "professional-business")
    setSelectedSlideIndex(savedSession.selectedSlideIndex ?? 0)
  }, [skipSavedSession])

  useEffect(() => {
    if (!prompt.trim() && !deck) {
      return
    }

    const request: PptPreviewRequest = { prompt, scenario, language }

    savePptPreviewSession({
      request,
      selectedVariantKey,
      selectedSlideIndex,
      generatedDeck: deck ?? undefined,
      lastActionAt: new Date().toISOString(),
    })
  }, [prompt, scenario, language, selectedVariantKey, selectedSlideIndex, deck])

  const selectedVariant = useMemo(() => {
    if (!deck) {
      return null
    }

    return deck.variants.find((variant) => variant.key === selectedVariantKey) ?? deck.variants[0]
  }, [deck, selectedVariantKey])

  const currentSlide = selectedVariant?.slides[selectedSlideIndex]

  const redirectTo = getToolReturnPath(prompt, scenario, language, loginGateAction ?? undefined)
  const canUseProtectedActions = Boolean(user) && !isDemoMode

  const triggerPreviewDownload = async (currentDeck: PptPreviewDeck, variantKey: string) => {
    const response = await fetch(getLeadToolEndpoint(toolSlug, "download"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        deck: currentDeck,
        selectedVariantKey: variantKey,
      }),
    })

    if (response.status === 401) {
      setLoginGateAction("download")
      throw new Error("Authentication required")
    }

    if (!response.ok) {
      throw new Error(await parseApiError(response, "下载预览包失败"))
    }

    const blob = await response.blob()
    const disposition = response.headers.get("Content-Disposition")
    const fallbackFileName = `${currentDeck.title.replace(/\s+/g, "-").toLowerCase()}-${variantKey}.json`
    const fileNameMatch = disposition?.match(/filename="(.+)"/)
    const fileName = fileNameMatch?.[1] || fallbackFileName

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const runFinalize = async (currentDeck: PptPreviewDeck, variantKey: string) => {
    const response = await fetch(getLeadToolEndpoint(toolSlug, "finalize"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        deck: currentDeck,
        selectedVariantKey: variantKey,
      }),
    })

    if (response.status === 401) {
      setLoginGateAction("finalize")
      throw new Error("Authentication required")
    }

    const data = (await response.json()) as {
      error?: string
      message?: string
      exportPlan?: { selectedVariant?: string; slideCount?: number }
    }

    if (!response.ok) {
      throw new Error(data.error || "完整 PPT 生成失败")
    }

    setStatusMessage(
      `${data.message || "完整 PPT 生成任务已创建。"} 已选择 ${data.exportPlan?.selectedVariant || "当前风格"}，共 ${
        data.exportPlan?.slideCount || 0
      } 页。`,
    )
  }

  const generatePreview = async () => {
    if (!prompt.trim()) {
      setStatusMessage("先输入一个主题，再生成多风格预览。")
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
          prompt,
          scenario,
          language,
        }),
      })

      const data = (await response.json()) as { error?: string; deck?: PptPreviewDeck }

      if (!response.ok || !data.deck) {
        throw new Error(data.error || "生成预览失败")
      }

      const nextDeck = data.deck

      startTransition(() => {
        setDeck(nextDeck)
        setSelectedVariantKey(nextDeck.variants[0]?.key ?? "professional-business")
        setSelectedSlideIndex(0)
        setStatusMessage("已生成 4 种风格预览。可以切换风格、翻页查看，再决定是否继续导出。")
      })
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "生成预览失败")
    } finally {
      setIsGenerating(false)
    }
  }

  const runProtectedAction = async (action: ProtectedAction) => {
    if (!deck || !selectedVariant) {
      setStatusMessage("请先生成预览，再进行下载或完整生成。")
      return
    }

    if (!canUseProtectedActions) {
      setLoginGateAction(action)
      return
    }

    setIsRunningProtectedAction(true)

    try {
      if (action === "download") {
        await triggerPreviewDownload(deck, selectedVariant.key)
        setStatusMessage("已下载当前风格的 PPTX 文件，可以直接在 PowerPoint 或 Keynote 中继续编辑。")
        return
      }

      await runFinalize(deck, selectedVariant.key)
    } catch (error) {
      if (error instanceof Error && error.message !== "Authentication required") {
        setStatusMessage(error.message)
      }
    } finally {
      setIsRunningProtectedAction(false)
    }
  }

  useEffect(() => {
    if (!initialAction || !deck || !selectedVariant || !canUseProtectedActions || isRunningProtectedAction) {
      return
    }

    void (async () => {
      setIsRunningProtectedAction(true)

      try {
        if (initialAction === "download") {
          await triggerPreviewDownload(deck, selectedVariant.key)
          setStatusMessage("已为当前风格下载 PPTX 文件。你可以继续编辑，或返回生成新的版本。")
        } else {
          await runFinalize(deck, selectedVariant.key)
        }
      } catch (error) {
        if (error instanceof Error && error.message !== "Authentication required") {
          setStatusMessage(error.message)
        }
      } finally {
        setIsRunningProtectedAction(false)
      }
    })()
  }, [initialAction, deck, selectedVariant, canUseProtectedActions, isRunningProtectedAction])

  return (
    <>
      <div className="space-y-6">
        <Card className="border-border/70 bg-card/90 text-foreground shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <WandSparkles className="h-5 w-5" />
              <span className="text-sm font-medium">Fast Preview Layer</span>
            </div>
            <CardTitle className="text-2xl">输入主题，直接看 4 种 PPT 方向</CardTitle>
            <CardDescription className="max-w-3xl text-muted-foreground">
              先看结构和风格，再决定是否下载或生成完整 PPT。首屏只做一件事：尽快让你看到结果。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">主题</label>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-28 border-border/70 bg-background/80 text-base text-foreground placeholder:text-muted-foreground"
                placeholder="例如：为 AI Marketing 设计一个面向 B2B 客户的增长方案预览 PPT"
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">场景</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pptScenarioOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setScenario(option.value)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition",
                        scenario === option.value
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

              <div className="space-y-4 rounded-[1.5rem] border border-border/70 bg-background/75 p-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">语言</label>
                  <div className="flex flex-col gap-2">
                    {pptLanguageOptions.map((option) => (
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
                  游客先看结果，登录只发生在下载和完整生成时。
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm leading-6 text-muted-foreground">
                平台托管模型配置：预览优先速度，完整生成优先质量。
              </div>
              <Button className="sm:min-w-52" size="lg" onClick={() => void generatePreview()} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isGenerating ? "正在生成 4 种预览..." : "生成 4 种预览"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/70 bg-card/85 text-foreground">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <CardTitle className="text-2xl">{deck ? `${deck.title} · 多风格预览` : "预览结果面板"}</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {deck
                      ? "先切换风格，再翻页看关键内容。喜欢哪个方向，再继续下载或生成完整 PPT。"
                      : "生成后，结果会直接出现在这里。"}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                    游客可预览
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                    下载/完整生成需登录
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                    工具会话自动保留
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={canUseProtectedActions ? "outline" : "default"}
                  className={cn(
                    canUseProtectedActions ? "border-border/70 bg-background text-foreground hover:bg-primary/5" : "",
                  )}
                  onClick={() => void runProtectedAction("download")}
                  disabled={isRunningProtectedAction}
                >
                  {canUseProtectedActions ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  {canUseProtectedActions ? "下载预览包" : "登录后下载"}
                </Button>
                <Button onClick={() => void runProtectedAction("finalize")} disabled={isRunningProtectedAction}>
                  {canUseProtectedActions ? <Play className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  {canUseProtectedActions ? "生成完整 PPT" : "登录后生成完整 PPT"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {statusMessage ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
                  {statusMessage}
                </div>
              ) : null}

              {!deck || !selectedVariant || !currentSlide ? (
                <div className="rounded-[1.75rem] border border-dashed border-border/70 bg-background/75 p-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileStack className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-xl font-medium text-foreground">先生成第一版预览</h3>
                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    这个 MVP 会先产出一个可比较的 deck 预览层。后续只需要把真实后端生成器接到当前交互上，就能完成完整导出链路。
                  </p>
                </div>
              ) : (
                <Tabs value={selectedVariantKey} onValueChange={setSelectedVariantKey} className="gap-5">
                  <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-transparent p-0">
                    {deck.variants.map((variant) => (
                      <TabsTrigger
                        key={variant.key}
                        value={variant.key}
                        className="min-w-[160px] rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-left text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-foreground"
                      >
                        <div>
                          <div className="font-medium">{variant.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{variant.summary}</div>
                        </div>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {deck.variants.map((variant) => (
                    <TabsContent key={variant.key} value={variant.key} className="space-y-5">
                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                        <div
                          className="rounded-[2rem] border p-6 shadow-[0_30px_90px_-50px_rgba(0,0,0,0.8)]"
                          style={{
                            backgroundColor: variant.palette.background,
                            color: variant.palette.foreground,
                            borderColor: variant.palette.border,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: variant.palette.accent }}>
                                {currentSlide.kicker}
                              </div>
                              <h3 className="mt-3 text-3xl font-semibold">{currentSlide.title}</h3>
                              <p className="mt-4 max-w-2xl text-sm leading-7 opacity-80">{currentSlide.body}</p>
                            </div>
                            <div
                              className="rounded-full px-3 py-1 text-xs font-medium"
                              style={{ backgroundColor: `${variant.palette.accent}20`, color: variant.palette.accent }}
                            >
                              {selectedSlideIndex + 1} / {variant.slides.length}
                            </div>
                          </div>

                          <div className="mt-8 grid gap-3 md:grid-cols-2">
                            {currentSlide.bullets.map((bullet) => (
                              <div
                                key={bullet}
                                className="rounded-2xl border px-4 py-3 text-sm leading-6"
                                style={{ backgroundColor: variant.palette.panel, borderColor: variant.palette.border }}
                              >
                                {bullet}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <Card className="border-border/70 bg-background/75 text-foreground">
                            <CardHeader className="space-y-2">
                              <CardTitle className="text-lg">{variant.name} 的强项</CardTitle>
                              <CardDescription className="text-muted-foreground">{variant.summary}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {variant.strengths.map((strength) => (
                                <div
                                  key={strength}
                                  className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm"
                                >
                                  {strength}
                                </div>
                              ))}
                            </CardContent>
                          </Card>

                          <div className="grid gap-2">
                            {variant.slides.map((slide, index) => (
                              <button
                                key={slide.id}
                                type="button"
                                onClick={() => setSelectedSlideIndex(index)}
                                className={cn(
                                  "rounded-2xl border px-4 py-3 text-left transition",
                                  selectedSlideIndex === index
                                    ? "border-primary bg-primary/12 text-foreground"
                                    : "border-border/70 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-primary/5",
                                )}
                              >
                                <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{slide.kicker}</div>
                                <div className="mt-2 font-medium text-foreground">{slide.title}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <LoginGateDialog
        open={Boolean(loginGateAction)}
        onOpenChange={(open) => setLoginGateAction(open ? loginGateAction : null)}
        actionLabel={loginGateAction === "finalize" ? "完整生成" : "下载"}
        redirectTo={redirectTo}
      />
    </>
  )
}
