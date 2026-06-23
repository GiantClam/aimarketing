"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  History,
  Plus,
  RefreshCw,
  Search,
  Workflow,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { DashboardFilterToolbar } from "@/components/ui/dashboard-filter-toolbar"
import { cn } from "@/lib/utils"
import type { WorkflowDefinition } from "@/lib/workflows/store"
import { resolveWorkflowNodeTitle, type WorkflowDefinitionNode, type WorkflowNodeType } from "@/lib/workflows/schema"

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

type WorkflowNodePreviewTone = "start" | "upload" | "process" | "add"

type WorkflowNodePreviewItem = {
  label: string
  tone: WorkflowNodePreviewTone
}

const WORKFLOW_CARDS_PER_PAGE = 6
const RECENT_RUNS_PER_PAGE = 10
const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateTime(value: string | null, locale: "zh" | "en") {
  const parsed = parseDate(value)
  if (!parsed) return locale === "zh" ? "未记录" : "Not recorded"
  return parsed.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelativeTime(value: string | null, locale: "zh" | "en") {
  const parsed = parseDate(value)
  if (!parsed) return locale === "zh" ? "未记录" : "Not recorded"

  const diffMs = parsed.getTime() - Date.now()
  const absSeconds = Math.round(Math.abs(diffMs) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { numeric: "auto" })

  if (absSeconds < 60) return rtf.format(Math.round(diffMs / 1000), "second")
  const absMinutes = Math.round(absSeconds / 60)
  if (absMinutes < 60) return rtf.format(Math.round(diffMs / (60 * 1000)), "minute")
  const absHours = Math.round(absMinutes / 60)
  if (absHours < 24) return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), "hour")
  const absDays = Math.round(absHours / 24)
  if (absDays < 30) return rtf.format(Math.round(diffMs / DAY_MS), "day")
  return formatDateTime(value, locale)
}

function formatDuration(createdAt: string | null, finishedAt: string | null, locale: "zh" | "en") {
  const created = parseDate(createdAt)
  const finished = parseDate(finishedAt)
  if (!created || !finished) return "—"

  const totalSeconds = Math.max(0, Math.round((finished.getTime() - created.getTime()) / 1000))
  if (totalSeconds < 60) return locale === "zh" ? `${totalSeconds} 秒` : `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return locale === "zh" ? `${minutes} 分 ${seconds} 秒` : `${minutes}m ${seconds}s`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return locale === "zh" ? `${hours} 小时 ${remainingMinutes} 分` : `${hours}h ${remainingMinutes}m`
}

function getWorkflowStatusMeta(status: WorkflowDefinition["status"], locale: "zh" | "en") {
  if (status === "live") {
    return {
      label: locale === "zh" ? "已启用" : "Live",
      className: "border-[#ccefd7] bg-[#eefaf2] text-[#168449]",
    }
  }
  if (status === "archived") {
    return {
      label: locale === "zh" ? "已归档" : "Archived",
      className: "border-[#ffd6d6] bg-[#fff0f0] text-[#d93025]",
    }
  }
  return {
    label: locale === "zh" ? "草稿" : "Draft",
    className: "border-[#e8d474] bg-[#fff7d6] text-[#9a7900]",
  }
}

function getRunStatusMeta(status: string, locale: "zh" | "en") {
  if (status === "succeeded") {
    return {
      label: locale === "zh" ? "成功" : "Succeeded",
      className: "border-[#ccefd7] bg-[#eefaf2] text-[#23a55a]",
    }
  }
  if (status === "failed") {
    return {
      label: locale === "zh" ? "失败" : "Failed",
      className: "border-[#ffd6d6] bg-[#fff0f0] text-[#d93025]",
    }
  }
  if (status === "running" || status === "queued") {
    return {
      label: status === "queued" ? (locale === "zh" ? "排队中" : "Queued") : locale === "zh" ? "运行中" : "Running",
      className: "border-[#efe6a8] bg-[#fffbe5] text-[#8a7500]",
    }
  }
  if (status === "cancelled") {
    return {
      label: locale === "zh" ? "已取消" : "Cancelled",
      className: "border-[#e2e2da] bg-[#f7f7f2] text-[#666]",
    }
  }
  return {
    label: status,
    className: "border-[#e2e2da] bg-[#f7f7f2] text-[#666]",
  }
}

function getNodeTone(type: WorkflowNodeType): WorkflowNodePreviewTone {
  if (type === "upload") return "upload"
  if (type === "text_input") return "start"
  return "process"
}

function buildWorkflowNodePreview(nodes: WorkflowDefinitionNode[], locale: "zh" | "en"): WorkflowNodePreviewItem[] {
  const sortedNodes = [...nodes].sort((a, b) => a.positionX - b.positionX || a.positionY - b.positionY)
  const visibleNodes = sortedNodes.slice(0, 2)
  const preview: WorkflowNodePreviewItem[] = [
    { label: locale === "zh" ? "开始" : "Start", tone: "start" },
    ...visibleNodes.map((node) => ({
      label: resolveWorkflowNodeTitle(node.type, node.title, locale),
      tone: getNodeTone(node.type),
    })),
  ]

  if (sortedNodes.length > visibleNodes.length) {
    preview.push({
      label: `+${sortedNodes.length - visibleNodes.length}`,
      tone: "add",
    })
  } else {
    preview.push({
      label: "+",
      tone: "add",
    })
  }

  return preview
}

function WorkflowMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: typeof Workflow
  label: string
  value: string
  detail: string
  tone?: "neutral" | "success" | "danger"
}) {
  return (
    <article className="rounded-2xl border border-[#e7e7df] bg-white p-5 shadow-[0_10px_28px_rgba(0,0,0,0.055)]">
      <div className="flex items-start gap-4">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] bg-[#f5ef3d] text-[#111]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#6f6f6f]">{label}</div>
          <div className="mt-2 font-display text-3xl font-black uppercase leading-none text-[#111]">{value}</div>
          <div
            className={cn(
              "mt-2 text-xs font-semibold",
              tone === "success" && "text-[#23a55a]",
              tone === "danger" && "text-[#d93025]",
              tone === "neutral" && "text-[#6f6f6f]",
            )}
          >
            {detail}
          </div>
        </div>
      </div>
    </article>
  )
}

function WorkflowStatusBadge({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <span className={cn("inline-flex h-[26px] items-center rounded-[7px] border px-[10px] text-[12px] font-extrabold uppercase", className)}>
      {label}
    </span>
  )
}

function RunStatusBadge({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-black uppercase", className)}>
      {label}
    </span>
  )
}

function WorkflowNodePreview({
  items,
}: {
  items: WorkflowNodePreviewItem[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 items-center rounded-[10px] border px-[18px] text-sm font-extrabold text-[#111]",
              item.tone === "start" && "border-[#ccefd7] bg-[#eefaf2]",
              item.tone === "upload" && "border-[#d8c9ff] bg-[#f2ecff]",
              item.tone === "process" && "border-[#efe6a8] bg-[#fffbe5]",
              item.tone === "add" && "border-[#e2e2da] border-dashed bg-white",
            )}
          >
            {item.label}
          </div>
          {index < items.length - 1 ? <span className="text-lg font-black text-[#111]">→</span> : null}
        </div>
      ))}
    </div>
  )
}

function WorkflowPagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-[#666]">
        {currentPage} / {totalPages}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
          <button
            key={page}
            type="button"
            className={cn(
              "h-9 min-w-9 rounded-[8px] px-3 text-sm font-black",
              page === currentPage
                ? "bg-[#f5ef3d] text-[#111]"
                : "border border-[#deded6] bg-white text-[#111]",
            )}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function WorkflowListPage({
  locale,
  initialWorkflows,
  recentRuns,
  currentUserName,
}: {
  locale: "zh" | "en"
  initialWorkflows: WorkflowListDefinition[]
  recentRuns: WorkflowListRunItem[]
  currentUserName: string
}) {
  const router = useRouter()
  const [workflows, setWorkflows] = useState(initialWorkflows)
  const [submitting, setSubmitting] = useState(false)
  const [duplicatingWorkflowId, setDuplicatingWorkflowId] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [runsPage, setRunsPage] = useState(1)
  const [runSearch, setRunSearch] = useState("")
  const [runStatusFilter, setRunStatusFilter] = useState("all")
  const [runDateFilter, setRunDateFilter] = useState("7d")

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Workflow Builder",
          title: "工作流",
          description:
            "把上传、文案、图片、视频和 PPT 生产链保存为可复用工作流资产，在同一页面里管理卡片、快速打开 Builder，并追踪最近运行结果。",
          createWorkflow: "创建工作流",
          createBuilder: "创建并进入 Builder",
          createPending: "创建中...",
          viewRunHistory: "查看运行记录",
          metricsTotal: "工作流总数",
          metricsActive: "启用中的工作流",
          metricsSucceeded: "近 7 天成功运行",
          metricsFailed: "近 7 天失败运行",
          metricsUpdated: "最近更新",
          metricTotalDetail: "企业工作流资产库",
          metricActiveDetail: "可直接打开与复用",
          metricSucceededDetail: "按最近 7 天运行统计",
          metricFailedDetail: "需要优先检查的失败",
          metricUpdatedDetail: "最近被编辑的工作流",
          cardsEyebrow: "Workflow Cards",
          cardsTitle: "工作流卡片",
          cardsDescription: "Create Workflow 永远作为最强入口，其余卡片用于打开、复制与追踪最近状态。",
          createTitle: "创建工作流",
          createDescription: "新建一个空白工作流，并立即进入 Builder 配置节点与参数。",
          createAction: "创建并打开 Builder",
          latestRunNone: "还没有运行记录",
          latestRunLabel: "最近运行",
          updatedBy: "更新于",
          ownerBy: "创建者",
          openAction: "打开",
          duplicateAction: "复制",
          duplicatePending: "复制中...",
          viewRunsAction: "查看运行",
          moreAction: "更多",
          noWorkflows: "当前企业还没有保存任何工作流，先创建第一条可复用链路。",
          recentRunsEyebrow: "Recent Runs",
          recentRunsTitle: "最近运行",
          recentRunsEmpty: "还没有 workflow 运行记录。",
          searchPlaceholder: "搜索工作流、Run ID 或 slug...",
          filterAllStatus: "全部状态",
          filterSucceeded: "成功",
          filterFailed: "失败",
          filterRunning: "运行中",
          filterQueued: "排队中",
          filterAllDates: "全部时间",
          filter7d: "最近 7 天",
          filter30d: "最近 30 天",
          filterTriggerAll: "全部触发方式",
          filterTriggerManual: "手动触发",
          refresh: "刷新",
          tableWorkflow: "工作流",
          tableRunId: "Run ID",
          tableCreated: "创建时间",
          tableUpdated: "更新时间",
          tableTrigger: "触发方式",
          tableDuration: "耗时",
          tableStatus: "状态",
          tableActions: "操作",
          triggerManual: "Manual",
          showingRuns: (start: number, end: number, total: number) => `显示 ${start} - ${end} / ${total} 条运行`,
          defaultWorkflowTitle: "未命名工作流",
          duplicatedSuffix: "副本",
          noRunsForWorkflow: "暂无运行",
        }
      : {
          eyebrow: "Workflow Builder",
          title: "WORKFLOWS",
          description:
            "Save repeatable upload, copy, image, video, and PPT production chains as reusable workflow assets, then manage cards and recent execution from one console.",
          createWorkflow: "Create workflow",
          createBuilder: "Create and open builder",
          createPending: "Creating...",
          viewRunHistory: "View run history",
          metricsTotal: "Total workflows",
          metricsActive: "Active workflows",
          metricsSucceeded: "Successful runs (7d)",
          metricsFailed: "Failed runs (7d)",
          metricsUpdated: "Last updated",
          metricTotalDetail: "Reusable workflow assets in this workspace",
          metricActiveDetail: "Ready to open or duplicate",
          metricSucceededDetail: "Measured from the last 7 days",
          metricFailedDetail: "Runs that need attention first",
          metricUpdatedDetail: "Most recently edited workflow",
          cardsEyebrow: "Workflow Cards",
          cardsTitle: "WORKFLOW CARDS",
          cardsDescription: "Keep Create Workflow as the strongest entry, then browse reusable chains as cards instead of a flat list.",
          createTitle: "Create workflow",
          createDescription: "Create a blank workflow and jump straight into the builder.",
          createAction: "Create and open builder",
          latestRunNone: "No runs yet",
          latestRunLabel: "Latest run",
          updatedBy: "Updated",
          ownerBy: "Owner",
          openAction: "Open",
          duplicateAction: "Duplicate",
          duplicatePending: "Duplicating...",
          viewRunsAction: "View runs",
          moreAction: "More",
          noWorkflows: "No workflows have been saved for this enterprise yet. Create the first reusable production chain.",
          recentRunsEyebrow: "Recent Runs",
          recentRunsTitle: "RECENT RUNS",
          recentRunsEmpty: "No workflow runs have been recorded yet.",
          searchPlaceholder: "Search workflow, run ID, or slug...",
          filterAllStatus: "All status",
          filterSucceeded: "Succeeded",
          filterFailed: "Failed",
          filterRunning: "Running",
          filterQueued: "Queued",
          filterAllDates: "All dates",
          filter7d: "Last 7 days",
          filter30d: "Last 30 days",
          filterTriggerAll: "All triggers",
          filterTriggerManual: "Manual trigger",
          refresh: "Refresh",
          tableWorkflow: "Workflow",
          tableRunId: "Run ID",
          tableCreated: "Created",
          tableUpdated: "Updated",
          tableTrigger: "Trigger",
          tableDuration: "Duration",
          tableStatus: "Status",
          tableActions: "Actions",
          triggerManual: "Manual",
          showingRuns: (start: number, end: number, total: number) => `Showing ${start} to ${end} of ${total} runs`,
          defaultWorkflowTitle: "Untitled workflow",
          duplicatedSuffix: "Copy",
          noRunsForWorkflow: "No runs yet",
        }

  const workflowMap = useMemo(() => new Map(workflows.map((workflow) => [workflow.id, workflow])), [workflows])

  const latestRunsByWorkflowId = useMemo(() => {
    const map = new Map<number, WorkflowListRunItem>()
    for (const run of recentRuns) {
      if (!run.workflowId || map.has(run.workflowId)) continue
      map.set(run.workflowId, run)
    }
    return map
  }, [recentRuns])

  const workflowMetrics = useMemo(() => {
    const now = Date.now()
    const last7DaysRuns = recentRuns.filter((run) => {
      const created = parseDate(run.createdAt)
      return created ? now - created.getTime() <= 7 * DAY_MS : false
    })

    const latestWorkflow = [...workflows].sort((a, b) => {
      const left = parseDate(a.updatedAt)?.getTime() ?? 0
      const right = parseDate(b.updatedAt)?.getTime() ?? 0
      return right - left
    })[0]

    return {
      total: workflows.length,
      active: workflows.filter((workflow) => workflow.status === "live").length,
      succeeded7d: last7DaysRuns.filter((run) => run.status === "succeeded").length,
      failed7d: last7DaysRuns.filter((run) => run.status === "failed").length,
      lastUpdated: latestWorkflow ? formatRelativeTime(latestWorkflow.updatedAt, locale) : "—",
    }
  }, [locale, recentRuns, workflows])

  const totalPages = Math.max(1, Math.ceil(workflows.length / WORKFLOW_CARDS_PER_PAGE))
  const pagedWorkflows = useMemo(() => {
    const startIndex = (currentPage - 1) * WORKFLOW_CARDS_PER_PAGE
    return workflows.slice(startIndex, startIndex + WORKFLOW_CARDS_PER_PAGE)
  }, [currentPage, workflows])

  const filteredRuns = useMemo(() => {
    const now = Date.now()
    const search = runSearch.trim().toLowerCase()

    return recentRuns.filter((run) => {
      if (runStatusFilter !== "all" && run.status !== runStatusFilter) return false
      if (runDateFilter !== "all") {
        const created = parseDate(run.createdAt)
        if (!created) return false
        const maxAge = runDateFilter === "7d" ? 7 * DAY_MS : 30 * DAY_MS
        if (now - created.getTime() > maxAge) return false
      }
      if (!search) return true

      const workflowTitle = run.workflowId ? workflowMap.get(run.workflowId)?.title ?? "" : ""
      return [workflowTitle, run.itemSlug, String(run.id)].some((value) => value.toLowerCase().includes(search))
    })
  }, [recentRuns, runDateFilter, runSearch, runStatusFilter, workflowMap])

  const totalRunsPages = Math.max(1, Math.ceil(filteredRuns.length / RECENT_RUNS_PER_PAGE))
  const pagedRuns = useMemo(() => {
    const startIndex = (runsPage - 1) * RECENT_RUNS_PER_PAGE
    return filteredRuns.slice(startIndex, startIndex + RECENT_RUNS_PER_PAGE)
  }, [filteredRuns, runsPage])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  useEffect(() => {
    setRunsPage((page) => Math.min(page, totalRunsPages))
  }, [totalRunsPages])

  useEffect(() => {
    setRunsPage(1)
  }, [runDateFilter, runSearch, runStatusFilter])

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
      setCurrentPage(1)
      router.push(`/dashboard/workflows/${created.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_create_failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDuplicate(workflow: WorkflowListDefinition) {
    setDuplicatingWorkflowId(workflow.id)
    setErrorMessage("")

    try {
      const created = await createWorkflow({
        title: `${workflow.title} ${copy.duplicatedSuffix}`,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        metadata: workflow.metadata,
      })
      setWorkflows((current) => [created, ...current])
      setCurrentPage(1)
      router.push(`/dashboard/workflows/${created.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_duplicate_failed")
    } finally {
      setDuplicatingWorkflowId(null)
    }
  }

  const runsStart = filteredRuns.length === 0 ? 0 : (runsPage - 1) * RECENT_RUNS_PER_PAGE + 1
  const runsEnd = Math.min(filteredRuns.length, runsPage * RECENT_RUNS_PER_PAGE)

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6f6f6f]">{copy.eyebrow}</div>
              <h1 className="mt-2 font-display text-5xl font-black uppercase leading-[0.95] text-[#111] lg:text-[78px]">
                {copy.title}
              </h1>
              <p className="mt-4 max-w-[720px] text-[15px] leading-7 text-[#666] lg:text-base">{copy.description}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="h-11 rounded-[9px] border-[#deded6] bg-white px-[18px] text-sm font-extrabold text-[#111]"
                asChild
              >
                <Link href="#recent-runs">
                  <History className="mr-2 h-4 w-4" />
                  {copy.viewRunHistory}
                </Link>
              </Button>
              <Button
                className="h-11 rounded-[9px] border border-[#ded735] bg-[#f5ef3d] px-[22px] text-sm font-black text-[#111] hover:bg-[#f5ef3d]/90"
                onClick={() => void handleCreate()}
                disabled={submitting}
              >
                <Plus className="mr-2 h-4 w-4" />
                {submitting ? copy.createPending : copy.createWorkflow}
              </Button>
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <WorkflowMetricCard icon={Workflow} label={copy.metricsTotal} value={String(workflowMetrics.total)} detail={copy.metricTotalDetail} />
            <WorkflowMetricCard icon={CheckCircle2} label={copy.metricsActive} value={String(workflowMetrics.active)} detail={copy.metricActiveDetail} tone="success" />
            <WorkflowMetricCard icon={CheckCircle2} label={copy.metricsSucceeded} value={String(workflowMetrics.succeeded7d)} detail={copy.metricSucceededDetail} tone="success" />
            <WorkflowMetricCard icon={AlertTriangle} label={copy.metricsFailed} value={String(workflowMetrics.failed7d)} detail={copy.metricFailedDetail} tone="danger" />
            <WorkflowMetricCard icon={Clock3} label={copy.metricsUpdated} value={workflowMetrics.lastUpdated} detail={copy.metricUpdatedDetail} />
          </div>

          <section className="rounded-[18px] border border-[#e7e7df] bg-white p-6 shadow-[0_14px_34px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-3 border-b border-[#efefe7] pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#777]">{copy.cardsEyebrow}</div>
                <h2 className="mt-2 font-display text-2xl font-black uppercase leading-none text-[#111]">{copy.cardsTitle}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#666]">{copy.cardsDescription}</p>
              </div>
              <div className="text-sm font-semibold text-[#666]">{workflows.length}</div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
              <article className={cn("relative overflow-hidden rounded-2xl border border-[#e7e7df] bg-white p-7", submitting && "pointer-events-none opacity-70")}>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 22%, rgba(17,17,17,0.25) 0, rgba(17,17,17,0.25) 2px, transparent 3px), linear-gradient(90deg, transparent 24%, rgba(17,17,17,0.22) 25%, rgba(17,17,17,0.22) 26%, transparent 27%), linear-gradient(transparent 38%, rgba(17,17,17,0.22) 39%, rgba(17,17,17,0.22) 40%, transparent 41%)",
                    backgroundSize: "120px 120px, 120px 120px, 120px 120px",
                  }}
                />
                <div className="relative flex h-full flex-col">
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[14px] bg-[#f5ef3d] text-[#111]">
                    <Plus className="h-8 w-8" />
                  </div>
                  <h3 className="mt-6 font-display text-[30px] font-black uppercase leading-none text-[#111]">{copy.createTitle}</h3>
                  <p className="mt-4 max-w-[28rem] text-sm leading-6 text-[#666]">{copy.createDescription}</p>
                  <div className="mt-auto pt-8">
                    <Button
                      className="h-[46px] w-full rounded-[9px] border border-[#ded735] bg-[#f5ef3d] text-sm font-black text-[#111] hover:bg-[#f5ef3d]/90"
                      onClick={() => void handleCreate()}
                      disabled={submitting}
                    >
                      {submitting ? copy.createPending : copy.createAction}
                    </Button>
                  </div>
                </div>
              </article>

              {pagedWorkflows.map((workflow) => {
                const status = getWorkflowStatusMeta(workflow.status, locale)
                const latestRun = latestRunsByWorkflowId.get(workflow.id)
                const nodePreview = buildWorkflowNodePreview(workflow.nodes, locale)
                const hasDescription = Boolean(workflow.description && workflow.description.trim())

                return (
                  <article
                    key={workflow.id}
                    className="min-h-[260px] rounded-2xl border border-[#e7e7df] bg-white p-7 shadow-[0_10px_28px_rgba(0,0,0,0.045)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[28px] font-black uppercase leading-none text-[#111]">
                          {workflow.title}
                        </h3>
                        <div className="mt-3 text-sm text-[#666]">
                          {copy.updatedBy} {formatRelativeTime(workflow.updatedAt, locale)} · {copy.ownerBy} {currentUserName}
                        </div>
                      </div>
                      <WorkflowStatusBadge label={status.label} className={status.className} />
                    </div>

                    <p className="mt-4 min-h-[44px] text-sm leading-6 text-[#666]">
                      {hasDescription ? workflow.description : workflow.slug}
                    </p>

                    <div className="mt-5">
                      <WorkflowNodePreview items={nodePreview} />
                    </div>

                    <div className="mt-5 rounded-[12px] border border-[#ededE7] bg-[#fafaf7] px-4 py-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[#777]">{copy.latestRunLabel}</div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[#111]">
                          {latestRun ? `#${latestRun.id} · ${formatRelativeTime(latestRun.createdAt, locale)}` : copy.latestRunNone}
                        </div>
                        {latestRun ? (
                          <RunStatusBadge {...getRunStatusMeta(latestRun.status, locale)} />
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      <Button
                        className="h-[42px] rounded-[9px] border border-[#ded735] bg-[#f5ef3d] px-[22px] text-sm font-black text-[#111] hover:bg-[#f5ef3d]/90"
                        asChild
                      >
                        <Link href={`/dashboard/workflows/${workflow.id}`}>{copy.openAction}</Link>
                      </Button>
                      <button
                        type="button"
                        className="h-10 px-[14px] text-sm font-extrabold text-[#111]"
                        onClick={() => void handleDuplicate(workflow)}
                        disabled={duplicatingWorkflowId === workflow.id}
                      >
                        {duplicatingWorkflowId === workflow.id ? copy.duplicatePending : copy.duplicateAction}
                      </button>
                      <Link href={latestRun ? `/dashboard/workflows/runs/${latestRun.id}` : `/dashboard/workflows/${workflow.id}`} className="h-10 px-[14px] text-sm font-extrabold text-[#111]">
                        {latestRun ? copy.viewRunsAction : copy.noRunsForWorkflow}
                      </Link>
                      <Link
                        href={`/dashboard/workflows/${workflow.id}`}
                        className="ml-auto flex h-10 w-10 items-center justify-center rounded-[9px] text-[#111] hover:bg-[#f7f7f2]"
                        aria-label={copy.moreAction}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>

            {workflows.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-[#d9d9d0] bg-[#fafaf7] px-5 py-6 text-sm text-[#666]">
                {copy.noWorkflows}
              </div>
            ) : null}

            <div className="mt-6">
              <WorkflowPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
            </div>
          </section>

          <section id="recent-runs" className="rounded-[18px] border border-[#e7e7df] bg-white p-6 shadow-[0_14px_34px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-3 border-b border-[#efefe7] pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#777]">{copy.recentRunsEyebrow}</div>
                <h2 className="mt-2 font-display text-2xl font-black uppercase leading-none text-[#111]">{copy.recentRunsTitle}</h2>
              </div>
            </div>

            <DashboardFilterToolbar
              className="mt-5"
              search={
                <label className="relative block min-w-0">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777]" />
                  <input
                    value={runSearch}
                    onChange={(event) => setRunSearch(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    className="h-[42px] w-full rounded-[9px] border border-[#deded6] bg-white pl-10 pr-4 text-sm text-[#111] outline-none transition focus:border-[#111]"
                  />
                </label>
              }
              filters={
                <>
                  <select
                    value={runStatusFilter}
                    onChange={(event) => setRunStatusFilter(event.target.value)}
                    className="h-[42px] w-full rounded-[9px] border border-[#deded6] bg-white px-4 text-sm font-bold text-[#111] sm:min-w-[150px] sm:w-auto"
                  >
                    <option value="all">{copy.filterAllStatus}</option>
                    <option value="succeeded">{copy.filterSucceeded}</option>
                    <option value="failed">{copy.filterFailed}</option>
                    <option value="running">{copy.filterRunning}</option>
                    <option value="queued">{copy.filterQueued}</option>
                  </select>

                  <select
                    value={runDateFilter}
                    onChange={(event) => setRunDateFilter(event.target.value)}
                    className="h-[42px] w-full rounded-[9px] border border-[#deded6] bg-white px-4 text-sm font-bold text-[#111] sm:min-w-[160px] sm:w-auto"
                  >
                    <option value="7d">{copy.filter7d}</option>
                    <option value="30d">{copy.filter30d}</option>
                    <option value="all">{copy.filterAllDates}</option>
                  </select>

                  <select
                    value="manual"
                    disabled
                    className="h-[42px] w-full rounded-[9px] border border-[#deded6] bg-white px-4 text-sm font-bold text-[#111] disabled:opacity-100 sm:min-w-[160px] sm:w-auto"
                  >
                    <option value="all">{copy.filterTriggerAll}</option>
                    <option value="manual">{copy.filterTriggerManual}</option>
                  </select>
                </>
              }
              actions={
                <Button
                  type="button"
                  variant="outline"
                  className="h-[42px] rounded-[9px] border-[#deded6] bg-white px-4 text-sm font-extrabold text-[#111]"
                  onClick={() => router.refresh()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {copy.refresh}
                </Button>
              }
            />

            <div className="mt-5 overflow-hidden rounded-xl border border-[#ededE7] bg-white">
              <table className="w-full border-collapse text-left">
                <thead className="bg-[#fafaf7] text-[11px] font-black uppercase tracking-[0.08em] text-[#555]">
                  <tr>
                    <th className="px-4 py-3">{copy.tableWorkflow}</th>
                    <th className="px-4 py-3">{copy.tableRunId}</th>
                    <th className="px-4 py-3">{copy.tableCreated}</th>
                    <th className="px-4 py-3">{copy.tableUpdated}</th>
                    <th className="px-4 py-3">{copy.tableTrigger}</th>
                    <th className="px-4 py-3">{copy.tableDuration}</th>
                    <th className="px-4 py-3">{copy.tableStatus}</th>
                    <th className="px-4 py-3">{copy.tableActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRuns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#666]">
                        {copy.recentRunsEmpty}
                      </td>
                    </tr>
                  ) : null}

                  {pagedRuns.map((run) => {
                    const status = getRunStatusMeta(run.status, locale)
                    const workflow = run.workflowId ? workflowMap.get(run.workflowId) ?? null : null
                    const workflowHref = workflow ? `/dashboard/workflows/${workflow.id}` : null

                    return (
                      <tr key={run.id} className="border-t border-[#ededE7] align-top">
                        <td className="px-4 py-[14px] text-[13px]">
                          {workflowHref ? (
                            <Link href={workflowHref} className="font-bold text-[#111] hover:underline">
                              {workflow?.title}
                            </Link>
                          ) : (
                            <div className="font-bold text-[#111]">{run.itemSlug}</div>
                          )}
                          <div className="mt-1 text-xs text-[#666]">{run.itemSlug}</div>
                        </td>
                        <td className="px-4 py-[14px] text-[13px] font-semibold text-[#111]">#{run.id}</td>
                        <td className="px-4 py-[14px] text-[13px] text-[#666]">{formatDateTime(run.createdAt, locale)}</td>
                        <td className="px-4 py-[14px] text-[13px] text-[#666]">{formatDateTime(run.finishedAt || run.createdAt, locale)}</td>
                        <td className="px-4 py-[14px] text-[13px] text-[#111]">{copy.triggerManual}</td>
                        <td className="px-4 py-[14px] text-[13px] text-[#666]">{formatDuration(run.createdAt, run.finishedAt, locale)}</td>
                        <td className="px-4 py-[14px] text-[13px]">
                          <RunStatusBadge label={status.label} className={status.className} />
                        </td>
                        <td className="px-4 py-[14px] text-[13px]">
                          <div className="flex flex-wrap items-center gap-3">
                            <Link href={`/dashboard/workflows/runs/${run.id}`} className="font-extrabold text-[#111] hover:underline">
                              {copy.viewRunsAction}
                            </Link>
                            {workflowHref ? (
                              <Link href={workflowHref} className="font-extrabold text-[#111] hover:underline">
                                {copy.openAction}
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-[#666]">{copy.showingRuns(runsStart, runsEnd, filteredRuns.length)}</div>
              <WorkflowPagination currentPage={runsPage} totalPages={totalRunsPages} onPageChange={setRunsPage} />
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-[12px] border border-[#ffd6d6] bg-[#fff0f0] px-4 py-3 text-sm text-[#d93025]">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
