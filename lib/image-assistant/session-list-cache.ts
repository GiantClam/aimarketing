type ImageAssistantSessionListCacheEntry = {
  payload: unknown
  updatedAt: number
  expiresAt: number
}

const IMAGE_ASSISTANT_LIST_CACHE_TTL_MS = (() => {
  const parsed = Number.parseInt(process.env.IMAGE_ASSISTANT_LIST_CACHE_TTL_MS || "", 10)
  if (!Number.isFinite(parsed)) return 45_000
  return Math.min(60_000, Math.max(30_000, parsed))
})()

const STORE_KEY = "__aimarketing_image_assistant_list_cache__"

function getStore() {
  const globalScope = globalThis as typeof globalThis & {
    [STORE_KEY]?: Map<string, ImageAssistantSessionListCacheEntry>
  }
  if (!globalScope[STORE_KEY]) {
    globalScope[STORE_KEY] = new Map<string, ImageAssistantSessionListCacheEntry>()
  }
  return globalScope[STORE_KEY]
}

export function buildImageAssistantSessionListCacheKey(input: {
  userId: number
  limit?: number
  cursor?: string | null
}) {
  const safeLimit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : 30
  const normalizedCursor = typeof input.cursor === "string" ? input.cursor.trim() : ""
  return `${input.userId}:${safeLimit}:${normalizedCursor}`
}

export function getImageAssistantSessionListCache(key: string, mode: "fresh" | "stale" = "fresh") {
  const entry = getStore().get(key)
  if (!entry) return null
  if (mode === "fresh" && Date.now() > entry.expiresAt) return null
  return entry
}

export function setImageAssistantSessionListCache(key: string, payload: unknown) {
  const now = Date.now()
  getStore().set(key, {
    payload,
    updatedAt: now,
    expiresAt: now + IMAGE_ASSISTANT_LIST_CACHE_TTL_MS,
  })
}

export function invalidateImageAssistantSessionListCacheByUser(userId: number) {
  const prefix = `${userId}:`
  const store = getStore()
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key)
    }
  }
}
