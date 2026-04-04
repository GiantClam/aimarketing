export type PendingTaskEventStatus = "running" | "completed" | "failed" | "info"

export type PendingTaskEvent = {
  type: string
  label: string
  detail?: string
  status: PendingTaskEventStatus
  at: number
}

export function normalizePendingTaskEvents(raw: unknown): PendingTaskEvent[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const source = item as Record<string, unknown>
      const type = typeof source.type === "string" ? source.type : ""
      const label = typeof source.label === "string" ? source.label : ""
      if (!type || !label) return null
      const detail = typeof source.detail === "string" ? source.detail : undefined
      const status =
        source.status === "running" || source.status === "completed" || source.status === "failed" || source.status === "info"
          ? source.status
          : "info"
      const at = typeof source.at === "number" && Number.isFinite(source.at) ? source.at : Date.now()
      return { type, label, detail, status, at } as PendingTaskEvent
    })
    .filter((item): item is PendingTaskEvent => Boolean(item))
    .sort((a, b) => a.at - b.at)
}

export function arePendingTaskEventsEqual(left: PendingTaskEvent[], right: PendingTaskEvent[]) {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const target = right[index]
    return (
      item.type === target.type &&
      item.label === target.label &&
      item.detail === target.detail &&
      item.status === target.status &&
      item.at === target.at
    )
  })
}
