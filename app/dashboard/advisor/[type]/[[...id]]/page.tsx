"use client"

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth-provider"
import { DifyChatArea } from "@/components/chat/DifyChatArea"

export default function AdvisorPage({ params }: { params: Promise<{ type: string; id?: string[] }> }) {
  const { user, isDemoMode, hasFeature, loading } = useAuth()
  const router = useRouter()
  const resolvedParams = use(params)

  const advisorType = resolvedParams.type
  const pathId = resolvedParams.id?.[0]
  const conversationId = !pathId || pathId === "new" ? null : pathId
  const userEmail = isDemoMode ? "demo@example.com" : user?.email
  const difyUser = userEmail ? `${userEmail}_${advisorType}` : null

  useEffect(() => {
    if (advisorType === "copywriting") {
      const nextConversationId = conversationId ? `/${conversationId}` : ""
      router.replace(`/dashboard/writer${nextConversationId}`)
      return
    }

    let cancelled = false

    const checkAvailability = async () => {
      if (loading || !user) return

      const allowed = advisorType === "copywriting" ? hasFeature("copywriting_generation") : hasFeature("expert_advisor")
      if (!allowed) {
        router.replace("/dashboard")
        return
      }

      try {
        const res = await fetch("/api/dify/advisors/availability")
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

        if (advisorType === "lead-hunter" && !available.leadHunter) {
          router.replace("/dashboard")
          return
        }

        if (advisorType === "copywriting" && !available.copywriting) {
          router.replace("/dashboard")
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof TypeError && error.message.includes("Failed to fetch")) return
        console.error("Failed to check advisor availability:", error)
      }
    }

    void checkAvailability()
    return () => {
      cancelled = true
    }
  }, [advisorType, conversationId, hasFeature, loading, router, user])

  if (advisorType === "copywriting") {
    return (
      <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center text-sm text-muted-foreground lg:h-screen">
        正在跳转到文章写作工作台...
      </div>
    )
  }

  if (loading || !user || !difyUser) {
    return (
      <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center text-sm text-muted-foreground lg:h-screen">正在加载顾问会话...</div>
    )
  }

  return (
    <div className="h-[calc(100vh-65px)] w-full bg-transparent lg:h-screen">
      <main className="mx-auto h-full max-w-[1680px] p-4 lg:p-6">
        <DifyChatArea
          user={difyUser}
          advisorType={advisorType}
          initialConversationId={conversationId}
          key={`${advisorType}-${conversationId || "new"}`}
        />
      </main>
    </div>
  )
}
