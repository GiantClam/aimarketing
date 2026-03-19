"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowRight, ImageIcon, PenSquare, Radar, Settings, Sparkles, Target, TrendingUp } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useDashboardAvailability } from "@/components/dashboard-availability-provider"
import { useI18n } from "@/components/locale-provider"
import { cn } from "@/lib/utils"

type QuickLinkItem = {
  href: string
  label: string
  description: string
  icon: any
  category: "advisor" | "creative" | "admin"
  accentClassName: string
  badge: string
}

export default function DashboardPage() {
  const { user, hasFeature } = useAuth()
  const { messages } = useI18n()
  const { advisor, writer, imageAssistant } = useDashboardAvailability()

  const quickLinks = useMemo(() => {
    const items: QuickLinkItem[] = [
      {
        href: "/dashboard/settings",
        label: messages.dashboardPage.settings.label,
        icon: Settings,
        description: messages.dashboardPage.settings.description,
        category: "admin",
        accentClassName: "from-slate-900 via-slate-800 to-slate-700 text-white",
        badge: "Control",
      },
    ]

    if (hasFeature("expert_advisor") && advisor.brandStrategy) {
      items.push({
        href: "/dashboard/advisor/brand-strategy/new",
        label: messages.dashboardPage.brandAdvisor.label,
        icon: Target,
        description: messages.dashboardPage.brandAdvisor.description,
        category: "advisor",
        accentClassName: "from-orange-500 via-orange-400 to-amber-300 text-white",
        badge: "Advisor",
      })
    }

    if (hasFeature("expert_advisor") && advisor.growth) {
      items.push({
        href: "/dashboard/advisor/growth/new",
        label: messages.dashboardPage.growthAdvisor.label,
        icon: TrendingUp,
        description: messages.dashboardPage.growthAdvisor.description,
        category: "advisor",
        accentClassName: "from-emerald-600 via-teal-500 to-cyan-400 text-white",
        badge: "Advisor",
      })
    }

    if (hasFeature("expert_advisor") && advisor.leadHunter) {
      items.push({
        href: "/dashboard/advisor/lead-hunter/new",
        label: messages.dashboardPage.leadHunter.label,
        icon: Radar,
        description: messages.dashboardPage.leadHunter.description,
        category: "advisor",
        accentClassName: "from-sky-600 via-cyan-500 to-teal-300 text-white",
        badge: "Signal",
      })
    }

    if (hasFeature("copywriting_generation") && writer.enabled) {
      items.push({
        href: "/dashboard/writer",
        label: messages.dashboardPage.writer.label,
        icon: PenSquare,
        description: messages.dashboardPage.writer.description,
        category: "creative",
        accentClassName: "from-rose-500 via-orange-400 to-amber-200 text-white",
        badge: "Create",
      })
    }

    if (hasFeature("image_design_generation") && imageAssistant.enabled) {
      items.push({
        href: "/dashboard/image-assistant",
        label: messages.dashboardPage.imageAssistant.label,
        icon: ImageIcon,
        description: messages.dashboardPage.imageAssistant.description,
        category: "creative",
        accentClassName: "from-violet-600 via-fuchsia-500 to-pink-300 text-white",
        badge: "Studio",
      })
    }

    return items
  }, [advisor, hasFeature, imageAssistant.enabled, messages, writer.enabled])

  const groupedLinks = useMemo(() => {
    const sections = [
      {
        key: "advisor",
        title: "策略与增长",
        description: "把复杂问题拆成可执行判断，适合品牌、增长和客户搜索任务。",
      },
      {
        key: "creative",
        title: "内容与设计",
        description: "围绕创意生产闭环组织写作和图像工作流。",
      },
      {
        key: "admin",
        title: "治理与配置",
        description: "集中维护身份、权限和企业级 AI 资源。",
      },
    ] as const

    return sections
      .map((section) => ({
        ...section,
        items: quickLinks.filter((item) => item.category === section.key),
      }))
      .filter((section) => section.items.length > 0)
  }, [quickLinks])

  const workspaceStats = useMemo(() => {
    const advisorCount = quickLinks.filter((item) => item.category === "advisor").length
    const creativeCount = quickLinks.filter((item) => item.category === "creative").length

    return [
      { label: "可用入口", value: String(quickLinks.length) },
      { label: "顾问工作台", value: String(advisorCount) },
      { label: "创意模块", value: String(creativeCount) },
    ]
  }, [quickLinks])

  return (
    <div className="h-full overflow-y-auto px-6 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[32px] border-2 border-border bg-card">
          <div className="grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {messages.dashboardPage.eyebrow}
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">
                  {messages.dashboardPage.title}
                </h1>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground lg:text-lg">
                  {messages.dashboardPage.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {quickLinks.slice(0, 3).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    <span>{item.label}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border-2 border-border bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Workspace Brief</p>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">
                    {user?.enterpriseName || "Personal Workspace"}
                  </h2>
                </div>
                <div className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-foreground">
                  {user?.enterpriseStatus === "active" ? "Active" : user?.enterpriseStatus || "Standalone"}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {workspaceStats.map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between rounded-[22px] border-2 border-border bg-card px-4 py-3">
                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                    <span className="text-2xl font-semibold text-foreground">{stat.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[22px] border-2 border-dashed border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
                先完成身份与资源配置，再进入顾问或创意工作台，能明显减少首次使用中的空页面和权限误判。
              </div>
            </div>
          </div>
        </section>

        {groupedLinks.map((section) => (
          <section key={section.key} className="space-y-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{section.title}</p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">{section.title}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{section.description}</p>
            </div>

            <div className={cn("grid gap-4", section.items.length > 1 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-1")}>
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group overflow-hidden rounded-[28px] border-2 border-border bg-card transition duration-200 hover:border-primary"
                  >
                    <div className={cn("flex items-center justify-between px-5 py-4", "bg-gradient-to-r", item.accentClassName)}>
                      <div className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                        {item.badge}
                      </div>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-foreground">{item.label}</h3>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        {quickLinks.length === 1 && (
          <section className="rounded-[28px] border-2 border-dashed border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">{messages.dashboardPage.emptyTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{messages.dashboardPage.emptyDescription}</p>
          </section>
        )}
      </div>
    </div>
  )
}
