import Link from "next/link"
import { CreditCard, Database, LayoutGrid, Network, Settings, Sparkles, Users2, Workflow } from "lucide-react"

import { EnterpriseKnowledgeGovernancePanel } from "@/components/platform/enterprise-knowledge-governance-panel"
import { EnterpriseMemberGovernancePanel } from "@/components/platform/enterprise-member-governance-panel"
import { PlatformGovernanceSettingsPanel } from "@/components/platform/platform-governance-settings-panel"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AppLocale } from "@/lib/i18n/config"
import type { CustomerGovernanceSnapshot } from "@/lib/platform/customer-governance"
import type { PlatformGovernanceSnapshot } from "@/lib/platform/governance"
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

function formatNumberOrFallback(value: number | null, fallback: string) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback
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

function getCustomerRuntimeStatusLabel(
  status: CustomerGovernanceSnapshot["runtimes"][number]["status"],
  locale: "zh" | "en",
) {
  if (locale === "zh") {
    if (status === "ready") return "Ready"
    if (status === "deferred") return "Deferred"
    return "未启用"
  }

  if (status === "ready") return "Ready"
  if (status === "deferred") return "Deferred"
  return "Disabled"
}

export function WorkspacePlatformGovernance({
  locale,
  snapshot,
  customerSnapshot,
  currentUserId,
  canViewEnterpriseGovernance,
  canManageEnterpriseGovernance,
}: {
  locale: AppLocale
  snapshot: PlatformGovernanceSnapshot
  customerSnapshot: CustomerGovernanceSnapshot | null
  currentUserId: number
  canViewEnterpriseGovernance: boolean
  canManageEnterpriseGovernance: boolean
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
          enterpriseIaTitle: "企业设置入口与治理面",
          enterpriseIaBody:
            "成员与知识相关配置现在已经在这里直接可管；席位、用量、算力和 SSO 继续先以信息架构入口落位，帮助企业管理员知道这些治理面会落在哪些工作台路径上。",
          tabsTitle: "企业设置板块",
          tabsBody:
            "把企业治理配置拆成清晰的 tab：治理偏好、模型配置、企业管理员面板分别承接，避免管理员在个人设置和平台设置之间来回跳转。",
          governanceTab: "治理设置",
          modelTab: "模型配置",
          adminTab: "企业管理员",
          adminTitle: "企业管理员配置入口",
          adminBody:
            "原来出现在个人设置里的管理员入口已经收回到企业设置。这里同时承接成员审核、权限分配、知识连接和顾问工作流治理。",
          adminMovedTag: "已从个人设置迁移",
          personalSettingsLink: "打开个人设置",
          membersTitle: "企业成员与席位",
          membersBody: "直接显示当前企业总成员数、活跃成员数，以及套餐能提供的 seat 上限。",
          usageTitle: "共享额度与用量",
          usageBody: "把共享 credits、当前计划和近 30 天的 credits 流水压成一个运营视角。",
          ssoTitle: "SSO 就绪状态",
          ssoBody: "这个 MVP 只展示域名和配置状态，不做真实 SSO 强制接入。",
          runtimeStatusTitle: "客户侧运行时可用性",
          runtimeStatusBody: "把客户会直接碰到的能力运行时压成 ready / deferred / runtime_disabled 三档。",
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
          totalMembers: "总成员",
          activeMembers: "活跃成员",
          seatLimit: "Seat 上限",
          recentLedger: "近 30 天流水",
          recentNetCredits: "近 30 天净积分",
          ssoConfigured: "已配置",
          ssoMissing: "未配置",
          domain: "域名",
          notConfigured: "未配置",
          customerSnapshotUnavailable: "企业治理数据暂时不可用。这里明确显示为未配置，而不是伪造 0 或占位数字。",
          settingsUnavailable: "治理设置暂时无法读取，请稍后重试。",
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
          enterpriseIaTitle: "Enterprise settings entry and governance layer",
          enterpriseIaBody:
            "Member and knowledge controls are now directly manageable here, while seats, usage, compute, and SSO still land as information-architecture entry points first.",
          tabsTitle: "Enterprise settings sections",
          tabsBody:
            "Split enterprise controls into clear tabs so governance preferences, model configuration, and admin operations each have a dedicated surface.",
          governanceTab: "Governance",
          modelTab: "Model config",
          adminTab: "Enterprise admin",
          adminTitle: "Enterprise admin controls",
          adminBody:
            "The admin handoff that used to sit in personal settings now lives here alongside member reviews, permissions, knowledge bindings, and advisor workflow governance.",
          adminMovedTag: "Moved from personal settings",
          personalSettingsLink: "Open personal settings",
          membersTitle: "Members and seats",
          membersBody: "Show the company member footprint directly: total members, active members, and the seat limit available on the current plan.",
          usageTitle: "Shared credits and usage",
          usageBody: "Compress shared credits, current plan, and 30-day credit ledger activity into one operational view.",
          ssoTitle: "SSO readiness",
          ssoBody: "This MVP only shows the domain and readiness state. It does not enforce real SSO yet.",
          runtimeStatusTitle: "Customer runtime availability",
          runtimeStatusBody: "Collapse customer-facing capability runtimes into ready / deferred / runtime_disabled states.",
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
          totalMembers: "Total members",
          activeMembers: "Active members",
          seatLimit: "Seat limit",
          recentLedger: "30-day ledger",
          recentNetCredits: "30-day net credits",
          ssoConfigured: "Configured",
          ssoMissing: "Not configured",
          domain: "Domain",
          notConfigured: "Not configured",
          customerSnapshotUnavailable:
            "Customer governance data is currently unavailable. This surface stays explicitly unconfigured instead of showing fake zero values.",
          settingsUnavailable: "Governance settings are temporarily unavailable. Try again later.",
        }

  const customerDataAvailable = Boolean(customerSnapshot)
  const customerNotConfigured = copy.notConfigured
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
      <section className="public-grid-bg workspace-page-shell mx-auto max-w-7xl">
        <div className="workspace-stack">
          <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
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
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
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

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
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

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
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

          <div className="grid gap-4 xl:grid-cols-4">
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.membersTitle}</div>
              <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {customerSnapshot ? formatNumber(customerSnapshot.members.active) : customerNotConfigured}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.membersBody}</p>
              <div className="mt-4 space-y-2">
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.totalMembers}: {customerSnapshot ? formatNumber(customerSnapshot.members.total) : customerNotConfigured}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.activeMembers}: {customerSnapshot ? formatNumber(customerSnapshot.members.active) : customerNotConfigured}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.seatLimit}: {customerSnapshot ? formatNumberOrFallback(customerSnapshot.members.seatLimit, customerNotConfigured) : customerNotConfigured}
                </div>
                {!customerDataAvailable ? (
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {copy.customerSnapshotUnavailable}
                  </div>
                ) : null}
              </div>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.usageTitle}</div>
              <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {customerSnapshot ? formatNumberOrFallback(customerSnapshot.usage.sharedCredits, customerNotConfigured) : customerNotConfigured}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.usageBody}</p>
              <div className="mt-4 space-y-2">
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.plan}: {customerSnapshot ? customerSnapshot.usage.currentPlan || customerNotConfigured : customerNotConfigured}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.recentLedger}: {customerSnapshot ? formatNumberOrFallback(customerSnapshot.usage.recentLedgerEntries, customerNotConfigured) : customerNotConfigured}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.recentNetCredits}: {customerSnapshot ? formatNumberOrFallback(customerSnapshot.usage.recentLedgerNetCredits, customerNotConfigured) : customerNotConfigured}
                </div>
              </div>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.ssoTitle}</div>
              <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {customerSnapshot ? (customerSnapshot.sso.status === "configured" ? copy.ssoConfigured : copy.ssoMissing) : customerNotConfigured}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.ssoBody}</p>
              <div className="mt-4 space-y-2">
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.domain}: {customerSnapshot ? customerSnapshot.sso.domain || customerNotConfigured : customerNotConfigured}
                </div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                  {copy.status}: {customerSnapshot ? (customerSnapshot.sso.status === "configured" ? copy.ssoConfigured : copy.ssoMissing) : customerNotConfigured}
                </div>
              </div>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.runtimeStatusTitle}</div>
              <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {customerSnapshot ? String(customerSnapshot.runtimes.length) : customerNotConfigured}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.runtimeStatusBody}</p>
              <div className="mt-4 space-y-2">
                {customerSnapshot ? customerSnapshot.runtimes.map((item) => (
                  <div key={item.slug} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {item.slug}: {getCustomerRuntimeStatusLabel(item.status, displayLocale)}
                  </div>
                )) : (
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {copy.customerSnapshotUnavailable}
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 p-5">
            <div className="dashboard-kicker text-muted-foreground">{copy.tabsTitle}</div>
            <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
              {copy.tabsTitle}
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">{copy.tabsBody}</p>

            <Tabs defaultValue="governance" className="mt-6 space-y-5">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-[10px] bg-muted/60 p-1">
                <TabsTrigger value="governance" className="h-10 min-w-[120px] rounded-[8px] px-4">
                  {copy.governanceTab}
                </TabsTrigger>
                <TabsTrigger value="models" className="h-10 min-w-[120px] rounded-[8px] px-4">
                  {copy.modelTab}
                </TabsTrigger>
                <TabsTrigger value="admin" className="h-10 min-w-[120px] rounded-[8px] px-4">
                  {copy.adminTab}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="governance" className="space-y-5">
                <div className="dashboard-panel rounded-[10px] border border-border bg-background/70 p-4">
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

                {customerSnapshot ? (
                  <PlatformGovernanceSettingsPanel
                    locale={locale}
                    snapshot={customerSnapshot}
                    visibleSections={["governance"]}
                  />
                ) : (
                  <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                    <div className="dashboard-kicker text-muted-foreground">{copy.settingsTitle}</div>
                    <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {customerNotConfigured}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.settingsUnavailable}</p>
                  </article>
                )}
              </TabsContent>

              <TabsContent value="models" className="space-y-5">
                {customerSnapshot ? (
                  <PlatformGovernanceSettingsPanel
                    locale={locale}
                    snapshot={customerSnapshot}
                    runtimeProviders={snapshot.runtime.providers}
                    visibleSections={["models"]}
                    initialCategory="text_generation"
                  />
                ) : (
                  <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                    <div className="dashboard-kicker text-muted-foreground">{copy.modelTab}</div>
                    <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {customerNotConfigured}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-muted-foreground">{copy.settingsUnavailable}</p>
                  </article>
                )}
              </TabsContent>

              <TabsContent value="admin" className="space-y-5">
                <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 p-5">
                  <div className="dashboard-kicker text-muted-foreground">{copy.adminMovedTag}</div>
                  <h3 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {copy.adminTitle}
                  </h3>
                  <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">{copy.adminBody}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button className="public-button-primary h-10 px-4" asChild>
                      <Link href="/dashboard/settings">
                        <Settings className="mr-2 h-4 w-4" />
                        {copy.personalSettingsLink}
                      </Link>
                    </Button>
                  </div>
                </article>

                <EnterpriseMemberGovernancePanel
                  locale={locale}
                  currentUserId={currentUserId}
                  canManage={canManageEnterpriseGovernance}
                />

                <EnterpriseKnowledgeGovernancePanel
                  locale={locale}
                  currentUserId={currentUserId}
                  canView={canViewEnterpriseGovernance}
                  canManage={canManageEnterpriseGovernance}
                />

                <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 p-5">
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
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>
    </div>
  )
}
