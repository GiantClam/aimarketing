"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowRight, ImageIcon, PenSquare, Settings, Target, TrendingUp } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useDashboardAvailability } from "@/components/dashboard-availability-provider"
import { useI18n } from "@/components/locale-provider"

type QuickLinkItem = {
  href: string
  label: string
  description: string
  icon: any
}

export default function DashboardPage() {
  const { hasFeature } = useAuth()
  const { messages } = useI18n()
  const { advisor, writer, imageAssistant } = useDashboardAvailability()

  const quickLinks = useMemo(() => {
    const items: QuickLinkItem[] = [
      {
        href: "/dashboard/settings",
        label: messages.dashboardPage.settings.label,
        icon: Settings,
        description: messages.dashboardPage.settings.description,
      },
    ]

    if (hasFeature("expert_advisor") && advisor.brandStrategy) {
      items.push({
        href: "/dashboard/advisor/brand-strategy/new",
        label: messages.dashboardPage.brandAdvisor.label,
        icon: Target,
        description: messages.dashboardPage.brandAdvisor.description,
      })
    }

    if (hasFeature("expert_advisor") && advisor.growth) {
      items.push({
        href: "/dashboard/advisor/growth/new",
        label: messages.dashboardPage.growthAdvisor.label,
        icon: TrendingUp,
        description: messages.dashboardPage.growthAdvisor.description,
      })
    }

    if (hasFeature("copywriting_generation") && writer.enabled) {
      items.push({
        href: "/dashboard/writer",
        label: messages.dashboardPage.writer.label,
        icon: PenSquare,
        description: messages.dashboardPage.writer.description,
      })
    }

    if (hasFeature("image_design_generation") && imageAssistant.enabled) {
      items.push({
        href: "/dashboard/image-assistant",
        label: messages.dashboardPage.imageAssistant.label,
        icon: ImageIcon,
        description: messages.dashboardPage.imageAssistant.description,
      })
    }

    return items
  }, [advisor, hasFeature, imageAssistant.enabled, messages, writer.enabled])

  return (
    <div className="h-full overflow-y-auto bg-muted/10 p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-3xl border bg-card p-8 shadow-sm">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">{messages.dashboardPage.eyebrow}</p>
            <h1 className="font-sans text-3xl font-bold text-foreground lg:text-4xl">{messages.dashboardPage.title}</h1>
            <p className="font-manrope leading-7 text-muted-foreground">{messages.dashboardPage.description}</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="font-sans text-lg font-semibold text-foreground">{item.label}</h2>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <p className="text-sm font-manrope leading-6 text-muted-foreground">{item.description}</p>
                </div>
              </Link>
            )
          })}
        </section>

        {quickLinks.length === 1 && (
          <section className="rounded-2xl border border-dashed bg-card/60 p-6">
            <h2 className="font-sans text-lg font-semibold text-foreground">{messages.dashboardPage.emptyTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{messages.dashboardPage.emptyDescription}</p>
          </section>
        )}
      </div>
    </div>
  )
}
