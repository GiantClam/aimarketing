type AdvisorConversationListCacheEntry = {
  payload: unknown
  updatedAt: number
  expiresAt: number
}

const ADVISOR_LIST_CACHE_TTL_MS = (() => {
  const parsed = Number.parseInt(process.env.ADVISOR_LIST_CACHE_TTL_MS || "", 10)
  if (!Number.isFinite(parsed)) return 45_000
  return Math.min(60_000, Math.max(30_000, parsed))
})()

const STORE_KEY = "__aimarketing_advisor_list_cache__"

function getStore() {
  const globalScope = globalThis as typeof globalThis & {
    [STORE_KEY]?: Map<string, AdvisorConversationListCacheEntry>
  }
  if (!globalScope[STORE_KEY]) {
    globalScope[STORE_KEY] = new Map<string, AdvisorConversationListCacheEntry>()
  }
  return globalScope[STORE_KEY]
}

function normalizeAdvisorType(advisorType: string | null | undefined) {
  const normalized = typeof advisorType === "string" ? advisorType.trim().toLowerCase() : ""
  return normalized || "default"
}

export function buildAdvisorConversationListCacheKey(input: {
  userId: number
  advisorType: string | null | undefined
  lastId?: string | null
  limit?: number
}) {
  const safeLimit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : 20
  const normalizedLastId = typeof input.lastId === "string" ? input.lastId.trim() : ""
  return `${input.userId}:${normalizeAdvisorType(input.advisorType)}:${safeLimit}:${normalizedLastId}`
}

export function getAdvisorConversationListCache(key: string, mode: "fresh" | "stale" = "fresh") {
  const entry = getStore().get(key)
  if (!entry) return null
  if (mode === "fresh" && Date.now() > entry.expiresAt) return null
  return entry
}

export function setAdvisorConversationListCache(key: string, payload: unknown) {
  const now = Date.now()
  getStore().set(key, {
    payload,
    updatedAt: now,
    expiresAt: now + ADVISOR_LIST_CACHE_TTL_MS,
  })
}

export function invalidateAdvisorConversationListCacheByScope(userId: number, advisorType: string | null | undefined) {
  const prefix = `${userId}:${normalizeAdvisorType(advisorType)}:`
  const store = getStore()
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key)
    }
  }
}

