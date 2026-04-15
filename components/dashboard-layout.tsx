"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Bot,
  Globe,
  ImageIcon,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenSquare,
  Radar,
  Search,
  Settings,
  Target,
  TrendingUp,
  Users,
  Video,
  X,
} from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { AiEntrySidebarItem } from "@/components/ai-entry/AiEntrySidebarItem"
import { AdvisorSidebarItem } from "@/components/chat/AdvisorSidebarItem"
import {
  DashboardAvailabilityProvider,
  useDashboardAvailability,
} from "@/components/dashboard-availability-provider"
import { ImageAssistantSidebarItem } from "@/components/image-assistant/ImageAssistantSidebarItem"
import { useI18n } from "@/components/locale-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { WriterSidebarItem } from "@/components/writer/WriterSidebarItem"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <DashboardAvailabilityProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </DashboardAvailabilityProvider>
  )
}

function DashboardLayoutContent({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const { messages, locale } = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { user, isDemoMode, loading, logout, hasFeature } = useAuth()
  const { advisor, writer, imageAssistant } = useDashboardAvailability()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, router, user])

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
  const hasImageAssistantFeature = hasFeature("image_design_generation")
  const enterprisePending = user?.enterpriseStatus === "pending"
  const enterpriseRejected = user?.enterpriseStatus === "rejected"

  const showAdvisorSection = useMemo(() => {
    if (enterprisePending || enterpriseRejected) return false
    return hasAdvisorFeature && (advisor.brandStrategy || advisor.growth)
  }, [advisor, enterprisePending, enterpriseRejected, hasAdvisorFeature])

  const showLeadHunterSection = useMemo(() => {
    if (enterprisePending || enterpriseRejected) return false
    return hasAdvisorFeature && (advisor.leadHunter || advisor.companySearch || advisor.contactMining)
  }, [advisor, enterprisePending, enterpriseRejected, hasAdvisorFeature])

  const showWriterEntry = useMemo(() => {
    if (enterprisePending || enterpriseRejected) return false
    return hasCopywritingFeature && writer.enabled
  }, [enterprisePending, enterpriseRejected, hasCopywritingFeature, writer.enabled])

  const showImageAssistantEntry = useMemo(() => {
    if (enterprisePending || enterpriseRejected) return false
    return hasImageAssistantFeature && imageAssistant.enabled
  }, [enterprisePending, enterpriseRejected, hasImageAssistantFeature, imageAssistant.enabled])

  const showAiEntry = useMemo(() => {
    return true
  }, [])

  const aiEntryLabel = locale === "zh" ? "AI \u5bf9\u8bdd" : "AI Chat"
  const consultingAdvisorLabel = locale === "zh" ? "\u54a8\u8be2\u4e13\u5bb6" : "Consulting Advisor"
  const consultingAdvisorHref = "/dashboard/ai?entry=consulting-advisor"

  return (
    <div className="flex h-screen bg-transparent">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 overflow-hidden border-r border-sidebar-border bg-sidebar shadow-none transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:static ${
          sidebarCollapsed ? "w-[88px]" : "w-[320px]"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex h-full flex-col">
          <div className={sidebarCollapsed ? "border-b border-sidebar-border p-3" : "border-b border-sidebar-border p-4"}>
            <div className={sidebarCollapsed ? "flex flex-col items-center gap-3" : "flex items-start justify-between gap-3"}>
              <div className={sidebarCollapsed ? "flex flex-col items-center gap-3" : "flex min-w-0 items-center gap-3"}>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] bg-accent">
                  <span className="text-base font-bold lowercase text-primary">ai</span>
                </div>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">workspace</div>
                    <h1 className="truncate text-lg font-semibold text-sidebar-foreground">{messages.shared.appName}</h1>
                  </div>
                )}
              </div>
              <div className={sidebarCollapsed ? "flex w-full flex-col items-center gap-2" : "flex items-center gap-1"}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={sidebarCollapsed ? "hidden h-9 w-9 rounded-[14px] border border-sidebar-border bg-card p-0 lg:inline-flex" : "hidden rounded-full border border-transparent lg:inline-flex"}
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  title={sidebarCollapsed ? messages.shared.expandSidebar : messages.shared.collapseSidebar}
                  aria-label={sidebarCollapsed ? messages.shared.expandSidebar : messages.shared.collapseSidebar}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {!sidebarCollapsed && user?.enterpriseName && (
              <p className="mt-3 rounded-full bg-muted px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-sidebar-foreground/80">
                {user.enterpriseName} ({user.enterpriseCode})
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea
              className="h-full"
              viewportClassName="overflow-x-hidden [&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
            >
              <div className={sidebarCollapsed ? "space-y-3 p-3" : "space-y-4 p-4"}>
                {(enterprisePending || enterpriseRejected) && (
                  <div className="rounded-[20px] border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                    {enterprisePending ? messages.dashboardLayout.pendingEnterprise : messages.dashboardLayout.rejectedEnterprise}
                  </div>
                )}

                {showAiEntry && (
                  sidebarCollapsed ? (
                    <Link href="/dashboard/ai">
                      <Button
                        variant="ghost"
                        className="w-full justify-center border border-sidebar-border bg-card"
                        size="sm"
                        title={aiEntryLabel}
                        aria-label={aiEntryLabel}
                      >
                        <Bot className="h-4 w-4" />
                      </Button>
                    </Link>
                  ) : (
                    <AiEntrySidebarItem title={aiEntryLabel} icon={Bot} />
                  )
                )}

                {showAdvisorSection && (
                  <div>
                    {!sidebarCollapsed && (
                      <h3 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/65">
                        {messages.dashboardLayout.advisorSection}
                      </h3>
                    )}
                    {hasAdvisorFeature &&
                      (sidebarCollapsed ? (
                        <Link href={consultingAdvisorHref}>
                          <Button
                            variant="ghost"
                            className="w-full justify-center"
                            size="sm"
                            title={consultingAdvisorLabel}
                          >
                            <Bot className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AiEntrySidebarItem
                          title={consultingAdvisorLabel}
                          icon={Bot}
                          entryHref={consultingAdvisorHref}
                        />
                      ))}
                    {hasAdvisorFeature && advisor.brandStrategy && userEmail && (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/advisor/brand-strategy/new">
                          <Button variant="ghost" className="w-full justify-center" size="sm" title={messages.dashboardLayout.brandAdvisor}>
                            <Target className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AdvisorSidebarItem title={messages.dashboardLayout.brandAdvisor} advisorType="brand-strategy" userEmail={userEmail} icon={Target} />
                      )
                    )}
                    {hasAdvisorFeature && advisor.growth && userEmail && (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/advisor/growth/new">
                          <Button variant="ghost" className="mt-1 w-full justify-center" size="sm" title={messages.dashboardLayout.growthAdvisor}>
                            <TrendingUp className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AdvisorSidebarItem title={messages.dashboardLayout.growthAdvisor} advisorType="growth" userEmail={userEmail} icon={TrendingUp} />
                      )
                    )}
                  </div>
                )}

                {showLeadHunterSection && (
                  <div>
                    {!sidebarCollapsed && (
                      <h3 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/65">
                        {messages.dashboardLayout.leadHunterSection}
                      </h3>
                    )}
                    {hasAdvisorFeature && advisor.leadHunter && userEmail && (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/advisor/lead-hunter/new">
                          <Button variant="ghost" className="w-full justify-center" size="sm" title={messages.dashboardLayout.leadHunter}>
                            <Radar className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AdvisorSidebarItem title={messages.dashboardLayout.leadHunter} advisorType="lead-hunter" userEmail={userEmail} icon={Radar} />
                      )
                    )}
                    {hasAdvisorFeature && advisor.companySearch && userEmail && (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/advisor/company-search/new">
                          <Button variant="ghost" className={advisor.leadHunter ? "mt-1 w-full justify-center" : "w-full justify-center"} size="sm" title={messages.dashboardLayout.companySearch}>
                            <Search className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AdvisorSidebarItem title={messages.dashboardLayout.companySearch} advisorType="company-search" userEmail={userEmail} icon={Search} />
                      )
                    )}
                    {hasAdvisorFeature && advisor.contactMining && userEmail && (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/advisor/contact-mining/new">
                          <Button variant="ghost" className="mt-1 w-full justify-center" size="sm" title={messages.dashboardLayout.contactMining}>
                            <Users className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <AdvisorSidebarItem title={messages.dashboardLayout.contactMining} advisorType="contact-mining" userEmail={userEmail} icon={Users} />
                      )
                    )}
                  </div>
                )}

                {(showWriterEntry || showImageAssistantEntry) && (
                  <div>
                    {!sidebarCollapsed && (
                      <h3 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/65">
                        {messages.dashboardLayout.creativeSection}
                      </h3>
                    )}
                    {showWriterEntry ? (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/writer">
                          <Button variant="ghost" className="w-full justify-center" size="sm" title={messages.dashboardLayout.writer} aria-label={messages.dashboardLayout.writer}>
                            <PenSquare className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <WriterSidebarItem title={messages.dashboardLayout.writer} icon={PenSquare} />
                      )
                    ) : null}
                    {showImageAssistantEntry ? (
                      sidebarCollapsed ? (
                        <Link href="/dashboard/image-assistant">
                          <Button variant="ghost" className="mt-1 w-full justify-center" size="sm" title={messages.dashboardLayout.imageAssistant} aria-label={messages.dashboardLayout.imageAssistant}>
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <ImageAssistantSidebarItem title={messages.dashboardLayout.imageAssistant} icon={ImageIcon} />
                      )
                    ) : null}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className={sidebarCollapsed ? "space-y-2 border-t border-sidebar-border/80 p-3" : "space-y-2 border-t border-sidebar-border/80 p-4"}>
            {hasVideoFeature && !enterprisePending && !enterpriseRejected && (
              <Link href="/dashboard/video">
                <Button
                  variant="ghost"
                  className={
                    sidebarCollapsed
                      ? "w-full justify-center rounded-2xl border border-sidebar-border/60 bg-white/40"
                      : "h-11 w-full justify-start rounded-[18px] border-2 border-sidebar-border bg-card text-sidebar-foreground hover:bg-primary hover:text-primary-foreground"
                  }
                  size="sm"
                  title={messages.dashboardLayout.videoAgent}
                >
                  <Video className={sidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
                  {!sidebarCollapsed && messages.dashboardLayout.videoAgent}
                </Button>
              </Link>
            )}
            {hasWebsiteFeature && !enterprisePending && !enterpriseRejected && (
              <Link href="/dashboard/website-generator">
                <Button
                  variant="ghost"
                  className={
                    sidebarCollapsed
                      ? "w-full justify-center rounded-2xl border border-sidebar-border/60 bg-white/40"
                      : "h-11 w-full justify-start rounded-[18px] border-2 border-sidebar-border bg-card text-sidebar-foreground hover:bg-primary hover:text-primary-foreground"
                  }
                  size="sm"
                  title={messages.dashboardLayout.websiteAgent}
                >
                  <Globe className={sidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
                  {!sidebarCollapsed && messages.dashboardLayout.websiteAgent}
                </Button>
              </Link>
            )}
            <Link href="/dashboard/settings">
              <Button
                variant="ghost"
                className={
                  sidebarCollapsed
                    ? "w-full justify-center rounded-2xl border border-sidebar-border/60 bg-white/40"
                    : "h-11 w-full justify-start rounded-[18px] border-2 border-sidebar-border bg-card text-sidebar-foreground hover:bg-primary hover:text-primary-foreground"
                }
                size="sm"
                title={messages.shared.userSettings}
              >
                <Settings className={sidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
                {!sidebarCollapsed && messages.shared.userSettings}
              </Button>
            </Link>

            <Separator className="my-2" />

            <div className={sidebarCollapsed ? "flex flex-col items-center gap-2 rounded-[20px] border-2 border-sidebar-border bg-card p-2" : "flex items-center gap-3 rounded-[20px] border-2 border-sidebar-border bg-card p-3"}>
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback className="bg-accent text-xs text-primary">
                  {isDemoMode ? messages.dashboardLayout.demoLabel : messages.shared.user}
                </AvatarFallback>
              </Avatar>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sidebar-foreground">
                    {isDemoMode ? messages.shared.demoAccount : user?.name || messages.shared.marketingMember}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
                </div>
              )}
              <Button variant="ghost" size="sm" className="rounded-full border border-transparent text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => void handleLogout()} disabled={isLoggingOut} title={messages.shared.logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-transparent">
        <header className="border-b border-border bg-card p-4 lg:hidden">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[14px] bg-accent">
                <span className="text-xs font-bold lowercase text-primary">ai</span>
              </div>
              <h1 className="text-lg font-semibold text-foreground">{messages.shared.appName}</h1>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden bg-transparent">{children}</div>
      </main>
    </div>
  )
}


