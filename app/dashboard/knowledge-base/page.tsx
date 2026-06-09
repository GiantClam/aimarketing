import Link from "next/link"
import { ArrowRight, BookOpen, Database, Settings2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getRequestLocale } from "@/lib/i18n/request-locale"

export default async function KnowledgeBasePage() {
  const locale = await getRequestLocale()
  const isZh = locale === "zh"

  const copy = isZh
    ? {
        eyebrow: "Enterprise Workspace",
        title: "知识与顾问资源入口",
        description:
          "把企业知识库、顾问检索和后续 Agent / MCP 绑定先收敛到一个入口层，避免继续把知识能力藏在设置页深处。",
        cards: [
          {
            title: "企业知识检索",
            body: "当前企业知识库、Dify 数据集和检索开关主要仍在 Settings 中治理，但这里作为平台级知识入口，统一解释资源状态与下一步动作。",
            points: ["对齐企业知识库配置", "后续承接 Agent / MCP / Workflow 绑定", "避免把知识能力误读成单一聊天功能"],
            href: "/dashboard/platform-settings",
            action: "打开平台设置",
            icon: Database,
          },
          {
            title: "顾问与工作流复用",
            body: "知识不是独立孤岛。它会继续服务 AI 对话、顾问工作流和后续自动化执行，因此这里强调绑定关系而不是单页工具感。",
            points: ["服务 AI 对话和顾问路线", "衔接企业级权限与审计", "为工作流模板提供共享上下文"],
            href: "/dashboard/agent-platform",
            action: "查看智能体中台",
            icon: Sparkles,
          },
          {
            title: "平台治理入口",
            body: "当企业需要调整成员权限、计费边界或知识启用策略时，统一回到平台治理入口，不再让操作散落在孤立后台中。",
            points: ["Settings 管理权限与知识策略", "Billing 管理 credits 和套餐", "Capabilities 核对运行时与权限边界"],
            href: "/dashboard/platform-settings",
            action: "查看平台设置",
            icon: Settings2,
          },
        ],
        backToSettings: "前往平台设置",
        openBilling: "查看计费",
      }
    : {
        eyebrow: "Enterprise Workspace",
        title: "Knowledge and advisor resource hub",
        description:
          "Pull enterprise knowledge, advisor retrieval, and future Agent / MCP bindings into one front door instead of hiding knowledge entirely inside deep settings routes.",
        cards: [
          {
            title: "Enterprise knowledge retrieval",
            body: "Enterprise Dify datasets and retrieval toggles still live in Settings today, but this page acts as the platform-level knowledge entry that explains resource status and next actions.",
            points: ["Aligns enterprise knowledge configuration", "Prepares Agent / MCP / workflow bindings", "Avoids presenting knowledge as a single chat-only feature"],
            href: "/dashboard/platform-settings",
            action: "Open platform settings",
            icon: Database,
          },
          {
            title: "Advisor and workflow reuse",
            body: "Knowledge is not a standalone silo. It continues to support AI chat, advisor workflows, and future automation, so this page emphasizes bindings instead of a single-tool mental model.",
            points: ["Supports AI chat and advisor routes", "Stays aligned with enterprise permissions and audit", "Provides shared context for workflow templates"],
            href: "/dashboard/agent-platform",
            action: "View agent platform",
            icon: Sparkles,
          },
          {
            title: "Platform governance entry",
            body: "When a company needs to adjust member permissions, billing boundaries, or knowledge enablement, the workflow should return to one governance layer instead of several scattered admin screens.",
            points: ["Settings manages permissions and knowledge policy", "Billing manages credits and plans", "Capabilities verifies runtime and entitlement boundaries"],
            href: "/dashboard/platform-settings",
            action: "View platform settings",
            icon: Settings2,
          },
        ],
        backToSettings: "Go to platform settings",
        openBilling: "Open billing",
      }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-8">
          <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl">
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
                  {copy.title}
                </h1>
                <p className="mt-4 text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button className="public-button-primary h-10 px-4" asChild>
                  <Link href="/dashboard/platform-settings">{copy.backToSettings}</Link>
                </Button>
                <Button className="public-button-secondary h-10 px-4" asChild>
                  <Link href="/dashboard/billing">{copy.openBilling}</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {copy.cards.map((card) => {
              const Icon = card.icon
              return (
                <article key={card.title} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="dashboard-kicker text-muted-foreground">
                        {isZh ? "知识入口" : "Knowledge entry"}
                      </div>
                      <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                        {card.title}
                      </h2>
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{card.body}</p>

                  <div className="mt-4 space-y-2">
                    {card.points.map((point) => (
                      <div key={point} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                        {point}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <Button className="public-button-primary h-10 px-4" asChild>
                      <Link href={card.href}>
                        {card.action}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="space-y-3">
                <div className="dashboard-kicker text-muted-foreground">{isZh ? "平台说明" : "Platform note"}</div>
                <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {isZh ? "知识能力仍复用现有底座" : "Knowledge still reuses the current foundation"}
                </h2>
                <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
                  {isZh
                    ? "这次平台化扩充没有另起新的知识系统。知识入口仍然复用现有企业配置、顾问工作流和权限体系，只是把它提升成企业工作台中的正式平台模块。"
                    : "The platform expansion does not create a second knowledge system. It keeps reusing the existing enterprise configuration, advisor workflows, and permission model while promoting knowledge into a first-class workspace module."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
