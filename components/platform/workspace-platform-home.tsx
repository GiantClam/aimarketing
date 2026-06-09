import Link from "next/link"
import {
  Bot,
  CreditCard,
  GraduationCap,
  ImageIcon,
  LayoutGrid,
  Network,
  PlayCircle,
  Plug,
  Radar,
  Sparkles,
  Database,
  Settings,
  Scale,
  ShieldCheck,
  Target,
  TrendingUp,
  Users2,
  UserPlus,
  Workflow,
  PenSquare,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import { listLocalizedBusinessAgentConfigsBySlug } from "@/lib/platform/business-agents"
import { getLocalizedPlatformHubLinks } from "@/lib/platform/catalog"
import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"
import {
  buildDashboardBusinessHref,
  getLocalizedWorkspaceBusinessEntries,
} from "@/lib/platform/workspace-business"

const hubIcons = {
  capabilities: LayoutGrid,
  agents: Users2,
  plugins: Plug,
  "mcp-services": Network,
  workflows: Workflow,
} as const

const capabilityIcons = {
  "ai-chat": Bot,
  "ai-ppt": Sparkles,
  "ai-image": ImageIcon,
  "ai-video": PlayCircle,
  "agent-platform": Users2,
} as const

const businessIcons = {
  content: TrendingUp,
  creative: PenSquare,
  lead: Radar,
  sales: Target,
  operations: Workflow,
  knowledge: Database,
  compliance: ShieldCheck,
  training: GraduationCap,
  talent: UserPlus,
  legal: Scale,
} as const

const operations = {
  zh: [
    {
      slug: "knowledge-base",
      title: "知识与顾问资源",
      summary: "进入企业知识入口，梳理知识检索、顾问绑定和后续 Agent / MCP 复用。",
      href: "/dashboard/knowledge-base",
      icon: Database,
    },
    {
      slug: "billing",
      title: "计费与用量",
      summary: "查看 credits、套餐和团队可用额度，确保平台能力和商业规则保持同一层治理。",
      href: "/dashboard/billing",
      icon: CreditCard,
    },
    {
      slug: "settings",
      title: "平台设置",
      summary: "把模型路由、credits、目录显示控制和治理入口收回同一页，再按需深入原始设置页。",
      href: "/dashboard/platform-settings",
      icon: Settings,
    },
  ],
  en: [
    {
      slug: "knowledge-base",
      title: "Knowledge and advisor resources",
      summary: "Enter the enterprise knowledge front door for retrieval, advisor bindings, and future Agent / MCP reuse.",
      href: "/dashboard/knowledge-base",
      icon: Database,
    },
    {
      slug: "billing",
      title: "Billing and usage",
      summary: "Review credits, plans, and team allowance so platform capabilities and commercial rules stay on one control surface.",
      href: "/dashboard/billing",
      icon: CreditCard,
    },
    {
      slug: "settings",
      title: "Platform settings",
      summary: "Keep model routing, credits, registry visibility, and governance links on one page before diving into the legacy settings screens.",
      href: "/dashboard/platform-settings",
      icon: Settings,
    },
  ],
} as const

function getProviderStatusLabel(status: "active" | "fallback" | "planned", locale: "zh" | "en") {
  if (status === "active") return locale === "zh" ? "已接入" : "Active"
  if (status === "fallback") return locale === "zh" ? "兼容链路" : "Fallback"
  return locale === "zh" ? "规划中" : "Planned"
}

export function WorkspacePlatformHome({
  locale,
  capabilities,
}: {
  locale: AppLocale
  capabilities: PlatformRegistryControlEntry[]
}) {
  const displayLocale = locale === "zh" ? "zh" : "en"
  const hubs = getLocalizedPlatformHubLinks(locale)
  const businessEntries = getLocalizedWorkspaceBusinessEntries(locale)

  const copy =
    displayLocale === "zh"
      ? {
          eyebrow: "Workspace Hub",
          title: "企业工作台平台入口",
          description:
            "把 AI、PPT、图片、视频、智能体、插件、MCP 和工作流放回同一个工作台首页，避免继续从单页功能入口开始跳转。",
          businessTitle: "业务视角入口",
          businessDescription:
            "先按业务目标进入工作台，再决定落到 AI、Writer、Image、Video、Knowledge、Billing 还是平台治理页面。",
          directoriesTitle: "平台目录",
          directoriesDescription: "先管理平台骨架，再进入具体运行时和业务页面。",
          capabilitiesTitle: "优先能力",
          capabilitiesDescription: "优先把高频能力固定在首页，便于企业团队统一理解与协作。",
          operationsTitle: "治理与资源",
          operationsDescription: "把知识、计费和设置放进同一平台入口层，避免企业管理员再靠记忆寻找后台位置。",
          expertTitle: "专家工作台示例",
          expertDescription: "用一个成交专家工作台示例页，统一角色说明、示例问题、输入区、历史占位和输出动作结构。",
          openWorkspace: "打开工作台",
          viewPublic: "查看公共入口",
          openBusiness: "打开业务入口",
          openExpert: "查看专家工作台",
        }
      : {
          eyebrow: "Workspace Hub",
          title: "Enterprise workspace front door",
          description:
            "Put AI, PPT, image, video, agents, plugins, MCP, and workflows back onto one workspace homepage instead of dropping users into a single-function screen first.",
          businessTitle: "Business entry layer",
          businessDescription:
            "Start from a business objective first, then land into AI, Writer, Image, Video, Knowledge, Billing, or governance routes as needed.",
          directoriesTitle: "Platform directories",
          directoriesDescription: "Manage the platform skeleton first, then step into the runtime surfaces.",
          capabilitiesTitle: "Priority capabilities",
          capabilitiesDescription: "Pin the most-used capabilities on the home screen so enterprise teams share one mental model.",
          operationsTitle: "Governance and resources",
          operationsDescription: "Keep knowledge, billing, and settings on the same platform front door so enterprise admins do not have to remember scattered routes.",
          expertTitle: "Expert workbench example",
          expertDescription:
            "Use one closing-expert example page to standardize role framing, sample prompts, input, history placeholders, and output actions.",
          openWorkspace: "Open Workspace",
          viewPublic: "View Public Entry",
          openBusiness: "Open business view",
          openExpert: "View expert workbench",
        }
  const operationItems = operations[displayLocale]

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-8">
          <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="dashboard-kicker text-muted-foreground">{copy.businessTitle}</div>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-muted-foreground">{copy.businessDescription}</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {businessEntries.map((entry) => {
                const Icon = businessIcons[entry.iconKey]
                const defaultBusinessAgent = listLocalizedBusinessAgentConfigsBySlug(displayLocale, entry.slug)[0] || null
                const businessHref = buildDashboardBusinessHref(entry.slug, {
                  agentId: defaultBusinessAgent?.agentId || null,
                })

                return (
                  <article key={entry.slug} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="dashboard-kicker text-muted-foreground">BUSINESS VIEW</div>
                        <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                          {entry.title}
                        </h2>
                      </div>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                        <Icon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-muted-foreground">{entry.summary}</p>

                    <div className="mt-4 space-y-2">
                      {entry.outcomes.slice(0, 2).map((item) => (
                        <div key={item} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                          {item}
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button className="public-button-primary h-10 px-4" asChild>
                        <Link href={businessHref}>{copy.openBusiness}</Link>
                      </Button>
                      {entry.expertWorkbenchHref ? (
                        <Button className="public-button-secondary h-10 px-4" asChild>
                          <Link href={entry.expertWorkbenchHref}>{copy.openExpert}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-4">
              <div>
                <div className="dashboard-kicker text-muted-foreground">{copy.directoriesTitle}</div>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{copy.directoriesDescription}</p>
              </div>

              <div className="grid gap-4">
                {hubs.map((hub) => {
                  const Icon = hubIcons[hub.slug as keyof typeof hubIcons] ?? LayoutGrid
                  const workspaceHref = `/dashboard/${hub.slug}`

                  return (
                    <article key={hub.slug} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                          <Icon className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                            {hub.title}
                          </h2>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">{hub.summary}</p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button className="public-button-primary h-10 px-4" asChild>
                              <Link href={workspaceHref}>{copy.openWorkspace}</Link>
                            </Button>
                            <Button className="public-button-secondary h-10 px-4" asChild>
                              <Link href={localizePublicPath(hub.href, locale)}>{copy.viewPublic}</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="dashboard-kicker text-muted-foreground">{copy.capabilitiesTitle}</div>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{copy.capabilitiesDescription}</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {capabilities.map((item) => {
                  const Icon = capabilityIcons[item.slug as keyof typeof capabilityIcons] ?? Sparkles
                  const targetHref = item.workspaceHref ?? (item.publicHref ? localizePublicPath(item.publicHref, locale) : "/dashboard/capabilities")

                  return (
                    <article key={item.slug} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3">
                          <div className="dashboard-kicker text-muted-foreground">{item.capabilityKind?.toUpperCase() || "CAPABILITY"}</div>
                          <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                            {item.title}
                          </h3>
                        </div>
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                          <Icon className="h-5 w-5 text-primary-foreground" />
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.summary}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(item.bindings ?? []).map((binding) => (
                          <span key={`${item.slug}-${binding.provider}`} className="dashboard-chip rounded-[4px] px-3 py-2 text-xs leading-5 text-muted-foreground">
                            {binding.provider} · {getProviderStatusLabel(binding.status, displayLocale)}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 space-y-2">
                        {item.proofPoints.slice(0, 2).map((point) => (
                          <div key={point} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                            {point}
                          </div>
                        ))}
                      </div>

                      <div className="mt-5">
                        <Button className="public-button-primary h-10 px-4" asChild>
                          <Link href={targetHref}>{copy.openWorkspace}</Link>
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="pt-2">
                <div className="dashboard-kicker text-muted-foreground">{copy.operationsTitle}</div>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{copy.operationsDescription}</p>
              </div>

              <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="dashboard-kicker text-muted-foreground">{copy.expertTitle}</div>
                <h3 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {displayLocale === "zh" ? "成交专家工作台" : "Closing expert workbench"}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.expertDescription}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button className="public-button-primary h-10 px-4" asChild>
                    <Link href="/dashboard/agent-platform/sales-close-expert">{copy.openExpert}</Link>
                  </Button>
                  <Button className="public-button-secondary h-10 px-4" asChild>
                    <Link href={buildDashboardBusinessHref("sales-close")}>{copy.openBusiness}</Link>
                  </Button>
                </div>
              </article>

              <div className="grid gap-4 xl:grid-cols-3">
                {operationItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <article key={item.slug} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3">
                          <div className="dashboard-kicker text-muted-foreground">OPERATIONS</div>
                          <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                            {item.title}
                          </h3>
                        </div>
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                          <Icon className="h-5 w-5 text-primary-foreground" />
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.summary}</p>

                      <div className="mt-5">
                        <Button className="public-button-primary h-10 px-4" asChild>
                          <Link href={item.href}>{copy.openWorkspace}</Link>
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
