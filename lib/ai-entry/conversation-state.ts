import {
  extractLatestPptPreviewInvalidationContext,
  type PptConversationState,
  resolveLatestPptConversationState,
} from "@/lib/ai-entry/ppt-tool-result-message"

export type AiEntryConversationState = {
  ppt: PptConversationState
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
  const raw = value as { ppt?: PptConversationState | null } | null | undefined
  const fallback = createEmptyAiEntryConversationState()
  const ppt = raw?.ppt
  if (!ppt || typeof ppt !== "object") {
    return fallback
  }

  return {
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
  }
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
    return derivedState
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
    return {
      ppt: {
        latestPreview: null,
        latestExport:
          previousState.ppt.latestExport?.previewSessionId === invalidatedPreview.previewSessionId
            ? null
            : previousState.ppt.latestExport,
        phase: "preview-invalidated",
      },
    }
  }

  if (preview) {
    return {
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
    }
  }

  if (exported) {
    return {
      ppt: {
        latestPreview: previousState.ppt.latestPreview,
        latestExport: exported,
        phase: previousState.ppt.latestPreview ? "exported" : previousState.ppt.phase,
      },
    }
  }

  return previousState
}
