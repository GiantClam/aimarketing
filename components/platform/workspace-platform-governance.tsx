import Link from "next/link"
import { CreditCard, Database, LayoutGrid, Network, Settings, Sparkles, Users2, Workflow } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AppLocale } from "@/lib/i18n/config"
import type { PlatformGovernanceSnapshot } from "@/lib/platform/governance"
import { WorkspacePlatformRuntimePanel } from "@/components/platform/workspace-platform-runtime-panel"
import { getLocalizedWorkspaceEnterpriseSettingEntries } from "@/lib/platform/workspace-enterprise-settings"

const registryIcons = {
  capability: LayoutGrid,
  agent: Users2,
  plugin: Sparkles,
  mcp_service: Network,
  workflow: Workflow,
} as const

function formatNumber(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("en-US").format(value)
}

function getRegistryLabel(itemType: keyof typeof registryIcons, locale: "zh" | "en") {
  if (locale === "zh") {
    if (itemType === "capability") return "能力"
    if (itemType === "agent") return "智能体"
    if (itemType === "plugin") return "插件"
    if (itemType === "mcp_service") return "MCP 服务"
    return "工作流"
  }

  if (itemType === "capability") return "Capabilities"
  if (itemType === "agent") return "Agents"
  if (itemType === "plugin") return "Plugins"
  if (itemType === "mcp_service") return "MCP Services"
  return "Workflows"
}

export function WorkspacePlatformGovernance({
  locale,
  snapshot,
}: {
  locale: AppLocale
  snapshot: PlatformGovernanceSnapshot
}) {
  const displayLocale = locale === "zh" ? "zh" : "en"
  const copy =
    displayLocale === "zh"
      ? {
          eyebrow: "Platform Governance",
          title: "平台设置与治理总览",
          description:
            "把模型路由、credits、套餐、注册表显示控制和企业治理入口收回到同一页，不再要求企业管理员自己记住多个后台地址。",
          runtimeTitle: "模型路由与运行时",
          runtimeBody:
            "直接读取当前 provider routing、任务模式和 entitlement 钩子，避免平台能力页和实际运行时脱节。",
          billingTitle: "计费与额度",
          billingBody:
            "统一查看当前计划、可用 credits、预留额度和团队 seat 状态，让平台治理和商业规则保持同一视角。",
          registryTitle: "目录显示控制",
          registryBody:
            "这里汇总 capability / agent / plugin / MCP / workflow 的注册表状态，用来判断哪些能力已启用、哪些仍是 deferred。",
          settingsTitle: "治理入口",
          settingsBody:
            "更细的成员、知识、账单和工作台策略仍保留在原有页面，但现在都从同一个平台设置页回流。",
          enterpriseIaTitle: "企业设置入口层",
          enterpriseIaBody:
            "席位、用量、算力和 SSO 先以信息架构入口落位，帮助企业管理员知道这些治理面会落在哪些工作台路径上。",
          credits: "可用积分",
          reserved: "预留积分",
          totalBalance: "账户余额",
          plan: "当前计划",
          status: "订阅状态",
          nextPlan: "下个计划",
          seats: "成员席位",
          canSpend: "可消耗",
          yes: "可以",
          no: "不可以",
          unavailable: "账单数据暂不可用",
          runtimeReady: "活跃文本主路由",
          controlSurface: "治理能力",
          openBilling: "打开计费",
          openSettings: "打开原始设置",
          openKnowledge: "打开知识入口",
          openCapabilities: "查看能力中心",
          canManage: "企业管理员可修改平台注册表",
          readOnly: "当前账号只读查看平台注册表",
          enabled: "已启用",
          deferred: "Deferred",
          publicVisible: "公开可见",
          workspaceVisible: "工作台可见",
        }
      : {
          eyebrow: "Platform Governance",
          title: "Platform settings and governance overview",
          description:
            "Keep model routing, credits, plans, registry visibility control, and enterprise governance links on one page instead of making admins remember scattered screens.",
          runtimeTitle: "Model routing and runtime",
          runtimeBody:
            "Reads the real provider routing, task modes, and entitlement hooks so the platform view stays aligned with the actual runtime.",
          billingTitle: "Billing and credit posture",
          billingBody:
            "Review the current plan, available credits, reserved balance, and seat status in one place so platform governance and commercial rules share the same surface.",
          registryTitle: "Directory visibility control",
          registryBody:
            "Summarizes capability / agent / plugin / MCP / workflow registry state so teams can see what is enabled versus still deferred.",
          settingsTitle: "Governance entry points",
          settingsBody:
            "Member, knowledge, billing, and detailed workspace settings still live on their existing pages, but they now roll back into one platform settings layer.",
          enterpriseIaTitle: "Enterprise settings entry layer",
          enterpriseIaBody:
            "Seats, usage, compute, and SSO land here as information architecture entry points first so admins know where each governance surface belongs.",
          credits: "Available credits",
          reserved: "Reserved credits",
          totalBalance: "Account balance",
          plan: "Current plan",
          status: "Subscription status",
          nextPlan: "Next plan",
          seats: "Workspace seats",
          canSpend: "Spendable now",
          yes: "Yes",
          no: "No",
          unavailable: "Billing data is currently unavailable",
          runtimeReady: "Active text route",
          controlSurface: "Governance control",
          openBilling: "Open billing",
          openSettings: "Open legacy settings",
          openKnowledge: "Open knowledge hub",
          openCapabilities: "View capabilities",
          canManage: "Company admins can edit the platform registry",
          readOnly: "This account can inspect the platform registry in read-only mode",
          enabled: "Enabled",
          deferred: "Deferred",
          publicVisible: "Public visible",
          workspaceVisible: "Workspace visible",
        }

  const governanceLinks = [
    {
      slug: "billing",
      title: copy.openBilling,
      href: "/dashboard/billing",
      icon: CreditCard,
    },
    {
      slug: "settings",
      title: copy.openSettings,
      href: "/dashboard/settings",
      icon: Settings,
    },
    {
      slug: "knowledge",
      title: copy.openKnowledge,
      href: "/dashboard/knowledge-base",
      icon: Database,
    },
    {
      slug: "capabilities",
      title: copy.openCapabilities,
      href: "/dashboard/capabilities",
      icon: LayoutGrid,
    },
  ]
  const enterpriseSettings = getLocalizedWorkspaceEnterpriseSettingEntries(locale)

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-8">
          <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                {copy.runtimeReady}: {snapshot.runtime.activeTextProvider || "—"}
              </span>
              <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                {copy.credits}: {formatNumber(snapshot.billing.availableCredits)}
              </span>
              <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                {copy.controlSurface}: {snapshot.canManageRegistry ? copy.canManage : copy.readOnly}
              </span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
              <div className="dashboard-kicker text-muted-foreground">{copy.runtimeTitle}</div>
              <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {snapshot.runtime.activeTextProvider || "Unconfigured"}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.runtimeBody}</p>
              <div className="mt-4 space-y-2">
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {snapshot.runtime.providers.length} providers
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {snapshot.runtime.tasks.length} task runtimes
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {snapshot.runtime.entitlements.length} entitlement hooks
                </div>
              </div>
            </article>

            <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
              <div className="dashboard-kicker text-muted-foreground">{copy.billingTitle}</div>
              <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {snapshot.billing.planName || snapshot.billing.planCode || "—"}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.billingBody}</p>
              <div className="mt-4 space-y-2">
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.credits}: {formatNumber(snapshot.billing.availableCredits)}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.reserved}: {formatNumber(snapshot.billing.reservedCredits)}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.totalBalance}: {formatNumber(snapshot.billing.balanceCredits)}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.status}: {snapshot.billing.subscriptionStatus || "—"}
                </div>
                {snapshot.billing.nextPlanCode ? (
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {copy.nextPlan}: {snapshot.billing.nextPlanCode}
                  </div>
                ) : null}
                {snapshot.billing.seatLimit != null ? (
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {copy.seats}: {formatNumber(snapshot.billing.activeMemberCount)} / {formatNumber(snapshot.billing.seatLimit)}
                  </div>
                ) : null}
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.canSpend}: {snapshot.billing.canSpendCredits ? copy.yes : copy.no}
                </div>
                {snapshot.billing.note ? (
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {copy.unavailable}: {snapshot.billing.note}
                  </div>
                ) : null}
              </div>
            </article>

            <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
              <div className="dashboard-kicker text-muted-foreground">{copy.registryTitle}</div>
              <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {snapshot.canManageRegistry ? copy.canManage : copy.readOnly}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.registryBody}</p>
              <div className="mt-4 space-y-3">
                {snapshot.registry.map((item) => {
                  const Icon = registryIcons[item.itemType]
                  return (
                    <div key={item.itemType} className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Icon className="h-4 w-4" />
                        {getRegistryLabel(item.itemType, displayLocale)}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-muted-foreground">
                        {item.counts.total} total · {item.counts.enabled} {copy.enabled} · {item.counts.publicVisible} {copy.publicVisible} · {item.counts.workspaceVisible} {copy.workspaceVisible} · {item.counts.deferred} {copy.deferred}
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          </div>

          <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
            <div className="dashboard-kicker text-muted-foreground">{copy.settingsTitle}</div>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">{copy.settingsBody}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {governanceLinks.map((item) => {
                const Icon = item.icon
                return (
                  <Button key={item.slug} className="public-button-primary h-10 px-4" asChild>
                    <Link href={item.href}>
                      <Icon className="mr-2 h-4 w-4" />
                      {item.title}
                    </Link>
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
            <div className="dashboard-kicker text-muted-foreground">{copy.enterpriseIaTitle}</div>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">{copy.enterpriseIaBody}</p>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {enterpriseSettings.map((item) => (
                <article key={item.slug} className="rounded-[10px] border border-border bg-background p-4">
                  <div className="dashboard-kicker text-muted-foreground">ENTERPRISE SETTINGS</div>
                  <h3 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.summary}</p>
                  <div className="mt-4 space-y-2">
                    {item.bullets.slice(0, 2).map((point) => (
                      <div key={point} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                        {point}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5">
                    <Button className="public-button-primary h-10 px-4" asChild>
                      <Link href={item.href}>{item.title}</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <WorkspacePlatformRuntimePanel locale={displayLocale} snapshot={snapshot.runtime} />
    </div>
  )
}
