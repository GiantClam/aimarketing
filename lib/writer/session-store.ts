"use client"

import {
  normalizeWriterLanguage,
  normalizeWriterMode,
  normalizeWriterPlatform,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import type { WriterConversationSummary, WriterConversationStatus } from "@/lib/writer/types"

export type WriterSessionMeta = {
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
  draft?: string
  imagesRequested?: boolean
  status?: WriterConversationStatus
  updatedAt: number
}

export type WriterRefreshDetail =
  | { action: "upsert"; conversation: WriterConversationSummary }
  | { action: "remove"; conversationId: string }
  | undefined

export const SESSION_STORAGE_KEY = "writer-session-store-v1"
export const WRITER_REFRESH_EVENT = "writer-refresh"

function canUseStorage() {
  return typeof window !== "undefined"
}

export function readWriterSessionStore() {
  if (!canUseStorage()) return {} as Record<string, WriterSessionMeta>

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, WriterSessionMeta>
  } catch {
    return {}
  }
}

export function writeWriterSessionStore(store: Record<string, WriterSessionMeta>) {
  if (!canUseStorage()) return
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store))
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
    ...meta,
    platform: normalizeWriterPlatform(meta.platform),
    mode: normalizeWriterMode(normalizeWriterPlatform(meta.platform), meta.mode),
    language: normalizeWriterLanguage(meta.language),
  }
  writeWriterSessionStore(store)
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
