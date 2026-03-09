import Link from "next/link"
import { ArrowRight, Globe, PenSquare, Settings, Target, Video } from "lucide-react"

import { DashboardLayout } from "@/components/dashboard-layout"

const quickLinks = [
  { href: "/dashboard/settings", label: "用户设置", icon: Settings, description: "管理企业信息、成员权限与个人资料" },
  { href: "/dashboard/video", label: "视频生成 Agent", icon: Video, description: "通过多轮对话生成营销视频" },
  { href: "/dashboard/website-generator", label: "网站生成 Agent", icon: Globe, description: "输入需求并实时预览网站页面" },
  { href: "/dashboard/advisor/brand-strategy/new", label: "品牌战略顾问", icon: Target, description: "梳理品牌定位、差异化和策略方向" },
  { href: "/dashboard/advisor/copywriting/new", label: "文案写作专家", icon: PenSquare, description: "围绕渠道目标生成结构化营销文案" },
]

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-muted/10 p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="rounded-3xl border bg-card p-8 shadow-sm">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">AI Marketing Workspace</p>
              <h1 className="font-sans text-3xl font-bold text-foreground lg:text-4xl">企业级营销工作台</h1>
              <p className="font-manrope leading-7 text-muted-foreground">所有功能已按 Agent 形态统一组织。你可以从左侧进入顾问会话、视频生成、网站生成和设置中心。</p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quickLinks.map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5">
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
        </div>
      </div>
    </DashboardLayout>
  )
}
