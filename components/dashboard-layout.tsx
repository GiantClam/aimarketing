"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Globe,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenSquare,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Video,
  X,
} from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { AdvisorSidebarItem } from "@/components/chat/AdvisorSidebarItem"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { WriterSidebarItem } from "@/components/writer/WriterSidebarItem"

interface DashboardLayoutProps {
  children: React.ReactNode
}

type AdvisorAvailability = {
  brandStrategy: boolean
  growth: boolean
  copywriting: boolean
  hasAny: boolean
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
        if (isAbortError(error)) return
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
    return hasAdvisorFeature && (advisorAvailability.brandStrategy || advisorAvailability.growth)
  }, [advisorAvailability, enterprisePending, enterpriseRejected, hasAdvisorFeature])

  const showWriterEntry = useMemo(() => {
    if (enterprisePending || enterpriseRejected) return false
    return hasCopywritingFeature
  }, [enterprisePending, enterpriseRejected, hasCopywritingFeature])

  return (
    <div className="flex h-screen bg-background">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 border-r border-sidebar-border bg-sidebar transform transition-all duration-200 ease-in-out lg:static ${
          sidebarCollapsed ? "w-20" : "w-80"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-sidebar-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
                  <Sparkles className="h-5 w-5 text-sidebar-primary-foreground" />
                </div>
                {!sidebarCollapsed && <h1 className="font-sans text-lg font-bold text-sidebar-foreground">AI Marketing</h1>}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden lg:inline-flex"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
                  aria-label={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {!sidebarCollapsed && user?.enterpriseName && (
              <p className="mt-2 text-xs text-sidebar-foreground/70">
                {user.enterpriseName}（{user.enterpriseCode}）
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="h-full">
              <div className={sidebarCollapsed ? "space-y-3 p-3" : "space-y-4 p-4"}>
                {(enterprisePending || enterpriseRejected) && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">{enterprisePending ? "你的企业加入申请正在审核中。" : "你的企业加入申请已被拒绝，请联系管理员。"}</div>
                )}

                {showAdvisorSection && (
                  <div>
                    {!sidebarCollapsed && (
                      <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">专家 Agent</h3>
                    )}
                    {hasAdvisorFeature && advisorAvailability.brandStrategy && userEmail && (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/advisor/brand-strategy/new">
                          <Button variant="ghost" className="w-full justify-center" size="sm" title="品牌战略顾问">
                            <Target className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AdvisorSidebarItem title="品牌战略顾问" advisorType="brand-strategy" userEmail={userEmail} icon={Target} />
                      )
                    )}
                    {hasAdvisorFeature && advisorAvailability.growth && userEmail && (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/advisor/growth/new">
                          <Button variant="ghost" className="mt-1 w-full justify-center" size="sm" title="增长顾问">
                            <TrendingUp className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AdvisorSidebarItem title="增长顾问" advisorType="growth" userEmail={userEmail} icon={TrendingUp} />
                      )
                    )}
                  </div>
                )}

                {showWriterEntry && (
                  <div>
                    {!sidebarCollapsed && (
                      <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">文章写作</h3>
                    )}
                    {sidebarCollapsed ? (
                      <Link href="/dashboard/writer">
                        <Button
                          variant="ghost"
                          className="w-full justify-center"
                          size="sm"
                          title="多平台图文写作"
                          aria-label="多平台图文写作"
                        >
                          <PenSquare className="h-4 w-4" />
                        </Button>
                      </Link>
                    ) : (
                      <WriterSidebarItem title="多平台图文写作" icon={PenSquare} />
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className={sidebarCollapsed ? "space-y-2 border-t border-sidebar-border p-3" : "space-y-2 border-t border-sidebar-border p-4"}>
            {hasVideoFeature && !enterprisePending && !enterpriseRejected && (
              <Link href="/dashboard/video">
                <Button variant="ghost" className={sidebarCollapsed ? "w-full justify-center" : "w-full justify-start font-manrope"} size="sm" title="视频生成 Agent">
                  <Video className={sidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
                  {!sidebarCollapsed && "视频生成 Agent"}
                </Button>
              </Link>
            )}
            {hasWebsiteFeature && !enterprisePending && !enterpriseRejected && (
              <Link href="/dashboard/website-generator">
                <Button variant="ghost" className={sidebarCollapsed ? "w-full justify-center" : "w-full justify-start font-manrope"} size="sm" title="网站生成 Agent">
                  <Globe className={sidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
                  {!sidebarCollapsed && "网站生成 Agent"}
                </Button>
              </Link>
            )}
            <Link href="/dashboard/settings">
              <Button variant="ghost" className={sidebarCollapsed ? "w-full justify-center" : "w-full justify-start font-manrope"} size="sm" title="用户设置">
                <Settings className={sidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
                {!sidebarCollapsed && "用户设置"}
              </Button>
            </Link>

            <Separator className="my-2" />

            <div className={sidebarCollapsed ? "flex flex-col items-center gap-2 p-1" : "flex items-center gap-3 p-2"}>
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">{isDemoMode ? "体验" : "用户"}</AvatarFallback>
              </Avatar>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate font-manrope text-sm font-medium text-sidebar-foreground">{isDemoMode ? "体验账号" : user?.name || "营销成员"}</p>
                  <p className="truncate font-manrope text-xs text-muted-foreground">{userEmail}</p>
                </div>
              )}
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => void handleLogout()} disabled={isLoggingOut} title="退出登录">
                <LogOut className="h-4 w-4" />
              </Button>
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
