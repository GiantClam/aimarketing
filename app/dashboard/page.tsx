"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, PenSquare, Settings, Target, TrendingUp } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { DashboardLayout } from "@/components/dashboard-layout"

type AdvisorAvailability = {
  brandStrategy: boolean
  growth: boolean
  copywriting: boolean
}

export default function DashboardPage() {
  const { user, hasFeature } = useAuth()
  const [advisorAvailability, setAdvisorAvailability] = useState<AdvisorAvailability>({
    brandStrategy: false,
    growth: false,
    copywriting: false,
  })

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const controller = new AbortController()

    const loadAdvisorAvailability = async () => {
      try {
        const res = await fetch("/api/dify/advisors/availability", { signal: controller.signal })
        if (!res.ok) return

        const json = await res.json()
        if (cancelled || !json?.data) return

        setAdvisorAvailability({
          brandStrategy: Boolean(json.data.brandStrategy),
          growth: Boolean(json.data.growth),
          copywriting: Boolean(json.data.copywriting),
        })
      } catch (error) {
        if (controller.signal.aborted || cancelled) return
        if (error instanceof TypeError && error.message.includes("Failed to fetch")) return
        console.error("Failed to load dashboard advisor availability:", error)
      }
    }

    void loadAdvisorAvailability()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [user])

  const quickLinks = useMemo(() => {
    const items = [
      {
        href: "/dashboard/settings",
        label: "用户设置",
        icon: Settings,
        description: "管理企业信息、成员权限和个人资料。",
      },
    ]

    if (hasFeature("expert_advisor") && advisorAvailability.brandStrategy) {
      items.push({
        href: "/dashboard/advisor/brand-strategy/new",
        label: "品牌战略顾问",
        icon: Target,
        description: "梳理品牌定位、价值主张和差异化策略。",
      })
    }

    if (hasFeature("expert_advisor") && advisorAvailability.growth) {
      items.push({
        href: "/dashboard/advisor/growth/new",
        label: "增长顾问",
        icon: TrendingUp,
        description: "围绕渠道目标和业务指标制定增长动作。",
      })
    }

    if (hasFeature("copywriting_generation") && advisorAvailability.copywriting) {
      items.push({
        href: "/dashboard/advisor/copywriting/new",
        label: "文案写作专家",
        icon: PenSquare,
        description: "基于目标渠道快速产出结构化营销文案。",
      })
    }

    return items
  }, [advisorAvailability, hasFeature])

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-muted/10 p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="rounded-3xl border bg-card p-8 shadow-sm">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">AI Marketing Workspace</p>
              <h1 className="font-sans text-3xl font-bold text-foreground lg:text-4xl">企业级营销工作台</h1>
              <p className="font-manrope leading-7 text-muted-foreground">
                当前工作台只展示已授权且已完成配置的专家 Agent。网站生成和视频生成能力已暂时停用，不会在当前环境开放。
              </p>
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
              <h2 className="font-sans text-lg font-semibold text-foreground">当前暂无可用营销能力</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                你的账号已进入工作台，但尚未分配顾问权限，或当前账号下没有可用的 Dify 顾问配置。请联系企业管理员处理。
              </p>
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
