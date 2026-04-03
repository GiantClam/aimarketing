import type { WriterAgentType, WriterMemoryItem, WriterSoulProfile, WriterSoulProfilePatch } from "@/lib/writer/memory/types"

type ListMemoriesResult = {
  data: WriterMemoryItem[]
  has_more: boolean
  next_cursor: string | null
  limit: number
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
    credentials: "include",
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: unknown }).error || "")
      : ""
    throw new Error(message || `writer_memory_http_${response.status}`)
  }

  return payload as T
}

export async function listWriterMemoryItems(input: {
  agentType: WriterAgentType
  type?: string
  limit?: number
  cursor?: string | null
}) {
  const params = new URLSearchParams()
  params.set("agentType", input.agentType)
  if (input.type) params.set("type", input.type)
  if (input.limit) params.set("limit", String(input.limit))
  if (input.cursor) params.set("cursor", input.cursor)

  const result = await requestJson<ListMemoriesResult>(`/api/writer/memory/items?${params.toString()}`)
  return result
}

export async function createWriterMemoryItem(input: {
  agentType: WriterAgentType
  type: "user" | "feedback" | "project" | "reference"
  title: string
  content: string
  source?: "explicit_user" | "implicit_extraction" | "manual_edit"
  confidence?: number
  conversationId?: number | null
}) {
  return requestJson<{ data: WriterMemoryItem }>("/api/writer/memory/items", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      source: input.source || "explicit_user",
      conversationId: input.conversationId ?? null,
    }),
  })
}

export async function patchWriterMemoryItem(
  memoryId: number,
  input: {
    agentType: WriterAgentType
    title?: string
    content?: string
    type?: "user" | "feedback" | "project" | "reference"
    source?: "explicit_user" | "implicit_extraction" | "manual_edit"
    confidence?: number
  },
) {
  return requestJson<{ data: WriterMemoryItem }>(`/api/writer/memory/items/${memoryId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export async function deleteWriterMemoryItem(memoryId: number, agentType: WriterAgentType) {
  return requestJson<{ ok: boolean }>(`/api/writer/memory/items/${memoryId}`, {
    method: "DELETE",
    body: JSON.stringify({ agentType }),
  })
}

export async function getWriterSoulProfile(agentType: WriterAgentType) {
  return requestJson<{ data: WriterSoulProfile | null }>(`/api/writer/memory/profile?agentType=${agentType}`)
}

export async function patchWriterSoulProfile(agentType: WriterAgentType, patch: WriterSoulProfilePatch) {
  return requestJson<{ data: WriterSoulProfile }>(`/api/writer/memory/profile`, {
    method: "PATCH",
    body: JSON.stringify({ agentType, ...patch }),
  })
}

