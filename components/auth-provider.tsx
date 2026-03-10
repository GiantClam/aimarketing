"use client"

import type React from "react"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

import { buildPermissionMap, type FeatureKey, type PermissionMap } from "@/lib/enterprise/constants"
import { isFeatureRuntimeEnabled } from "@/lib/runtime-features"

interface User {
  id: number
  name: string
  email: string
  isDemo?: boolean
  isAnonymous?: boolean
  enterpriseId: number | null
  enterpriseCode: string | null
  enterpriseName: string | null
  enterpriseRole: string | null
  enterpriseStatus: string | null
  permissions: PermissionMap
}

type RegisterPayload = {
  name: string
  email: string
  password: string
  enterpriseAction: "create" | "join"
  enterpriseName?: string
  enterpriseCode?: string
  joinNote?: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<{ requiresApproval: boolean }>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (updates: Partial<Pick<User, "name">>) => Promise<void>
  loading: boolean
  devLogin: () => Promise<void>
  anonymousLogin: () => Promise<void>
  isDemoMode: boolean
  isEnterpriseAdmin: boolean
  hasFeature: (feature: FeatureKey) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== "object") return null

  const candidate = raw as Record<string, unknown>
  const parsedId = Number(candidate.id)
  if (!Number.isFinite(parsedId) || parsedId <= 0) return null

  return {
    id: parsedId,
    name: String(candidate.name || ""),
    email: String(candidate.email || ""),
    isDemo: Boolean(candidate.isDemo),
    isAnonymous: Boolean(candidate.isAnonymous),
    enterpriseId: candidate.enterpriseId ? Number(candidate.enterpriseId) : null,
    enterpriseCode: typeof candidate.enterpriseCode === "string" ? candidate.enterpriseCode : null,
    enterpriseName: typeof candidate.enterpriseName === "string" ? candidate.enterpriseName : null,
    enterpriseRole: typeof candidate.enterpriseRole === "string" ? candidate.enterpriseRole : null,
    enterpriseStatus: typeof candidate.enterpriseStatus === "string" ? candidate.enterpriseStatus : null,
    permissions: {
      ...buildPermissionMap(false),
      ...((candidate.permissions as PermissionMap | undefined) || {}),
    },
  }
}

async function parseUserResponse(res: Response) {
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || "Request failed")
  }

  const normalized = normalizeUser(data.user)
  if (!normalized) {
    throw new Error("Invalid user payload")
  }

  return { data, user: normalized }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  const isDemoMode = user?.isDemo === true || user?.isAnonymous === true
  const isEnterpriseAdmin = user?.enterpriseRole === "admin" && user?.enterpriseStatus === "active"

  const applyUser = (nextUser: User | null) => {
    setUser(nextUser)
  }

  const refreshProfile = async () => {
    const res = await fetch("/api/auth/profile", {
      credentials: "same-origin",
      cache: "no-store",
    })

    if (res.status === 401) {
      applyUser(null)
      return
    }

    const { user: normalized } = await parseUserResponse(res)
    applyUser(normalized)
  }

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const isPublicRoute = !pathname || pathname === "/" || pathname === "/login" || pathname === "/register"

    const bootstrap = async () => {
      if (isPublicRoute) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch("/api/auth/profile", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        })

        if (!active) return
        if (res.status === 401) {
          applyUser(null)
          return
        }

        const { user: normalized } = await parseUserResponse(res)
        if (active) {
          applyUser(normalized)
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        if (active) {
          if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
            applyUser(null)
            return
          }
          console.error("Auth bootstrap failed:", error)
          applyUser(null)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      active = false
      controller.abort()
    }
  }, [pathname])

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      })

      const { user: normalized } = await parseUserResponse(res)
      applyUser(normalized)
    } finally {
      setLoading(false)
    }
  }

  const register = async (payload: RegisterPayload) => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      })

      const { data, user: normalized } = await parseUserResponse(res)
      applyUser(normalized)
      return { requiresApproval: Boolean(data.requiresApproval) }
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (updates: Partial<Pick<User, "name">>) => {
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(updates),
    })

    const { user: normalized } = await parseUserResponse(res)
    applyUser(normalized)
  }

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      })
    } finally {
      applyUser(null)
    }
  }

  const devLogin = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        credentials: "same-origin",
      })

      const { user: normalized } = await parseUserResponse(res)
      applyUser({ ...normalized, isAnonymous: false })
    } finally {
      setLoading(false)
    }
  }

  const anonymousLogin = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        credentials: "same-origin",
      })

      const { user: normalized } = await parseUserResponse(res)
      applyUser({ ...normalized, isAnonymous: true })
    } finally {
      setLoading(false)
    }
  }

  const hasFeature = (feature: FeatureKey) => {
    if (!user) return false
    if (!isFeatureRuntimeEnabled(feature)) return false
    if (isEnterpriseAdmin) return true
    return Boolean(user.permissions?.[feature])
  }

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      login,
      register,
      logout,
      refreshProfile,
      updateProfile,
      loading,
      devLogin,
      anonymousLogin,
      isDemoMode,
      isEnterpriseAdmin,
      hasFeature,
    }),
    [user, loading, isDemoMode, isEnterpriseAdmin],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
