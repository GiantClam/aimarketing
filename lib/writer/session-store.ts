"use client"

import {
  normalizeWriterLanguage,
  normalizeWriterMode,
  normalizeWriterPlatform,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import type {
  WriterConversationSummary,
  WriterConversationStatus,
  WriterHistoryEntry,
  WriterTurnDiagnostics,
} from "@/lib/writer/types"

export type WriterSessionMeta = {
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
  draft?: string
  imagesRequested?: boolean
  status?: WriterConversationStatus
  diagnostics?: WriterTurnDiagnostics | null
  updatedAt: number
}

export type WriterConversationCache = {
  entries: WriterHistoryEntry[]
  conversation: WriterConversationSummary | null
  historyCursor: string | null
  hasMoreHistory: boolean
  loadedTurnCount: number
  updatedAt: number
}

type WriterSessionStoreEntry = WriterSessionMeta & {
  cache?: WriterConversationCache | null
}

export type WriterRefreshDetail =
  | { action: "upsert"; conversation: WriterConversationSummary }
  | { action: "remove"; conversationId: string }
  | undefined

export const SESSION_STORAGE_KEY = "writer-session-store-v1"
export const WRITER_REFRESH_EVENT = "writer-refresh"
export const WRITER_SESSION_CACHE_TTL_MS = 30_000

function canUseStorage() {
  return typeof window !== "undefined"
}

export function readWriterSessionStore() {
  if (!canUseStorage()) return {} as Record<string, WriterSessionStoreEntry>

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, WriterSessionStoreEntry>
  } catch {
    return {}
  }
}

export function writeWriterSessionStore(store: Record<string, WriterSessionStoreEntry>) {
  if (!canUseStorage()) return
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store))
}

function normalizeConversationSummary(
  conversation: WriterConversationSummary | null | undefined,
): WriterConversationSummary | null {
  if (!conversation) return null

  const platform = normalizeWriterPlatform(conversation.platform)
  return {
    ...conversation,
    platform,
    mode: normalizeWriterMode(platform, conversation.mode),
    language: normalizeWriterLanguage(conversation.language),
  }
}

export function getWriterSessionMeta(conversationId: string | null) {
  if (!conversationId) return null
  const store = readWriterSessionStore()
  const meta = store[conversationId]

  if (!meta) return null

  return {
    ...meta,
    platform: normalizeWriterPlatform(meta.platform),
    mode: normalizeWriterMode(normalizeWriterPlatform(meta.platform), meta.mode),
    language: normalizeWriterLanguage(meta.language),
  } satisfies WriterSessionMeta
}

export function saveWriterSessionMeta(conversationId: string, meta: WriterSessionMeta) {
  const store = readWriterSessionStore()
  store[conversationId] = {
    ...(store[conversationId] || {}),
    ...meta,
    platform: normalizeWriterPlatform(meta.platform),
    mode: normalizeWriterMode(normalizeWriterPlatform(meta.platform), meta.mode),
    language: normalizeWriterLanguage(meta.language),
  }
  writeWriterSessionStore(store)
}

export function getWriterConversationCache(conversationId: string | null) {
  if (!conversationId) return null
  const store = readWriterSessionStore()
  const cache = store[conversationId]?.cache
  if (!cache) return null

  return {
    ...cache,
    conversation: normalizeConversationSummary(cache.conversation),
    loadedTurnCount: Math.max(cache.loadedTurnCount || 0, cache.entries.length),
  } satisfies WriterConversationCache
}

export function saveWriterConversationCache(conversationId: string, cache: WriterConversationCache) {
  const store = readWriterSessionStore()
  store[conversationId] = {
    ...(store[conversationId] || {}),
    cache: {
      ...cache,
      conversation: normalizeConversationSummary(cache.conversation),
      loadedTurnCount: Math.max(cache.loadedTurnCount || 0, cache.entries.length),
    },
  } as WriterSessionStoreEntry
  writeWriterSessionStore(store)
}

export function deleteWriterConversationCache(conversationId: string) {
  const store = readWriterSessionStore()
  if (!store[conversationId]) return
  store[conversationId] = {
    ...store[conversationId],
    cache: null,
  }
  writeWriterSessionStore(store)
}

export function isWriterConversationCacheFresh(cache: WriterConversationCache, maxAgeMs = WRITER_SESSION_CACHE_TTL_MS) {
  return Date.now() - cache.updatedAt < maxAgeMs
}

export function deleteWriterSessionMeta(conversationId: string) {
  const store = readWriterSessionStore()
  delete store[conversationId]
  writeWriterSessionStore(store)
}

export function emitWriterRefresh(detail?: WriterRefreshDetail) {
  if (!canUseStorage()) return
  window.dispatchEvent(new CustomEvent(WRITER_REFRESH_EVENT, { detail }))
}
