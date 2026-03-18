"use client"

import { useState, type ReactNode } from "react"
import {
  QueryClient,
  QueryClientProvider,
  type Query,
} from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"

const QUERY_CACHE_KEY = "aimarketing-query-cache-v1"
const QUERY_CACHE_MAX_AGE_MS = 30 * 60 * 1000

function shouldPersistQuery(query: Query) {
  return query.meta?.persist === true
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  })
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [persister] = useState(() => {
    if (typeof window === "undefined") return null

    return createSyncStoragePersister({
      storage: window.sessionStorage,
      key: QUERY_CACHE_KEY,
      throttleTime: 1_000,
    })
  })

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: QUERY_CACHE_MAX_AGE_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
