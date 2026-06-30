"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock3,
  CreditCard,
  Database,
  Eye,
  KeyRound,
  LayoutGrid,
  Network,
  Route,
  Save,
  Settings,
  ShieldCheck,
  TestTube2,
  Users2,
  Zap,
  Workflow,
} from "lucide-react"

import { EnterpriseKnowledgeGovernancePanel } from "@/components/platform/enterprise-knowledge-governance-panel"
import { EnterpriseMemberGovernancePanel } from "@/components/platform/enterprise-member-governance-panel"
import { PlatformGovernanceSettingsPanel } from "@/components/platform/platform-governance-settings-panel"
import { WorkspaceWorkflowTemplateStudio } from "@/components/platform/workspace-workflow-template-studio"
import { Button } from "@/components/ui/button"
import type { AppLocale } from "@/lib/i18n/config"
import type { CustomerGovernanceSnapshot } from "@/lib/platform/customer-governance"
import type { PlatformGovernanceSnapshot } from "@/lib/platform/governance"
import { getLocalizedWorkspaceEnterpriseSettingEntries } from "@/lib/platform/workspace-enterprise-settings"

function formatNumber(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("en-US").format(value)
}

function formatPercent(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—"
  return `${Math.round(value * 100)}%`
}

function formatDuration(value: number | null, locale: "zh" | "en") {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return "—"
  const seconds = Math.round(value / 1000)
  if (seconds < 60) return locale === "zh" ? `${seconds} 秒` : `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainderSeconds = seconds % 60
  return locale === "zh" ? `${minutes} 分 ${remainderSeconds} 秒` : `${minutes}m ${remainderSeconds}s`
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

function getRuntimeProviderLabel(provider: PlatformGovernanceSnapshot["runtime"]["providers"][number]) {
  if (provider.id === "pptoken") return "PPToken"
  if (provider.id === "openrouter") return "OpenRouter"
  if (provider.id === "aiberm") return "AIBERM"
  if (provider.id === "crazyroute") return "Crazyroute"
  if (provider.id === "runninghub-image") return "RunningHub Image"
  if (provider.id === "runninghub-video") return "RunningHub Video"
  if (provider.id === "minimax-video") return "MiniMax Hailuo Video"
  if (provider.id === "minimax-audio") return "MiniMax Audio"
  if (provider.id === "fixture") return "Fixture"
  return provider.id
}

function SettingsMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "neutral",
}: {
  icon: typeof Activity
  label: string
  value: string
  helper: string
  tone?: "neutral" | "success" | "warning"
}) {
  return (
    <article className="dashboard-panel relative overflow-hidden rounded-[14px] border border-[#e7e7df] bg-white p-4 shadow-[0_10px_28px_rgba(0,0,0,0.045)]">
      <div className="flex items-start gap-3">
        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-[#ffd000] text-[#111] [clip-path:polygon(0_0,88%_0,100%_14%,100%_100%,0_100%)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[11px] font-black uppercase tracking-[0.12em] text-[#6f6f6f]">
            {label}
          </div>
          <div className="mt-2 truncate font-display text-2xl font-black uppercase leading-none text-[#111]">
            {value}
          </div>
          <div
            className={
              tone === "success"
                ? "mt-2 text-xs font-semibold text-[#25a85a]"
                : tone === "warning"
                  ? "mt-2 text-xs font-semibold text-[#8a7500]"
                  : "mt-2 text-xs text-[#6f6f6f]"
            }
          >
            {helper}
          </div>
        </div>
      </div>
    </article>
  )
}

function SettingsSideCard({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <aside className="rounded-2xl border border-[#e7e7df] bg-white p-4 shadow-[0_10px_26px_rgba(0,0,0,0.04)]">
      <div className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-[#777]">{label}</div>
      <div className="mt-3">{children}</div>
    </aside>
  )
}

function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string
  tone?: "success" | "warning" | "danger" | "neutral"
}) {
  const className =
    tone === "success"
      ? "border-[#ccefd7] bg-[#eefaf2] text-[#168449]"
      : tone === "danger"
        ? "border-[#ffd6d6] bg-[#fff0f0] text-[#d93025]"
        : tone === "warning"
          ? "border-[#efe6a8] bg-[#fffbe5] text-[#8a7500]"
          : "border-[#e5e5dc] bg-[#f5f5ef] text-[#555]"
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-extrabold uppercase ${className}`}>
      <span className={tone === "success" ? "h-1.5 w-1.5 rounded-full bg-[#25a85a]" : "h-1.5 w-1.5 rounded-full bg-current"} />
      {label}
    </span>
  )
}

function SettingsSectionCard({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section id={id} className="settings-section-card scroll-mt-6 rounded-2xl border border-[#e7e7df] bg-white p-5 shadow-[0_14px_34px_rgba(0,0,0,0.045)] lg:p-6">
      <div className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-[#777]">{eyebrow}</div>
      <h2 className="mt-2 font-display text-3xl font-black uppercase leading-none text-[#111]">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#666]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function HashNavLink({
  href,
  active = false,
  className,
  activeClassName,
  inactiveClassName,
  onActivate,
  children,
}: {
  href: string
  active?: boolean
  className?: string
  activeClassName: string
  inactiveClassName: string
  onActivate?: (hash: string) => void
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "location" : undefined}
      onClick={() => {
        const nextHash = href.replace(/^.*#/, "").trim()
        if (nextHash) onActivate?.(nextHash)
      }}
      className={[
        className,
        active ? activeClassName : inactiveClassName,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd000] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Link>
  )
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
  const configuredProviderCount = snapshot.runtime.providers.filter((provider) => provider.configured).length
  const activeProviderCount = snapshot.runtime.providers.filter((provider) => provider.active).length
  const readyRuntimeCount = customerSnapshot?.runtimes.filter((runtime) => runtime.status === "ready").length ?? 0
  const degradedRuntimeCount = customerSnapshot?.runtimes.filter((runtime) => runtime.status === "deferred").length ?? 0
  const disabledRuntimeCount = customerSnapshot?.runtimes.filter((runtime) => runtime.status === "runtime_disabled").length ?? 0
  const defaultRouteRows = customerSnapshot
    ? ([
        ["Text generation", "text_generation"],
        ["Image generation", "image_generation"],
        ["Video generation", "video_generation"],
        ["Audio generation", "audio_generation"],
      ] as const).map(([label, category]) => {
        const config = customerSnapshot.settings.modelConfig[category]
        const providerId = config.selectedProviderId || config.providers[0]?.providerId || "—"
        const provider = config.providers.find((item) => item.providerId === providerId) || config.providers[0]
        return {
          label,
          provider: provider?.label || providerId,
          model: config.selectedModelId || provider?.modelId || "—",
          fallback: config.providers.find((item) => item.providerId !== providerId && item.enabled)?.label || "—",
          active: Boolean(provider?.enabled || config.selectedProviderId),
        }
      })
    : []
  const providerRows = snapshot.runtime.providers.slice(0, 9)
  const updatedAt = customerSnapshot?.settings.updatedAt
    ? new Date(customerSnapshot.settings.updatedAt).toLocaleString(displayLocale === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null
  const settingsAreas = useMemo(
    () =>
      displayLocale === "zh"
        ? [
            ["governance", "治理设置", ShieldCheck],
            ["model-routing", "模型路由", Route],
            ["runtime-availability", "运行时可用性", Activity],
            ["workflow-governance", "工作流治理", Workflow],
            ["enterprise-admin", "企业管理员", Users2],
          ]
        : [
            ["governance", "Governance", ShieldCheck],
            ["model-routing", "Model Routing", Route],
            ["runtime-availability", "Runtime Availability", Activity],
            ["workflow-governance", "Workflow Governance", Workflow],
            ["enterprise-admin", "Enterprise admin", Users2],
          ],
    [displayLocale],
  )
  const onThisPage = useMemo(
    () =>
      displayLocale === "zh"
        ? [
            ["overview", "配置概览"],
            ["model-routing", "模型路由"],
            ["default-routes", "默认路由"],
            ["providers", "Provider 配置"],
            ["runtime-availability", "运行时可用性"],
            ["workflow-governance", "工作流治理"],
            ["admin-controls", "企业治理"],
          ]
        : [
            ["overview", "Settings overview"],
            ["model-routing", "Model routing"],
            ["default-routes", "Default routes"],
            ["providers", "Provider configuration"],
            ["runtime-availability", "Runtime availability"],
            ["workflow-governance", "Workflow governance"],
            ["admin-controls", "Enterprise controls"],
          ],
    [displayLocale],
  )
  const validHashTargets = useMemo(
    () =>
      new Set([
        ...settingsAreas.map(([id]) => String(id)),
        ...onThisPage.map(([id]) => String(id)),
      ]),
    [onThisPage, settingsAreas],
  )
  const [activeHash, setActiveHash] = useState("overview")

  useEffect(() => {
    const syncHash = () => {
      const nextHash = window.location.hash.replace(/^#/, "").trim()
      setActiveHash(nextHash && validHashTargets.has(nextHash) ? nextHash : "overview")
    }

    syncHash()
    window.addEventListener("hashchange", syncHash)
    return () => window.removeEventListener("hashchange", syncHash)
  }, [validHashTargets])

  const activeTopLevelSection = useMemo(() => {
    if (settingsAreas.some(([id]) => String(id) === activeHash)) {
      return activeHash
    }
    if (activeHash === "default-routes" || activeHash === "providers" || activeHash === "routing-rules" || activeHash === "provider-editor") {
      return "model-routing"
    }
    if (activeHash === "workflow-governance") {
      return "workflow-governance"
    }
    if (activeHash === "admin-controls") {
      return "enterprise-admin"
    }
    return "overview"
  }, [activeHash, settingsAreas])
  const ui =
    displayLocale === "zh"
      ? {
          policyAudit: "策略审计日志",
          saveAll: "保存全部变更",
          metricCredits: "Credits & Billing",
          metricRuntime: "Runtime Health",
          metricAdmin: "Admin Access",
          metricVisibility: "Visibility Rules",
          metricProviders: "Active Providers",
          metricByok: "BYOK Enabled",
          availableCredits: "可用共享额度",
          readyRuntimes: "Ready runtimes",
          adminMode: "管理员控制",
          registryVisible: "目录可见规则",
          providerHelper: "可用 provider",
          byokHelper: "API Key 配置状态",
          settingsAreas: "Settings Areas",
          onThisPage: "On This Page",
          currentScope: "Current Scope",
          saveStatus: "Save Status",
          scopeName: "Enterprise workspace",
          scopeMeta: "Global HQ · Platform governance",
          changeScope: "Change scope",
          saved: "All changes saved",
          unsaved: "等待首次保存",
          viewHistory: "View change history",
          overviewTitle: "Enterprise Settings",
          overviewBody: "查看企业配置状态、切换配置域，并在同一控制台内验证模型、运行时、权限和计费治理。",
          routingTitle: "Model Routing",
          routingBody: "配置模型供应商、设置不同任务默认路由，并用模拟器验证当前路由是否符合企业策略。",
          enabledProviders: "Enabled Providers",
          defaultRoutes: "Default Routes",
          routingMode: "Routing Mode",
          totalModels: "Total Models",
          lastUpdated: "Last Updated",
          smartRouting: "Smart cost + quality",
          defaultRoutesTab: "Default routes",
          providersTab: "Providers",
          rulesTab: "Routing rules",
          insightsTab: "Usage insights",
          taskType: "Task Type",
          primary: "Primary Provider / Model",
          fallback: "Fallback",
          status: "Status",
          actions: "Actions",
          edit: "Edit",
          provider: "Provider",
          baseUrl: "Base URL",
          models: "Models",
          lastSync: "Last Sync",
          routingRules: "Routing Rules",
          simulator: "Routing Simulator",
          simulate: "Simulate",
          simulatorBody: "选择任务类型后，可在右侧验证默认路由、fallback 路径和预估风险。",
          runtimeTitle: "Runtime Availability",
          runtimeBody: "Runtime Availability 只回答产品能力是否可用；Model Routing 负责模型供应商和默认模型。",
          capability: "Capability",
          runtime: "Runtime",
          availability: "Availability",
          lastCheck: "Last Check",
          adminTitle: "Enterprise Admin Controls",
          adminBody: "成员、知识、席位和治理偏好保留真实管理入口，避免管理员在个人设置和平台设置之间跳转。",
          workflowTitle: "Workflow Governance",
          workflowBody: "把最近工作流运行、成功率、质量门覆盖、审查规则和知识闭环压成一个企业运营视角。",
          workflowCoverage: "Workflow coverage",
          workflowRuns: "Recent workflow runs",
          workflowSuccess: "Recent success rate",
          workflowDuration: "Avg run duration",
          workflowCredits: "Recent credits",
          workflowKnowledge: "Knowledge loop coverage",
          workflowAssets: "Asset retention",
          workflowTableTitle: "Workflow performance",
          workflowStatus: "Status",
          workflowRunsCol: "Runs",
          workflowSuccessCol: "Success",
          workflowCreditsCol: "Avg credits",
          workflowKnowledgeCol: "Knowledge",
        }
      : {
          policyAudit: "Policy audit log",
          saveAll: "Save all changes",
          metricCredits: "Credits & Billing",
          metricRuntime: "Runtime Health",
          metricAdmin: "Admin Access",
          metricVisibility: "Visibility Rules",
          metricProviders: "Active Providers",
          metricByok: "BYOK Enabled",
          availableCredits: "Available shared credits",
          readyRuntimes: "Ready runtimes",
          adminMode: "Admin control",
          registryVisible: "Directory visibility rules",
          providerHelper: "Configured providers",
          byokHelper: "API key posture",
          settingsAreas: "Settings Areas",
          onThisPage: "On This Page",
          currentScope: "Current Scope",
          saveStatus: "Save Status",
          scopeName: "Enterprise workspace",
          scopeMeta: "Global HQ · Platform governance",
          changeScope: "Change scope",
          saved: "All changes saved",
          unsaved: "Waiting for first save",
          viewHistory: "View change history",
          overviewTitle: "Enterprise Settings",
          overviewBody: "Review enterprise configuration state, switch configuration domains, and validate model, runtime, permission, and billing governance from one control surface.",
          routingTitle: "Model Routing",
          routingBody: "Configure model providers, set default routes for task types, and verify routing behavior before admins rely on it.",
          enabledProviders: "Enabled Providers",
          defaultRoutes: "Default Routes",
          routingMode: "Routing Mode",
          totalModels: "Total Models",
          lastUpdated: "Last Updated",
          smartRouting: "Smart cost + quality",
          defaultRoutesTab: "Default routes",
          providersTab: "Providers",
          rulesTab: "Routing rules",
          insightsTab: "Usage insights",
          taskType: "Task Type",
          primary: "Primary Provider / Model",
          fallback: "Fallback",
          status: "Status",
          actions: "Actions",
          edit: "Edit",
          provider: "Provider",
          baseUrl: "Base URL",
          models: "Models",
          lastSync: "Last Sync",
          routingRules: "Routing Rules",
          simulator: "Routing Simulator",
          simulate: "Simulate",
          simulatorBody: "Pick a task type to validate the primary route, fallback path, and operational risk before changes go live.",
          runtimeTitle: "Runtime Availability",
          runtimeBody: "Runtime Availability answers whether a product capability is usable. Model Routing controls provider and model choice.",
          capability: "Capability",
          runtime: "Runtime",
          availability: "Availability",
          lastCheck: "Last Check",
          adminTitle: "Enterprise Admin Controls",
          adminBody: "Member, knowledge, seat, and governance controls stay directly manageable here instead of scattering admin work across personal settings.",
          workflowTitle: "Workflow Governance",
          workflowBody:
            "Compress recent workflow runs, success rate, quality-gate coverage, review rules, and knowledge-loop signals into one enterprise operating view.",
          workflowCoverage: "Workflow coverage",
          workflowRuns: "Recent workflow runs",
          workflowSuccess: "Recent success rate",
          workflowDuration: "Avg run duration",
          workflowCredits: "Recent credits",
          workflowKnowledge: "Knowledge loop coverage",
          workflowAssets: "Asset retention",
          workflowTableTitle: "Workflow performance",
          workflowStatus: "Status",
          workflowRunsCol: "Runs",
          workflowSuccessCol: "Success",
          workflowCreditsCol: "Avg credits",
          workflowKnowledgeCol: "Knowledge",
        }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between" id="overview">
            <div>
              <div className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-[#6f6f6f]">
                {copy.eyebrow}
              </div>
              <h1 className="mt-2 font-display text-5xl font-black uppercase leading-none text-[#111] lg:text-6xl">
                {ui.overviewTitle}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#666] lg:text-base">{ui.overviewBody}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="h-10 rounded-lg border-[#deded6] bg-white px-4 font-display text-xs font-black uppercase text-[#111]" asChild>
                <Link href="/dashboard/platform-settings/usage">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {ui.policyAudit}
                </Link>
              </Button>
              <Button className="public-button-primary h-10 px-4" asChild>
                <Link href="#model-routing">
                  <Save className="mr-2 h-4 w-4" />
                  {ui.saveAll}
                </Link>
              </Button>
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <SettingsMetricCard icon={CreditCard} label={ui.metricCredits} value={formatNumber(snapshot.billing.availableCredits)} helper={ui.availableCredits} />
            <SettingsMetricCard icon={Activity} label={ui.metricRuntime} value={`${readyRuntimeCount}/${customerSnapshot?.runtimes.length ?? snapshot.runtime.tasks.length}`} helper={ui.readyRuntimes} tone={readyRuntimeCount > 0 ? "success" : "warning"} />
            <SettingsMetricCard icon={ShieldCheck} label={ui.metricAdmin} value={canManageEnterpriseGovernance ? "Active" : "Read only"} helper={ui.adminMode} tone={canManageEnterpriseGovernance ? "success" : "neutral"} />
            <SettingsMetricCard icon={Eye} label={ui.metricVisibility} value={formatNumber(snapshot.registry.reduce((total, item) => total + item.counts.workspaceVisible, 0))} helper={ui.registryVisible} />
            <SettingsMetricCard icon={Network} label={ui.metricProviders} value={`${activeProviderCount}/${configuredProviderCount}`} helper={ui.providerHelper} tone={activeProviderCount > 0 ? "success" : "warning"} />
            <SettingsMetricCard icon={KeyRound} label={ui.metricByok} value={configuredProviderCount > 0 ? "On" : "Off"} helper={ui.byokHelper} tone={configuredProviderCount > 0 ? "success" : "warning"} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
            <div className="space-y-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:overflow-y-auto">
              <SettingsSideCard label={ui.settingsAreas}>
                <nav className="space-y-1">
                  {settingsAreas.map(([id, label, Icon]) => (
                    <HashNavLink
                      key={String(id)}
                      href={`#${id}`}
                      active={activeTopLevelSection === id}
                      onActivate={setActiveHash}
                      className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm transition"
                      activeClassName="bg-[#111] font-extrabold text-[#ffd000]"
                      inactiveClassName="font-bold text-[#111] hover:bg-[#ffd000]/35"
                    >
                      <Icon className="h-4 w-4" />
                      {String(label)}
                    </HashNavLink>
                  ))}
                </nav>
              </SettingsSideCard>

              <SettingsSideCard label={ui.onThisPage}>
                <nav className="space-y-1">
                  {onThisPage.map(([id, label]) => (
                    <HashNavLink
                      key={id}
                      href={`#${id}`}
                      active={activeHash === id}
                      onActivate={setActiveHash}
                      className="flex h-8 items-center gap-2 text-xs transition"
                      activeClassName="font-bold text-[#111]"
                      inactiveClassName="text-[#666] hover:text-[#111]"
                    >
                      <span
                        className={
                          activeHash === id
                            ? "h-2 w-2 rounded-full bg-[#ffd000]"
                            : "h-2 w-2 rounded-full border border-[#d8d8d0]"
                        }
                      />
                      {label}
                    </HashNavLink>
                  ))}
                </nav>
              </SettingsSideCard>

              <SettingsSideCard label={ui.currentScope}>
                <div className="space-y-2">
                  <div className="text-sm font-black text-[#111]">{ui.scopeName}</div>
                  <div className="text-xs leading-5 text-[#666]">{customerSnapshot?.sso.domain || ui.scopeMeta}</div>
                  <Button variant="outline" className="mt-2 h-9 w-full rounded-lg border-[#deded6] bg-white text-xs font-extrabold uppercase" asChild>
                    <Link href="/dashboard/platform-settings/sso">{ui.changeScope}</Link>
                  </Button>
                </div>
              </SettingsSideCard>

              <SettingsSideCard label={ui.saveStatus}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-black text-[#25a85a]">
                    <CheckCircle2 className="h-4 w-4" />
                    {updatedAt ? ui.saved : ui.unsaved}
                  </div>
                  <div className="text-xs text-[#666]">{updatedAt || copy.notConfigured}</div>
                  <Button variant="outline" className="mt-2 h-9 w-full rounded-lg border-[#deded6] bg-white text-xs font-extrabold uppercase" asChild>
                    <Link href="/dashboard/platform-settings/usage">{ui.viewHistory}</Link>
                  </Button>
                </div>
              </SettingsSideCard>
            </div>

            <main className="space-y-6">
              <SettingsSectionCard id="governance" eyebrow="GOVERNANCE" title={copy.governanceTab} description={copy.settingsBody}>
                <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                  <div className="rounded-xl border border-[#e7e7df] bg-[#fafaf7] p-4">
                    <div className="font-display text-xl font-black uppercase text-[#111]">{copy.settingsTitle}</div>
                    <p className="mt-2 text-sm leading-6 text-[#666]">{copy.settingsBody}</p>
                    <div className="mt-4 grid gap-2">
                      {governanceLinks.map((item) => {
                        const Icon = item.icon
                        return (
                          <Button key={item.slug} variant="outline" className="h-10 justify-start rounded-lg border-[#deded6] bg-white font-bold" asChild>
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
                    <PlatformGovernanceSettingsPanel locale={locale} snapshot={customerSnapshot} visibleSections={["governance"]} />
                  ) : (
                    <div className="rounded-xl border border-[#e7e7df] bg-white p-5 text-sm leading-6 text-[#666]">
                      {copy.settingsUnavailable}
                    </div>
                  )}
                </div>
              </SettingsSectionCard>

              <SettingsSectionCard id="model-routing" eyebrow="MODEL ROUTING" title={ui.routingTitle} description={ui.routingBody}>
                <div className="grid overflow-hidden rounded-[14px] border border-[#e7e7df] bg-white sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    [ui.enabledProviders, `${configuredProviderCount} of ${snapshot.runtime.providers.length}`],
                    [ui.defaultRoutes, `${defaultRouteRows.filter((row) => row.active).length} tasks`],
                    [ui.routingMode, ui.smartRouting],
                    [ui.totalModels, String(snapshot.runtime.providers.filter((provider) => provider.model).length)],
                    [ui.lastUpdated, updatedAt || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="border-b border-r border-[#ededE7] p-4 last:border-r-0 xl:border-b-0">
                      <div className="font-display text-[10px] font-black uppercase tracking-[0.12em] text-[#777]">{label}</div>
                      <div className="mt-2 text-sm font-black text-[#111]">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-6 border-b border-[#e7e7df]">
                  {[ui.defaultRoutesTab, ui.providersTab, ui.rulesTab, ui.insightsTab].map((tab, index) => (
                    <HashNavLink
                      key={tab}
                      href={index === 0 ? "#default-routes" : index === 1 ? "#providers" : "#routing-rules"}
                      active={
                        (index === 0 && (activeHash === "model-routing" || activeHash === "default-routes")) ||
                        (index === 1 && activeHash === "providers") ||
                        (index >= 2 && (activeHash === "routing-rules" || activeHash === "provider-editor"))
                      }
                      onActivate={setActiveHash}
                      className="py-3 text-sm"
                      activeClassName="border-b-2 border-[#ffd000] font-black text-[#111]"
                      inactiveClassName="font-extrabold text-[#666]"
                    >
                      {tab}
                    </HashNavLink>
                  ))}
                </div>

                <div id="default-routes" className="mt-5 overflow-hidden rounded-xl border border-[#ededE7]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#fafaf7] text-xs font-black uppercase text-[#555]">
                      <tr>
                        <th className="px-4 py-3">{ui.taskType}</th>
                        <th className="px-4 py-3">{ui.primary}</th>
                        <th className="px-4 py-3">{ui.fallback}</th>
                        <th className="px-4 py-3">{ui.status}</th>
                        <th className="px-4 py-3">{ui.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defaultRouteRows.map((row) => (
                        <tr key={row.label} className="border-t border-[#ededE7]">
                          <td className="px-4 py-4 font-bold text-[#111]">{row.label}</td>
                          <td className="px-4 py-4 text-[#333]">{row.provider} / {row.model}</td>
                          <td className="px-4 py-4 text-[#666]">{row.fallback}</td>
                          <td className="px-4 py-4"><StatusBadge label={row.active ? "Active" : "Disabled"} tone={row.active ? "success" : "neutral"} /></td>
                          <td className="px-4 py-4"><a href="#provider-editor" className="font-black uppercase text-[#111] underline decoration-[#c9a400] underline-offset-4">{ui.edit}</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div id="providers" className="mt-5 overflow-hidden rounded-xl border border-[#ededE7]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#fafaf7] text-xs font-black uppercase text-[#555]">
                      <tr>
                        <th className="px-4 py-3">{ui.provider}</th>
                        <th className="px-4 py-3">{ui.status}</th>
                        <th className="px-4 py-3">{ui.baseUrl}</th>
                        <th className="px-4 py-3">{ui.models}</th>
                        <th className="px-4 py-3">{ui.lastSync}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerRows.map((provider) => (
                        <tr key={provider.id} className="border-t border-[#ededE7]">
                          <td className="px-4 py-4 font-bold text-[#111]">{getRuntimeProviderLabel(provider)}</td>
                          <td className="px-4 py-4"><StatusBadge label={provider.configured ? "Active" : "Disabled"} tone={provider.configured ? "success" : "neutral"} /></td>
                          <td className="max-w-[220px] truncate px-4 py-4 text-[#666]">{provider.baseURL || "••••••••••••••"}</td>
                          <td className="px-4 py-4 text-[#333]">{provider.model || "—"}</td>
                          <td className="px-4 py-4 text-[#666]">{provider.active ? "Live route" : "On demand"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div id="routing-rules" className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-xl border border-[#e7e7df] bg-[#fafaf7] p-4">
                    <div className="font-display text-xl font-black uppercase text-[#111]">{ui.routingRules}</div>
                    <div className="mt-4 space-y-3">
                      {enterpriseSettings.map((item, index) => (
                        <div key={item.slug} className="rounded-lg border border-[#e7e7df] bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-bold text-[#111]">{item.title}</div>
                            <StatusBadge label={index === 2 ? "Active" : "Ready"} tone="success" />
                          </div>
                          <div className="mt-1 text-xs leading-5 text-[#666]">{item.summary}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#111] bg-[#111] p-4 text-white">
                    <div className="font-display text-xl font-black uppercase">{ui.simulator}</div>
                    <p className="mt-2 text-sm leading-6 text-white/70">{ui.simulatorBody}</p>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-lg border border-white/15 bg-white/8 p-3 text-sm">Workspace: {ui.scopeName}</div>
                      <div className="rounded-lg border border-white/15 bg-white/8 p-3 text-sm">Task type: Video generation</div>
                      <div className="rounded-lg border border-[#ffd000]/40 bg-[#ffd000] p-3 text-sm font-black text-[#111]">
                        Primary: {defaultRouteRows.find((row) => row.label === "Video generation")?.provider || "MiniMax"} / {defaultRouteRows.find((row) => row.label === "Video generation")?.model || "Hailuo"}
                      </div>
                      <Button className="h-10 w-full rounded-lg border border-[#c9a400] bg-[#ffd000] font-black uppercase text-[#111]">
                        <TestTube2 className="mr-2 h-4 w-4" />
                        {ui.simulate}
                      </Button>
                    </div>
                  </div>
                </div>

                <div id="provider-editor" className="mt-5">
                  {customerSnapshot ? (
                    <PlatformGovernanceSettingsPanel
                      locale={locale}
                      snapshot={customerSnapshot}
                      runtimeProviders={snapshot.runtime.providers}
                      visibleSections={["models"]}
                      initialCategory="text_generation"
                    />
                  ) : (
                    <div className="rounded-xl border border-[#e7e7df] bg-white p-5 text-sm leading-6 text-[#666]">
                      {copy.settingsUnavailable}
                    </div>
                  )}
                </div>
              </SettingsSectionCard>

              <SettingsSectionCard id="runtime-availability" eyebrow="RUNTIME AVAILABILITY" title={ui.runtimeTitle} description={ui.runtimeBody}>
                <div className="grid gap-4 md:grid-cols-4">
                  <SettingsMetricCard icon={CheckCircle2} label="Ready" value={String(readyRuntimeCount)} helper="Available now" tone="success" />
                  <SettingsMetricCard icon={Clock3} label="Degraded" value={String(degradedRuntimeCount)} helper="Deferred runtime" tone="warning" />
                  <SettingsMetricCard icon={Circle} label="Disabled" value={String(disabledRuntimeCount)} helper="Runtime disabled" />
                  <SettingsMetricCard icon={Zap} label="Maintenance" value="0" helper="No windows" tone="success" />
                </div>
                <div className="mt-5 overflow-hidden rounded-xl border border-[#ededE7]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#fafaf7] text-xs font-black uppercase text-[#555]">
                      <tr>
                        <th className="px-4 py-3">{ui.capability}</th>
                        <th className="px-4 py-3">{ui.status}</th>
                        <th className="px-4 py-3">{ui.runtime}</th>
                        <th className="px-4 py-3">{ui.availability}</th>
                        <th className="px-4 py-3">{ui.lastCheck}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(customerSnapshot?.runtimes || []).map((item) => (
                        <tr key={item.slug} className="border-t border-[#ededE7]">
                          <td className="px-4 py-4 font-bold text-[#111]">{item.slug}</td>
                          <td className="px-4 py-4">
                            <StatusBadge
                              label={getCustomerRuntimeStatusLabel(item.status, displayLocale)}
                              tone={item.status === "ready" ? "success" : item.status === "deferred" ? "warning" : "neutral"}
                            />
                          </td>
                          <td className="px-4 py-4 text-[#333]">{snapshot.runtime.tasks.find((task) => task.capabilitySlug === item.slug)?.mode || "platform"}</td>
                          <td className="px-4 py-4 text-[#666]">{item.status === "ready" ? "Available" : item.status}</td>
                          <td className="px-4 py-4 text-[#666]">{updatedAt || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SettingsSectionCard>

              {snapshot.workflows ? (
                <SettingsSectionCard id="workflow-governance" eyebrow="WORKFLOW GOVERNANCE" title={ui.workflowTitle} description={ui.workflowBody}>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <SettingsMetricCard icon={Workflow} label={ui.workflowCoverage} value={String(snapshot.workflows.totalWorkflowCount)} helper={`${snapshot.workflows.liveWorkflowCount} live`} />
                    <SettingsMetricCard icon={Activity} label={ui.workflowRuns} value={String(snapshot.workflows.recentRunCount)} helper={`${snapshot.workflows.recentSucceededRunCount} succeeded / ${snapshot.workflows.recentFailedRunCount} failed`} tone="success" />
                    <SettingsMetricCard icon={CheckCircle2} label={ui.workflowSuccess} value={formatPercent(snapshot.workflows.recentSuccessRate)} helper={ui.workflowSuccess} tone="success" />
                    <SettingsMetricCard icon={Clock3} label={ui.workflowDuration} value={formatDuration(snapshot.workflows.recentAverageDurationMs, displayLocale)} helper={ui.workflowDuration} />
                    <SettingsMetricCard icon={CreditCard} label={ui.workflowCredits} value={formatNumber(snapshot.workflows.recentCreditsConsumed)} helper={ui.workflowCredits} tone="warning" />
                    <SettingsMetricCard icon={Database} label={ui.workflowKnowledge} value={`${snapshot.workflows.workflowsWithKnowledgeLoop}/${snapshot.workflows.totalWorkflowCount}`} helper={ui.workflowKnowledge} />
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-[#e7e7df] bg-[#fafaf7] p-4">
                      <div className="font-display text-xl font-black uppercase text-[#111]">{ui.workflowKnowledge}</div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <StatusBadge label={`${snapshot.workflows.workflowsWithQualityGates} quality-gated`} tone="success" />
                        <StatusBadge label={`${snapshot.workflows.workflowsWithReviewRules} review-ruled`} tone="warning" />
                        <StatusBadge label={`${snapshot.workflows.workflowsWithKnowledgeLoop} knowledge-loop`} tone="success" />
                        <StatusBadge label={`${snapshot.workflows.workflowsWithDefaultPreset} preset-backed`} tone="neutral" />
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-[#666]">
                        <div>{ui.workflowAssets}: {formatNumber(snapshot.workflows.recentArtifactCount)} artifacts / {formatNumber(snapshot.workflows.recentWorkItemCount)} work items</div>
                        <div>{ui.workflowKnowledge}: {formatNumber(snapshot.workflows.recentKnowledgeSaveJobCount)} queued knowledge jobs</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#111] bg-[#111] p-4 text-white">
                      <div className="font-display text-xl font-black uppercase">{ui.workflowTableTitle}</div>
                      <p className="mt-2 text-sm leading-6 text-white/70">{ui.workflowBody}</p>
                      <div className="mt-4 space-y-2">
                        {snapshot.workflows.topWorkflows.slice(0, 4).map((workflow) => (
                          <div key={workflow.workflowId} className="rounded-lg border border-white/15 bg-white/8 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-bold">{workflow.title}</div>
                              <StatusBadge label={workflow.status} tone={workflow.status === "live" ? "success" : workflow.status === "draft" ? "warning" : "neutral"} />
                            </div>
                            <div className="mt-2 text-xs text-white/70">
                              {workflow.runCount} runs · {formatPercent(workflow.successRate)} · {workflow.knowledgeReadNodeCount}/{workflow.knowledgeWriteNodeCount}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 overflow-hidden rounded-xl border border-[#ededE7]">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-[#fafaf7] text-xs font-black uppercase text-[#555]">
                        <tr>
                          <th className="px-4 py-3">{ui.workflowTableTitle}</th>
                          <th className="px-4 py-3">{ui.workflowStatus}</th>
                          <th className="px-4 py-3">{ui.workflowRunsCol}</th>
                          <th className="px-4 py-3">{ui.workflowSuccessCol}</th>
                          <th className="px-4 py-3">{ui.workflowCreditsCol}</th>
                          <th className="px-4 py-3">{ui.workflowKnowledgeCol}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.workflows.topWorkflows.map((workflow) => (
                          <tr key={workflow.workflowId} className="border-t border-[#ededE7]">
                            <td className="px-4 py-4 font-bold text-[#111]">{workflow.title}</td>
                            <td className="px-4 py-4">
                              <StatusBadge label={workflow.status} tone={workflow.status === "live" ? "success" : workflow.status === "draft" ? "warning" : "neutral"} />
                            </td>
                            <td className="px-4 py-4 text-[#333]">{workflow.runCount}</td>
                            <td className="px-4 py-4 text-[#333]">{formatPercent(workflow.successRate)}</td>
                            <td className="px-4 py-4 text-[#333]">{workflow.averageCreditsConsumed.toFixed(1)}</td>
                            <td className="px-4 py-4 text-[#666]">
                              {workflow.knowledgeReadNodeCount}/{workflow.knowledgeWriteNodeCount} · queue {workflow.assetQueueNodeCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SettingsSectionCard>
              ) : null}

              <SettingsSectionCard id="enterprise-admin" eyebrow="ENTERPRISE ADMIN" title={ui.adminTitle} description={ui.adminBody}>
                <div id="admin-controls" className="space-y-5">
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
                  <WorkspaceWorkflowTemplateStudio locale={displayLocale} />
                  <div className="grid gap-4 xl:grid-cols-2">
                    {enterpriseSettings.map((item) => (
                      <article key={item.slug} className="rounded-xl border border-[#e7e7df] bg-[#fafaf7] p-4">
                        <div className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-[#777]">ENTERPRISE SETTINGS</div>
                        <h3 className="mt-2 font-display text-2xl font-black uppercase leading-none text-[#111]">{item.title}</h3>
                        <p className="mt-3 text-sm leading-6 text-[#666]">{item.summary}</p>
                        <Button className="public-button-primary mt-4 h-10 px-4" asChild>
                          <Link href={item.href}>{item.title}</Link>
                        </Button>
                      </article>
                    ))}
                  </div>
                </div>
              </SettingsSectionCard>
            </main>
          </div>
        </div>
      </section>
    </div>
  )
}
