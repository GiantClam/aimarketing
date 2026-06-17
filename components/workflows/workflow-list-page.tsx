"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { WorkflowDefinition } from "@/lib/workflows/store"

type WorkflowListDefinition = Omit<WorkflowDefinition, "createdAt" | "updatedAt"> & {
  createdAt: string
  updatedAt: string
}

type WorkflowListRunItem = {
  id: number
  workflowId: number | null
  itemSlug: string
  status: string
  createdAt: string | null
  finishedAt: string | null
}

const WORKFLOW_CARDS_PER_PAGE = 7

function formatTimestamp(value: string | null, locale: "zh" | "en") {
  if (!value) return locale === "zh" ? "未记录" : "Not recorded"

  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
  } catch {
    return value
  }
}

function getStatusTone(status: string) {
  if (status === "succeeded" || status === "live") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
  if (status === "failed" || status === "archived") return "border-rose-500/30 bg-rose-500/10 text-rose-200"
  if (status === "running") return "border-amber-500/30 bg-amber-500/10 text-amber-100"
  return "border-primary/30 bg-background/70 text-foreground"
}

export function WorkflowListPage({
  locale,
  initialWorkflows,
  recentRuns,
}: {
  locale: "zh" | "en"
  initialWorkflows: WorkflowListDefinition[]
  recentRuns: WorkflowListRunItem[]
}) {
  const router = useRouter()
  const [workflows, setWorkflows] = useState(initialWorkflows)
  const [submitting, setSubmitting] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(workflows.length / WORKFLOW_CARDS_PER_PAGE))
  const pagedWorkflows = useMemo(() => {
    const startIndex = (currentPage - 1) * WORKFLOW_CARDS_PER_PAGE
    return workflows.slice(startIndex, startIndex + WORKFLOW_CARDS_PER_PAGE)
  }, [currentPage, workflows])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Workflow Builder",
          title: "工作流",
          description:
            "把站内已经跑顺的上传、文案、图片、视频和 PPT 生产链保存成可重复执行的固定流程，输入走素材库语义，输出走作品库语义。",
          createTitle: "新建工作流",
          createDescription: "点击后直接创建一个空白工作流并进入 builder。",
          createAction: "创建并进入 Builder",
          createPending: "创建中...",
          duplicateAction: "复制",
          openAction: "打开 Builder",
          latestRunAction: "查看最近运行",
          listTitle: "已保存工作流",
          listEmpty: "当前企业还没有保存任何 workflow。",
          recentRunsTitle: "最近运行",
          recentRunsEmpty: "还没有 workflow 运行记录。",
          nodes: "节点",
          edges: "连线",
          updated: "更新于",
          created: "创建于",
          statusDraft: "草稿",
          statusLive: "已启用",
          statusArchived: "已归档",
          duplicatePending: "复制中...",
          cardsTitle: "工作流卡片",
          cardsDescription: "按图文卡片浏览已有工作流，第一个卡片固定用于新建工作流。",
          pageLabel: "页码",
          previousPage: "上一页",
          nextPage: "下一页",
          pageSummary: (page: number, total: number) => `第 ${page} / ${total} 页`,
          openCardAction: "打开",
          defaultWorkflowTitle: "未命名工作流",
        }
      : {
          eyebrow: "Workflow Builder",
          title: "Workflows",
          description:
            "Save proven upload, copy, image, video, and PPT production chains as repeatable fixed workflows. Inputs stay asset-library native; outputs land in work-library semantics.",
          createTitle: "Create workflow",
          createDescription: "Click to create a blank workflow and open the builder immediately.",
          createAction: "Create and open builder",
          createPending: "Creating...",
          duplicateAction: "Duplicate",
          openAction: "Open builder",
          latestRunAction: "View latest run",
          listTitle: "Saved workflows",
          listEmpty: "No workflows have been saved for this enterprise yet.",
          recentRunsTitle: "Recent runs",
          recentRunsEmpty: "No workflow runs have been recorded yet.",
          nodes: "Nodes",
          edges: "Edges",
          updated: "Updated",
          created: "Created",
          statusDraft: "Draft",
          statusLive: "Live",
          statusArchived: "Archived",
          duplicatePending: "Duplicating...",
          cardsTitle: "Workflow cards",
          cardsDescription: "Browse workflows as visual cards. The first card is always reserved for creating a new workflow.",
          pageLabel: "Page",
          previousPage: "Previous",
          nextPage: "Next",
          pageSummary: (page: number, total: number) => `Page ${page} of ${total}`,
          openCardAction: "Open",
          defaultWorkflowTitle: "Untitled workflow",
        }

  const statusLabel = (status: WorkflowDefinition["status"]) => {
    if (status === "live") return copy.statusLive
    if (status === "archived") return copy.statusArchived
    return copy.statusDraft
  }

  async function createWorkflow(payload: {
    title: string
    description: string | null
    nodes?: WorkflowDefinition["nodes"]
    edges?: WorkflowDefinition["edges"]
    metadata?: WorkflowDefinition["metadata"]
  }) {
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })

    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.data) {
      throw new Error(typeof result?.error === "string" ? result.error : "workflow_create_failed")
    }

    const created = result.data as WorkflowDefinition
    return {
      ...created,
      createdAt: new Date(created.createdAt).toISOString(),
      updatedAt: new Date(created.updatedAt).toISOString(),
    } satisfies WorkflowListDefinition
  }

  async function handleCreate() {
    setSubmitting(true)
    setErrorMessage("")

    try {
      const created = await createWorkflow({
        title: copy.defaultWorkflowTitle,
        description: null,
      })
      setWorkflows((current) => [created, ...current])
      router.push(`/dashboard/workflows/${created.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_create_failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDuplicate(workflow: WorkflowListDefinition) {
    setDuplicatingId(workflow.id)
    setErrorMessage("")

    try {
      const created = await createWorkflow({
        title: `${workflow.title} Copy`,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        metadata: workflow.metadata,
      })
      setWorkflows((current) => [created, ...current])
      router.push(`/dashboard/workflows/${created.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_duplicate_failed")
    } finally {
      setDuplicatingId(null)
    }
  }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg workspace-page-shell mx-auto max-w-7xl">
        <div className="workspace-stack">
          <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {copy.cardsTitle}
                </h2>
                <p className="text-sm text-muted-foreground">{copy.cardsDescription}</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>{workflows.length}</div>
                <div>{copy.pageSummary(currentPage, totalPages)}</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={submitting}
                className="dashboard-panel workspace-card-panel mx-auto flex min-h-[300px] w-full max-w-[340px] flex-col items-center justify-center rounded-[12px] border border-dashed border-primary/35 bg-card/85 p-5 text-center transition hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-70"
                aria-label={copy.createAction}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/30 bg-[linear-gradient(135deg,rgba(214,160,74,0.2),rgba(214,160,74,0.04))] text-primary">
                  <Plus className="h-9 w-9" />
                </div>
                <div className="mt-4 dashboard-kicker text-muted-foreground">{copy.createTitle}</div>
                <h3 className="mt-2 font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {submitting ? copy.createPending : copy.createAction}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{copy.createDescription}</p>
              </button>

              {pagedWorkflows.map((workflow) => {
                const openHref = `/dashboard/workflows/${workflow.id}`

                return (
                  <article
                    key={workflow.id}
                    className="dashboard-panel workspace-card-panel mx-auto w-full max-w-[340px] overflow-hidden rounded-[14px] border border-border bg-card/90 p-0 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                  >
                    <div
                      className="min-h-[118px] border-b border-border/60 px-4 py-3.5"
                      style={{
                        background:
                          workflow.status === "live"
                            ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(255,255,255,0.72) 55%, rgba(34,197,94,0.04))"
                            : workflow.status === "archived"
                              ? "linear-gradient(135deg, rgba(244,63,94,0.18), rgba(255,255,255,0.72) 55%, rgba(244,63,94,0.04))"
                              : "linear-gradient(135deg, rgba(214,160,74,0.20), rgba(255,255,255,0.76) 58%, rgba(214,160,74,0.04))",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-3">
                          <Badge variant="outline" className={`rounded-[999px] border px-2.5 py-1 font-display text-[11px] uppercase tracking-[0.08em] ${getStatusTone(workflow.status)}`}>
                            {statusLabel(workflow.status)}
                          </Badge>
                          <h3 className="line-clamp-2 font-display text-2xl font-extrabold uppercase tracking-[0.01em] text-foreground">
                            {workflow.title}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 px-4 py-4">
                      <p className="min-h-16 text-sm leading-6 text-muted-foreground line-clamp-3">
                        {workflow.description || workflow.slug || workflow.title}
                      </p>

                      <div className="space-y-3 border-t border-border/60 pt-3">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full bg-muted/70 px-2 py-1">
                            {copy.updated}: {formatTimestamp(workflow.updatedAt, locale)}
                          </span>
                          <span className="rounded-full bg-muted/70 px-2 py-1">
                            {copy.nodes}: {workflow.nodes.length}
                          </span>
                          <span className="rounded-full bg-muted/70 px-2 py-1">
                            {copy.edges}: {workflow.edges.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button className="public-button-primary h-8 w-full px-3.5 text-xs" asChild>
                            <Link href={openHref}>{copy.openCardAction}</Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 w-full rounded-[8px] px-3.5 text-xs"
                            disabled={duplicatingId === workflow.id}
                            onClick={() => {
                              void handleDuplicate(workflow)
                            }}
                          >
                            {duplicatingId === workflow.id ? copy.duplicatePending : copy.duplicateAction}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}

              {workflows.length === 0 ? (
                <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-dashed border-border bg-card/70 p-6 text-sm text-muted-foreground md:col-span-1 xl:col-span-2">
                  {copy.listEmpty}
                </div>
              ) : null}
            </div>

            {workflows.length > WORKFLOW_CARDS_PER_PAGE ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-card/65 px-4 py-3">
                <div className="text-sm text-muted-foreground">
                  {copy.pageLabel}: {copy.pageSummary(currentPage, totalPages)}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-[8px]"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    {copy.previousPage}
                  </Button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <Button
                      key={page}
                      type="button"
                      variant={page === currentPage ? "default" : "outline"}
                      className="h-9 min-w-9 rounded-[8px] px-3"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-[8px]"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    {copy.nextPage}
                  </Button>
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-[12px] border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-300">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
            <div className="space-y-3">
              <div className="dashboard-kicker text-muted-foreground">{copy.recentRunsTitle}</div>
              <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {copy.recentRunsTitle}
              </h2>
            </div>

            <div className="mt-5 space-y-3">
              {recentRuns.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                  {copy.recentRunsEmpty}
                </div>
              ) : null}

              {recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/dashboard/workflows/runs/${run.id}`}
                  className="block rounded-[10px] border border-border/80 bg-background/60 px-4 py-4 transition hover:border-primary/50 hover:bg-background/90"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{run.itemSlug}</div>
                      <div className="text-xs text-muted-foreground">
                        #{run.id} · {copy.created}: {formatTimestamp(run.createdAt, locale)}
                      </div>
                    </div>
                    <Badge variant="outline" className={`rounded-[4px] border px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] ${getStatusTone(run.status)}`}>
                      {run.status}
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {copy.updated}: {formatTimestamp(run.finishedAt || run.createdAt, locale)}
                  </div>
                </Link>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
