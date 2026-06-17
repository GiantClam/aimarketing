"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { buildWorkflowRunStatusPath } from "@/lib/workflows/run-status-path"

type WorkflowRunnerItem = {
  slug: string
  title: string
  summary: string
  bindingTarget: string
  runtimeStatus: "ready" | "deferred" | "runtime_disabled" | null
}

type WorkflowRunDetail = {
  id: number
  status: string
  events: Array<{ id: number; message: string; level: string }>
  artifacts: Array<{ id: number; title: string }>
}

export function WorkspaceWorkflowRunner({
  locale,
  items,
  title,
  description,
  className,
  compact = false,
}: {
  locale: "zh" | "en"
  items: WorkflowRunnerItem[]
  title?: string
  description?: string
  className?: string
  compact?: boolean
}) {
  const [selectedSlug, setSelectedSlug] = useState(items[0]?.slug || "")
  const [prompt, setPrompt] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [run, setRun] = useState<WorkflowRunDetail | null>(null)
  const [detailPath, setDetailPath] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const detailRequestInFlightRef = useRef(false)

  const selectedItem = items.find((item) => item.slug === selectedSlug) || items[0] || null

  useEffect(() => {
    if (!detailPath || !run || (run.status !== "running" && run.status !== "queued")) return

    let cancelled = false
    detailRequestInFlightRef.current = false

    const refreshRun = async () => {
      if (detailRequestInFlightRef.current) return
      detailRequestInFlightRef.current = true
      try {
        const response = await fetch(buildWorkflowRunStatusPath(detailPath), {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null)
        if (!response?.ok) return
        const payload = await response.json().catch(() => null)
        if (!cancelled && payload?.data?.run) {
          setRun((current) => ({
            ...(current || {}),
            ...(payload.data.run as WorkflowRunDetail),
          }))
        }
      } finally {
        detailRequestInFlightRef.current = false
      }
    }

    void refreshRun()
    const timer = window.setInterval(() => {
      void refreshRun()
    }, 3000)

    return () => {
      cancelled = true
      detailRequestInFlightRef.current = false
      window.clearInterval(timer)
    }
  }, [detailPath, run])

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Workflow Runner",
          title: "工作流运行面板",
          description: "这里走真实的 workflow run API：会创建本地 run、记录事件，并返回可轮询的详情路径。",
          selectLabel: "选择模板",
          promptLabel: "输入内容",
          promptPlaceholder: "输入 brief、内容链接、活动主题或需要复用的原始文本……",
          run: "启动工作流",
          running: "工作流已提交，正在轮询本地 run。",
          success: "工作流响应已写入本地 run。",
          failed: "工作流启动失败",
          viewTask: "查看任务详情",
          notReady: "当前模板尚未接入可运行 runtime。",
        }
      : {
          eyebrow: "Workflow Runner",
          title: "Workflow runner",
          description: "This hits the real workflow run API: it creates a local run, stores events, and returns a pollable detail path.",
          selectLabel: "Choose template",
          promptLabel: "Input",
          promptPlaceholder: "Enter a brief, content link, campaign theme, or source text to repurpose...",
          run: "Run workflow",
          running: "Workflow dispatched. Polling the local run now.",
          success: "Workflow response stored on the local run.",
          failed: "Workflow run failed",
          viewTask: "View task details",
          notReady: "This template is not connected to a runnable runtime yet.",
        }

  const submit = async () => {
    if (!selectedItem) return
    if (selectedItem.runtimeStatus !== "ready") {
      setMessage(copy.notReady)
      return
    }

    setSubmitting(true)
    setMessage("")

    try {
      const response = await fetch(`/api/platform/workflows/${selectedItem.slug}/run?locale=${locale}&surface=workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          prompt,
          bindingTarget: selectedItem.bindingTarget,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data?.run) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "workflow_run_failed")
      }

      setRun(payload.data.run as WorkflowRunDetail)
      setDetailPath(payload.data.detailPath as string)
      setMessage(payload.data.run.status === "running" || payload.data.run.status === "queued" ? copy.running : copy.success)
    } catch (error) {
      setMessage(`${copy.failed}: ${error instanceof Error ? error.message : "unknown_error"}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className={cn(compact ? "" : "public-grid-bg workspace-page-shell-bottom mx-auto max-w-7xl", className)}>
      <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
        <div className="space-y-3">
          <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className={cn("font-display font-extrabold uppercase tracking-[0.02em] text-foreground", compact ? "text-2xl" : "text-3xl")}>
            {title || copy.title}
          </h2>
          <p className="max-w-4xl text-sm leading-7 text-muted-foreground">{description || copy.description}</p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="grid gap-2 text-sm text-foreground">
              <span className="dashboard-kicker text-muted-foreground">{copy.selectLabel}</span>
              <select
                className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
                value={selectedSlug}
                onChange={(event) => setSelectedSlug(event.target.value)}
              >
                {items.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedItem ? (
              <div className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                <div className="font-medium text-foreground">{selectedItem.title}</div>
                <div className="mt-2 text-muted-foreground">{selectedItem.summary}</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <label className="grid gap-2 text-sm text-foreground">
              <span className="dashboard-kicker text-muted-foreground">{copy.promptLabel}</span>
              <textarea
                className="dashboard-chip min-h-32 rounded-[4px] border border-border bg-background px-3 py-3 text-sm"
                placeholder={copy.promptPlaceholder}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button className="public-button-primary h-10 px-4" type="button" disabled={submitting || !selectedItem} onClick={() => void submit()}>
                {copy.run}
              </Button>
              {run ? (
                <Link
                  href={`/dashboard/tasks/${run.id}`}
                  className="dashboard-chip rounded-[4px] px-4 py-2 text-sm text-foreground transition hover:bg-primary hover:text-primary-foreground"
                >
                  {copy.viewTask}
                </Link>
              ) : null}
            </div>

            {message ? <div className="text-sm text-muted-foreground">{message}</div> : null}

            {run ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  Run ID: {run.id}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  Status: {run.status}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85 md:col-span-2">
                  Events: {run.events.map((event) => event.message).join(" -> ") || "none"}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85 md:col-span-2">
                  Artifacts: {run.artifacts.map((artifact) => `#${artifact.id} ${artifact.title}`).join(", ") || "none"}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
