"use client"

import type { ImageAssistantSessionDetail } from "@/lib/image-assistant/types"

export type ImageAssistantSessionContentCache = {
  detail: ImageAssistantSessionDetail
  updatedAt: number
}

type ImageAssistantSessionStore = Record<string, ImageAssistantSessionContentCache>

const IMAGE_ASSISTANT_SESSION_CACHE_KEY = "image-assistant-session-cache-v1"
const memoryCache = new Map<string, ImageAssistantSessionContentCache>()

export const IMAGE_ASSISTANT_SESSION_CACHE_TTL_MS = 30_000

function canUseStorage() {
  return typeof window !== "undefined"
}

function cloneDetail(detail: ImageAssistantSessionDetail): ImageAssistantSessionDetail {
  return {
    ...detail,
    session: { ...detail.session },
    messages: [...detail.messages],
    versions: detail.versions.map((version) => ({
      ...version,
      candidates: [...version.candidates],
    })),
    assets: [...detail.assets],
    canvas_document: null,
    meta: { ...detail.meta },
  }
}

function readStore(): ImageAssistantSessionStore {
  if (!canUseStorage()) return {}

  try {
    const raw = window.sessionStorage.getItem(IMAGE_ASSISTANT_SESSION_CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ImageAssistantSessionStore
  } catch {
    return {}
  }
}

function writeStore(store: ImageAssistantSessionStore) {
  if (!canUseStorage()) return
  window.sessionStorage.setItem(IMAGE_ASSISTANT_SESSION_CACHE_KEY, JSON.stringify(store))
}

export function getImageAssistantSessionContentCache(sessionId: string | null) {
  if (!sessionId) return null

  const inMemory = memoryCache.get(sessionId)
  if (inMemory) {
    return {
      ...inMemory,
      detail: cloneDetail(inMemory.detail),
    } satisfies ImageAssistantSessionContentCache
  }

  const store = readStore()
  const cached = store[sessionId]
  if (!cached) return null

  memoryCache.set(sessionId, cached)
  return {
    ...cached,
    detail: cloneDetail(cached.detail),
  } satisfies ImageAssistantSessionContentCache
}

export function saveImageAssistantSessionContentCache(sessionId: string, detail: ImageAssistantSessionDetail) {
  const nextCache = {
    detail: cloneDetail(detail),
    updatedAt: Date.now(),
  } satisfies ImageAssistantSessionContentCache

  memoryCache.set(sessionId, nextCache)
  const store = readStore()
  store[sessionId] = nextCache
  writeStore(store)
}

export function deleteImageAssistantSessionContentCache(sessionId: string) {
  memoryCache.delete(sessionId)
  const store = readStore()
  delete store[sessionId]
  writeStore(store)
}

export function isImageAssistantSessionContentCacheFresh(
  cache: ImageAssistantSessionContentCache,
  maxAgeMs = IMAGE_ASSISTANT_SESSION_CACHE_TTL_MS,
) {
  return Date.now() - cache.updatedAt < maxAgeMs
}
