"use client"

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth-provider"
import { DifyChatArea } from "@/components/chat/DifyChatArea"
import { DashboardLayout } from "@/components/dashboard-layout"

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
}

function getAdvisorTitle(advisorType: string) {
  if (advisorType === "brand-strategy") return "品牌战略顾问"
  if (advisorType === "growth") return "增长顾问"
  if (advisorType === "copywriting") return "文案写作专家"
  return "专家顾问"
}

export default function AdvisorPage({ params }: { params: Promise<{ type: string; id?: string[] }> }) {
  const { user, isDemoMode, hasFeature, loading } = useAuth()
  const router = useRouter()
  const resolvedParams = use(params)

  const advisorType = resolvedParams.type
  const pathId = resolvedParams.id?.[0]
  const conversationId = !pathId || pathId === "new" ? null : pathId
  const title = getAdvisorTitle(advisorType)

  const userEmail = isDemoMode ? "demo@example.com" : user?.email
  const difyUser = userEmail ? `${userEmail}_${advisorType}` : null

  useEffect(() => {
    if (advisorType === "copywriting") {
      const nextConversationId = conversationId ? `/${conversationId}` : ""
      router.replace(`/dashboard/writer${nextConversationId}`)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const checkAvailability = async () => {
      if (loading || !user) return

      const allowed = advisorType === "copywriting" ? hasFeature("copywriting_generation") : hasFeature("expert_advisor")
      if (!allowed) {
        router.replace("/dashboard")
        return
      }

      try {
        const res = await fetch("/api/dify/advisors/availability", { signal: controller.signal })
        if (!res.ok) return

        const data = await res.json()
        const available = data?.data
        if (!available || cancelled) return

        if (advisorType === "brand-strategy" && !available.brandStrategy) {
          router.replace("/dashboard")
          return
        }

        if (advisorType === "growth" && !available.growth) {
          router.replace("/dashboard")
          return
        }

        if (advisorType === "copywriting" && !available.copywriting) {
          router.replace("/dashboard")
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) return
        if (isAbortError(error)) return
        if (error instanceof TypeError && error.message.includes("Failed to fetch")) return
        console.error("Failed to check advisor availability:", error)
      }
    }

    void checkAvailability()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [advisorType, hasFeature, loading, router, user])

  if (advisorType === "copywriting") {
    return (
      <DashboardLayout>
        <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center text-sm text-muted-foreground lg:h-screen">
          正在跳转到文章写作工作台...
        </div>
      </DashboardLayout>
    )
  }

  if (loading || !user || !difyUser) {
    return (
      <DashboardLayout>
        <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center text-sm text-muted-foreground lg:h-screen">正在加载顾问会话...</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-65px)] w-full flex-col bg-background lg:h-screen">
        <header className="z-10 flex shrink-0 items-center justify-between border-b bg-background px-6 py-4 shadow-sm">
          <div>
            <h1 className="font-sans text-lg font-bold text-foreground">{title}</h1>
            <p className="mt-1 text-xs font-manrope text-muted-foreground">在这里与专属 {title} 进行多轮会话，支持历史会话切换与上下文追踪。</p>
          </div>
        </header>
        <main className="relative min-h-0 flex-1 bg-muted/10">
          <DifyChatArea user={difyUser} advisorType={advisorType} initialConversationId={conversationId} key={`${advisorType}-${conversationId || "new"}`} />
        </main>
      </div>
    </DashboardLayout>
  )
}
