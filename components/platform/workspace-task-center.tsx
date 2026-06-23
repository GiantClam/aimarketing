"use client"

import { useMemo, useState } from "react"

import Link from "next/link"
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Command,
  Download,
  Eye,
  ImageIcon,
  ListChecks,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  Timer,
  Wrench,
  Workflow,
  XCircle,
} from "lucide-react"

import { DashboardFilterToolbar } from "@/components/ui/dashboard-filter-toolbar"

type TaskSource = "tool" | "workflow" | "agent" | "media"
type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
type StatusFilter = "all" | "running" | "succeeded" | "failed" | "queued"
type SourceFilter = "all" | TaskSource
type DateRangeFilter = "today" | "7d" | "30d" | "custom"
type SortFilter = "newest" | "duration" | "status" | "source"

type WorkspaceTaskCenterItem = {
  id: number
  kind: string
  itemType: string
  itemSlug: string
  status: string
  externalSystem: string | null
  externalRunId: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

type NormalizedTaskRun = WorkspaceTaskCenterItem & {
  source: TaskSource
  normalizedStatus: TaskStatus
  displayName: string
  durationMs: number | null
}

const PAGE_SIZE = 10

const statusOrder: Record<TaskStatus, number> = {
  running: 0,
  queued: 1,
  failed: 2,
  cancelled: 3,
  succeeded: 4,
}

const sourceStyles: Record<TaskSource, string> = {
  tool: "border-[#efe6a8] bg-[#fff7d6] text-[#8a7500]",
  workflow: "border-[#c9dcff] bg-[#edf4ff] text-[#2463d4]",
  agent: "border-[#ccefd7] bg-[#eefaf2] text-[#23a55a]",
  media: "border-[#d8c9ff] bg-[#f2ecff] text-[#7653d6]",
}

const sourceDotStyles: Record<TaskSource, string> = {
  tool: "bg-[#f5ef3d]",
  workflow: "bg-[#2463d4]",
  agent: "bg-[#23a55a]",
  media: "bg-[#7653d6]",
}

const statusStyles: Record<TaskStatus, string> = {
  succeeded: "border-[#ccefd7] bg-[#eefaf2] text-[#23a55a]",
  failed: "border-[#ffd6d6] bg-[#fff0f0] text-[#d93025]",
  cancelled: "border-[#ffd6d6] bg-[#fff0f0] text-[#d93025]",
  running: "border-[#efe6a8] bg-[#fffbe5] text-[#8a7500]",
  queued: "border-[#e6e6de] bg-[#f2f2ee] text-[#666]",
}

const statusLabels: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
}

const sourceLabels: Record<TaskSource, string> = {
  tool: "Tool",
  workflow: "Workflow",
  agent: "Agent",
  media: "Media",
}

function normalizeSource(kind: string): TaskSource {
  if (kind === "workflow" || kind === "media" || kind === "tool" || kind === "agent") return kind
  return "tool"
}

function normalizeStatus(status: string): TaskStatus {
  if (status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "cancelled") return status
  return "queued"
}

function toDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatTaskTimestamp(value: string | null, locale: "zh" | "en") {
  const date = toDate(value)
  if (!date) return locale === "zh" ? "未记录" : "Not recorded"
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatDuration(value: number | null) {
  if (value == null || value < 0) return "00:00:00"
  const totalSeconds = Math.max(0, Math.round(value / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":")
}

function getTaskDurationMs(run: WorkspaceTaskCenterItem) {
  const started = toDate(run.startedAt) ?? toDate(run.createdAt)
  const finished = toDate(run.finishedAt) ?? toDate(run.updatedAt)
  if (!started || !finished) return null
  return finished.getTime() - started.getTime()
}

function getDisplayName(run: WorkspaceTaskCenterItem) {
  return run.itemSlug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (value) => value.toUpperCase())
}

function getRunId(run: WorkspaceTaskCenterItem) {
  return run.externalRunId || `RUN-${String(run.id).padStart(5, "0")}`
}

function getLatestTimestamp(runs: NormalizedTaskRun[]) {
  return runs
    .map((run) => toDate(run.updatedAt) ?? toDate(run.createdAt))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0]
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function getTaskIcon(source: TaskSource) {
  if (source === "workflow") return Workflow
  if (source === "agent") return Bot
  if (source === "media") return ImageIcon
  return Wrench
}

function getAverageDuration(runs: NormalizedTaskRun[]) {
  const durations = runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => duration != null && duration >= 0)
  if (durations.length === 0) return null
  return durations.reduce((total, value) => total + value, 0) / durations.length
}

function buildNormalizedRuns(runs: WorkspaceTaskCenterItem[]): NormalizedTaskRun[] {
  return runs.map((run) => {
    const source = normalizeSource(run.kind)

    return {
      ...run,
      source,
      normalizedStatus: normalizeStatus(run.status),
      displayName: getDisplayName(run),
      durationMs: getTaskDurationMs(run),
    }
  })
}

function useFilteredRuns(runs: NormalizedTaskRun[], filters: {
  query: string
  status: StatusFilter
  source: SourceFilter
  dateRange: DateRangeFilter
  sort: SortFilter
}) {
  return useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const latest = getLatestTimestamp(runs)
    const dayStart = latest ? new Date(latest) : null

    if (dayStart) {
      dayStart.setHours(0, 0, 0, 0)
    }

    const rangeStart =
      filters.dateRange === "today" && dayStart
        ? dayStart
        : filters.dateRange === "7d" && latest
          ? new Date(latest.getTime() - 7 * 24 * 60 * 60 * 1000)
          : filters.dateRange === "30d" && latest
            ? new Date(latest.getTime() - 30 * 24 * 60 * 60 * 1000)
            : null

    const filtered = runs.filter((run) => {
      const runDate = toDate(run.createdAt)
      const statusMatches =
        filters.status === "all" ||
        run.normalizedStatus === filters.status ||
        (filters.status === "failed" && run.normalizedStatus === "cancelled")
      const sourceMatches = filters.source === "all" || run.source === filters.source
      const rangeMatches = !rangeStart || !runDate || runDate.getTime() >= rangeStart.getTime()
      const queryMatches =
        !query ||
        run.displayName.toLowerCase().includes(query) ||
        run.itemSlug.toLowerCase().includes(query) ||
        getRunId(run).toLowerCase().includes(query) ||
        String(run.id).includes(query)

      return statusMatches && sourceMatches && rangeMatches && queryMatches
    })

    return filtered.sort((left, right) => {
      if (filters.sort === "duration") {
        return (right.durationMs ?? -1) - (left.durationMs ?? -1)
      }

      if (filters.sort === "status") {
        return statusOrder[left.normalizedStatus] - statusOrder[right.normalizedStatus]
      }

      if (filters.sort === "source") {
        return sourceLabels[left.source].localeCompare(sourceLabels[right.source])
      }

      const leftDate = toDate(left.createdAt)?.getTime() ?? 0
      const rightDate = toDate(right.createdAt)?.getTime() ?? 0
      return rightDate - leftDate || right.id - left.id
    })
  }, [filters.dateRange, filters.query, filters.sort, filters.source, filters.status, runs])
}

function TaskSourceBadge({ source }: { source: TaskSource }) {
  return (
    <span className={`inline-flex h-[26px] items-center rounded-[7px] border px-2.5 text-[11px] font-black uppercase ${sourceStyles[source]}`}>
      {sourceLabels[source]}
    </span>
  )
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex h-[26px] items-center rounded-full border px-2.5 text-[11px] font-black uppercase ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

function TaskCenterHeader({
  locale,
  onExport,
}: {
  locale: "zh" | "en"
  onExport: () => void
}) {
  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="font-display text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          TASK CENTER
        </div>
        <h1 className="mt-2 font-display text-[4.2rem] font-black uppercase leading-[0.86] tracking-[0] text-[#111] sm:text-[5.35rem] lg:text-[5.85rem]">
          TASK CENTER
        </h1>
        <p className="mt-5 max-w-[720px] text-[15px] leading-7 text-[#666] sm:text-base">
          {locale === "zh"
            ? "统一查看 workflow、media、tool 和 agent runs，快速判断运行状态、来源、耗时与失败情况。"
            : "Review workflow, media, tool, and agent runs in one place with status, source, duration, and failure visibility."}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-11 items-center gap-2 rounded-[9px] border border-[#deded6] bg-white px-[18px] text-sm font-extrabold text-[#111] shadow-[0_10px_24px_rgba(0,0,0,0.045)] transition hover:-translate-y-0.5 hover:border-[#cfcfc7]"
        >
          <Download className="h-4 w-4" />
          Export logs
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center gap-2 rounded-[9px] border border-[#ded735] bg-[#f5ef3d] px-[22px] text-sm font-black text-[#111] shadow-[0_10px_24px_rgba(245,239,61,0.22)] transition hover:-translate-y-0.5 hover:bg-[#fbf45a]"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh tasks
        </button>
      </div>
    </header>
  )
}

function TaskMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: typeof Activity
  label: string
  value: string
  detail: string
  tone?: "good" | "risk" | "neutral"
}) {
  const detailClass = tone === "good" ? "text-[#23a55a]" : tone === "risk" ? "text-[#d93025]" : "text-[#777]"

  return (
    <article className="min-h-28 rounded-2xl border border-[#e7e7df] bg-white p-5 shadow-[0_10px_28px_rgba(0,0,0,0.055)]">
      <div className="flex items-start gap-4">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] border border-[#ded735] bg-[#f5ef3d] text-[#111]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">{label}</div>
          <div className="mt-2 font-display text-3xl font-black uppercase leading-none text-[#111]">{value}</div>
          <div className={`mt-3 text-xs font-bold ${detailClass}`}>{detail}</div>
        </div>
      </div>
    </article>
  )
}

function TaskMetricGrid({
  runs,
  locale,
}: {
  runs: NormalizedTaskRun[]
  locale: "zh" | "en"
}) {
  const running = runs.filter((run) => run.normalizedStatus === "running").length
  const succeeded = runs.filter((run) => run.normalizedStatus === "succeeded").length
  const failed = runs.filter((run) => run.normalizedStatus === "failed" || run.normalizedStatus === "cancelled").length
  const latest = getLatestTimestamp(runs)
  const latestLabel = latest ? formatTaskTimestamp(latest.toISOString(), locale) : "No sync"

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <TaskMetricCard icon={ListChecks} label="Total tasks" value={runs.length.toLocaleString()} detail={`${runs.length} indexed runs`} />
      <TaskMetricCard icon={Loader2} label="Running" value={running.toLocaleString()} detail={`${runs.filter((run) => run.normalizedStatus === "queued").length} queued`} />
      <TaskMetricCard icon={CheckCircle2} label="Succeeded" value={succeeded.toLocaleString()} detail="Healthy completions" tone="good" />
      <TaskMetricCard icon={XCircle} label="Failed" value={failed.toLocaleString()} detail="Needs review" tone={failed > 0 ? "risk" : "neutral"} />
      <TaskMetricCard icon={Clock3} label="Last updated" value={latestLabel} detail="Enterprise task sync" />
    </section>
  )
}

function TaskFilterToolbar({
  query,
  status,
  source,
  dateRange,
  sort,
  onQueryChange,
  onStatusChange,
  onSourceChange,
  onDateRangeChange,
  onSortChange,
}: {
  query: string
  status: StatusFilter
  source: SourceFilter
  dateRange: DateRangeFilter
  sort: SortFilter
  onQueryChange: (value: string) => void
  onStatusChange: (value: StatusFilter) => void
  onSourceChange: (value: SourceFilter) => void
  onDateRangeChange: (value: DateRangeFilter) => void
  onSortChange: (value: SortFilter) => void
}) {
  return (
    <section className="rounded-2xl border border-[#e7e7df] bg-white p-4 shadow-[0_10px_28px_rgba(0,0,0,0.045)]">
      <DashboardFilterToolbar
        className="2xl:items-center 2xl:justify-between"
        searchClassName="2xl:max-w-[440px]"
        filtersClassName="2xl:justify-end"
        search={
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777]" />
            <span className="sr-only">Search task name or run ID</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search task name, run ID..."
              className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#c8c22b] focus:ring-4 focus:ring-[#f5ef3d]/25"
            />
          </label>
        }
        filters={
          <>
            <select value={status} onChange={(event) => onStatusChange(event.target.value as StatusFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[140px] sm:w-auto">
              <option value="all">All status</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
            </select>
            <select value={source} onChange={(event) => onSourceChange(event.target.value as SourceFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[140px] sm:w-auto">
              <option value="all">All sources</option>
              <option value="tool">Tool</option>
              <option value="workflow">Workflow</option>
              <option value="agent">Agent</option>
              <option value="media">Media</option>
            </select>
            <select value={dateRange} onChange={(event) => onDateRangeChange(event.target.value as DateRangeFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[160px] sm:w-auto">
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom</option>
            </select>
            <select value={sort} onChange={(event) => onSortChange(event.target.value as SortFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[170px] sm:w-auto">
              <option value="newest">Created: Newest</option>
              <option value="duration">Duration</option>
              <option value="status">Status</option>
              <option value="source">Source</option>
            </select>
          </>
        }
      />
    </section>
  )
}

function TaskActions({ run }: { run: NormalizedTaskRun }) {
  const isFailed = run.normalizedStatus === "failed" || run.normalizedStatus === "cancelled"

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/dashboard/tasks/${run.id}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e1e1da] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
        title="View details"
        aria-label="View details"
      >
        <Eye className="h-4 w-4" />
      </Link>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e1e1da] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
        title={isFailed ? "Retry" : "Open result"}
        aria-label={isFailed ? "Retry" : "Open result"}
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e1e1da] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
        title="More"
        aria-label="More"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  )
}

function RecentTasksTable({
  runs,
  locale,
}: {
  runs: NormalizedTaskRun[]
  locale: "zh" | "en"
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#edede7]">
      <table className="w-full min-w-[980px] border-separate border-spacing-0 bg-white">
        <thead className="bg-[#fafaf7] text-[11px] font-black uppercase tracking-[0.08em] text-[#555]">
          <tr>
            {["Task Name", "Source", "Run ID", "Created", "Updated", "Duration", "Status", "Actions"].map((heading) => (
              <th key={heading} className="px-4 py-3 text-left">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.length > 0 ? (
            runs.map((run) => {
              const TaskIcon = getTaskIcon(run.source)

              return (
                <tr key={run.id} className="transition hover:bg-[#fffef0]">
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm text-[#222]">
                    <div className="flex min-w-[220px] items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${sourceDotStyles[run.source]} text-[#111]`}>
                        <TaskIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {run.normalizedStatus === "running" ? <span className="h-2 w-2 rounded-full bg-[#23a55a]" /> : null}
                          <span className="truncate font-black uppercase tracking-[0.01em] text-[#111]">{run.displayName}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-[#777]">{run.externalSystem || run.itemType || "Local platform run"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm">
                    <TaskSourceBadge source={run.source} />
                  </td>
                  <td className="border-t border-[#edede7] px-4 py-3 font-mono text-xs text-[#333]">{getRunId(run)}</td>
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm text-[#333]">{formatTaskTimestamp(run.createdAt, locale)}</td>
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm text-[#333]">{formatTaskTimestamp(run.updatedAt, locale)}</td>
                  <td className="border-t border-[#edede7] px-4 py-3 font-mono text-xs text-[#333]">{formatDuration(run.durationMs)}</td>
                  <td className="border-t border-[#edede7] px-4 py-3">
                    <TaskStatusBadge status={run.normalizedStatus} />
                  </td>
                  <td className="border-t border-[#edede7] px-4 py-3">
                    <TaskActions run={run} />
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan={8} className="border-t border-[#edede7] px-4 py-12 text-center text-sm font-bold text-[#777]">
                {locale === "zh" ? "当前筛选条件下没有任务运行记录。" : "No task runs match the current filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TaskPagination({
  page,
  total,
  onPageChange,
}: {
  page: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(total, page * PAGE_SIZE)
  const visiblePages = Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1)

  return (
    <div className="flex flex-col gap-3 pt-4 text-sm text-[#666] sm:flex-row sm:items-center sm:justify-between">
      <div className="font-bold">
        Showing {start} to {end} of {total.toLocaleString()} tasks
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} className="h-9 rounded-lg border border-[#deded6] bg-white px-3 font-black text-[#111]" aria-label="Previous page">
          &lt;
        </button>
        {visiblePages.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            className={`h-9 w-9 rounded-lg border font-black ${item === page ? "border-[#ded735] bg-[#f5ef3d] text-[#111]" : "border-[#deded6] bg-white text-[#111]"}`}
          >
            {item}
          </button>
        ))}
        {pageCount > 3 ? <span className="px-1 font-black text-[#777]">...</span> : null}
        <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} className="h-9 rounded-lg border border-[#deded6] bg-white px-3 font-black text-[#111]" aria-label="Next page">
          &gt;
        </button>
      </div>
    </div>
  )
}

function RecentTasksPanel({
  runs,
  total,
  page,
  locale,
  onPageChange,
}: {
  runs: NormalizedTaskRun[]
  total: number
  page: number
  locale: "zh" | "en"
  onPageChange: (page: number) => void
}) {
  return (
    <section className="rounded-[18px] border border-[#e7e7df] bg-white p-5 shadow-[0_14px_34px_rgba(0,0,0,0.06)] lg:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-black uppercase leading-none text-[#111]">Recent Tasks</h2>
          <p className="mt-2 text-sm text-[#777]">Workflow, media, tool, and agent runs ordered for triage.</p>
        </div>
        <span className="rounded-lg border border-[#e7e7df] bg-[#fafaf7] px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#555]">
          {total.toLocaleString()} records
        </span>
      </div>

      <RecentTasksTable runs={runs} locale={locale} />
      <TaskPagination page={page} total={total} onPageChange={onPageChange} />
    </section>
  )
}

function DonutChart({ rate }: { rate: number }) {
  return (
    <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: `conic-gradient(#23a55a ${rate}%, #ededE7 0)` }}>
      <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white font-display text-2xl font-black text-[#111]">
        {rate.toFixed(0)}%
      </div>
    </div>
  )
}

function Sparkline() {
  return (
    <svg viewBox="0 0 180 52" className="h-[52px] w-full" role="img" aria-label="Average duration trend">
      <path d="M4 38 C 28 18, 42 34, 62 24 S 95 14, 112 27 S 148 40, 176 12" fill="none" stroke="#f5ef3d" strokeLinecap="round" strokeWidth="5" />
      <path d="M4 38 C 28 18, 42 34, 62 24 S 95 14, 112 27 S 148 40, 176 12" fill="none" stroke="#111" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

function TasksOverTime({ runs }: { runs: NormalizedTaskRun[] }) {
  const latest = getLatestTimestamp(runs)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = latest ? new Date(latest.getTime() - (6 - index) * 24 * 60 * 60 * 1000) : null
    const key = date?.toISOString().slice(0, 10) ?? `day-${index}`
    const dayRuns = runs.filter((run) => toDate(run.createdAt)?.toISOString().slice(0, 10) === key)
    const succeeded = dayRuns.filter((run) => run.normalizedStatus === "succeeded").length
    const failed = dayRuns.filter((run) => run.normalizedStatus === "failed" || run.normalizedStatus === "cancelled").length
    const running = dayRuns.filter((run) => run.normalizedStatus === "running" || run.normalizedStatus === "queued").length
    const total = Math.max(1, succeeded + failed + running)

    return {
      label: date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date) : `D${index + 1}`,
      succeeded,
      failed,
      running,
      total,
    }
  })

  return (
    <div className="space-y-3">
      <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">Tasks over time</div>
      <div className="flex h-28 items-end gap-2">
        {days.map((day) => (
          <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-20 w-full max-w-[26px] flex-col justify-end overflow-hidden rounded-t-lg border border-[#e7e7df] bg-[#f7f7f2]">
              <div style={{ height: `${Math.max(8, (day.running / day.total) * 80)}px` }} className="bg-[#f5ef3d]" />
              <div style={{ height: `${Math.max(0, (day.failed / day.total) * 80)}px` }} className="bg-[#d93025]" />
              <div style={{ height: `${Math.max(0, (day.succeeded / day.total) * 80)}px` }} className="bg-[#23a55a]" />
            </div>
            <span className="text-[10px] font-bold text-[#777]">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SourceBreakdown({ runs }: { runs: NormalizedTaskRun[] }) {
  const total = Math.max(1, runs.length)
  const sourceCounts = (Object.keys(sourceLabels) as TaskSource[]).map((source) => {
    const count = runs.filter((run) => run.source === source).length
    return { source, count, percent: (count / total) * 100 }
  })

  return (
    <div className="space-y-3">
      <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">Source breakdown</div>
      {sourceCounts.map((item) => (
        <div key={item.source} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-black text-[#333]">
            <span>{sourceLabels[item.source]}</span>
            <span>
              {item.count} · {item.percent.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#ededE7]">
            <div className={`${sourceDotStyles[item.source]} h-full rounded-full`} style={{ width: `${item.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function QueueInsightsPanel({ runs }: { runs: NormalizedTaskRun[] }) {
  const succeeded = runs.filter((run) => run.normalizedStatus === "succeeded").length
  const failed = runs.filter((run) => run.normalizedStatus === "failed" || run.normalizedStatus === "cancelled").length
  const terminal = succeeded + failed
  const successRate = terminal > 0 ? (succeeded / terminal) * 100 : 0
  const avgDuration = getAverageDuration(runs)

  return (
    <aside className="rounded-[18px] border border-[#e7e7df] bg-white p-5 shadow-[0_14px_34px_rgba(0,0,0,0.06)] lg:p-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-black uppercase leading-none text-[#111]">Queue Insights</h2>
        <p className="mt-2 text-sm text-[#777]">Operational health for the visible run queue.</p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-5 rounded-xl border border-[#edede7] bg-[#fafaf7] p-4">
          <div>
            <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">Success rate</div>
            <div className="mt-2 font-display text-4xl font-black leading-none text-[#111]">{successRate.toFixed(1)}%</div>
            <div className="mt-3 text-xs font-bold text-[#23a55a]">Terminal task health</div>
          </div>
          <DonutChart rate={successRate} />
        </div>

        <div className="rounded-xl border border-[#edede7] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">Avg duration</div>
              <div className="mt-2 font-mono text-2xl font-black text-[#111]">{formatDuration(avgDuration)}</div>
            </div>
            <span className="rounded-full border border-[#efe6a8] bg-[#fffbe5] px-2.5 py-1 text-[11px] font-black uppercase text-[#8a7500]">
              Runtime
            </span>
          </div>
          <Sparkline />
        </div>

        <TasksOverTime runs={runs} />
        <SourceBreakdown runs={runs} />

        <Link
          href="/dashboard/tasks"
          className="inline-flex h-11 w-full items-center justify-center rounded-[9px] border border-[#111] bg-[#111] px-4 text-sm font-black text-white transition hover:bg-[#242424]"
        >
          View full analytics
        </Link>
      </div>
    </aside>
  )
}

function FloatingUtility() {
  return (
    <div className="fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 rounded-full bg-[#111] px-2 py-2 text-white shadow-[0_14px_30px_rgba(0,0,0,0.18)] 2xl:flex">
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12" aria-label="Timer">
        <Timer className="h-4 w-4" />
      </button>
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12" aria-label="Command menu">
        <Command className="h-4 w-4" />
      </button>
    </div>
  )
}

export function WorkspaceTaskCenter({
  locale,
  runs,
}: {
  locale: "zh" | "en"
  runs: WorkspaceTaskCenterItem[]
}) {
  const normalizedRuns = useMemo(() => buildNormalizedRuns(runs), [runs])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [source, setSource] = useState<SourceFilter>("all")
  const [dateRange, setDateRange] = useState<DateRangeFilter>("7d")
  const [sort, setSort] = useState<SortFilter>("newest")
  const [page, setPage] = useState(1)
  const filteredRuns = useFilteredRuns(normalizedRuns, { query, status, source, dateRange, sort })
  const pageCount = Math.max(1, Math.ceil(filteredRuns.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, pageCount)
  const pageRuns = filteredRuns.slice((normalizedPage - 1) * PAGE_SIZE, normalizedPage * PAGE_SIZE)

  function resetPage(next: () => void) {
    next()
    setPage(1)
  }

  function exportLogs() {
    const header = ["Task Name", "Source", "Run ID", "Created", "Updated", "Duration", "Status"]
    const rows = filteredRuns.map((run) => [
      run.displayName,
      sourceLabels[run.source],
      getRunId(run),
      formatTaskTimestamp(run.createdAt, locale),
      formatTaskTimestamp(run.updatedAt, locale),
      formatDuration(run.durationMs),
      statusLabels[run.normalizedStatus],
    ])
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "task-center-logs.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full overflow-auto bg-[#fafaf6] bg-[linear-gradient(rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[length:48px_48px]">
      <section className="mx-auto flex max-w-[1480px] flex-col gap-6 px-4 py-6 lg:px-6 xl:px-8">
        <TaskCenterHeader locale={locale} onExport={exportLogs} />
        <TaskMetricGrid runs={normalizedRuns} locale={locale} />

        <main className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <TaskFilterToolbar
              query={query}
              status={status}
              source={source}
              dateRange={dateRange}
              sort={sort}
              onQueryChange={(value) => resetPage(() => setQuery(value))}
              onStatusChange={(value) => resetPage(() => setStatus(value))}
              onSourceChange={(value) => resetPage(() => setSource(value))}
              onDateRangeChange={(value) => resetPage(() => setDateRange(value))}
              onSortChange={(value) => resetPage(() => setSort(value))}
            />
            <RecentTasksPanel
              runs={pageRuns}
              total={filteredRuns.length}
              page={normalizedPage}
              locale={locale}
              onPageChange={setPage}
            />
          </div>

          <QueueInsightsPanel runs={filteredRuns} />
        </main>
      </section>

      <FloatingUtility />
    </div>
  )
}
