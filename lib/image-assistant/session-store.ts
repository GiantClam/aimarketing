"use client"

import {
  readStorageJson,
  writeStorageRecordStore,
} from "@/lib/browser-storage"
import type {
  ImageAssistantAsset,
  ImageAssistantMessage,
  ImageAssistantSessionDetail,
  ImageAssistantVersionSummary,
} from "@/lib/image-assistant/types"

export type ImageAssistantSessionContentCache = {
  detail: ImageAssistantSessionDetail
  updatedAt: number
}

type ImageAssistantSessionStore = Record<string, ImageAssistantSessionContentCache>

const IMAGE_ASSISTANT_SESSION_CACHE_KEY = "image-assistant-session-cache-v1"
const memoryCache = new Map<string, ImageAssistantSessionContentCache>()

export const IMAGE_ASSISTANT_SESSION_CACHE_TTL_MS = 30_000
const IMAGE_ASSISTANT_MAX_PERSISTED_SESSIONS = 4
const IMAGE_ASSISTANT_MAX_IN_MEMORY_SESSIONS = 8

function canUseStorage() {
  return typeof window !== "undefined"
}

function sanitizeMessageRequestPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null

  const source = payload as Record<string, unknown>
  const nextPayload: Record<string, unknown> = {}

  if (Array.isArray(source.referenceAssetIds)) {
    nextPayload.referenceAssetIds = source.referenceAssetIds.filter((value): value is string => typeof value === "string")
  }

  if (typeof source.snapshotAssetId === "string") {
    nextPayload.snapshotAssetId = source.snapshotAssetId
  }

  if (typeof source.maskAssetId === "string") {
    nextPayload.maskAssetId = source.maskAssetId
  }

  if (source.versionMeta && typeof source.versionMeta === "object") {
    const versionMeta = source.versionMeta as Record<string, unknown>
    if (versionMeta.patch_edit) {
      nextPayload.versionMeta = {
        patch_edit: versionMeta.patch_edit,
      }
    }
  }

  return Object.keys(nextPayload).length > 0 ? nextPayload : null
}

function sanitizeMessage(message: ImageAssistantMessage): ImageAssistantMessage {
  return {
    ...message,
    request_payload: sanitizeMessageRequestPayload(message.request_payload),
    response_payload: null,
  }
}

function sanitizeVersion(version: ImageAssistantVersionSummary): ImageAssistantVersionSummary {
  return {
    ...version,
    meta:
      version.meta && typeof version.meta === "object" && "patch_edit" in version.meta
        ? { patch_edit: (version.meta as Record<string, unknown>).patch_edit }
        : null,
    candidates: version.candidates.map((candidate) => ({ ...candidate })),
  }
}

function sanitizeAsset(asset: ImageAssistantAsset): ImageAssistantAsset {
  return {
    ...asset,
    meta: null,
  }
}

function cloneDetail(detail: ImageAssistantSessionDetail): ImageAssistantSessionDetail {
  return {
    ...detail,
    session: { ...detail.session },
    messages: detail.messages.map(sanitizeMessage),
    versions: detail.versions.map(sanitizeVersion),
    assets: detail.assets.map(sanitizeAsset),
    canvas_document: null,
    meta: { ...detail.meta },
  }
}

function pruneStore(store: ImageAssistantSessionStore, maxEntries = IMAGE_ASSISTANT_MAX_PERSISTED_SESSIONS) {
  const entries = Object.entries(store)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, maxEntries)
  return Object.fromEntries(entries) as ImageAssistantSessionStore
}

function touchMemoryCache(sessionId: string, cache: ImageAssistantSessionContentCache) {
  if (memoryCache.has(sessionId)) {
    memoryCache.delete(sessionId)
  }
  memoryCache.set(sessionId, cache)

  while (memoryCache.size > IMAGE_ASSISTANT_MAX_IN_MEMORY_SESSIONS) {
    const oldestKey = memoryCache.keys().next().value
    if (!oldestKey) break
    memoryCache.delete(oldestKey)
  }
}

function readStore(): ImageAssistantSessionStore {
  if (!canUseStorage()) return {}
  return readStorageJson<ImageAssistantSessionStore>("session", IMAGE_ASSISTANT_SESSION_CACHE_KEY) || {}
}

function writeStore(store: ImageAssistantSessionStore) {
  if (!canUseStorage()) return
  void writeStorageRecordStore("session", IMAGE_ASSISTANT_SESSION_CACHE_KEY, pruneStore(store), {
    maxEntries: IMAGE_ASSISTANT_MAX_PERSISTED_SESSIONS,
  })
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

  touchMemoryCache(sessionId, cached)
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

  touchMemoryCache(sessionId, nextCache)
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
