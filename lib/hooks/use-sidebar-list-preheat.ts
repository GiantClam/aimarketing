"use client"

import { useEffect, useRef } from "react"

type SidebarListPreheatCache<TItem> = {
  items: TItem[]
  updatedAt: number
}

export function useSidebarListPreheat<TItem>({
  enabled,
  ttlMs,
  readCache,
  fetchItems,
}: {
  enabled: boolean
  ttlMs: number
  readCache: () => SidebarListPreheatCache<TItem> | null
  fetchItems: (options?: { append?: boolean; cursor?: string | null; background?: boolean }) => Promise<unknown>
}) {
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      attemptedRef.current = false
      return
    }

    const cache = readCache()
    const hasItems = Array.isArray(cache?.items) && cache.items.length > 0
    const isFresh = Boolean(cache && Date.now() - cache.updatedAt < ttlMs)
    if (isFresh && hasItems) {
      return
    }

    if (attemptedRef.current) {
      return
    }

    attemptedRef.current = true
    void fetchItems({ background: true }).catch(() => {
      attemptedRef.current = false
    })
  }, [enabled, fetchItems, readCache, ttlMs])
}
