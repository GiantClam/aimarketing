import {
  extractLatestPptPreviewInvalidationContext,
  type PptConversationState,
  resolveLatestPptConversationState,
} from "@/lib/ai-entry/ppt-tool-result-message"
import { isValidRuntimeProjectSnapshot, type RuntimeProjectSnapshot } from "@/lib/ai-runtime/contracts"

export type AiEntryConversationState = {
  ppt: PptConversationState
  artifacts?: AiEntryRuntimeArtifactContext[]
  projectSnapshot?: RuntimeProjectSnapshot
}

export type AiEntryRuntimeArtifactContext = {
  artifactId: number
  title: string
  kind: string
  summary: string
}

function withArtifacts(state: { ppt: PptConversationState; projectSnapshot?: RuntimeProjectSnapshot }, artifacts: AiEntryRuntimeArtifactContext[] | undefined): AiEntryConversationState {
  const baseState: AiEntryConversationState = state.projectSnapshot
    ? { ppt: state.ppt, projectSnapshot: state.projectSnapshot }
    : { ppt: state.ppt }
  return artifacts && artifacts.length > 0 ? { ...baseState, artifacts } : baseState
}

function normalizeProjectSnapshot(value: unknown): RuntimeProjectSnapshot | undefined {
  return isValidRuntimeProjectSnapshot(value) ? value : undefined
}

export function createEmptyAiEntryConversationState(): AiEntryConversationState {
  return {
    ppt: {
      latestPreview: null,
      latestExport: null,
      phase: "idle",
    },
  }
}

export function normalizeAiEntryConversationState(value: unknown): AiEntryConversationState {
  const raw = value as { ppt?: PptConversationState | null; artifacts?: unknown; projectSnapshot?: unknown } | null | undefined
  const fallback = createEmptyAiEntryConversationState()
  const ppt = raw?.ppt
  if (!ppt || typeof ppt !== "object") {
    return fallback
  }

  const normalizedArtifacts = Array.isArray(raw?.artifacts)
    ? raw.artifacts.reduce<AiEntryRuntimeArtifactContext[]>((items, item) => {
        if (!item || typeof item !== "object") return items
        const record = item as Record<string, unknown>
        const artifactId = typeof record.artifactId === "number" && Number.isInteger(record.artifactId) && record.artifactId > 0 ? record.artifactId : null
        const title = typeof record.title === "string" ? record.title.trim().slice(0, 255) : ""
        const kind = typeof record.kind === "string" ? record.kind.trim().slice(0, 64) : ""
        const summary = typeof record.summary === "string" ? record.summary.trim().slice(0, 2_000) : ""
        if (!artifactId || !title || !kind) return items
        items.push({ artifactId, title, kind, summary })
        return items
      }, []).slice(-10)
    : []

  const state = withArtifacts({
    ppt: {
      latestPreview: ppt.latestPreview ?? null,
      latestExport: ppt.latestExport ?? null,
      phase:
        ppt.phase === "preview-ready" ||
        ppt.phase === "preview-invalidated" ||
        ppt.phase === "exported" ||
        ppt.phase === "idle"
          ? ppt.phase
          : "idle",
    },
  }, normalizedArtifacts)
  const projectSnapshot = normalizeProjectSnapshot(raw?.projectSnapshot)
  return projectSnapshot ? { ...state, projectSnapshot } : state
}

export function resolveAiEntryConversationStateFromContents(messageContents: string[] | undefined): AiEntryConversationState {
  return {
    ppt: resolveLatestPptConversationState(messageContents),
  }
}

export function mergeAiEntryConversationState(input: {
  storedState?: unknown
  messageContents?: string[]
}): AiEntryConversationState {
  const storedState = normalizeAiEntryConversationState(input.storedState)
  const derivedState = resolveAiEntryConversationStateFromContents(input.messageContents)
  const lastInvalidation = [...(input.messageContents || [])]
    .reverse()
    .map((content) => extractLatestPptPreviewInvalidationContext(content))
    .find((context) => Boolean(context))

  if (
    storedState.ppt.phase !== "idle" &&
    !(
      lastInvalidation &&
      storedState.ppt.latestPreview &&
      lastInvalidation.previewSessionId === storedState.ppt.latestPreview.previewSessionId
    )
  ) {
    return storedState
  }

  if (derivedState.ppt.phase !== "idle") {
    return withArtifacts({ ...derivedState, projectSnapshot: storedState.projectSnapshot }, storedState.artifacts)
  }

  return storedState
}

export function applyAiEntryConversationStateDelta(input: {
  previousState?: unknown
  messageContent: string
}): AiEntryConversationState {
  const previousState = normalizeAiEntryConversationState(input.previousState)
  const deltaState = resolveAiEntryConversationStateFromContents([input.messageContent])
  const invalidatedPreview = extractLatestPptPreviewInvalidationContext(input.messageContent)
  const preview = deltaState.ppt.latestPreview
  const exported = deltaState.ppt.latestExport

  if (
    invalidatedPreview &&
    previousState.ppt.latestPreview &&
    invalidatedPreview.previewSessionId === previousState.ppt.latestPreview.previewSessionId
  ) {
    return withArtifacts({
      ppt: {
        latestPreview: null,
        latestExport:
          previousState.ppt.latestExport?.previewSessionId === invalidatedPreview.previewSessionId
            ? null
            : previousState.ppt.latestExport,
        phase: "preview-invalidated",
      },
      projectSnapshot: previousState.projectSnapshot,
    }, previousState.artifacts)
  }

  if (preview) {
    return withArtifacts({
      ppt: exported
        ? {
            latestPreview: preview,
            latestExport: exported,
            phase: "exported",
          }
          : {
            latestPreview: preview,
            latestExport: null,
            phase: "preview-ready",
          },
      projectSnapshot: previousState.projectSnapshot,
    }, previousState.artifacts)
  }

  if (exported) {
    return withArtifacts({
      ppt: {
        latestPreview: previousState.ppt.latestPreview,
        latestExport: exported,
        phase: previousState.ppt.latestPreview ? "exported" : previousState.ppt.phase,
      },
      projectSnapshot: previousState.projectSnapshot,
    }, previousState.artifacts)
  }

  return previousState
}

export function appendAiEntryRuntimeArtifactContext(input: {
  previousState?: unknown
  artifact: AiEntryRuntimeArtifactContext
}) {
  const previousState = normalizeAiEntryConversationState(input.previousState)
  const artifacts = [...(previousState.artifacts || []).filter((item) => item.artifactId !== input.artifact.artifactId), input.artifact].slice(-10)
  return withArtifacts({ ppt: previousState.ppt, projectSnapshot: previousState.projectSnapshot }, artifacts)
}

export function setAiEntryRuntimeProjectSnapshot(input: {
  previousState?: unknown
  projectSnapshot: RuntimeProjectSnapshot
}) {
  const previousState = normalizeAiEntryConversationState(input.previousState)
  return { ...previousState, projectSnapshot: input.projectSnapshot }
}
