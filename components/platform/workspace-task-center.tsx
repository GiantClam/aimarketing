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
import {
  buildNormalizedRuns,
  buildTaskCenterTasks,
  filterTaskCenterTasks,
  formatDuration,
  formatTaskTimestamp,
  getAverageDuration,
  getLatestTimestamp,
  getRunId,
  getLocalizedSourceLabel,
  getLocalizedStatusLabel,
  getLocalizedTaskName,
  sourceLabels,
  type DateRangeFilter,
  type SortFilter,
  type SourceFilter,
  type StatusFilter,
  type TaskCenterTask,
  type TaskSource,
  type TaskStatus,
  type WorkspaceTaskCenterItem,
} from "@/lib/platform/task-center-view"

const PAGE_SIZE = 10

const sourceStyles: Record<TaskSource, string> = {
  tool: "border-[#efe6a8] bg-[#fff7d6] text-[#8a7500]",
  workflow: "border-[#c9dcff] bg-[#edf4ff] text-[#2463d4]",
  agent: "border-[#ccefd7] bg-[#eefaf2] text-[#23a55a]",
  media: "border-[#d8c9ff] bg-[#f2ecff] text-[#7653d6]",
}

const sourceDotStyles: Record<TaskSource, string> = {
  tool: "bg-[#ffd000]",
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

const TASK_CENTER_COPY = {
  zh: {
    header: "任务中心",
    description: "按任务聚合查看 workflow、media、tool 和 agent 的执行情况，不再把单次运行事件当成任务本身。",
    exportTasks: "导出任务",
    refreshTasks: "刷新任务",
    totalTasks: "任务总数",
    executionRecords: "条执行记录",
    active: "进行中",
    queuedTasks: "个排队任务",
    healthy: "运行健康",
    latestSucceeded: "最近一次执行成功",
    needsReview: "需要关注",
    latestFailed: "最近一次执行失败或已取消",
    lastUpdated: "最后更新",
    groupedSnapshot: "聚合任务快照",
    noSync: "暂无同步",
    searchAria: "搜索任务名称或最近运行 ID",
    searchPlaceholder: "搜索任务名称、slug、最近运行 ID……",
    allStatus: "全部状态",
    allSources: "全部来源",
    today: "今天",
    last7Days: "最近 7 天",
    last30Days: "最近 30 天",
    custom: "自定义",
    latestActivity: "最近活动",
    avgDuration: "平均耗时",
    latestStatus: "最近状态",
    source: "来源",
    viewLatestExecution: "查看最近执行",
    retry: "重试",
    openResult: "打开结果",
    more: "更多",
    task: "任务",
    latestRun: "最近运行",
    lastUpdatedColumn: "最后更新",
    runs: "运行次数",
    actions: "操作",
    localPlatformTask: "本地平台任务",
    run: "次运行",
    failedRun: "次失败",
    empty: "当前筛选条件下没有聚合后的任务记录。",
    showing: "显示",
    to: "至",
    of: "，共",
    tasks: "个任务",
    previousPage: "上一页",
    nextPage: "下一页",
    taskOverview: "任务概览",
    overviewDescription: "按任务身份聚合，每行指向最近的执行记录。",
    taskInsights: "任务洞察",
    insightsDescription: "当前可见聚合任务列表的运行健康情况。",
    successRate: "成功率",
    latestOutcomeHealth: "最近任务结果健康度",
    taskTag: "任务",
    tasksOverTime: "任务趋势",
    sourceBreakdown: "来源分布",
    viewFullAnalytics: "查看完整分析",
    timer: "计时器",
    commandMenu: "命令菜单",
  },
  en: {
    header: "Task Center",
    description: "Review workflow, media, tool, and agent activity as grouped tasks instead of treating each execution event as a task.",
    exportTasks: "Export tasks",
    refreshTasks: "Refresh tasks",
    totalTasks: "Total tasks",
    executionRecords: "execution records",
    active: "Active",
    queuedTasks: "queued tasks",
    healthy: "Healthy",
    latestSucceeded: "Latest execution succeeded",
    needsReview: "Needs review",
    latestFailed: "Latest execution failed or cancelled",
    lastUpdated: "Last updated",
    groupedSnapshot: "Grouped task snapshot",
    noSync: "No sync",
    searchAria: "Search task name or latest run ID",
    searchPlaceholder: "Search task name, slug, latest run ID...",
    allStatus: "All status",
    allSources: "All sources",
    today: "Today",
    last7Days: "Last 7 days",
    last30Days: "Last 30 days",
    custom: "Custom",
    latestActivity: "Latest activity",
    avgDuration: "Avg duration",
    latestStatus: "Latest status",
    source: "Source",
    viewLatestExecution: "View latest execution",
    retry: "Retry",
    openResult: "Open result",
    more: "More",
    task: "Task",
    latestRun: "Latest Run",
    lastUpdatedColumn: "Last Updated",
    runs: "Runs",
    actions: "Actions",
    localPlatformTask: "Local platform task",
    run: "run",
    failedRun: "failed",
    empty: "No grouped tasks match the current filters.",
    showing: "Showing",
    to: "to",
    of: "of",
    tasks: "tasks",
    previousPage: "Previous page",
    nextPage: "Next page",
    taskOverview: "Task Overview",
    overviewDescription: "Grouped by task identity. Each row points to the latest execution record.",
    taskInsights: "Task Insights",
    insightsDescription: "Operational health for the visible grouped task list.",
    successRate: "Success rate",
    latestOutcomeHealth: "Latest task outcome health",
    taskTag: "Task",
    tasksOverTime: "Tasks over time",
    sourceBreakdown: "Source breakdown",
    viewFullAnalytics: "View full analytics",
    timer: "Timer",
    commandMenu: "Command menu",
  },
} as const

function getTaskCenterCopy(locale: "zh" | "en") {
  return TASK_CENTER_COPY[locale]
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

function useFilteredTasks(tasks: TaskCenterTask[], filters: {
  query: string
  status: StatusFilter
  source: SourceFilter
  dateRange: DateRangeFilter
  sort: SortFilter
}) {
  const { query, status, source, dateRange, sort } = filters
  return useMemo(
    () => filterTaskCenterTasks(tasks, { query, status, source, dateRange, sort }),
    [dateRange, query, sort, source, status, tasks],
  )
}

function TaskSourceBadge({ source, locale }: { source: TaskSource; locale: "zh" | "en" }) {
  return (
    <span className={`inline-flex h-[26px] items-center rounded-[7px] border px-2.5 text-[11px] font-black uppercase ${sourceStyles[source]}`}>
      {getLocalizedSourceLabel(source, locale)}
    </span>
  )
}

function TaskStatusBadge({ status, locale }: { status: TaskStatus; locale: "zh" | "en" }) {
  return (
    <span className={`inline-flex h-[26px] items-center rounded-full border px-2.5 text-[11px] font-black uppercase ${statusStyles[status]}`}>
      {getLocalizedStatusLabel(status, locale)}
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
  const copy = getTaskCenterCopy(locale)

  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="font-display text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          {copy.header}
        </div>
        <h1 className="mt-2 font-display text-[4.2rem] font-black uppercase leading-[0.86] tracking-[0] text-[#111] sm:text-[5.35rem] lg:text-[5.85rem]">
          {copy.header}
        </h1>
        <p className="mt-5 max-w-[720px] text-[15px] leading-7 text-[#666] sm:text-base">
          {copy.description}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-11 items-center gap-2 rounded-[9px] border border-[#deded6] bg-white px-[18px] text-sm font-extrabold text-[#111] shadow-[0_10px_24px_rgba(0,0,0,0.045)] transition hover:-translate-y-0.5 hover:border-[#cfcfc7]"
        >
          <Download className="h-4 w-4" />
          {copy.exportTasks}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center gap-2 rounded-[9px] border border-[#c9a400] bg-[#ffd000] px-[22px] text-sm font-black text-[#111] shadow-[0_10px_24px_rgba(255,208,0,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ffd21a]"
        >
          <RefreshCw className="h-4 w-4" />
          {copy.refreshTasks}
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
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] border border-[#c9a400] bg-[#ffd000] text-[#111]">
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
  tasks,
  totalRuns,
  locale,
}: {
  tasks: TaskCenterTask[]
  totalRuns: number
  locale: "zh" | "en"
}) {
  const copy = getTaskCenterCopy(locale)
  const running = tasks.filter((task) => task.normalizedStatus === "running").length
  const queued = tasks.filter((task) => task.normalizedStatus === "queued").length
  const succeeded = tasks.filter((task) => task.normalizedStatus === "succeeded").length
  const failed = tasks.filter((task) => task.normalizedStatus === "failed" || task.normalizedStatus === "cancelled").length
  const latest = getLatestTimestamp(tasks)
  const latestLabel = latest ? formatTaskTimestamp(latest.toISOString(), locale) : copy.noSync

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <TaskMetricCard icon={ListChecks} label={copy.totalTasks} value={tasks.length.toLocaleString()} detail={`${totalRuns.toLocaleString()} ${copy.executionRecords}`} />
      <TaskMetricCard icon={Loader2} label={copy.active} value={running.toLocaleString()} detail={`${queued.toLocaleString()} ${copy.queuedTasks}`} />
      <TaskMetricCard icon={CheckCircle2} label={copy.healthy} value={succeeded.toLocaleString()} detail={copy.latestSucceeded} tone="good" />
      <TaskMetricCard icon={XCircle} label={copy.needsReview} value={failed.toLocaleString()} detail={copy.latestFailed} tone={failed > 0 ? "risk" : "neutral"} />
      <TaskMetricCard icon={Clock3} label={copy.lastUpdated} value={latestLabel} detail={copy.groupedSnapshot} />
    </section>
  )
}

function TaskFilterToolbar({
  locale,
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
  locale: "zh" | "en"
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
  const copy = getTaskCenterCopy(locale)

  return (
    <section className="rounded-2xl border border-[#e7e7df] bg-white p-4 shadow-[0_10px_28px_rgba(0,0,0,0.045)]">
      <DashboardFilterToolbar
        className="2xl:items-center 2xl:justify-between"
        searchClassName="2xl:max-w-[440px]"
        filtersClassName="2xl:justify-end"
        search={
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777]" />
            <span className="sr-only">{copy.searchAria}</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#b89100] focus:ring-4 focus:ring-[#ffd000]/25"
            />
          </label>
        }
        filters={
          <>
            <select value={status} onChange={(event) => onStatusChange(event.target.value as StatusFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[140px] sm:w-auto">
              <option value="all">{copy.allStatus}</option>
              <option value="running">{getLocalizedStatusLabel("running", locale)}</option>
              <option value="succeeded">{getLocalizedStatusLabel("succeeded", locale)}</option>
              <option value="failed">{getLocalizedStatusLabel("failed", locale)}</option>
              <option value="queued">{getLocalizedStatusLabel("queued", locale)}</option>
            </select>
            <select value={source} onChange={(event) => onSourceChange(event.target.value as SourceFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[140px] sm:w-auto">
              <option value="all">{copy.allSources}</option>
              <option value="tool">{getLocalizedSourceLabel("tool", locale)}</option>
              <option value="workflow">{getLocalizedSourceLabel("workflow", locale)}</option>
              <option value="agent">{getLocalizedSourceLabel("agent", locale)}</option>
              <option value="media">{getLocalizedSourceLabel("media", locale)}</option>
            </select>
            <select value={dateRange} onChange={(event) => onDateRangeChange(event.target.value as DateRangeFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[160px] sm:w-auto">
              <option value="today">{copy.today}</option>
              <option value="7d">{copy.last7Days}</option>
              <option value="30d">{copy.last30Days}</option>
              <option value="custom">{copy.custom}</option>
            </select>
            <select value={sort} onChange={(event) => onSortChange(event.target.value as SortFilter)} className="h-11 w-full rounded-[9px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111] outline-none sm:min-w-[170px] sm:w-auto">
              <option value="newest">{copy.latestActivity}</option>
              <option value="duration">{copy.avgDuration}</option>
              <option value="status">{copy.latestStatus}</option>
              <option value="source">{copy.source}</option>
            </select>
          </>
        }
      />
    </section>
  )
}

function TaskActions({ task, locale }: { task: TaskCenterTask; locale: "zh" | "en" }) {
  const copy = getTaskCenterCopy(locale)
  const isFailed = task.normalizedStatus === "failed" || task.normalizedStatus === "cancelled"

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/dashboard/tasks/${task.latestRun.id}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e1e1da] bg-white text-[#111] transition hover:border-[#b89100] hover:bg-[#ffd000]"
        title={copy.viewLatestExecution}
        aria-label={copy.viewLatestExecution}
      >
        <Eye className="h-4 w-4" />
      </Link>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e1e1da] bg-white text-[#111] transition hover:border-[#b89100] hover:bg-[#ffd000]"
        title={isFailed ? copy.retry : copy.openResult}
        aria-label={isFailed ? copy.retry : copy.openResult}
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e1e1da] bg-white text-[#111] transition hover:border-[#b89100] hover:bg-[#ffd000]"
        title={copy.more}
        aria-label={copy.more}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  )
}

function RecentTasksTable({
  tasks,
  locale,
}: {
  tasks: TaskCenterTask[]
  locale: "zh" | "en"
}) {
  const copy = getTaskCenterCopy(locale)

  return (
    <div className="overflow-x-auto rounded-xl border border-[#edede7]">
      <table className="w-full min-w-[980px] border-separate border-spacing-0 bg-white">
        <thead className="bg-[#fafaf7] text-[11px] font-black uppercase tracking-[0.08em] text-[#555]">
          <tr>
            {[
              copy.task,
              copy.source,
              copy.latestRun,
              copy.lastUpdatedColumn,
              copy.runs,
              copy.avgDuration,
              copy.latestStatus,
              copy.actions,
            ].map((heading) => (
              <th key={heading} className="px-4 py-3 text-left">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.length > 0 ? (
            tasks.map((task) => {
              const TaskIcon = getTaskIcon(task.source)

              return (
                <tr key={task.key} className="transition hover:bg-[#fffef0]">
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm text-[#222]">
                    <div className="flex min-w-[220px] items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${sourceDotStyles[task.source]} text-[#111]`}>
                        <TaskIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {task.normalizedStatus === "running" ? <span className="h-2 w-2 rounded-full bg-[#23a55a]" /> : null}
                          <span className="truncate font-black uppercase tracking-[0.01em] text-[#111]">{getLocalizedTaskName(task, locale)}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-[#777]">
                          {[
                            task.externalSystem || task.itemType || copy.localPlatformTask,
                            `${task.runCount} ${locale === "zh" ? copy.run : task.runCount === 1 ? copy.run : `${copy.run}s`}`,
                            task.failedRunCount > 0 ? `${task.failedRunCount} ${copy.failedRun}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm">
                    <TaskSourceBadge source={task.source} locale={locale} />
                  </td>
                  <td className="border-t border-[#edede7] px-4 py-3 font-mono text-xs text-[#333]">{getRunId(task.latestRun)}</td>
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm text-[#333]">{formatTaskTimestamp(task.updatedAt, locale)}</td>
                  <td className="border-t border-[#edede7] px-4 py-3 text-sm text-[#333]">{task.runCount.toLocaleString()}</td>
                  <td className="border-t border-[#edede7] px-4 py-3 font-mono text-xs text-[#333]">{formatDuration(task.averageDurationMs)}</td>
                  <td className="border-t border-[#edede7] px-4 py-3">
                    <TaskStatusBadge status={task.normalizedStatus} locale={locale} />
                  </td>
                  <td className="border-t border-[#edede7] px-4 py-3">
                    <TaskActions task={task} locale={locale} />
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan={8} className="border-t border-[#edede7] px-4 py-12 text-center text-sm font-bold text-[#777]">
                {copy.empty}
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
  locale,
  onPageChange,
}: {
  page: number
  total: number
  locale: "zh" | "en"
  onPageChange: (page: number) => void
}) {
  const copy = getTaskCenterCopy(locale)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(total, page * PAGE_SIZE)
  const visiblePages = Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1)

  return (
    <div className="flex flex-col gap-3 pt-4 text-sm text-[#666] sm:flex-row sm:items-center sm:justify-between">
      <div className="font-bold">
        {locale === "zh"
          ? `${copy.showing} ${start} ${copy.to} ${end}${copy.of} ${total.toLocaleString()}${copy.tasks}`
          : `${copy.showing} ${start} ${copy.to} ${end} ${copy.of} ${total.toLocaleString()} ${copy.tasks}`}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} className="h-9 rounded-lg border border-[#deded6] bg-white px-3 font-black text-[#111]" aria-label={copy.previousPage}>
          &lt;
        </button>
        {visiblePages.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            className={`h-9 w-9 rounded-lg border font-black ${item === page ? "border-[#c9a400] bg-[#ffd000] text-[#111]" : "border-[#deded6] bg-white text-[#111]"}`}
          >
            {item}
          </button>
        ))}
        {pageCount > 3 ? <span className="px-1 font-black text-[#777]">...</span> : null}
        <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} className="h-9 rounded-lg border border-[#deded6] bg-white px-3 font-black text-[#111]" aria-label={copy.nextPage}>
          &gt;
        </button>
      </div>
    </div>
  )
}

function RecentTasksPanel({
  tasks,
  total,
  page,
  locale,
  onPageChange,
}: {
  tasks: TaskCenterTask[]
  total: number
  page: number
  locale: "zh" | "en"
  onPageChange: (page: number) => void
}) {
  const copy = getTaskCenterCopy(locale)

  return (
    <section className="rounded-[18px] border border-[#e7e7df] bg-white p-5 shadow-[0_14px_34px_rgba(0,0,0,0.06)] lg:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-black uppercase leading-none text-[#111]">{copy.taskOverview}</h2>
          <p className="mt-2 text-sm text-[#777]">{copy.overviewDescription}</p>
        </div>
        <span className="rounded-lg border border-[#e7e7df] bg-[#fafaf7] px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#555]">
          {total.toLocaleString()} {copy.tasks}
        </span>
      </div>

      <RecentTasksTable tasks={tasks} locale={locale} />
      <TaskPagination page={page} total={total} locale={locale} onPageChange={onPageChange} />
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

function Sparkline({ locale }: { locale: "zh" | "en" }) {
  const copy = getTaskCenterCopy(locale)

  return (
    <svg viewBox="0 0 180 52" className="h-[52px] w-full" role="img" aria-label={`${copy.avgDuration} trend`}>
      <path d="M4 38 C 28 18, 42 34, 62 24 S 95 14, 112 27 S 148 40, 176 12" fill="none" stroke="#ffd000" strokeLinecap="round" strokeWidth="5" />
      <path d="M4 38 C 28 18, 42 34, 62 24 S 95 14, 112 27 S 148 40, 176 12" fill="none" stroke="#111" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

function TasksOverTime({ tasks, locale }: { tasks: TaskCenterTask[]; locale: "zh" | "en" }) {
  const copy = getTaskCenterCopy(locale)
  const latest = getLatestTimestamp(tasks)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = latest ? new Date(latest.getTime() - (6 - index) * 24 * 60 * 60 * 1000) : null
    const key = date?.toISOString().slice(0, 10) ?? `day-${index}`
    const dayTasks = tasks.filter((task) => task.updatedAt?.slice(0, 10) === key)
    const succeeded = dayTasks.filter((task) => task.normalizedStatus === "succeeded").length
    const failed = dayTasks.filter((task) => task.normalizedStatus === "failed" || task.normalizedStatus === "cancelled").length
    const running = dayTasks.filter((task) => task.normalizedStatus === "running" || task.normalizedStatus === "queued").length
    const total = Math.max(1, succeeded + failed + running)

    return {
      label: date ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }).format(date) : `D${index + 1}`,
      succeeded,
      failed,
      running,
      total,
    }
  })

  return (
    <div className="space-y-3">
      <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">{copy.tasksOverTime}</div>
      <div className="flex h-28 items-end gap-2">
        {days.map((day) => (
          <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-20 w-full max-w-[26px] flex-col justify-end overflow-hidden rounded-t-lg border border-[#e7e7df] bg-[#f7f7f2]">
              <div style={{ height: `${Math.max(8, (day.running / day.total) * 80)}px` }} className="bg-[#ffd000]" />
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

function SourceBreakdown({ tasks, locale }: { tasks: TaskCenterTask[]; locale: "zh" | "en" }) {
  const copy = getTaskCenterCopy(locale)
  const total = Math.max(1, tasks.length)
  const sourceCounts = (Object.keys(sourceLabels) as TaskSource[]).map((source) => {
    const count = tasks.filter((task) => task.source === source).length
    return { source, count, percent: (count / total) * 100 }
  })

  return (
    <div className="space-y-3">
      <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">{copy.sourceBreakdown}</div>
      {sourceCounts.map((item) => (
        <div key={item.source} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-black text-[#333]">
            <span>{getLocalizedSourceLabel(item.source, locale)}</span>
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

function QueueInsightsPanel({ tasks, locale }: { tasks: TaskCenterTask[]; locale: "zh" | "en" }) {
  const copy = getTaskCenterCopy(locale)
  const succeeded = tasks.filter((task) => task.normalizedStatus === "succeeded").length
  const failed = tasks.filter((task) => task.normalizedStatus === "failed" || task.normalizedStatus === "cancelled").length
  const terminal = succeeded + failed
  const successRate = terminal > 0 ? (succeeded / terminal) * 100 : 0
  const avgDuration = getAverageDuration(tasks)

  return (
    <aside className="rounded-[18px] border border-[#e7e7df] bg-white p-5 shadow-[0_14px_34px_rgba(0,0,0,0.06)] lg:p-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-black uppercase leading-none text-[#111]">{copy.taskInsights}</h2>
        <p className="mt-2 text-sm text-[#777]">{copy.insightsDescription}</p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-5 rounded-xl border border-[#edede7] bg-[#fafaf7] p-4">
            <div>
              <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">{copy.successRate}</div>
              <div className="mt-2 font-display text-4xl font-black leading-none text-[#111]">{successRate.toFixed(1)}%</div>
              <div className="mt-3 text-xs font-bold text-[#23a55a]">{copy.latestOutcomeHealth}</div>
            </div>
            <DonutChart rate={successRate} />
          </div>

        <div className="rounded-xl border border-[#edede7] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#666]">{copy.avgDuration}</div>
              <div className="mt-2 font-mono text-2xl font-black text-[#111]">{formatDuration(avgDuration)}</div>
            </div>
            <span className="rounded-full border border-[#efe6a8] bg-[#fffbe5] px-2.5 py-1 text-[11px] font-black uppercase text-[#8a7500]">
              {copy.taskTag}
            </span>
          </div>
          <Sparkline locale={locale} />
        </div>

        <TasksOverTime tasks={tasks} locale={locale} />
        <SourceBreakdown tasks={tasks} locale={locale} />

        <Link
          href="/dashboard/tasks"
          className="inline-flex h-11 w-full items-center justify-center rounded-[9px] border border-[#111] bg-[#111] px-4 text-sm font-black text-white transition hover:bg-[#242424]"
        >
          {copy.viewFullAnalytics}
        </Link>
      </div>
    </aside>
  )
}

function FloatingUtility({ locale }: { locale: "zh" | "en" }) {
  const copy = getTaskCenterCopy(locale)

  return (
    <div className="fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 rounded-full bg-[#111] px-2 py-2 text-white shadow-[0_14px_30px_rgba(0,0,0,0.18)] 2xl:flex">
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12" aria-label={copy.timer}>
        <Timer className="h-4 w-4" />
      </button>
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12" aria-label={copy.commandMenu}>
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
  const groupedTasks = useMemo(() => buildTaskCenterTasks(normalizedRuns), [normalizedRuns])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [source, setSource] = useState<SourceFilter>("all")
  const [dateRange, setDateRange] = useState<DateRangeFilter>("7d")
  const [sort, setSort] = useState<SortFilter>("newest")
  const [page, setPage] = useState(1)
  const filteredTasks = useFilteredTasks(groupedTasks, { query, status, source, dateRange, sort })
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, pageCount)
  const pageTasks = filteredTasks.slice((normalizedPage - 1) * PAGE_SIZE, normalizedPage * PAGE_SIZE)

  function resetPage(next: () => void) {
    next()
    setPage(1)
  }

  function exportTasks() {
    const copy = getTaskCenterCopy(locale)
    const header = [copy.task, copy.source, copy.latestRun, copy.lastUpdatedColumn, copy.runs, copy.avgDuration, copy.latestStatus]
    const rows = filteredTasks.map((task) => [
      getLocalizedTaskName(task, locale),
      getLocalizedSourceLabel(task.source, locale),
      getRunId(task.latestRun),
      formatTaskTimestamp(task.updatedAt, locale),
      String(task.runCount),
      formatDuration(task.averageDurationMs),
      getLocalizedStatusLabel(task.normalizedStatus, locale),
    ])
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "task-center.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full overflow-auto bg-[#fafaf6] bg-[linear-gradient(rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[length:48px_48px]">
      <section className="mx-auto flex max-w-[1480px] flex-col gap-6 px-4 py-6 lg:px-6 xl:px-8">
        <TaskCenterHeader locale={locale} onExport={exportTasks} />
        <TaskMetricGrid tasks={groupedTasks} totalRuns={normalizedRuns.length} locale={locale} />

        <main className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <TaskFilterToolbar
              locale={locale}
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
              tasks={pageTasks}
              total={filteredTasks.length}
              page={normalizedPage}
              locale={locale}
              onPageChange={setPage}
            />
          </div>

          <QueueInsightsPanel tasks={filteredTasks} locale={locale} />
        </main>
      </section>

      <FloatingUtility locale={locale} />
    </div>
  )
}
