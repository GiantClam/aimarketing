"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, PenSquare, Settings, Target, TrendingUp } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { DashboardLayout } from "@/components/dashboard-layout"

type AdvisorAvailability = {
  brandStrategy: boolean
  growth: boolean
}

export default function DashboardPage() {
  const { user, hasFeature } = useAuth()
  const [advisorAvailability, setAdvisorAvailability] = useState<AdvisorAvailability>({
    brandStrategy: false,
    growth: false,
  })
  const [writerEnabled, setWriterEnabled] = useState(false)

  useEffect(() => {
    if (!user) return

    let cancelled = false

    const loadAvailability = async () => {
      try {
        const [advisorResponse, writerResponse] = await Promise.all([
          fetch("/api/dify/advisors/availability"),
          fetch("/api/writer/availability"),
        ])

        if (!advisorResponse.ok || !writerResponse.ok) return

        const advisorJson = await advisorResponse.json()
        const writerJson = await writerResponse.json()
        if (cancelled) return

        setAdvisorAvailability({
          brandStrategy: Boolean(advisorJson?.data?.brandStrategy),
          growth: Boolean(advisorJson?.data?.growth),
        })
        setWriterEnabled(Boolean(writerJson?.data?.enabled))
      } catch (error) {
        if (cancelled) return
        console.error("Failed to load dashboard availability:", error)
      }
    }

    void loadAvailability()

    return () => {
      cancelled = true
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
        description: "梳理品牌定位、差异化价值和策略方向。",
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

    if (hasFeature("copywriting_generation") && writerEnabled) {
      items.push({
        href: "/dashboard/writer",
        label: "文章写作",
        icon: PenSquare,
        description: "统一生成公众号、小红书、X、Facebook 图文内容，并支持 Markdown 微调与发布包导出。",
      })
    }

    return items
  }, [advisorAvailability, hasFeature, writerEnabled])

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-muted/10 p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="rounded-3xl border bg-card p-8 shadow-sm">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">AI Marketing Workspace</p>
              <h1 className="font-sans text-3xl font-bold text-foreground lg:text-4xl">企业级 AI 营销工作台</h1>
              <p className="font-manrope leading-7 text-muted-foreground">
                当前工作台已按能力统一收口。专家 Agent 负责策略与增长咨询，文章写作工作台负责多平台图文创作、编辑和发布准备。
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
                你的账号已经进入工作台，但当前企业尚未分配顾问或文章写作权限。请联系企业管理员完成功能开通。
              </p>
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
