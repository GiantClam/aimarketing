export type TaskSource = "tool" | "workflow" | "agent" | "media"
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type StatusFilter = "all" | "running" | "succeeded" | "failed" | "queued"
export type SourceFilter = "all" | TaskSource
export type DateRangeFilter = "today" | "7d" | "30d" | "custom"
export type SortFilter = "newest" | "duration" | "status" | "source"

export type WorkspaceTaskCenterItem = {
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

export type NormalizedTaskRun = WorkspaceTaskCenterItem & {
  source: TaskSource
  normalizedStatus: TaskStatus
  displayName: string
  durationMs: number | null
}

export type TaskCenterTask = {
  key: string
  source: TaskSource
  itemType: string
  itemSlug: string
  externalSystem: string | null
  displayName: string
  normalizedStatus: TaskStatus
  runCount: number
  runningRunCount: number
  queuedRunCount: number
  succeededRunCount: number
  failedRunCount: number
  createdAt: string | null
  updatedAt: string | null
  latestRun: NormalizedTaskRun
  averageDurationMs: number | null
  latestDurationMs: number | null
}

export const statusOrder: Record<TaskStatus, number> = {
  running: 0,
  queued: 1,
  failed: 2,
  cancelled: 3,
  succeeded: 4,
}

export const statusLabels: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
}

export const sourceLabels: Record<TaskSource, string> = {
  tool: "Tool",
  workflow: "Workflow",
  agent: "Agent",
  media: "Media",
}

export function normalizeSource(kind: string): TaskSource {
  if (kind === "workflow" || kind === "media" || kind === "tool" || kind === "agent") return kind
  return "tool"
}

export function normalizeStatus(status: string): TaskStatus {
  if (status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "cancelled") return status
  return "queued"
}

export function toDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatTaskTimestamp(value: string | null, locale: "zh" | "en") {
  const date = toDate(value)
  if (!date) return locale === "zh" ? "未记录" : "Not recorded"
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatDuration(value: number | null) {
  if (value == null || value < 0) return "00:00:00"
  const totalSeconds = Math.max(0, Math.round(value / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":")
}

export function getTaskDurationMs(run: WorkspaceTaskCenterItem) {
  const started = toDate(run.startedAt) ?? toDate(run.createdAt)
  const finished = toDate(run.finishedAt) ?? toDate(run.updatedAt)
  if (!started || !finished) return null
  return finished.getTime() - started.getTime()
}

export function getDisplayName(run: Pick<WorkspaceTaskCenterItem, "itemSlug">) {
  return run.itemSlug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (value) => value.toUpperCase())
}

export function getRunId(run: Pick<WorkspaceTaskCenterItem, "externalRunId" | "id">) {
  return run.externalRunId || `RUN-${String(run.id).padStart(5, "0")}`
}

export function getActivityDate(record: Pick<WorkspaceTaskCenterItem, "updatedAt" | "createdAt">) {
  return toDate(record.updatedAt) ?? toDate(record.createdAt)
}

export function getLatestTimestamp(records: Array<Pick<WorkspaceTaskCenterItem, "updatedAt" | "createdAt">>) {
  return records
    .map((record) => getActivityDate(record))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0]
}

export function getAverageDuration(items: Array<{ averageDurationMs: number | null }>) {
  const durations = items
    .map((item) => item.averageDurationMs)
    .filter((duration): duration is number => duration != null && duration >= 0)
  if (durations.length === 0) return null
  return durations.reduce((total, value) => total + value, 0) / durations.length
}

export function buildNormalizedRuns(runs: WorkspaceTaskCenterItem[]): NormalizedTaskRun[] {
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

function buildTaskKey(run: NormalizedTaskRun) {
  return [run.source, run.itemType, run.itemSlug, run.externalSystem ?? ""].join("::")
}

function sortRunsByActivity(left: NormalizedTaskRun, right: NormalizedTaskRun) {
  const leftTime = getActivityDate(left)?.getTime() ?? 0
  const rightTime = getActivityDate(right)?.getTime() ?? 0
  return rightTime - leftTime || right.id - left.id
}

export function buildTaskCenterTasks(runs: NormalizedTaskRun[]): TaskCenterTask[] {
  const grouped = new Map<string, NormalizedTaskRun[]>()

  for (const run of runs) {
    const key = buildTaskKey(run)
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(run)
    } else {
      grouped.set(key, [run])
    }
  }

  return [...grouped.entries()]
    .map(([key, groupRuns]) => {
      const sortedRuns = [...groupRuns].sort(sortRunsByActivity)
      const latestRun = sortedRuns[0]
      const durations = sortedRuns
        .map((run) => run.durationMs)
        .filter((duration): duration is number => duration != null && duration >= 0)
      const createdAt = [...sortedRuns]
        .map((run) => toDate(run.createdAt))
        .filter((date): date is Date => Boolean(date))
        .sort((left, right) => left.getTime() - right.getTime())[0]
      const updatedAt = getLatestTimestamp(sortedRuns)
      const runningRunCount = sortedRuns.filter((run) => run.normalizedStatus === "running").length
      const queuedRunCount = sortedRuns.filter((run) => run.normalizedStatus === "queued").length
      const succeededRunCount = sortedRuns.filter((run) => run.normalizedStatus === "succeeded").length
      const failedRunCount = sortedRuns.filter((run) => run.normalizedStatus === "failed" || run.normalizedStatus === "cancelled").length

      return {
        key,
        source: latestRun.source,
        itemType: latestRun.itemType,
        itemSlug: latestRun.itemSlug,
        externalSystem: latestRun.externalSystem,
        displayName: latestRun.displayName,
        normalizedStatus: latestRun.normalizedStatus,
        runCount: sortedRuns.length,
        runningRunCount,
        queuedRunCount,
        succeededRunCount,
        failedRunCount,
        createdAt: createdAt ? createdAt.toISOString() : latestRun.createdAt,
        updatedAt: updatedAt ? updatedAt.toISOString() : latestRun.updatedAt,
        latestRun,
        averageDurationMs:
          durations.length > 0 ? durations.reduce((total, value) => total + value, 0) / durations.length : null,
        latestDurationMs: latestRun.durationMs,
      } satisfies TaskCenterTask
    })
    .sort((left, right) => sortTaskCenterTasks(left, right, "newest"))
}

function getRangeStart(
  dateRange: DateRangeFilter,
  latest: Date | undefined,
) {
  const dayStart = latest ? new Date(latest) : null

  if (dayStart) {
    dayStart.setHours(0, 0, 0, 0)
  }

  if (dateRange === "today" && dayStart) return dayStart
  if (dateRange === "7d" && latest) return new Date(latest.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (dateRange === "30d" && latest) return new Date(latest.getTime() - 30 * 24 * 60 * 60 * 1000)
  return null
}

function sortTaskCenterTasksByNewest(left: TaskCenterTask, right: TaskCenterTask) {
  const leftTime = getActivityDate(left)?.getTime() ?? 0
  const rightTime = getActivityDate(right)?.getTime() ?? 0
  return rightTime - leftTime || right.latestRun.id - left.latestRun.id
}

export function sortTaskCenterTasks(left: TaskCenterTask, right: TaskCenterTask, sort: SortFilter = "newest") {
  if (sort === "duration") {
    return (right.averageDurationMs ?? -1) - (left.averageDurationMs ?? -1) || sortTaskCenterTasksByNewest(left, right)
  }

  if (sort === "status") {
    return statusOrder[left.normalizedStatus] - statusOrder[right.normalizedStatus] || sortTaskCenterTasksByNewest(left, right)
  }

  if (sort === "source") {
    return sourceLabels[left.source].localeCompare(sourceLabels[right.source]) || sortTaskCenterTasksByNewest(left, right)
  }

  return sortTaskCenterTasksByNewest(left, right)
}

export function filterTaskCenterTasks(
  tasks: TaskCenterTask[],
  filters: {
    query: string
    status: StatusFilter
    source: SourceFilter
    dateRange: DateRangeFilter
    sort: SortFilter
  },
) {
  const query = filters.query.trim().toLowerCase()
  const latest = getLatestTimestamp(tasks)
  const rangeStart = getRangeStart(filters.dateRange, latest)

  return tasks
    .filter((task) => {
      const taskDate = getActivityDate(task)
      const statusMatches =
        filters.status === "all" ||
        task.normalizedStatus === filters.status ||
        (filters.status === "failed" && task.normalizedStatus === "cancelled")
      const sourceMatches = filters.source === "all" || task.source === filters.source
      const rangeMatches = !rangeStart || !taskDate || taskDate.getTime() >= rangeStart.getTime()
      const queryMatches =
        !query ||
        task.displayName.toLowerCase().includes(query) ||
        task.itemSlug.toLowerCase().includes(query) ||
        task.itemType.toLowerCase().includes(query) ||
        getRunId(task.latestRun).toLowerCase().includes(query) ||
        String(task.latestRun.id).includes(query)

      return statusMatches && sourceMatches && rangeMatches && queryMatches
    })
    .sort((left, right) => sortTaskCenterTasks(left, right, filters.sort))
}
