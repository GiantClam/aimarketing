import { looksLikeReferenceEditIntent } from "@/lib/image-assistant/intent"
import type { ImageAssistantGuidedSelection } from "@/lib/image-assistant/types"

type VersionRef = {
  id: string
  selected_candidate_id: string | null
  candidates: Array<{
    id: string
    asset_id: string
  }>
}

function getPrimaryAssetIdFromVersion(version: VersionRef | null | undefined) {
  if (!version) return null

  const selectedCandidate = version.selected_candidate_id
    ? version.candidates.find((candidate) => candidate.id === version.selected_candidate_id) || null
    : null
  const fallbackCandidate = selectedCandidate || version.candidates[0] || null
  return typeof fallbackCandidate?.asset_id === "string" && fallbackCandidate.asset_id ? fallbackCandidate.asset_id : null
}

function dedupeAssetIds(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (typeof value !== "string" || !value) continue
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }

  return result
}

export function getFallbackReferenceAssetIdsFromVersions(input: {
  versions: VersionRef[]
  selectedVersionId?: string | null
  currentVersionId?: string | null
}) {
  if (!Array.isArray(input.versions) || !input.versions.length) {
    return []
  }

  const preferredVersionIds = dedupeAssetIds([input.selectedVersionId, input.currentVersionId])
  for (const versionId of preferredVersionIds) {
    const assetId = getPrimaryAssetIdFromVersion(input.versions.find((version) => version.id === versionId) || null)
    if (assetId) return [assetId]
  }

  for (const version of input.versions) {
    const assetId = getPrimaryAssetIdFromVersion(version)
    if (assetId) return [assetId]
  }

  return []
}

export function shouldUseImplicitEditMode(input: {
  requestedKind: "generate" | "edit"
  prompt: string
  guidedSelection?: ImageAssistantGuidedSelection | null
  explicitReferenceCount: number
  fallbackReferenceCount: number
}) {
  if (input.requestedKind !== "generate") {
    return false
  }
  const totalReferenceCount = Math.max(0, input.explicitReferenceCount) + Math.max(0, input.fallbackReferenceCount)
  if (totalReferenceCount <= 0) {
    return false
  }
  if (input.guidedSelection?.question_id) {
    return false
  }

  return looksLikeReferenceEditIntent({
    prompt: input.prompt,
    taskType: null,
    referenceCount: totalReferenceCount,
  })
}
