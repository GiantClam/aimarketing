"use client"

import { useMemo, useState } from "react"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { AppLocale } from "@/lib/i18n/config"
import { getDeferredEntryCopy, getDeferredAvailabilityLabel, isDeferredAvailability } from "@/lib/platform/deferred-entry"
import type { PlatformDirectoryAvailability } from "@/lib/platform/directory-config"

type RegistryExecutionPanelProps = {
  locale: AppLocale
  surface: "public" | "workspace"
  itemType: "capability" | "agent" | "plugin" | "mcp_service" | "workflow"
  slug: string
  bindingTarget: string
  runtimeStatus: "ready" | "deferred" | "runtime_disabled" | null
  availability?: PlatformDirectoryAvailability
  accessState: "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required" | null
  currentUser: boolean
  loginHref?: string
  compact?: boolean
}

type ExecutionUiSpec = {
  action: string
  promptLabel: string
  promptPlaceholder: string
  buildBody: (prompt: string, locale: AppLocale) => Record<string, unknown>
}

type ExecuteResult = {
  message?: string
  conversationId?: string
  provider?: string
  providerModel?: string
  taskId?: string
  task_id?: string
  status?: string
  deck?: { variants?: Array<unknown> }
  accepted?: boolean
  [key: string]: unknown
}

function getExecutionUiSpec(bindingTarget: string, locale: AppLocale): ExecutionUiSpec | null {
  if (bindingTarget === "ai-chat" || bindingTarget === "agent-platform") {
    return {
      action: "chat",
      promptLabel: locale === "zh" ? "问题" : "Prompt",
      promptPlaceholder:
        locale === "zh"
          ? "例如：为 AI Marketing 规划一个新的增长活动。"
          : "Example: Plan a new growth campaign for AI Marketing.",
      buildBody: (prompt) => ({
        message: prompt,
        stream: false,
      }),
    }
  }

  if (bindingTarget === "content-repurpose") {
    return {
      action: "execute",
      promptLabel: locale === "zh" ? "改写任务" : "Repurpose prompt",
      promptPlaceholder:
        locale === "zh"
          ? "例如：把这段产品说明改写成 3 条适合 LinkedIn 的短帖。"
          : "Example: Turn this product note into 3 LinkedIn-ready short posts.",
      buildBody: (prompt, nextLocale) => ({
        query: prompt,
        platform: "linkedin",
        mode: "chat",
        language: nextLocale === "zh" ? "zh-CN" : "en-US",
      }),
    }
  }

  if (bindingTarget === "campaign-launch" || bindingTarget === "ai-ppt") {
    return {
      action: "preview",
      promptLabel: locale === "zh" ? "活动主题" : "Campaign prompt",
      promptPlaceholder:
        locale === "zh"
          ? "例如：AI Marketing 新产品发布会 PPT。"
          : "Example: AI Marketing new product launch deck.",
      buildBody: (prompt, nextLocale) => ({
        prompt,
        scenario: "product-launch",
        language: nextLocale === "zh" ? "zh-CN" : "en-US",
      }),
    }
  }

  if (bindingTarget === "ai-image") {
    return {
      action: "generate",
      promptLabel: locale === "zh" ? "图片任务" : "Image prompt",
      promptPlaceholder:
        locale === "zh"
          ? "例如：一张红黑企业风产品发布海报。"
          : "Example: A red-and-black enterprise-style product launch poster.",
      buildBody: (prompt) => ({ prompt }),
    }
  }

  if (bindingTarget === "ai-video" || bindingTarget === "visual-ad-pipeline") {
    return {
      action: "workflow-plan",
      promptLabel: locale === "zh" ? "视频任务" : "Video prompt",
      promptPlaceholder:
        locale === "zh"
          ? "例如：为 AI Marketing 生成 15 秒产品预告分镜。"
          : "Example: Generate a 15-second product teaser storyboard for AI Marketing.",
      buildBody: (prompt) => ({ prompt }),
    }
  }

  return null
}

function renderResultSummary(locale: AppLocale, result: ExecuteResult) {
  if (typeof result.message === "string" && result.message.trim()) {
    return result.message
  }

  const taskId = typeof result.taskId === "string" ? result.taskId : typeof result.task_id === "string" ? result.task_id : null
  if (taskId) {
    return locale === "zh" ? `任务已提交：${taskId}` : `Task submitted: ${taskId}`
  }

  if (result.deck && Array.isArray(result.deck.variants)) {
    return locale === "zh"
      ? `已返回 ${result.deck.variants.length} 个预览方向。`
      : `Returned ${result.deck.variants.length} preview variants.`
  }

  return JSON.stringify(result, null, 2)
}

export function RegistryExecutionPanel({
  locale,
  surface,
  itemType,
  slug,
  bindingTarget,
  runtimeStatus,
  availability,
  accessState,
  currentUser,
  loginHref,
  compact = false,
}: RegistryExecutionPanelProps) {
  const deferred = runtimeStatus === "deferred" || isDeferredAvailability(availability)
  const deferredCopy = getDeferredEntryCopy(locale, availability)
  const spec = useMemo(() => getExecutionUiSpec(bindingTarget, locale), [bindingTarget, locale])
  const [prompt, setPrompt] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [resultMeta, setResultMeta] = useState<{ provider?: string; status?: string; taskId?: string | null } | null>(null)
  const requiresLogin = accessState === "login_required" || accessState === "public_then_login" || accessState === "authorized"
  const requiresElevatedAccess = accessState === "permission_required" || accessState === "admin_required"

  const copy =
    locale === "zh"
      ? {
          title: compact ? "快速执行" : "统一执行入口",
          body: "直接通过平台注册表的 execute 路由触发当前绑定目标，不需要绕回单独的 legacy URL。",
          promptRequired: "先输入一个执行说明。",
          authRequired: "当前需要登录后执行。",
          restricted: "当前条目需要更高的企业权限后才能执行。",
          deferred: "当前绑定目标仍处于 deferred 状态，暂时不能真实执行。",
          disabled: "当前 runtime 还没准备好，暂时不能真实执行。",
          unsupported: "这个条目当前只有目录和绑定位，还没有可执行动作。",
          run: compact ? "执行" : "运行绑定目标",
          login: "登录后继续",
        }
      : {
          title: compact ? "Quick run" : "Unified execution entry",
          body: "Trigger the current binding target directly through the platform registry execute route instead of bouncing back to a separate legacy URL.",
          promptRequired: "Enter an execution prompt first.",
          authRequired: "Login is currently required before execution.",
          restricted: "This item currently requires elevated enterprise access before execution.",
          deferred: "This binding target is still deferred, so real execution is not available yet.",
          disabled: "This runtime is not ready yet, so real execution is not available.",
          unsupported: "This item currently exposes directory and binding state only, without an executable action yet.",
          run: compact ? "Run" : "Run binding target",
          login: "Log in to continue",
        }

  if (deferred) {
    const deferredContent = (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
            {getDeferredAvailabilityLabel(locale, availability)}
          </Badge>
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
            {bindingTarget ? bindingTarget.toUpperCase() : slug.toUpperCase()}
          </Badge>
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{deferredCopy.title}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{deferredCopy.body}</p>
        </div>
        {loginHref ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link href={loginHref}>{deferredCopy.secondaryActionLabel}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    )

    if (compact) {
      return <div className="mt-5 rounded-[8px] border border-border/70 bg-background/55 p-4">{deferredContent}</div>
    }

    return (
      <Card className="public-panel rounded-[12px] border border-border bg-card/80 p-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
            {deferredCopy.badgeLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">{deferredContent}</CardContent>
      </Card>
    )
  }

  async function runExecution() {
    if (!spec) {
      setError(copy.unsupported)
      return
    }
    if (!prompt.trim()) {
      setError(copy.promptRequired)
      return
    }
    if (requiresElevatedAccess) {
      setError(copy.restricted)
      return
    }
    if (!currentUser && requiresLogin) {
      setError(copy.authRequired)
      return
    }
    if (runtimeStatus === "deferred") {
      setError(copy.deferred)
      return
    }
    if (runtimeStatus !== "ready") {
      setError(copy.disabled)
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSummary(null)

    try {
      const response = await fetch(
        itemType === "capability"
          ? `/api/platform/capabilities/${encodeURIComponent(slug)}/execute?action=${encodeURIComponent(spec.action)}&locale=${encodeURIComponent(locale)}`
          : `/api/platform/registry/${encodeURIComponent(itemType)}/${encodeURIComponent(slug)}/execute?action=${encodeURIComponent(spec.action)}&locale=${encodeURIComponent(locale)}&surface=${encodeURIComponent(surface)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(spec.buildBody(prompt, locale)),
        },
      )

      const data = (await response.json().catch(() => null)) as { error?: string; data?: ExecuteResult } | ExecuteResult | null
      const payload: ExecuteResult | null =
        data && typeof data === "object" && "data" in data && data.data && typeof data.data === "object"
          ? (data.data as ExecuteResult)
          : data && typeof data === "object"
            ? (data as ExecuteResult)
            : null

      if (!response.ok || !payload) {
        throw new Error((data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : null) || "execution_failed")
      }

      const taskId =
        typeof payload.taskId === "string" ? payload.taskId : typeof payload.task_id === "string" ? payload.task_id : null
      setResultMeta({
        provider: typeof payload.provider === "string" ? payload.provider : undefined,
        status: typeof payload.status === "string" ? payload.status : undefined,
        taskId,
      })
      setSummary(renderResultSummary(locale, payload))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "execution_failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  const content = (
    <div className="space-y-4">
      {!compact ? <p className="text-sm leading-6 text-muted-foreground">{copy.body}</p> : null}
      {!spec ? (
        <p className="text-sm leading-6 text-muted-foreground">{copy.unsupported}</p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{spec.promptLabel}</div>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={spec.promptPlaceholder}
              className={compact ? "min-h-24 border-border/70 bg-card text-foreground" : "min-h-32 border-border/70 bg-card text-foreground"}
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {summary ? (
            <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm leading-6 text-foreground">
              {summary}
            </div>
          ) : null}
          {resultMeta ? (
            <div className="flex flex-wrap gap-2">
              {resultMeta.provider ? (
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                  {resultMeta.provider}
                </Badge>
              ) : null}
              {resultMeta.status ? (
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                  {resultMeta.status}
                </Badge>
              ) : null}
              {resultMeta.taskId ? (
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                  {resultMeta.taskId}
                </Badge>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void runExecution()}
              disabled={
                isSubmitting ||
                (!currentUser && requiresLogin) ||
                requiresElevatedAccess ||
                runtimeStatus !== "ready"
              }
            >
              {isSubmitting ? "..." : copy.run}
            </Button>
            {!currentUser && loginHref ? (
              <Button variant="outline" asChild>
                <Link href={loginHref}>{copy.login}</Link>
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )

  if (compact) {
    return <div className="mt-5 rounded-[8px] border border-border/70 bg-background/55 p-4">{content}</div>
  }

  return (
    <Card className="public-panel rounded-[12px] border border-border bg-card/80 p-0">
      <CardHeader className="p-6 pb-0">
        <CardTitle className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
          {copy.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">{content}</CardContent>
    </Card>
  )
}
