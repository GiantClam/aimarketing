import Link from "next/link"
import {
  ArrowRight,
  Bookmark,
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

import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import { listLocalizedBusinessAgentConfigsBySlug } from "@/lib/platform/business-agents"
import { getLocalizedPlatformHubLinks } from "@/lib/platform/catalog"
import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"
import type { PlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"
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

type MetricSnapshot = {
  label: string
  value: string
  growth: string
  bars: [number, number, number, number]
}

const businessMetrics: Record<string, MetricSnapshot> = {
  "content-growth": { label: "Content pieces", value: "128", growth: "+24%", bars: [42, 64, 51, 82] },
  "brand-creative": { label: "Assets created", value: "342", growth: "+31%", bars: [36, 58, 74, 88] },
  "lead-conversion": { label: "Leads qualified", value: "76", growth: "+17%", bars: [34, 48, 67, 72] },
  "sales-close": { label: "Deals in progress", value: "23", growth: "+15%", bars: [38, 54, 49, 71] },
  "enterprise-operations": { label: "Active tasks", value: "183", growth: "+9%", bars: [48, 55, 62, 68] },
  "knowledge-assets": { label: "Assets total", value: "1,248", growth: "+22%", bars: [44, 56, 78, 84] },
  "compliance-risk": { label: "Reviews cleared", value: "64", growth: "+12%", bars: [46, 52, 59, 70] },
  "training-enablement": { label: "Enablement kits", value: "41", growth: "+18%", bars: [32, 50, 63, 76] },
  "talent-recruiting": { label: "Candidates staged", value: "58", growth: "+14%", bars: [35, 44, 61, 69] },
  "legal-ops": { label: "Contracts reviewed", value: "37", growth: "+11%", bars: [30, 43, 55, 66] },
}

const directoryMetrics: Record<string, MetricSnapshot> = {
  capabilities: { label: "Bound providers", value: "12", growth: "+6%", bars: [38, 45, 62, 66] },
  agents: { label: "Agent cards", value: "28", growth: "+13%", bars: [36, 58, 63, 79] },
  plugins: { label: "Plugin slots", value: "19", growth: "+8%", bars: [32, 42, 57, 65] },
  "mcp-services": { label: "MCP services", value: "14", growth: "+10%", bars: [40, 46, 61, 73] },
  workflows: { label: "Workflow runs", value: "96", growth: "+21%", bars: [34, 53, 69, 86] },
}

const capabilityMetrics: Record<string, MetricSnapshot> = {
  "ai-chat": { label: "Model sessions", value: "212", growth: "+19%", bars: [45, 59, 66, 81] },
  "ai-ppt": { label: "Decks shipped", value: "47", growth: "+16%", bars: [37, 52, 61, 76] },
  "ai-image": { label: "Visual variants", value: "384", growth: "+28%", bars: [44, 58, 77, 90] },
  "ai-video": { label: "Storyboard jobs", value: "31", growth: "+12%", bars: [30, 44, 58, 68] },
  "agent-platform": { label: "Agent routes", value: "22", growth: "+15%", bars: [36, 50, 64, 74] },
}

const operationMetrics: Record<string, MetricSnapshot> = {
  "knowledge-base": { label: "Indexed sources", value: "164", growth: "+22%", bars: [42, 51, 69, 83] },
  billing: { label: "Credits tracked", value: "8.4k", growth: "+9%", bars: [39, 48, 57, 65] },
  settings: { label: "Policies live", value: "18", growth: "+7%", bars: [34, 43, 52, 61] },
}

const fallbackMetric: MetricSnapshot = {
  label: "Workspace signals",
  value: "64",
  growth: "+12%",
  bars: [34, 48, 58, 70],
}

function MetricModule({ metric }: { metric: MetricSnapshot }) {
  return (
    <div className="workspace-metric-module">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase leading-4 text-muted-foreground">{metric.label}</div>
          <div className="mt-1 font-display text-3xl font-extrabold leading-none text-foreground">{metric.value}</div>
        </div>
        <div className="workspace-growth font-display text-sm font-extrabold">{metric.growth}</div>
      </div>
      <div className="workspace-mini-bars mt-3" aria-hidden="true">
        {metric.bars.map((height, index) => (
          <span key={`${metric.label}-${index}`} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  )
}

function WorkspaceCardAction({ href, label }: { href: string; label: string }) {
  return (
    <div className="workspace-card-cta-base">
      <Link href={href} className="workspace-card-cta">
        {label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

function getProviderStatusLabel(status: "active" | "fallback" | "planned", locale: "zh" | "en") {
  if (status === "active") return locale === "zh" ? "已接入" : "Active"
  if (status === "fallback") return locale === "zh" ? "兼容链路" : "Fallback"
  return locale === "zh" ? "规划中" : "Planned"
}

export function WorkspacePlatformHome({
  locale,
  capabilities,
  workflowTemplates,
}: {
  locale: AppLocale
  capabilities: PlatformRegistryControlEntry[]
  workflowTemplates: PlatformRegistryEntryExecutionState[]
}) {
  const displayLocale = locale === "zh" ? "zh" : "en"
  const hubs = getLocalizedPlatformHubLinks(locale)
  const businessEntries = getLocalizedWorkspaceBusinessEntries(locale)
  const featuredWorkflowTemplates = workflowTemplates
    .filter((item) => item.enabled && item.workspaceVisible)
    .slice(0, 4)

  const copy =
    displayLocale === "zh"
      ? {
          eyebrow: "WORKSPACE HUB",
          title: "ENTERPRISE WORKSPACE FRONT DOOR",
          description:
            "把 AI、PPT、图片、视频、智能体、插件、MCP 和工作流放回同一个工作台首页，避免继续从单页功能入口开始跳转。",
          templatesTitle: "业务工作流模板",
          templatesDescription:
            "先从可复用业务流程启动，再进入 Builder、知识、素材和具体能力页面，避免团队继续从单点工具拼装流程。",
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
          openWorkspace: "OPEN VIEW",
          openTemplate: "START FLOW",
          viewPublic: "查看公共入口",
          openBusiness: "OPEN VIEW",
          openExpert: "查看专家工作台",
        }
      : {
          eyebrow: "WORKSPACE HUB",
          title: "ENTERPRISE WORKSPACE FRONT DOOR",
          description:
            "Put AI, PPT, image, video, agents, plugins, MCP, and workflows back onto one workspace homepage.",
          templatesTitle: "Business workflow templates",
          templatesDescription:
            "Start from reusable business flows first, then move into Builder, knowledge, asset, and capability surfaces as needed.",
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
          openWorkspace: "OPEN VIEW",
          openTemplate: "START FLOW",
          viewPublic: "View Public Entry",
          openBusiness: "OPEN VIEW",
          openExpert: "View expert workbench",
        }
  const operationItems = operations[displayLocale]

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg workspace-page-shell mx-auto max-w-7xl">
        <div className="workspace-stack">
          <div className="workspace-command-hero workspace-hero-panel">
            <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
              <div>
                <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
                <h1 className="workspace-command-title mt-3 text-foreground">{copy.title}</h1>
                <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">{copy.description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="workspace-status-card">
                  <div className="dashboard-kicker text-muted-foreground">ACTIVE ROUTES</div>
                  <div className="mt-2 font-display text-3xl font-extrabold text-foreground">42</div>
                </div>
                <div className="workspace-status-card">
                  <div className="dashboard-kicker text-muted-foreground">MODEL LANES</div>
                  <div className="mt-2 font-display text-3xl font-extrabold text-foreground">8</div>
                </div>
                <div className="workspace-status-card">
                  <div className="dashboard-kicker text-muted-foreground">TASK HEALTH</div>
                  <div className="mt-2 font-display text-3xl font-extrabold text-foreground">96%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="dashboard-kicker text-muted-foreground">{copy.templatesTitle}</div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{copy.templatesDescription}</p>
            </div>

            {featuredWorkflowTemplates.length > 0 ? (
              <div className="grid gap-6 xl:grid-cols-2">
                {featuredWorkflowTemplates.map((template) => {
                  const metric = directoryMetrics.workflows ?? fallbackMetric
                  const targetHref = template.workspaceLaunchPath || template.workspaceHref || "/dashboard/workflows"

                  return (
                    <article key={template.slug} className="workspace-command-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="workspace-icon-block">
                          <Workflow className="h-7 w-7 stroke-[2]" />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="dashboard-kicker text-muted-foreground">WORKFLOW TEMPLATE</div>
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                      </div>

                      <h2 className="mt-5 font-display text-3xl font-extrabold uppercase leading-none text-foreground">
                        {template.title}
                      </h2>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{template.summary}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[template.label, ...template.notes.slice(0, 2)].filter(Boolean).map((item) => (
                          <div key={`${template.slug}-${item}`} className="workspace-card-chip">
                            {item}
                          </div>
                        ))}
                      </div>

                      <div className="mt-auto flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
                        <WorkspaceCardAction href={targetHref} label={copy.openTemplate} />
                        <MetricModule metric={metric} />
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <article className="workspace-command-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="workspace-icon-block">
                    <Workflow className="h-7 w-7 stroke-[2]" />
                  </div>
                  <div className="dashboard-kicker text-muted-foreground">WORKFLOW TEMPLATE</div>
                </div>
                <h2 className="mt-5 font-display text-3xl font-extrabold uppercase leading-none text-foreground">
                  {displayLocale === "zh" ? "工作流模板入口" : "Workflow template entry"}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {displayLocale === "zh"
                    ? "当前企业还没有开启可见模板，先进入工作流页查看平台模板和企业自定义模板。"
                    : "No visible workflow templates are enabled for this enterprise yet. Open the workflows surface to inspect platform and enterprise templates."}
                </p>
                <div className="mt-auto flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
                  <WorkspaceCardAction href="/dashboard/workflows" label={copy.openTemplate} />
                  <MetricModule metric={directoryMetrics.workflows ?? fallbackMetric} />
                </div>
              </article>
            )}

            <div className="grid gap-6 xl:grid-cols-3">
              {businessEntries.map((entry) => {
                const Icon = businessIcons[entry.iconKey]
                const defaultBusinessAgent = listLocalizedBusinessAgentConfigsBySlug(displayLocale, entry.slug)[0] || null
                const businessHref = buildDashboardBusinessHref(entry.slug, {
                  agentId: defaultBusinessAgent?.agentId || null,
                })
                const metric = businessMetrics[entry.slug] ?? fallbackMetric

                return (
                  <article key={entry.slug} className="workspace-command-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="workspace-icon-block">
                        <Icon className="h-7 w-7 stroke-[2]" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="dashboard-kicker text-muted-foreground">BUSINESS VIEW</div>
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div className="workspace-card-pin" aria-hidden="true">
                        <Bookmark className="h-4 w-4" />
                      </div>
                    </div>

                    <h2 className="mt-5 font-display text-3xl font-extrabold uppercase leading-none text-foreground">
                      {entry.title}
                    </h2>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{entry.summary}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {entry.outcomes.slice(0, 2).map((item) => (
                        <div key={item} className="workspace-card-chip">
                          {item}
                        </div>
                      ))}
                    </div>

                    <div className="mt-auto flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
                      <WorkspaceCardAction href={businessHref} label={copy.openBusiness} />
                      <MetricModule metric={metric} />
                      {entry.expertWorkbenchHref ? (
                        <Link className="text-xs font-semibold uppercase text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={entry.expertWorkbenchHref}>
                          {copy.openExpert}
                        </Link>
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
                  const metric = directoryMetrics[hub.slug] ?? fallbackMetric

                  return (
                    <article key={hub.slug} className="workspace-command-card min-h-[230px]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="workspace-icon-block h-14 w-14">
                          <Icon className="h-6 w-6 stroke-[2]" />
                        </div>
                        <div className="dashboard-kicker text-muted-foreground">DIRECTORY</div>
                      </div>
                      <h2 className="mt-5 font-display text-3xl font-extrabold uppercase leading-none text-foreground">
                        {hub.title}
                      </h2>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{hub.summary}</p>
                      <div className="mt-auto flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
                        <WorkspaceCardAction href={workspaceHref} label={copy.openWorkspace} />
                        <MetricModule metric={metric} />
                      </div>
                      <Link className="mt-3 inline-flex text-xs font-semibold uppercase text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={localizePublicPath(hub.href, locale)}>
                        {copy.viewPublic}
                      </Link>
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
                  const metric = capabilityMetrics[item.slug] ?? fallbackMetric

                  return (
                    <article key={item.slug} className="workspace-command-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="workspace-icon-block h-14 w-14">
                          <Icon className="h-6 w-6 stroke-[2]" />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="dashboard-kicker text-muted-foreground">{item.capabilityKind?.toUpperCase() || "CAPABILITY"}</div>
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                      </div>
                      <h3 className="mt-5 font-display text-3xl font-extrabold uppercase leading-none text-foreground">
                        {item.title}
                      </h3>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(item.bindings ?? []).slice(0, 2).map((binding) => (
                          <span key={`${item.slug}-${binding.provider}`} className="workspace-card-chip text-xs text-muted-foreground">
                            {binding.provider} · {getProviderStatusLabel(binding.status, displayLocale)}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.proofPoints.slice(0, 2).map((point) => (
                          <div key={point} className="workspace-card-chip">
                            {point}
                          </div>
                        ))}
                      </div>

                      <div className="mt-auto flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
                        <WorkspaceCardAction href={targetHref} label={copy.openWorkspace} />
                        <MetricModule metric={metric} />
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="pt-2">
                <div className="dashboard-kicker text-muted-foreground">{copy.operationsTitle}</div>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{copy.operationsDescription}</p>
              </div>

              <article className="workspace-command-card min-h-[230px]">
                <div className="flex items-start justify-between gap-4">
                  <div className="workspace-icon-block h-14 w-14">
                    <Target className="h-6 w-6 stroke-[2]" />
                  </div>
                  <div className="dashboard-kicker text-muted-foreground">{copy.expertTitle}</div>
                </div>
                <h3 className="mt-5 font-display text-3xl font-extrabold uppercase leading-none text-foreground">
                  {displayLocale === "zh" ? "成交专家工作台" : "Closing expert workbench"}
                </h3>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{copy.expertDescription}</p>
                <div className="mt-auto flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
                  <WorkspaceCardAction href="/dashboard/agent-platform/sales-close-expert" label={copy.openExpert} />
                  <MetricModule metric={businessMetrics["sales-close"]} />
                </div>
                <Link className="mt-3 inline-flex text-xs font-semibold uppercase text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={buildDashboardBusinessHref("sales-close")}>
                  {copy.openBusiness}
                </Link>
              </article>

              <div className="grid gap-4 xl:grid-cols-3">
                {operationItems.map((item) => {
                  const Icon = item.icon
                  const metric = operationMetrics[item.slug] ?? fallbackMetric
                  return (
                    <article key={item.slug} className="workspace-command-card min-h-[240px]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="workspace-icon-block h-14 w-14">
                          <Icon className="h-6 w-6 stroke-[2]" />
                        </div>
                        <div className="dashboard-kicker text-muted-foreground">OPERATIONS</div>
                      </div>
                      <h3 className="mt-5 font-display text-2xl font-extrabold uppercase leading-none text-foreground">
                        {item.title}
                      </h3>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                      <div className="mt-auto flex flex-col gap-4 pt-6">
                        <MetricModule metric={metric} />
                        <WorkspaceCardAction href={item.href} label={copy.openWorkspace} />
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
