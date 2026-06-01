import type { PptLanguage, PptPreviewDeck, PptPreviewRequest, PptScenario } from "./ppt-preview-data"

const STORAGE_KEY = "lead-tools:ai-ppt-preview-session"

export type ProtectedAction = "download" | "finalize"

export type PptPreviewSession = {
  request: PptPreviewRequest
  selectedVariantKey?: string
  selectedSlideIndex?: number
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
  action?: ProtectedAction,
) {
  const searchParams = new URLSearchParams()

  if (prompt.trim()) {
    searchParams.set("prompt", prompt.trim())
  }

  searchParams.set("scenario", scenario)
  searchParams.set("language", language)

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
    return JSON.parse(rawValue) as PptPreviewSession
  } catch {
    return null
  }
}

export function savePptPreviewSession(session: PptPreviewSession) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearPptPreviewSession() {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}
