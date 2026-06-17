"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { AppLocale } from "@/lib/i18n/config"

type PublicMediaToolWorkbenchProps = {
  capabilitySlug: "ai-image" | "ai-video"
  locale: AppLocale
  currentUser: boolean
  loginHref: string
  workspaceHref: string
  runtimeStatus: "ready" | "deferred" | "runtime_disabled"
  accessState: "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required"
}

type MediaTaskSubmission = {
  provider: string
  mediaTarget: string
  requestedTarget?: string
  endpoint?: string | null
  taskId: string
  status: string
  raw?: Record<string, unknown> | null
}

type MediaTaskQuery = {
  taskId: string
  mediaTarget: string
  provider: string
  status: string
  results?: Array<{
    url?: string | null
    outputType?: string | null
    text?: string | null
  }> | null
}

function isTerminalStatus(status: string | null | undefined) {
  const normalized = String(status || "").toUpperCase()
  return normalized === "SUCCESS" || normalized === "FAILED"
}

function isVideoLikeResult(url: string | null | undefined, outputType: string | null | undefined) {
  if (String(outputType || "").toLowerCase().includes("video")) return true
  return /\.(mp4|webm|mov)(\?|$)/i.test(url || "")
}

export function PublicMediaToolWorkbench({
  capabilitySlug,
  locale,
  currentUser,
  loginHref,
  workspaceHref,
  runtimeStatus,
  accessState,
}: PublicMediaToolWorkbenchProps) {
  const isZh = locale === "zh"
  const copy = useMemo(
    () =>
      isZh
        ? {
            title: capabilitySlug === "ai-image" ? "公开媒体工作台" : "公开视频工作台",
            body:
              capabilitySlug === "ai-image"
                ? "直接在 public toolsite 里提交一次图片任务，平台会统一走 media execute 和 task query。"
                : "直接在 public toolsite 里提交一次视频工作流任务，平台会统一走 media execute 和 task query。",
            placeholder:
              capabilitySlug === "ai-image"
                ? "例如：为 AI Marketing 生成一张红黑企业风发布会主视觉。"
                : "例如：为 AI Marketing 生成一支 15 秒产品预告分镜。",
            submit: capabilitySlug === "ai-image" ? "提交图片任务" : "提交视频任务",
            refresh: "刷新任务状态",
            login: "登录后继续",
            workspace: "打开工作台",
            promptRequired: "先输入一个任务描述。",
            authRequired: "这个媒体工作台当前需要登录后执行。",
            deferred: "当前 runtime 仍处于 deferred 状态，暂时不能执行真实任务。",
            disabled: "当前 runtime 还没准备好，暂时不能执行真实任务。",
            currentTask: "当前任务",
            taskQueued: "任务已提交，平台会继续轮询状态。",
            taskFailed: "媒体任务执行失败。",
            taskStatus: "任务状态",
            provider: "Provider",
            results: "任务结果",
            noResults: "任务还没有返回可展示的结果。",
            runtime: "运行时",
            access: "访问门槛",
          }
        : {
            title: capabilitySlug === "ai-image" ? "Public media workbench" : "Public video workbench",
            body:
              capabilitySlug === "ai-image"
                ? "Submit an image task directly from the public toolsite. The platform routes it through the unified media execute and task-query flow."
                : "Submit a video workflow task directly from the public toolsite. The platform routes it through the unified media execute and task-query flow.",
            placeholder:
              capabilitySlug === "ai-image"
                ? "Example: Create a red-and-black enterprise launch key visual for AI Marketing."
                : "Example: Create a 15-second product teaser storyboard for AI Marketing.",
            submit: capabilitySlug === "ai-image" ? "Submit image task" : "Submit video task",
            refresh: "Refresh task status",
            login: "Log in to continue",
            workspace: "Open workspace",
            promptRequired: "Enter a task prompt first.",
            authRequired: "This media workbench currently requires login before execution.",
            deferred: "This runtime is still deferred, so real execution is not available yet.",
            disabled: "This runtime is not ready yet, so real execution is not available.",
            currentTask: "Current task",
            taskQueued: "Task submitted. The platform will continue polling for updates.",
            taskFailed: "The media task failed.",
            taskStatus: "Task status",
            provider: "Provider",
            results: "Results",
            noResults: "The task has not returned displayable results yet.",
            runtime: "Runtime",
            access: "Access",
          },
    [capabilitySlug, isZh],
  )

  const [prompt, setPrompt] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submission, setSubmission] = useState<MediaTaskSubmission | null>(null)
  const [task, setTask] = useState<MediaTaskQuery | null>(null)

  const action = capabilitySlug === "ai-image" ? "generate" : "generate"
  const canExecute = currentUser && runtimeStatus === "ready" && (accessState === "authorized" || accessState === "public")

  const refreshTask = useCallback(async (nextTaskId?: string) => {
    const taskId = nextTaskId || submission?.taskId
    if (!taskId) return

    setIsRefreshing(true)
    try {
      const response = await fetch(`/api/platform/media/tasks/${encodeURIComponent(taskId)}?target=${encodeURIComponent(capabilitySlug)}`, {
        cache: "no-store",
      })
      const data = (await response.json().catch(() => null)) as { error?: string; data?: MediaTaskQuery } | null
      if (!response.ok || !data?.data) {
        throw new Error(data?.error || copy.taskFailed)
      }
      setTask(data.data)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : copy.taskFailed)
    } finally {
      setIsRefreshing(false)
    }
  }, [capabilitySlug, copy.taskFailed, submission?.taskId])

  useEffect(() => {
    if (!task?.taskId || isTerminalStatus(task.status)) return

    const timer = window.setTimeout(() => {
      void refreshTask(task.taskId)
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [refreshTask, task?.taskId, task?.status])

  async function submitTask() {
    if (!prompt.trim()) {
      setError(copy.promptRequired)
      return
    }

    if (!currentUser) {
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
    setMessage(null)

    try {
      const response = await fetch(
        `/api/platform/capabilities/${encodeURIComponent(capabilitySlug)}/execute?action=${encodeURIComponent(action)}&locale=${encodeURIComponent(locale)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ prompt }),
        },
      )
      const data = (await response.json().catch(() => null)) as { error?: string; data?: MediaTaskSubmission } | null
      if (!response.ok || !data?.data) {
        throw new Error(data?.error || copy.taskFailed)
      }

      setSubmission(data.data)
      setTask({
        taskId: data.data.taskId,
        mediaTarget: data.data.mediaTarget,
        provider: data.data.provider,
        status: data.data.status,
        results: null,
      })
      setMessage(copy.taskQueued)
      await refreshTask(data.data.taskId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : copy.taskFailed)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-border/70 bg-card/85 p-4">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{copy.body}</p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{copy.submit}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={copy.placeholder}
              className="min-h-32 border-border/70 bg-card text-foreground"
            />

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                {copy.runtime}: {runtimeStatus}
              </Badge>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                {copy.access}: {accessState}
              </Badge>
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void submitTask()} disabled={isSubmitting || isRefreshing || !canExecute}>
                {isSubmitting ? "..." : copy.submit}
              </Button>
              {!currentUser ? (
                <Button variant="outline" asChild>
                  <Link href={loginHref}>{copy.login}</Link>
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href={workspaceHref}>{copy.workspace}</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{copy.currentTask}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {submission ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                    {copy.provider}: {submission.provider}
                  </Badge>
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                    {copy.taskStatus}: {task?.status || submission.status}
                  </Badge>
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                    task: {submission.taskId}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="ghost" onClick={() => void refreshTask()} disabled={isRefreshing}>
                    {isRefreshing ? "..." : copy.refresh}
                  </Button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">{copy.results}</h3>
                  {task?.results?.length ? (
                    <div className="grid gap-3">
                      {task.results.map((result, index) => {
                        const url = result.url || null
                        const videoLike = isVideoLikeResult(url, result.outputType)

                        return (
                          <div key={`${submission.taskId}-${index}`} className="rounded-2xl border border-border/70 bg-card p-3">
                            {url ? (
                              videoLike ? (
                                <video src={url} controls className="w-full rounded-xl bg-black/30" />
                              ) : (
                                <img src={url} alt={`task-result-${index + 1}`} className="w-full rounded-xl object-cover" />
                              )
                            ) : null}
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              {result.outputType ? <span>{result.outputType}</span> : null}
                              {url ? (
                                <Link href={url} target="_blank" className="text-primary hover:underline">
                                  {isZh ? "打开结果" : "Open result"}
                                </Link>
                              ) : null}
                            </div>
                            {result.text ? <p className="mt-2 text-sm text-muted-foreground">{result.text}</p> : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground">{copy.noResults}</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">{copy.noResults}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
