"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react"

import {
  readStorageJson,
  writeStorageJson,
  type BrowserStorageArea,
} from "@/lib/browser-storage"

type SidebarListCache<TItem> = {
  items: TItem[]
  hasMore: boolean
  nextCursor: string | null
  updatedAt: number
}

type SidebarListSnapshot<TItem> = {
  items: TItem[]
  hasMore: boolean
  nextCursor: string | null
}

type FetchPageResult<TItem> = {
  items: TItem[]
  hasMore: boolean
  nextCursor: string | null
}

function normalizeItems<TItem>(items: TItem[] | null | undefined) {
  return Array.isArray(items) ? items : []
}

export function useCachedSidebarList<TItem>({
  cacheKey,
  legacyKeys,
  ttlMs,
  isExpanded,
  activeItemId,
  fetchPage,
  mergeItems,
  getItemId,
  storageArea = "session",
}: {
  cacheKey: string
  legacyKeys?: Array<{ area: BrowserStorageArea; key: string }>
  ttlMs: number
  isExpanded: boolean
  activeItemId: string | null
  fetchPage: (input: { cursor?: string | null }) => Promise<FetchPageResult<TItem>>
  mergeItems: (current: TItem[], incoming: TItem[]) => TItem[]
  getItemId: (item: TItem) => string
  storageArea?: BrowserStorageArea
}) {
  const [items, setItems] = useState<TItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const exhaustedActiveItemIdRef = useRef<string | null>(null)
  const hasLoadedOnceRef = useRef(false)
  const fetchPageRef = useRef(fetchPage)
  const mergeItemsRef = useRef(mergeItems)
  const getItemIdRef = useRef(getItemId)
  const legacyKeysRef = useRef(legacyKeys)

  useEffect(() => {
    fetchPageRef.current = fetchPage
  }, [fetchPage])

  useEffect(() => {
    mergeItemsRef.current = mergeItems
  }, [mergeItems])

  useEffect(() => {
    getItemIdRef.current = getItemId
  }, [getItemId])

  useEffect(() => {
    legacyKeysRef.current = legacyKeys
  }, [legacyKeys])

  const readCache = useCallback(() => {
    return readStorageJson<SidebarListCache<TItem>>(storageArea, cacheKey)
  }, [cacheKey, storageArea])

  const persistCache = useCallback((nextItems: TItem[], nextHasMore: boolean, nextCursorValue: string | null) => {
    const safeItems = normalizeItems(nextItems)
    void writeStorageJson(storageArea, cacheKey, {
      items: safeItems,
      hasMore: nextHasMore,
      nextCursor: nextCursorValue,
      updatedAt: Date.now(),
    } satisfies SidebarListCache<TItem>, { legacyKeys: legacyKeysRef.current })
  }, [cacheKey, storageArea])

  const replaceList = useCallback((nextItems: TItem[], options?: { hasMore?: boolean; nextCursor?: string | null }) => {
    const resolvedHasMore = options?.hasMore ?? hasMore
    const resolvedNextCursor = options?.nextCursor ?? nextCursor
    const safeItems = normalizeItems(nextItems)
    setItems(safeItems)
    setHasMore(resolvedHasMore)
    setNextCursor(resolvedNextCursor)
    persistCache(safeItems, resolvedHasMore, resolvedNextCursor)
  }, [hasMore, nextCursor, persistCache])

  const updateList = useCallback((updater: (current: TItem[]) => TItem[], options?: { hasMore?: boolean; nextCursor?: string | null }) => {
    setItems((current) => {
      const nextItems = normalizeItems(updater(normalizeItems(current)))
      const resolvedHasMore = options?.hasMore ?? hasMore
      const resolvedNextCursor = options?.nextCursor ?? nextCursor
      setHasMore(resolvedHasMore)
      setNextCursor(resolvedNextCursor)
      persistCache(nextItems, resolvedHasMore, resolvedNextCursor)
      return nextItems
    })
  }, [hasMore, nextCursor, persistCache])

  const createSnapshot = useCallback((): SidebarListSnapshot<TItem> => ({
    items: normalizeItems(items),
    hasMore,
    nextCursor,
  }), [hasMore, items, nextCursor])

  const restoreSnapshot = useCallback((snapshot: SidebarListSnapshot<TItem>) => {
    const safeItems = normalizeItems(snapshot.items)
    setItems(safeItems)
    setHasMore(snapshot.hasMore)
    setNextCursor(snapshot.nextCursor)
    persistCache(safeItems, snapshot.hasMore, snapshot.nextCursor)
  }, [persistCache])

  const fetchItems = useCallback(async ({ append = false, cursor, background = false }: { append?: boolean; cursor?: string | null; background?: boolean } = {}) => {
    if (append) {
      setIsLoadingMore(true)
    } else if (!background) {
      setIsLoading(true)
    }

    try {
      const page = await fetchPageRef.current({ cursor })
      const pageItems = normalizeItems(page.items)
      let resolvedItems = pageItems
      setItems((current) => {
        const safeCurrent = normalizeItems(current)
        resolvedItems = append ? normalizeItems(mergeItemsRef.current(safeCurrent, pageItems)) : pageItems
        return resolvedItems
      })
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
      persistCache(resolvedItems, page.hasMore, page.nextCursor)
      hasLoadedOnceRef.current = true
      return page
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else if (!background) {
        setIsLoading(false)
      }
    }
  }, [persistCache])

  useEffect(() => {
    const cached = readCache()
    if (!cached) return
    setItems(normalizeItems(cached.items))
    setHasMore(cached.hasMore)
    setNextCursor(cached.nextCursor)
  }, [readCache])

  useEffect(() => {
    if (!isExpanded) return
    const cached = readCache()
    const isFresh = Boolean(cached && Date.now() - cached.updatedAt < ttlMs)
    const cachedItems = normalizeItems(cached?.items)
    if (isFresh && cachedItems.length > 0) {
      hasLoadedOnceRef.current = true
      return
    }
    void fetchItems().catch(() => {})
  }, [fetchItems, isExpanded, readCache, ttlMs])

  useEffect(() => {
    if (!isExpanded || !activeItemId || isLoading || isLoadingMore) return
    if (exhaustedActiveItemIdRef.current === activeItemId) return
    if (items.some((item) => getItemIdRef.current(item) === activeItemId)) return
    if (hasMore && nextCursor) {
      void fetchItems({ append: true, cursor: nextCursor }).catch(() => {})
      return
    }
    void fetchItems().catch(() => {})
  }, [activeItemId, fetchItems, hasMore, isExpanded, isLoading, isLoadingMore, items, nextCursor])

  useEffect(() => {
    if (!activeItemId) {
      exhaustedActiveItemIdRef.current = null
      return
    }

    if (items.some((item) => getItemIdRef.current(item) === activeItemId)) {
      exhaustedActiveItemIdRef.current = null
      return
    }

    if (hasLoadedOnceRef.current && !isLoading && !isLoadingMore && !hasMore) {
      exhaustedActiveItemIdRef.current = activeItemId
    }
  }, [activeItemId, hasMore, isLoading, isLoadingMore, items])

  const handleListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if (isLoading || isLoadingMore || !hasMore || !nextCursor) return
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 48) return
    void fetchItems({ append: true, cursor: nextCursor }).catch(() => {})
  }, [fetchItems, hasMore, isLoading, isLoadingMore, nextCursor])

  return useMemo(() => ({
    items,
    isLoading,
    isLoadingMore,
    hasMore,
    nextCursor,
    fetchItems,
    replaceList,
    updateList,
    createSnapshot,
    restoreSnapshot,
    handleListScroll,
    readCache,
  }), [
    createSnapshot,
    fetchItems,
    handleListScroll,
    hasMore,
    isLoading,
    isLoadingMore,
    items,
    nextCursor,
    readCache,
    replaceList,
    restoreSnapshot,
    updateList,
  ])
}
