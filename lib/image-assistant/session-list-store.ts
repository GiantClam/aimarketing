"use client"

import { readStorageJson, writeStorageJson } from "@/lib/browser-storage"
import type { ImageAssistantConversationSummary } from "@/lib/image-assistant/types"

type ImageAssistantConversationListCache = {
  items: ImageAssistantConversationSummary[]
  hasMore: boolean
  nextCursor: string | null
  updatedAt: number
}

const IMAGE_ASSISTANT_CONVERSATION_LIST_CACHE_KEY = "image-assistant-conversations-cache-v3"

function normalizeSessions(items: ImageAssistantConversationSummary[] | null | undefined) {
  return Array.isArray(items) ? items : []
}

export function mergeImageAssistantConversationSummaries(
  current: ImageAssistantConversationSummary[],
  incoming: ImageAssistantConversationSummary[],
) {
  const seen = new Set<string>()
  const merged: ImageAssistantConversationSummary[] = []

  for (const session of [...incoming, ...current]) {
    if (seen.has(session.id)) continue
    seen.add(session.id)
    merged.push(session)
  }

  return merged
}

export function getImageAssistantConversationListCacheKey(userId: number | null | undefined) {
  return userId && Number.isInteger(userId) && userId > 0 ? `${IMAGE_ASSISTANT_CONVERSATION_LIST_CACHE_KEY}:${userId}` : null
}

export function getImageAssistantConversationListCache(userId: number | null | undefined) {
  const cacheKey = getImageAssistantConversationListCacheKey(userId)
  return cacheKey ? readStorageJson<ImageAssistantConversationListCache>("session", cacheKey) : null
}

export function saveImageAssistantConversationListCache(
  userId: number | null | undefined,
  cache: ImageAssistantConversationListCache,
) {
  const cacheKey = getImageAssistantConversationListCacheKey(userId)
  if (!cacheKey) return

  void writeStorageJson("session", cacheKey, {
    items: normalizeSessions(cache.items),
    hasMore: cache.hasMore,
    nextCursor: cache.nextCursor,
    updatedAt: cache.updatedAt,
  } satisfies ImageAssistantConversationListCache)
}

export function upsertImageAssistantConversationSummary(
  userId: number | null | undefined,
  summary: ImageAssistantConversationSummary,
) {
  const existing = getImageAssistantConversationListCache(userId)
  saveImageAssistantConversationListCache(userId, {
    items: mergeImageAssistantConversationSummaries(normalizeSessions(existing?.items), [summary]),
    hasMore: existing?.hasMore ?? true,
    nextCursor: existing?.nextCursor ?? null,
    updatedAt: Date.now(),
  })
}

export function removeImageAssistantConversationSummary(userId: number | null | undefined, sessionId: string) {
  const existing = getImageAssistantConversationListCache(userId)
  if (!existing) return

  saveImageAssistantConversationListCache(userId, {
    ...existing,
    items: existing.items.filter((session) => session.id !== sessionId),
    updatedAt: Date.now(),
  })
}
