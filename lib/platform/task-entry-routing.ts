import type { TaskCenterTask } from "@/lib/platform/task-center-view"

export type TaskEntryTask = Pick<TaskCenterTask, "source" | "itemType" | "itemSlug"> & {
  latestRun: Pick<TaskCenterTask["latestRun"], "id" | "externalRunId">
}

const AUDIO_FEATURES = new Set(["ai-music", "voice-clone", "voice-synthesis"])
const VIDEO_FEATURES = new Set([
  "text-to-video",
  "image-to-video",
  "reference-to-video",
  "video-edit",
  "digital-human",
  "video-enhance",
])

function encodePathSegment(value: string) {
  return encodeURIComponent(value.trim())
}

function buildQuery(params: Record<string, string>) {
  return new URLSearchParams(params).toString()
}

function hasSessionSlug(task: TaskEntryTask) {
  const slug = task.itemSlug.trim()
  const externalRunId = task.latestRun.externalRunId?.trim() || ""
  return Boolean(slug) && slug !== externalRunId
}

export function resolveTaskEntryHref(task: TaskEntryTask) {
  const runId = String(task.latestRun.id)

  if (task.source === "workflow" && task.itemType === "workflow") {
    return `/dashboard/workflows/runs/${runId}`
  }

  if (task.source === "media" && task.itemType === "capability") {
    const feature = task.itemSlug.trim()
    const pathname = AUDIO_FEATURES.has(feature) ? "/dashboard/capabilities" : VIDEO_FEATURES.has(feature) ? "/dashboard/video" : null
    if (pathname) {
      return `${pathname}?${buildQuery({ feature, runId })}`
    }
  }

  if (task.source === "agent" && task.itemType === "writer_asset" && hasSessionSlug(task)) {
    return `/dashboard/writer/${encodePathSegment(task.itemSlug)}`
  }

  if (task.source === "agent" && task.itemType === "ai_entry_opencode" && hasSessionSlug(task)) {
    return `/dashboard/ai/${encodePathSegment(task.itemSlug)}`
  }

  return `/dashboard/tasks/${runId}`
}
