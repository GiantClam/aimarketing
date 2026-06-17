import type {
  PptFrontendTemplateId,
  PptLanguage,
  PptPreviewDeck,
  PptPreviewModelValue,
  PptPreviewPageCount,
  PptPreviewRequest,
  PptPreviewTemplateMode,
  PptScenario,
} from "./ppt-preview-data-fixed"

const STORAGE_KEY = "lead-tools:ai-ppt-preview-session"

export type ProtectedAction = "download" | "finalize"

export type PptPreviewSession = {
  request: PptPreviewRequest
  previewSessionId?: string
  selectedVariantKey?: string
  selectedSlideIndex?: number
  slideIndexByVariant?: Record<string, number>
  generatedDeck?: PptPreviewDeck
  lastActionAt: string
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function getToolReturnPath(
  prompt: string,
  scenario: PptScenario,
  language: PptLanguage,
  model?: PptPreviewModelValue,
  templateMode?: PptPreviewTemplateMode,
  templateId?: PptFrontendTemplateId,
  pageCount?: PptPreviewPageCount,
  action?: ProtectedAction,
) {
  const searchParams = new URLSearchParams()

  if (prompt.trim()) {
    searchParams.set("prompt", prompt.trim())
  }

  searchParams.set("scenario", scenario)
  searchParams.set("language", language)

  if (model) {
    searchParams.set("model", model)
  }

  if (templateMode) {
    searchParams.set("templateMode", templateMode)
  }

  if (templateId) {
    searchParams.set("templateId", templateId)
  }

  if (pageCount) {
    searchParams.set("pageCount", String(pageCount))
  }

  if (action) {
    searchParams.set("action", action)
  }

  const query = searchParams.toString()
  return query ? `/tools/ai-ppt-preview?${query}` : "/tools/ai-ppt-preview"
}

export function loadPptPreviewSession() {
  if (!canUseStorage()) {
    return null
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as PptPreviewSession
    if (parsed.generatedDeck) {
      const normalizedSession: PptPreviewSession = {
        request: parsed.request,
        previewSessionId: parsed.previewSessionId ?? parsed.generatedDeck.previewSessionId,
        selectedVariantKey: parsed.selectedVariantKey,
        selectedSlideIndex: parsed.selectedSlideIndex,
        slideIndexByVariant: parsed.slideIndexByVariant,
        lastActionAt: parsed.lastActionAt,
      }
      savePptPreviewSession(normalizedSession)
      return normalizedSession
    }

    return parsed
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function savePptPreviewSession(session: PptPreviewSession) {
  if (!canUseStorage()) {
    return
  }

  const payload: PptPreviewSession = {
    ...session,
    generatedDeck: undefined,
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        request: session.request,
        previewSessionId: session.previewSessionId,
        selectedVariantKey: session.selectedVariantKey,
        selectedSlideIndex: session.selectedSlideIndex,
        slideIndexByVariant: session.slideIndexByVariant,
        lastActionAt: session.lastActionAt,
      } satisfies PptPreviewSession),
    )
  }
}

export function clearPptPreviewSession() {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}
