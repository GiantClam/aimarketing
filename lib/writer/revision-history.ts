export type WriterRevisionHistoryItem = {
  id: string
  role: "user" | "assistant"
  content: string
  revision?: number | null
  isActiveDraft?: boolean
}

function isValidatedRevision(item: WriterRevisionHistoryItem) {
  return item.role === "assistant" && Number.isInteger(item.revision) && (item.revision || 0) > 0 && Boolean(item.content.trim())
}

/**
 * Returns persisted, validated article revisions in ascending revision order.
 * Pending optimistic assistant messages and legacy entries without a revision
 * are intentionally excluded so they cannot become the default active view.
 */
export function listWriterRevisionHistory<T extends WriterRevisionHistoryItem>(items: readonly T[]) {
  const byRevision = new Map<number, T>()
  for (const item of items) {
    if (!isValidatedRevision(item)) continue
    const revision = item.revision as number
    const current = byRevision.get(revision)
    if (!current || item.isActiveDraft || !current.isActiveDraft) byRevision.set(revision, item)
  }
  return [...byRevision.values()].sort((left, right) => (left.revision || 0) - (right.revision || 0))
}

export function selectLatestWriterRevision<T extends WriterRevisionHistoryItem>(
  items: readonly T[],
  activeRevision?: number | null,
) {
  const history = listWriterRevisionHistory(items)
  if (Number.isInteger(activeRevision) && (activeRevision || 0) > 0) {
    const active = history.find((item) => item.revision === activeRevision)
    if (active) return active
  }
  return history.at(-1) || null
}
