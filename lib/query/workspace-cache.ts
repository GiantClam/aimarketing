"use client"

import type { QueryClient, QueryKey } from "@tanstack/react-query"

import type {
  ImageAssistantMessagePage,
  ImageAssistantSessionDetail,
  ImageAssistantVersionPage,
} from "@/lib/image-assistant/types"
import type { WriterMessagePage } from "@/lib/writer/types"

export type AdvisorMessageRecord = {
  id: string
  conversation_id: string
  query?: string
  answer?: string
  inputs?: {
    contents?: string
    sys_query?: string
  } | null
}

export type AdvisorMessagePage = {
  data: AdvisorMessageRecord[]
  has_more?: boolean
  limit?: number
  first_id?: string | null
}

type ImageAssistantDetailOptions = {
  mode?: "summary" | "content" | "canvas" | "full"
  messageLimit?: number
  versionLimit?: number
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url)
  const json = await response.json().catch(() => ({}))

  if (!response.ok) {
    const rawError = typeof json?.error === "string" ? json.error : ""
    const details = typeof json?.details === "string" ? json.details : ""
    throw new Error(rawError || details || `http_${response.status}`)
  }

  return json as T
}

export function getWriterMessagesQueryKey(conversationId: string, limit: number, cursor?: string | null) {
  return ["writer", "messages", conversationId, limit, cursor || "latest"] as const
}

export async function getWriterMessagesPage(conversationId: string, limit: number, cursor?: string | null) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
    limit: String(limit),
  })
  if (cursor) params.set("cursor", cursor)

  return fetchJson<WriterMessagePage>(`/api/writer/messages?${params.toString()}`)
}

export function getAdvisorMessagesQueryKey(
  advisorType: string,
  conversationId: string,
  limit: number,
  firstId?: string | null,
) {
  return ["advisor", advisorType, "messages", conversationId, limit, firstId || "latest"] as const
}

export async function getAdvisorMessagesPage(
  user: string,
  advisorType: string,
  conversationId: string,
  limit: number,
  firstId?: string | null,
) {
  const params = new URLSearchParams({
    user,
    advisorType,
    conversation_id: conversationId,
    limit: String(limit),
  })
  if (firstId) params.set("first_id", firstId)

  return fetchJson<AdvisorMessagePage>(`/api/dify/messages?${params.toString()}`)
}

export function getImageAssistantDetailQueryKey(
  sessionId: string,
  options?: ImageAssistantDetailOptions,
) {
  return [
    "image-assistant",
    "session-detail",
    sessionId,
    options?.mode || "full",
    options?.messageLimit || 0,
    options?.versionLimit || 0,
  ] as const
}

export function getImageAssistantMessagesQueryKey(sessionId: string, limit: number, cursor?: string | null) {
  return ["image-assistant", "messages", sessionId, limit, cursor || "latest"] as const
}

export async function getImageAssistantMessagesPage(
  sessionId: string,
  limit: number,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)

  return fetchJson<ImageAssistantMessagePage>(
    `/api/image-assistant/sessions/${sessionId}/messages?${params.toString()}`,
  )
}

export function getImageAssistantVersionsQueryKey(sessionId: string, limit: number, cursor?: string | null) {
  return ["image-assistant", "versions", sessionId, limit, cursor || "latest"] as const
}

export async function getImageAssistantVersionsPage(
  sessionId: string,
  limit: number,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set("cursor", cursor)

  return fetchJson<ImageAssistantVersionPage>(
    `/api/image-assistant/sessions/${sessionId}/versions?${params.toString()}`,
  )
}

export async function getImageAssistantSessionDetail(
  sessionId: string,
  options?: ImageAssistantDetailOptions,
) {
  const params = new URLSearchParams({ mode: options?.mode || "full" })
  if (options?.messageLimit) params.set("messageLimit", String(options.messageLimit))
  if (options?.versionLimit) params.set("versionLimit", String(options.versionLimit))

  const payload = await fetchJson<{ data: ImageAssistantSessionDetail }>(
    `/api/image-assistant/sessions/${sessionId}?${params.toString()}`,
  )
  return payload.data
}

export async function ensureWorkspaceQueryData<T>(queryClient: QueryClient, options: {
  queryKey: QueryKey
  queryFn: () => Promise<T>
}) {
  return queryClient.ensureQueryData({
    ...options,
    meta: { persist: true },
  })
}

export async function fetchWorkspaceQueryData<T>(queryClient: QueryClient, options: {
  queryKey: QueryKey
  queryFn: () => Promise<T>
}) {
  return queryClient.fetchQuery({
    ...options,
    meta: { persist: true },
  })
}

export function invalidateWriterConversationQueries(queryClient: QueryClient, conversationId: string | null) {
  if (!conversationId) return Promise.resolve()
  return queryClient.invalidateQueries({
    queryKey: ["writer", "messages", conversationId],
  })
}

export function invalidateAdvisorConversationQueries(
  queryClient: QueryClient,
  advisorType: string,
  conversationId: string | null,
) {
  if (!conversationId) return Promise.resolve()
  return queryClient.invalidateQueries({
    queryKey: ["advisor", advisorType, "messages", conversationId],
  })
}

export function invalidateImageAssistantSessionQueries(queryClient: QueryClient, sessionId: string | null) {
  if (!sessionId) return Promise.resolve()
  return queryClient.invalidateQueries({
    queryKey: ["image-assistant", "session-detail", sessionId],
  })
}
