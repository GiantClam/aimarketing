"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/auth-provider"
import type { PermissionMap } from "@/lib/enterprise/constants"

type DashboardAdvisorAvailability = {
  brandStrategy: boolean
  growth: boolean
  leadHunter: boolean
  companySearch: boolean
  contactMining: boolean
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
    leadHunter: false,
    companySearch: false,
    contactMining: false,
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

function hasPermission(user: { enterpriseRole?: string | null; enterpriseStatus?: string | null; permissions?: PermissionMap }, key: keyof PermissionMap) {
  const isEnterpriseAdmin = user.enterpriseRole === "admin" && user.enterpriseStatus === "active"
  if (isEnterpriseAdmin) return true
  return Boolean(user.permissions?.[key])
}

function buildPermissionFallback(user: {
  enterpriseRole?: string | null
  enterpriseStatus?: string | null
  permissions?: PermissionMap
}): DashboardAvailabilityState {
  const advisorEnabled = hasPermission(user, "expert_advisor")
  const writerEnabled = hasPermission(user, "copywriting_generation")
  const imageEnabled = hasPermission(user, "image_design_generation")

  return {
    loading: false,
    advisor: {
      brandStrategy: advisorEnabled,
      growth: advisorEnabled,
      leadHunter: advisorEnabled,
      companySearch: advisorEnabled,
      contactMining: advisorEnabled,
      copywriting: writerEnabled,
      hasAny: advisorEnabled || writerEnabled,
    },
    writer: {
      enabled: writerEnabled,
      provider: null,
      reason: "availability_fetch_failed",
    },
    imageAssistant: {
      enabled: imageEnabled,
      provider: null,
      reason: "availability_fetch_failed",
    },
  }
}

export function DashboardAvailabilityProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [availability, setAvailability] = useState<DashboardAvailabilityState>(DEFAULT_AVAILABILITY)

  useEffect(() => {
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
            leadHunter: Boolean(json?.data?.advisor?.leadHunter),
            companySearch: Boolean(json?.data?.advisor?.companySearch),
            contactMining: Boolean(json?.data?.advisor?.contactMining),
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
        if (cancelled) return
        console.error("dashboard.availability.load-failed", error)
        setAvailability(buildPermissionFallback(user))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [authLoading, user?.enterpriseId, user?.id])

  const value = useMemo(() => availability, [availability])
  return <DashboardAvailabilityContext.Provider value={value}>{children}</DashboardAvailabilityContext.Provider>
}

export function useDashboardAvailability() {
  return useContext(DashboardAvailabilityContext)
}
