"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/auth-provider"

type DashboardAdvisorAvailability = {
  brandStrategy: boolean
  growth: boolean
  copywriting: boolean
  hasAny: boolean
}

type DashboardAvailabilityState = {
  loading: boolean
  advisor: DashboardAdvisorAvailability
  writer: {
    enabled: boolean
    provider: string | null
    reason: string | null
  }
  imageAssistant: {
    enabled: boolean
    provider: string | null
    reason: string | null
  }
}

const DEFAULT_AVAILABILITY: DashboardAvailabilityState = {
  loading: true,
  advisor: {
    brandStrategy: false,
    growth: false,
    copywriting: false,
    hasAny: false,
  },
  writer: {
    enabled: false,
    provider: null,
    reason: null,
  },
  imageAssistant: {
    enabled: false,
    provider: null,
    reason: null,
  },
}

const DashboardAvailabilityContext = createContext<DashboardAvailabilityState>(DEFAULT_AVAILABILITY)

export function DashboardAvailabilityProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [availability, setAvailability] = useState<DashboardAvailabilityState>(DEFAULT_AVAILABILITY)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const load = async () => {
      if (authLoading) {
        return
      }

      if (!user?.id) {
        if (!cancelled) {
          setAvailability({ ...DEFAULT_AVAILABILITY, loading: false })
        }
        return
      }

      if (!cancelled) {
        setAvailability((current) => ({ ...current, loading: true }))
      }

      try {
        const response = await fetch("/api/dashboard/availability", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`http_${response.status}`)
        }

        const json = await response.json()
        if (cancelled) return

        setAvailability({
          loading: false,
          advisor: {
            brandStrategy: Boolean(json?.data?.advisor?.brandStrategy),
            growth: Boolean(json?.data?.advisor?.growth),
            copywriting: Boolean(json?.data?.advisor?.copywriting),
            hasAny: Boolean(json?.data?.advisor?.hasAny),
          },
          writer: {
            enabled: Boolean(json?.data?.writer?.enabled),
            provider: typeof json?.data?.writer?.provider === "string" ? json.data.writer.provider : null,
            reason: typeof json?.data?.writer?.reason === "string" ? json.data.writer.reason : null,
          },
          imageAssistant: {
            enabled: Boolean(json?.data?.imageAssistant?.enabled),
            provider: typeof json?.data?.imageAssistant?.provider === "string" ? json.data.imageAssistant.provider : null,
            reason: typeof json?.data?.imageAssistant?.reason === "string" ? json.data.imageAssistant.reason : null,
          },
        })
      } catch (error) {
        if (controller.signal.aborted || cancelled) return
        console.error("dashboard.availability.load-failed", error)
        setAvailability({ ...DEFAULT_AVAILABILITY, loading: false })
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [authLoading, user?.id])

  const value = useMemo(() => availability, [availability])
  return <DashboardAvailabilityContext.Provider value={value}>{children}</DashboardAvailabilityContext.Provider>
}

export function useDashboardAvailability() {
  return useContext(DashboardAvailabilityContext)
}
