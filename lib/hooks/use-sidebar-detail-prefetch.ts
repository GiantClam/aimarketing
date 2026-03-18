"use client"

import { useCallback, useEffect, useRef } from "react"

export function useSidebarDetailPrefetch<TItem>({
  items,
  activeItemId,
  prefetchLimit,
  getItemId,
  prefetchItem,
}: {
  items: TItem[] | null | undefined
  activeItemId: string | null
  prefetchLimit: number
  getItemId: (item: TItem) => string
  prefetchItem: (itemId: string) => Promise<void>
}) {
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map())
  const safeItems = Array.isArray(items) ? items : []

  const runPrefetch = useCallback((itemId: string) => {
    const inFlight = inFlightRef.current.get(itemId)
    if (inFlight) {
      return inFlight
    }

    const nextPromise = Promise.resolve(prefetchItem(itemId))
      .catch(() => {})
      .finally(() => {
        inFlightRef.current.delete(itemId)
      })

    inFlightRef.current.set(itemId, nextPromise)
    return nextPromise
  }, [prefetchItem])

  useEffect(() => {
    if (prefetchLimit <= 0) return

    const targets = safeItems
      .filter((item) => getItemId(item) !== activeItemId)
      .slice(0, prefetchLimit)

    targets.forEach((item) => {
      void runPrefetch(getItemId(item))
    })
  }, [activeItemId, getItemId, prefetchLimit, runPrefetch, safeItems])

  return {
    prefetchItem: runPrefetch,
  }
}
