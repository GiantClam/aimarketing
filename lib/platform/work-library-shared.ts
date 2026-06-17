export type EnterpriseWorkLibraryGroupKey = "image" | "video" | "audio" | "document" | "other"
export type EnterpriseWorkLibraryPreviewKind = "image" | "video" | "audio" | "pdf" | "file"

export type EnterpriseWorkLibraryCandidate = {
  workId: number
  artifactId: number
  title: string
  type: string
  source: string | null
  mimeType: string | null
  artifactKind: string
  createdAt: string | null
  previewKind: EnterpriseWorkLibraryPreviewKind
  formatGroup: EnterpriseWorkLibraryGroupKey
  sourceUrl: string | null
  previewUrl: string
  downloadUrl: string
  referenceCount: number
}

export type EnterpriseWorkLibraryGroup = {
  key: EnterpriseWorkLibraryGroupKey
  items: EnterpriseWorkLibraryCandidate[]
}

const WORK_LIBRARY_GROUP_ORDER: EnterpriseWorkLibraryGroupKey[] = ["image", "video", "audio", "document", "other"]

function sortCandidatesByCreatedDesc(items: EnterpriseWorkLibraryCandidate[]) {
  return [...items].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return rightTime - leftTime || right.workId - left.workId
  })
}

export function filterWorkLibraryCandidates(
  items: EnterpriseWorkLibraryCandidate[],
  query: string,
): EnterpriseWorkLibraryCandidate[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return items

  return items.filter((item) =>
    [
      item.title,
      item.type,
      item.source,
      item.mimeType,
      String(item.artifactId),
      String(item.workId),
      item.artifactKind,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized)),
  )
}

export function groupWorkLibraryCandidates(
  items: EnterpriseWorkLibraryCandidate[],
): EnterpriseWorkLibraryGroup[] {
  const groups = new Map<EnterpriseWorkLibraryGroupKey, EnterpriseWorkLibraryCandidate[]>()
  for (const key of WORK_LIBRARY_GROUP_ORDER) groups.set(key, [])

  for (const item of sortCandidatesByCreatedDesc(items)) {
    groups.get(item.formatGroup)?.push(item)
  }

  return WORK_LIBRARY_GROUP_ORDER.map((key) => ({
    key,
    items: groups.get(key) ?? [],
  })).filter((group) => group.items.length > 0)
}
