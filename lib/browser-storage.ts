"use client"

export type BrowserStorageArea = "local" | "session"

type LegacyStorageKey = {
  area: BrowserStorageArea
  key: string
}

type WriteJsonOptions = {
  legacyKeys?: LegacyStorageKey[]
}

type WriteRecordStoreOptions<TValue> = WriteJsonOptions & {
  maxEntries: number
  getUpdatedAt?: (value: TValue) => number
}

function canUseBrowserStorage() {
  return typeof window !== "undefined"
}

function getStorage(area: BrowserStorageArea) {
  if (!canUseBrowserStorage()) return null
  return area === "local" ? window.localStorage : window.sessionStorage
}

function clearLegacyKeys(legacyKeys?: LegacyStorageKey[]) {
  if (!legacyKeys?.length) return

  for (const item of legacyKeys) {
    try {
      getStorage(item.area)?.removeItem(item.key)
    } catch {}
  }
}

export function readStorageJson<T>(area: BrowserStorageArea, key: string): T | null {
  try {
    const raw = getStorage(area)?.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeStorageJson<T>(area: BrowserStorageArea, key: string, value: T, options?: WriteJsonOptions) {
  try {
    getStorage(area)?.setItem(key, JSON.stringify(value))
    clearLegacyKeys(options?.legacyKeys)
    return true
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
      return false
    }
    return false
  }
}

export function removeStorageKeys(entries: LegacyStorageKey[]) {
  clearLegacyKeys(entries)
}

function getDefaultUpdatedAt(value: unknown) {
  if (value && typeof value === "object" && "updatedAt" in value) {
    const updatedAt = (value as { updatedAt?: number | null }).updatedAt
    return typeof updatedAt === "number" ? updatedAt : 0
  }
  return 0
}

export function pruneRecordStoreByUpdatedAt<TValue>(
  store: Record<string, TValue>,
  maxEntries: number,
  getUpdatedAt?: (value: TValue) => number,
) {
  return Object.fromEntries(
    Object.entries(store)
      .sort((a, b) => {
        const aUpdatedAt = getUpdatedAt ? getUpdatedAt(a[1]) : getDefaultUpdatedAt(a[1])
        const bUpdatedAt = getUpdatedAt ? getUpdatedAt(b[1]) : getDefaultUpdatedAt(b[1])
        return bUpdatedAt - aUpdatedAt
      })
      .slice(0, maxEntries),
  ) as Record<string, TValue>
}

export function writeStorageRecordStore<TValue>(
  area: BrowserStorageArea,
  key: string,
  store: Record<string, TValue>,
  options: WriteRecordStoreOptions<TValue>,
) {
  const storage = getStorage(area)
  if (!storage) return false

  let nextStore = pruneRecordStoreByUpdatedAt(store, options.maxEntries, options.getUpdatedAt)

  while (Object.keys(nextStore).length > 0) {
    try {
      storage.setItem(key, JSON.stringify(nextStore))
      clearLegacyKeys(options.legacyKeys)
      return true
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
        return false
      }

      const oldestKey = Object.entries(nextStore)
        .sort((a, b) => {
          const aUpdatedAt = options.getUpdatedAt ? options.getUpdatedAt(a[1]) : getDefaultUpdatedAt(a[1])
          const bUpdatedAt = options.getUpdatedAt ? options.getUpdatedAt(b[1]) : getDefaultUpdatedAt(b[1])
          return aUpdatedAt - bUpdatedAt
        })[0]?.[0]
      if (!oldestKey) break
      delete nextStore[oldestKey]
    }
  }

  try {
    storage.removeItem(key)
  } catch {}
  clearLegacyKeys(options.legacyKeys)
  return false
}
