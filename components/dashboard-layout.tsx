"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Globe, LogOut, Menu, PenSquare, Settings, Sparkles, Target, TrendingUp, Video, X } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { AdvisorSidebarItem } from "@/components/chat/AdvisorSidebarItem"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

interface DashboardLayoutProps {
  children: React.ReactNode
}

type AdvisorAvailability = {
  brandStrategy: boolean
  growth: boolean
  copywriting: boolean
  hasAny: boolean
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, isDemoMode, loading, logout, hasFeature } = useAuth()
  const [advisorAvailability, setAdvisorAvailability] = useState<AdvisorAvailability>({ brandStrategy: false, growth: false, copywriting: false, hasAny: false })
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, router, user])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const loadAdvisorAvailability = async () => {
      if (!user?.id) {
        if (!cancelled) setAdvisorAvailability({ brandStrategy: false, growth: false, copywriting: false, hasAny: false })
        return
      }

      try {
        const res = await fetch("/api/dify/advisors/availability", { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.data) {
          setAdvisorAvailability({
            brandStrategy: Boolean(data.data.brandStrategy),
            growth: Boolean(data.data.growth),
            copywriting: Boolean(data.data.copywriting),
            hasAny: Boolean(data.data.hasAny),
          })
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) return
        if (error instanceof TypeError && error.message.includes("Failed to fetch")) return
        console.error("Failed to load advisor availability:", error)
      }
    }

    void loadAdvisorAvailability()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [user?.id])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      setSidebarOpen(false)
      router.replace("/login")
    } finally {
      setIsLoggingOut(false)
    }
  }

  const userEmail = user?.email || ""
  const hasAdvisorFeature = hasFeature("expert_advisor")
  const hasWebsiteFeature = hasFeature("website_generation")
  const hasVideoFeature = hasFeature("video_generation")
  const hasCopywritingFeature = hasFeature("copywriting_generation")
  const enterprisePending = user?.enterpriseStatus === "pending"
  const enterpriseRejected = user?.enterpriseStatus === "rejected"

  const showAdvisorSection = useMemo(() => {
    if (enterprisePending || enterpriseRejected) return false
    return (hasAdvisorFeature && (advisorAvailability.brandStrategy || advisorAvailability.growth)) || (hasCopywritingFeature && advisorAvailability.copywriting)
  }, [advisorAvailability, enterprisePending, enterpriseRejected, hasAdvisorFeature, hasCopywritingFeature])

  return (
    <div className="flex h-screen bg-background">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 w-80 border-r border-sidebar-border bg-sidebar transform transition-transform duration-200 ease-in-out lg:static ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex h-full flex-col">
          <div className="border-b border-sidebar-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
                  <Sparkles className="h-5 w-5 text-sidebar-primary-foreground" />
                </div>
                <h1 className="font-sans text-lg font-bold text-sidebar-foreground">AI Marketing</h1>
              </div>
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            {user?.enterpriseName && <p className="mt-2 text-xs text-sidebar-foreground/70">{user.enterpriseName}（{user.enterpriseCode}）</p>}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                {(enterprisePending || enterpriseRejected) && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">{enterprisePending ? "你的企业加入申请正在审核中。" : "你的企业加入申请已被拒绝，请联系管理员。"}</div>
                )}

                {showAdvisorSection && (
                  <div>
                    <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">专家 Agent</h3>
                    {hasAdvisorFeature && advisorAvailability.brandStrategy && userEmail && <AdvisorSidebarItem title="品牌战略顾问" advisorType="brand-strategy" userEmail={userEmail} icon={Target} />}
                    {hasAdvisorFeature && advisorAvailability.growth && userEmail && <AdvisorSidebarItem title="增长顾问" advisorType="growth" userEmail={userEmail} icon={TrendingUp} />}
                    {hasCopywritingFeature && advisorAvailability.copywriting && userEmail && <AdvisorSidebarItem title="文案写作专家" advisorType="copywriting" userEmail={userEmail} icon={PenSquare} />}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2 border-t border-sidebar-border p-4">
            {hasVideoFeature && !enterprisePending && !enterpriseRejected && <Link href="/dashboard/video"><Button variant="ghost" className="w-full justify-start font-manrope" size="sm"><Video className="mr-2 h-4 w-4" />视频生成 Agent</Button></Link>}
            {hasWebsiteFeature && !enterprisePending && !enterpriseRejected && <Link href="/dashboard/website-generator"><Button variant="ghost" className="w-full justify-start font-manrope" size="sm"><Globe className="mr-2 h-4 w-4" />网站生成 Agent</Button></Link>}
            <Link href="/dashboard/settings"><Button variant="ghost" className="w-full justify-start font-manrope" size="sm"><Settings className="mr-2 h-4 w-4" />用户设置</Button></Link>

            <Separator className="my-2" />

            <div className="flex items-center gap-3 p-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">{isDemoMode ? "体验" : "用户"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-manrope text-sm font-medium text-sidebar-foreground">{isDemoMode ? "体验账号" : user?.name || "营销成员"}</p>
                <p className="truncate font-manrope text-xs text-muted-foreground">{userEmail}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => void handleLogout()} disabled={isLoggingOut}><LogOut className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-card/50 p-4 backdrop-blur-sm lg:hidden">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}><Menu className="h-4 w-4" /></Button>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary"><Sparkles className="h-4 w-4 text-primary-foreground" /></div>
              <h1 className="font-sans text-lg font-bold text-foreground">AI Marketing</h1>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  )
}
