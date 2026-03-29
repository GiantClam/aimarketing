"use client"

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth-provider"
import { DifyChatArea } from "@/components/chat/DifyChatArea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WorkspaceConversationSkeleton } from "@/components/workspace/workspace-message-primitives"

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

    if (advisorType === "lead-hunter") {
      const nextConversationId = conversationId ? `/${conversationId}` : "/new"
      router.replace(`/dashboard/advisor/company-search${nextConversationId}`)
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

        if (advisorType === "company-search" && !available.companySearch) {
          router.replace("/dashboard")
          return
        }

        if (advisorType === "contact-mining" && !available.contactMining) {
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
      <div className="flex h-full min-h-0 w-full items-center justify-center text-sm text-muted-foreground">
        正在跳转到文章写作工作台...
      </div>
    )
  }

  if (loading || !user || !difyUser) {
    return (
      <div className="h-full min-h-0 w-full bg-transparent">
        <main className="mx-auto h-full min-h-0 max-w-[1680px] px-2 pb-2 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
          <div className="flex h-full min-h-0 justify-center">
            <section className="flex min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-b-[28px] rounded-t-none border-x border-b border-t-0 border-border/70 bg-[#f7f7f7] shadow-none">
              <div className="min-h-0 flex-1 bg-[#f7f7f7]">
                <ScrollArea className="h-full" viewportClassName="px-3 pb-3 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
                  <WorkspaceConversationSkeleton rows={3} loadingLabel="正在加载顾问会话..." />
                </ScrollArea>
              </div>
              <div className="border-t border-border/70 bg-[#f7f7f7] px-3 py-2.5 lg:px-4 lg:py-3">
                <div className="mx-auto w-full max-w-5xl rounded-[24px] border-2 border-border bg-card p-2.5">
                  <div className="h-11 rounded-[18px] border-2 border-border bg-background/70" />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 w-full bg-transparent">
      <main className="mx-auto h-full min-h-0 max-w-[1680px] px-2 pb-2 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
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
