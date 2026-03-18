"use client"

import {
  readStorageJson,
  writeStorageRecordStore,
} from "@/lib/browser-storage"
import type { AdvisorMessagePage } from "@/lib/query/workspace-cache"

export type AdvisorChatMessage = {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  agentName?: string
}

export type AdvisorConversationCache = {
  messages: AdvisorChatMessage[]
  historyCursor: string | null
  hasMoreHistory: boolean
  loadedMessageCount: number
  updatedAt: number
}

type AdvisorMessagePair = {
  recordId: string
  conversationId: string
  query: string
  answer: string
  advisorLabel: string
}

const LEGACY_ADVISOR_LOCAL_STORAGE_KEY = "advisor-session-store-v1"
const ADVISOR_SESSION_STORAGE_KEY_V2 = "advisor-session-store-v2"
export const ADVISOR_SESSION_CACHE_TTL_MS = 30_000
const ADVISOR_SESSION_STORE_MAX_ENTRIES = 24
const ADVISOR_CONVERSATION_CACHE_MAX_MESSAGES = 24

function canUseStorage() {
  return typeof window !== "undefined"
}

function getAdvisorConversationStoreKey(advisorType: string, conversationId: string) {
  return `${advisorType}:${conversationId}`
}

function readAdvisorSessionStore() {
  if (!canUseStorage()) return {} as Record<string, AdvisorConversationCache>
  return readStorageJson<Record<string, AdvisorConversationCache>>("session", ADVISOR_SESSION_STORAGE_KEY_V2) || {}
}

function trimAdvisorConversationCache(cache: AdvisorConversationCache): AdvisorConversationCache {
  const retainedMessages = cache.messages.slice(-ADVISOR_CONVERSATION_CACHE_MAX_MESSAGES)
  const trimmed = retainedMessages.length < cache.messages.length
  const earliestAssistantMessage = retainedMessages.find((message) => message.role === "assistant") || null
  const nextHasMoreHistory = Boolean(cache.hasMoreHistory || trimmed)
  const nextCursor =
    nextHasMoreHistory && earliestAssistantMessage?.id?.startsWith("asst_")
      ? earliestAssistantMessage.id.slice("asst_".length)
      : null

  return {
    ...cache,
    messages: retainedMessages,
    historyCursor: nextCursor,
    hasMoreHistory: nextHasMoreHistory,
    loadedMessageCount: Math.ceil(retainedMessages.length / 2),
  }
}

function writeAdvisorSessionStore(store: Record<string, AdvisorConversationCache>) {
  if (!canUseStorage()) return
  void writeStorageRecordStore("session", ADVISOR_SESSION_STORAGE_KEY_V2, store, {
    maxEntries: ADVISOR_SESSION_STORE_MAX_ENTRIES,
    legacyKeys: [{ area: "local", key: LEGACY_ADVISOR_LOCAL_STORAGE_KEY }],
  })
}

export function sanitizeAdvisorAssistantContent(raw: string) {
  let text = raw || ""
  while (true) {
    const start = text.indexOf("<think>")
    if (start < 0) break
    const end = text.indexOf("</think>", start + "<think>".length)
    if (end < 0) {
      text = text.slice(0, start)
      break
    }
    text = `${text.slice(0, start)}${text.slice(end + "</think>".length)}`
  }
  return text.trim()
}

function buildPairSignature(pair: AdvisorMessagePair) {
  return `${pair.query.trim()}|${pair.answer.trim()}`
}

function dedupeAdvisorMessagePairs(pairs: AdvisorMessagePair[]) {
  const deduped: AdvisorMessagePair[] = []

  for (const pair of pairs) {
    const previous = deduped.at(-1)
    if (!previous || previous.query.trim() !== pair.query.trim()) {
      deduped.push(pair)
      continue
    }

    const previousAnswer = previous.answer.trim()
    const nextAnswer = pair.answer.trim()

    if (!previousAnswer && nextAnswer) {
      deduped[deduped.length - 1] = pair
      continue
    }

    if (buildPairSignature(previous) === buildPairSignature(pair)) {
      continue
    }

    deduped.push(pair)
  }

  return deduped
}

export function mapAdvisorMessagePageToChatMessages(page: AdvisorMessagePage, advisorLabel: string) {
  const source = Array.isArray(page.data) ? page.data : []
  const pairs = dedupeAdvisorMessagePairs(source.map((message) => ({
    recordId: message.id,
    conversationId: message.conversation_id,
    query: message.query || message.inputs?.contents || message.inputs?.sys_query || "",
    answer: sanitizeAdvisorAssistantContent(message.answer || ""),
    advisorLabel,
  })))
  const nextMessages: AdvisorChatMessage[] = []

  pairs.forEach((pair) => {
    nextMessages.push({
      id: `user_${pair.recordId}`,
      conversation_id: pair.conversationId,
      role: "user",
      content: pair.query,
    })
    nextMessages.push({
      id: `asst_${pair.recordId}`,
      conversation_id: pair.conversationId,
      role: "assistant",
      content: pair.answer,
      agentName: pair.advisorLabel,
    })
  })

  return nextMessages
}

export function buildAdvisorConversationCache(page: AdvisorMessagePage, advisorLabel: string): AdvisorConversationCache {
  const source = Array.isArray(page.data) ? page.data : []
  const nextCursor = Boolean(page?.has_more) && source.length > 0 ? source[0]?.id ?? null : null

  return {
    messages: mapAdvisorMessagePageToChatMessages(page, advisorLabel),
    historyCursor: nextCursor,
    hasMoreHistory: Boolean(page?.has_more) && Boolean(nextCursor),
    loadedMessageCount: source.length,
    updatedAt: Date.now(),
  }
}

export function getAdvisorConversationCache(advisorType: string, conversationId: string | null) {
  if (!conversationId) return null
  const store = readAdvisorSessionStore()
  const cache = store[getAdvisorConversationStoreKey(advisorType, conversationId)]
  return cache ? trimAdvisorConversationCache(cache) : null
}

export function saveAdvisorConversationCache(
  advisorType: string,
  conversationId: string,
  cache: AdvisorConversationCache,
) {
  const store = readAdvisorSessionStore()
  store[getAdvisorConversationStoreKey(advisorType, conversationId)] = trimAdvisorConversationCache(cache)
  writeAdvisorSessionStore(store)
}

export function deleteAdvisorConversationCache(advisorType: string, conversationId: string) {
  const store = readAdvisorSessionStore()
  delete store[getAdvisorConversationStoreKey(advisorType, conversationId)]
  writeAdvisorSessionStore(store)
}

export function isAdvisorConversationCacheFresh(
  cache: AdvisorConversationCache,
  maxAgeMs = ADVISOR_SESSION_CACHE_TTL_MS,
) {
  return Date.now() - cache.updatedAt < maxAgeMs
}
