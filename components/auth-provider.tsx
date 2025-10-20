"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"

interface User {
  id: string
  name: string
  email: string
  isAnonymous?: boolean
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
  devLogin: () => Promise<void>
  anonymousLogin: () => Promise<void>
  isDemoMode: boolean // Added isDemoMode to context
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const isDemoMode = user?.isAnonymous === true

  useEffect(() => {
    // Check for existing session on mount
    const checkAuth = async () => {
      try {
        // In a real app, this would check with your backend
        const savedUser = localStorage.getItem("user")
        if (savedUser) {
          setUser(JSON.parse(savedUser))
        }
      } catch (error) {
        console.error("Auth check failed:", error)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      // In a real app, this would call your authentication API
      // For demo purposes, we'll simulate a successful login
      const mockUser = {
        id: "1",
        name: "营销专家",
        email: email,
      }

      setUser(mockUser)
      localStorage.setItem("user", JSON.stringify(mockUser))
    } catch (error) {
      throw new Error("登录失败，请检查您的凭据")
    } finally {
      setLoading(false)
    }
  }

  const devLogin = async () => {
    setLoading(true)
    try {
      const defaultUser = {
        id: "vercel-dev-user-001",
        name: "Vercel 体验用户",
        email: "demo@aimarketing.vercel.app",
      }

      setUser(defaultUser)
      localStorage.setItem("user", JSON.stringify(defaultUser))

      console.log("[v0] Development login successful in Vercel environment")
    } catch (error) {
      console.error("[v0] Development login failed:", error)
      throw new Error("开发登录失败")
    } finally {
      setLoading(false)
    }
  }

  const register = async (name: string, email: string, password: string) => {
    setLoading(true)
    try {
      // In a real app, this would call your registration API
      const mockUser = {
        id: "1",
        name: name,
        email: email,
      }

      setUser(mockUser)
      localStorage.setItem("user", JSON.stringify(mockUser))
    } catch (error) {
      throw new Error("注册失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("user")
  }

  const anonymousLogin = async () => {
    setLoading(true)
    try {
      const anonymousUser = {
        id: `anonymous-${Date.now()}`,
        name: "匿名体验用户",
        email: "anonymous@demo.local",
        isAnonymous: true,
      }

      setUser(anonymousUser)
      localStorage.setItem("user", JSON.stringify(anonymousUser))

      console.log("[v0] Anonymous login successful for demo mode")
    } catch (error) {
      console.error("[v0] Anonymous login failed:", error)
      throw new Error("匿名登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, devLogin, anonymousLogin, isDemoMode }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
