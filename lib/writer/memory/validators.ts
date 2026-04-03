import {
  parseMemorySource,
  parseMemoryType,
  parseWriterAgentType,
  type SaveWriterMemoryInput,
  type WriterAgentType,
  type WriterMemoryItem,
  type WriterSoulProfilePatch,
} from "@/lib/writer/memory/types"

type ValidationSuccess<T> = {
  ok: true
  data: T
}

type ValidationFailure = {
  ok: false
  status: number
  error: string
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function asOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const num = Number(value)
  return Number.isFinite(num) ? num : Number.NaN
}

function badRequest(error: string): ValidationFailure {
  return { ok: false, status: 400, error }
}

export type ParsedMemoryItemsQuery = {
  agentType: WriterAgentType
  type?: SaveWriterMemoryInput["type"]
  limit: number
  cursor: number | null
}

export function parseMemoryItemsQuery(searchParams: URLSearchParams): ValidationResult<ParsedMemoryItemsQuery> {
  const agentType = parseWriterAgentType(searchParams.get("agentType"))
  if (!agentType) {
    return badRequest("invalid_agent_type")
  }

  const typeRaw = searchParams.get("type")
  const type = typeRaw ? parseMemoryType(typeRaw) : null
  if (typeRaw && !type) {
    return badRequest("invalid_memory_type")
  }

  const limitRaw = searchParams.get("limit")
  const limit = Number.parseInt(limitRaw || "20", 10)
  if (!Number.isFinite(limit) || limit <= 0) {
    return badRequest("invalid_limit")
  }

  const cursorRaw = searchParams.get("cursor")
  if (!cursorRaw) {
    return {
      ok: true,
      data: {
        agentType,
        type: type || undefined,
        limit: Math.min(limit, 100),
        cursor: null,
      },
    }
  }

  const cursor = Number.parseInt(cursorRaw, 10)
  if (!Number.isFinite(cursor) || cursor <= 0) {
    return badRequest("invalid_cursor")
  }

  return {
    ok: true,
    data: {
      agentType,
      type: type || undefined,
      limit: Math.min(limit, 100),
      cursor,
    },
  }
}

export function validateCreateMemoryPayload(
  body: unknown,
): ValidationResult<Omit<SaveWriterMemoryInput, "userId">> {
  if (!body || typeof body !== "object") {
    return badRequest("invalid_payload")
  }

  const candidate = body as Record<string, unknown>
  const agentType = parseWriterAgentType(String(candidate.agentType || ""))
  if (!agentType) {
    return badRequest("invalid_agent_type")
  }

  const type = parseMemoryType(String(candidate.type || ""))
  if (!type) {
    return badRequest("invalid_memory_type")
  }

  const source = parseMemorySource(String(candidate.source || ""))
  if (!source) {
    return badRequest("invalid_memory_source")
  }

  const title = normalizeText(candidate.title)
  const content = normalizeText(candidate.content)
  if (!title) return badRequest("title_required")
  if (!content) return badRequest("content_required")

  const confidence = asOptionalNumber(candidate.confidence)
  if (Number.isNaN(confidence)) {
    return badRequest("invalid_confidence")
  }

  const conversationId = asOptionalNumber(candidate.conversationId)
  if (Number.isNaN(conversationId) || (conversationId !== null && conversationId <= 0)) {
    return badRequest("invalid_conversation_id")
  }

  return {
    ok: true,
    data: {
      agentType,
      type,
      source,
      title,
      content,
      confidence: confidence ?? undefined,
      conversationId: conversationId ?? null,
    },
  }
}

export function validatePatchMemoryPayload(
  body: unknown,
): ValidationResult<{
  agentType: WriterAgentType
  patch: {
    type?: SaveWriterMemoryInput["type"]
    source?: SaveWriterMemoryInput["source"]
    title?: string
    content?: string
    confidence?: number
  }
}> {
  if (!body || typeof body !== "object") {
    return badRequest("invalid_payload")
  }
  const candidate = body as Record<string, unknown>
  const agentType = parseWriterAgentType(String(candidate.agentType || ""))
  if (!agentType) return badRequest("invalid_agent_type")

  const patch: {
    type?: SaveWriterMemoryInput["type"]
    source?: SaveWriterMemoryInput["source"]
    title?: string
    content?: string
    confidence?: number
  } = {}

  if (candidate.type !== undefined) {
    const type = parseMemoryType(String(candidate.type || ""))
    if (!type) return badRequest("invalid_memory_type")
    patch.type = type
  }
  if (candidate.source !== undefined) {
    const source = parseMemorySource(String(candidate.source || ""))
    if (!source) return badRequest("invalid_memory_source")
    patch.source = source
  }
  if (candidate.title !== undefined) {
    const title = normalizeText(candidate.title)
    if (!title) return badRequest("title_required")
    patch.title = title
  }
  if (candidate.content !== undefined) {
    const content = normalizeText(candidate.content)
    if (!content) return badRequest("content_required")
    patch.content = content
  }
  if (candidate.confidence !== undefined) {
    const confidence = asOptionalNumber(candidate.confidence)
    if (confidence === null || Number.isNaN(confidence)) return badRequest("invalid_confidence")
    patch.confidence = confidence
  }

  if (Object.keys(patch).length === 0) {
    return badRequest("empty_patch")
  }

  return {
    ok: true,
    data: {
      agentType,
      patch,
    },
  }
}

export function validateSoulProfilePatchPayload(
  body: unknown,
): ValidationResult<{
  agentType: WriterAgentType
  patch: WriterSoulProfilePatch
}> {
  if (!body || typeof body !== "object") {
    return badRequest("invalid_payload")
  }
  const candidate = body as Record<string, unknown>
  const agentType = parseWriterAgentType(String(candidate.agentType || ""))
  if (!agentType) return badRequest("invalid_agent_type")

  const patch: WriterSoulProfilePatch = {}
  if (candidate.tone !== undefined) patch.tone = normalizeText(candidate.tone)
  if (candidate.sentenceStyle !== undefined) patch.sentenceStyle = normalizeText(candidate.sentenceStyle)
  if (candidate.tabooList !== undefined) {
    if (!Array.isArray(candidate.tabooList)) return badRequest("invalid_taboo_list")
    patch.tabooList = candidate.tabooList.map((item) => String(item || "").trim()).filter(Boolean)
  }
  if (candidate.lexicalHints !== undefined) {
    if (!Array.isArray(candidate.lexicalHints)) return badRequest("invalid_lexical_hints")
    patch.lexicalHints = candidate.lexicalHints.map((item) => String(item || "").trim()).filter(Boolean)
  }
  if (candidate.confidence !== undefined) {
    const confidence = asOptionalNumber(candidate.confidence)
    if (confidence === null || Number.isNaN(confidence)) return badRequest("invalid_confidence")
    patch.confidence = confidence
  }
  if (candidate.version !== undefined) patch.version = normalizeText(candidate.version) || "v1"

  if (Object.keys(patch).length === 0) {
    return badRequest("empty_patch")
  }

  return { ok: true, data: { agentType, patch } }
}

export function parseMemoryIdParam(memoryId: string): ValidationResult<number> {
  const parsed = Number.parseInt(String(memoryId || "").trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return badRequest("invalid_memory_id")
  }
  return { ok: true, data: parsed }
}

export function parseAgentTypeParam(agentType: string | null | undefined): ValidationResult<WriterAgentType> {
  const parsed = parseWriterAgentType(agentType)
  if (!parsed) return badRequest("invalid_agent_type")
  return { ok: true, data: parsed }
}

export function isMemoryOwnedByScope(
  memory: Pick<WriterMemoryItem, "userId" | "agentType"> | null,
  scope: { userId: number; agentType: WriterAgentType },
) {
  return Boolean(memory && memory.userId === scope.userId && memory.agentType === scope.agentType)
}
