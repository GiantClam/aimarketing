"use client"

import { readStorageJson, writeStorageJson } from "@/lib/browser-storage"
import type { ImageAssistantConversationSummary } from "@/lib/image-assistant/types"

type ImageAssistantConversationListCache = {
  items: ImageAssistantConversationSummary[]
  hasMore: boolean
  nextCursor: string | null
  updatedAt: number
}

const IMAGE_ASSISTANT_CONVERSATION_LIST_CACHE_KEY = "image-assistant-conversations-cache-v2"
const IMAGE_ASSISTANT_CONVERSATION_LIST_LEGACY_KEYS = [{ area: "local" as const, key: "image-assistant-conversations-cache-v1" }]

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

export function getImageAssistantConversationListCache() {
  return readStorageJson<ImageAssistantConversationListCache>("session", IMAGE_ASSISTANT_CONVERSATION_LIST_CACHE_KEY)
}

export function saveImageAssistantConversationListCache(cache: ImageAssistantConversationListCache) {
  void writeStorageJson("session", IMAGE_ASSISTANT_CONVERSATION_LIST_CACHE_KEY, {
    items: normalizeSessions(cache.items),
    hasMore: cache.hasMore,
    nextCursor: cache.nextCursor,
    updatedAt: cache.updatedAt,
  } satisfies ImageAssistantConversationListCache, { legacyKeys: IMAGE_ASSISTANT_CONVERSATION_LIST_LEGACY_KEYS })
}

export function upsertImageAssistantConversationSummary(summary: ImageAssistantConversationSummary) {
  const existing = getImageAssistantConversationListCache()
  saveImageAssistantConversationListCache({
    items: mergeImageAssistantConversationSummaries(normalizeSessions(existing?.items), [summary]),
    hasMore: existing?.hasMore ?? true,
    nextCursor: existing?.nextCursor ?? null,
    updatedAt: Date.now(),
  })
}
