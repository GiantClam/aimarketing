"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Bot, Building2, Check, Clock3, Database, LogOut, Save, Shield, Sparkles, User, Users, Workflow, X, type LucideIcon } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WriterMemorySettingsSection } from "@/components/settings/writer-memory-settings-section"
import { FEATURE_KEYS, buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"
import type { AppLocale } from "@/lib/i18n/config"
import { isFeatureRuntimeEnabled } from "@/lib/runtime-features"
import { cn } from "@/lib/utils"

type PendingRequest = {
  requestId: number
  userId: number
  userName: string
  userEmail: string
  createdAt: string
  note?: string | null
}

type Member = {
  id: number
  name: string
  email: string
  enterpriseRole: string | null
  enterpriseStatus: string | null
  isDemo: boolean
  permissions: PermissionMap
}

type EnterpriseDifyDataset = {
  datasetId: string
  datasetName: string
  scope: "general" | "brand" | "product" | "case-study" | "compliance" | "campaign"
  priority: number
  enabled: boolean
}

type EnterpriseAdvisorType = "brand-strategy" | "growth" | "lead-hunter" | "company-search" | "contact-mining"

type AdvisorWorkflowSummary = {
  configured: boolean
  baseUrl: string | null
}

type AdvisorDefaultsSummary = {
  baseUrl: string | null
  brandStrategy: AdvisorWorkflowSummary
  growth: AdvisorWorkflowSummary
  leadHunter: AdvisorWorkflowSummary
  companySearch: AdvisorWorkflowSummary
  contactMining: AdvisorWorkflowSummary
}

type AdvisorOverrideSummary = {
  id: number
  advisorType: EnterpriseAdvisorType
  executionMode: "dify" | "skill"
  baseUrl: string
  apiKeyMasked: string
  hasApiKey: boolean
  enabled: boolean
}

type LeadHunterAdvisorType = "lead-hunter"

function formatEnterpriseDifyMessage(error: unknown, fallback: string, locale: AppLocale) {
  const isZh = locale === "zh"
  const message = error instanceof Error ? error.message : ""
  if (message === "base_url_required") return isZh ? "请填写 Dify API Base URL。" : "Please provide Dify API Base URL."
  if (message === "api_key_required_when_enabled") return isZh ? "启用企业知识检索前，请先填写 Dify API Key。" : "Please provide Dify API Key before enabling enterprise knowledge retrieval."
  if (message === "datasets_required_when_enabled") return isZh ? "启用企业知识检索前，请至少启用一个知识库。" : "Enable at least one dataset before enabling enterprise knowledge retrieval."
  if (message === "dify_config_incomplete") return isZh ? "请先填写完整的 Dify API Base URL 和 API Key。" : "Please complete Dify API Base URL and API Key first."
  return message || fallback
}

function formatEnterpriseSwitchMessage(error: unknown, fallback: string, locale: AppLocale) {
  const isZh = locale === "zh"
  const message = error instanceof Error ? error.message : ""
  if (message === "enterprise_admin_cannot_switch") return isZh ? "企业管理员不支持在此处更换绑定企业。" : "Company admins cannot switch bound enterprise here."
  if (message === "enterprise_not_bound") return isZh ? "当前账号尚未绑定企业，无法执行更换。" : "This account is not bound to an enterprise yet."
  if (message === "enterprise_code_required") return isZh ? "请输入目标企业 ID。" : "Please enter target company ID."
  if (message === "enterprise_not_found") return isZh ? "未找到该企业 ID，请检查后重试。" : "Target company ID was not found. Please check and retry."
  if (message === "enterprise_already_bound") return isZh ? "当前账号已绑定该企业，无需重复提交。" : "This account is already bound to the target company."
  return message || fallback
}

type OverviewMetricProps = {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone?: "warm" | "teal" | "ink"
}

function OverviewMetric({ icon: Icon, label, value, hint, tone = "warm" }: OverviewMetricProps) {
  const toneClassName =
    tone === "teal"
      ? "border-teal-200/70 bg-teal-50/85"
      : tone === "ink"
        ? "border-slate-300/80 bg-slate-900 text-white"
        : "border-orange-200/70 bg-orange-50/90"

  return (
    <div className={cn("rounded-[1.4rem] border p-4 shadow-sm", toneClassName)}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", tone === "ink" ? "border-white/15 bg-white/10" : "border-black/5 bg-white/70")}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", tone === "ink" ? "text-white/70" : "text-muted-foreground")}>{label}</p>
          <p className="mt-1 font-sans text-2xl font-semibold">{value}</p>
        </div>
      </div>
      <p className={cn("mt-4 text-sm leading-6", tone === "ink" ? "text-white/78" : "text-muted-foreground")}>{hint}</p>
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])
  const { user, isDemoMode, isEnterpriseAdmin, updateProfile, refreshProfile, logout } = useAuth()

  const knowledgeScopeOptions = useMemo(
    () => [
      { value: "general", label: t("综合资料", "General") },
      { value: "brand", label: t("品牌资料", "Brand") },
      { value: "product", label: t("产品资料", "Product") },
      { value: "case-study", label: t("案例资料", "Case study") },
      { value: "compliance", label: t("合规资料", "Compliance") },
      { value: "campaign", label: t("活动资料", "Campaign") },
    ],
    [t],
  )
  const featureLabels = useMemo(
    () => ({
      expert_advisor: t("专家顾问", "Expert advisor"),
      customer_profile_entry: t("客户画像入口", "Customer profile entry"),
      website_generation: t("网站生成", "Website generation"),
      video_generation: t("视频生成", "Video generation"),
      copywriting_generation: t("文案生成", "Copywriting generation"),
      image_design_generation: t("图片设计", "Image design"),
    }),
    [t],
  )

  const [name, setName] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [switchEnterpriseCode, setSwitchEnterpriseCode] = useState("")
  const [switchEnterpriseMessage, setSwitchEnterpriseMessage] = useState("")
  const [isSwitchingEnterprise, setIsSwitchingEnterprise] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingAdminData, setLoadingAdminData] = useState(false)
  const [permissionDrafts, setPermissionDrafts] = useState<Record<number, PermissionMap>>({})
  const [difyBaseUrl, setDifyBaseUrl] = useState("")
  const [difyApiKeyMasked, setDifyApiKeyMasked] = useState("")
  const [difyHasApiKey, setDifyHasApiKey] = useState(false)
  const [difyEnabled, setDifyEnabled] = useState(false)
  const [difyDatasets, setDifyDatasets] = useState<EnterpriseDifyDataset[]>([])
  const [loadingDifyConfig, setLoadingDifyConfig] = useState(false)
  const [savingDifyConfig, setSavingDifyConfig] = useState(false)
  const [difyMessage, setDifyMessage] = useState("")
  const [advisorDefaults, setAdvisorDefaults] = useState<AdvisorDefaultsSummary | null>(null)
  const [advisorOverrides, setAdvisorOverrides] = useState<Partial<Record<EnterpriseAdvisorType, AdvisorOverrideSummary>>>({})
  const [loadingAdvisorConfig, setLoadingAdvisorConfig] = useState(false)
  const [leadHunterModeDrafts, setLeadHunterModeDrafts] = useState<Partial<Record<LeadHunterAdvisorType, "dify" | "skill">>>({})
  const [savingLeadHunterAdvisorType, setSavingLeadHunterAdvisorType] = useState<LeadHunterAdvisorType | null>(null)
  const [advisorConfigMessage, setAdvisorConfigMessage] = useState("")

  useEffect(() => {
    setName(user?.name || "")
  }, [user?.name])

  const userId = Number(user?.id)
  const canViewEnterpriseDify = Boolean(user?.enterpriseId && user?.enterpriseStatus === "active")
  const canManageEnterpriseDify = isEnterpriseAdmin

  const loadAdminData = useCallback(async () => {
    if (!isEnterpriseAdmin || !Number.isFinite(userId) || userId <= 0) return

    setLoadingAdminData(true)
    try {
      const [requestRes, memberRes] = await Promise.all([
        fetch("/api/enterprise/requests", { cache: "no-store" }),
        fetch("/api/enterprise/members", { cache: "no-store" }),
      ])

      if (requestRes.ok) {
        const json = await requestRes.json()
        setRequests(json.data || [])
      }

      if (memberRes.ok) {
        const json = await memberRes.json()
        const list: Member[] = json.data || []
        setMembers(list)

        const nextDrafts: Record<number, PermissionMap> = {}
        for (const member of list) {
          nextDrafts[member.id] = { ...buildPermissionMap(false), ...(member.permissions || {}) }
        }
        setPermissionDrafts(nextDrafts)
      }
    } finally {
      setLoadingAdminData(false)
    }
  }, [isEnterpriseAdmin, userId])

  const loadDifyConfig = useCallback(async () => {
    if (!canViewEnterpriseDify || !Number.isFinite(userId) || userId <= 0) return

    setLoadingDifyConfig(true)
    try {
      const response = await fetch("/api/enterprise/dify", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json()
      const binding = json?.data?.binding
      setDifyBaseUrl(typeof binding?.baseUrl === "string" ? binding.baseUrl : "")
      setDifyApiKeyMasked(typeof binding?.apiKeyMasked === "string" ? binding.apiKeyMasked : "")
      setDifyHasApiKey(Boolean(binding?.hasApiKey))
      setDifyEnabled(Boolean(binding?.enabled))
      setDifyDatasets(
        Array.isArray(binding?.datasets)
          ? binding.datasets.map((dataset: any) => ({
            datasetId: String(dataset?.datasetId || ""),
            datasetName: String(dataset?.datasetName || ""),
            scope: dataset?.scope || "general",
            priority: Number(dataset?.priority || 100),
            enabled: Boolean(dataset?.enabled),
          }))
          : [],
      )
    } finally {
      setLoadingDifyConfig(false)
    }
  }, [canViewEnterpriseDify, userId])

  const applyAdvisorConfigPayload = useCallback((payload: any) => {
    const defaults = payload?.defaults
    const overrides = Array.isArray(payload?.overrides) ? payload.overrides : []
    setAdvisorDefaults(defaults)

    const nextOverrides: Partial<Record<EnterpriseAdvisorType, AdvisorOverrideSummary>> = {}
    const nextLeadHunterModeDrafts: Partial<Record<LeadHunterAdvisorType, "dify" | "skill">> = {}

    for (const override of overrides) {
      if (
        override?.advisorType === "brand-strategy" ||
        override?.advisorType === "growth" ||
        override?.advisorType === "lead-hunter" ||
        override?.advisorType === "company-search" ||
        override?.advisorType === "contact-mining"
      ) {
        const advisorType = override.advisorType as EnterpriseAdvisorType
        const executionMode = override?.executionMode === "skill" ? "skill" : "dify"
        nextOverrides[advisorType] = {
          id: Number(override?.id || 0),
          advisorType,
          executionMode,
          baseUrl: String(override?.baseUrl || ""),
          apiKeyMasked: String(override?.apiKeyMasked || ""),
          hasApiKey: Boolean(override?.hasApiKey),
          enabled: Boolean(override?.enabled),
        }
        if (advisorType === "lead-hunter") {
          nextLeadHunterModeDrafts[advisorType] = executionMode
        }
      }
    }

    setAdvisorOverrides(nextOverrides)
    setLeadHunterModeDrafts(nextLeadHunterModeDrafts)
  }, [])

  const loadAdvisorConfig = useCallback(async () => {
    if (!isEnterpriseAdmin || !Number.isFinite(userId) || userId <= 0) return

    setLoadingAdvisorConfig(true)
    try {
      const response = await fetch("/api/enterprise/dify/advisors", { cache: "no-store" })
      if (!response.ok) return

      const json = await response.json()
      applyAdvisorConfigPayload(json?.data)
    } finally {
      setLoadingAdvisorConfig(false)
    }
  }, [applyAdvisorConfigPayload, isEnterpriseAdmin, userId])

  useEffect(() => {
    void loadAdminData()
  }, [loadAdminData])

  useEffect(() => {
    void loadDifyConfig()
  }, [loadDifyConfig])

  useEffect(() => {
    void loadAdvisorConfig()
  }, [loadAdvisorConfig])

  const handleSaveProfile = async () => {
    const nextName = name.trim()
    if (!nextName) {
      setSaveMessage(t("显示名称不能为空", "Display name cannot be empty."))
      return
    }

    setIsSaving(true)
    try {
      await updateProfile({ name: nextName })
      await refreshProfile()
      setSaveMessage(t("保存成功", "Saved successfully."))
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : t("保存失败", "Save failed."))
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      router.replace("/login")
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleSwitchEnterprise = async () => {
    const nextCode = switchEnterpriseCode.trim().toLowerCase()
    if (!nextCode) {
      setSwitchEnterpriseMessage(t("请输入目标企业 ID。", "Please enter target company ID."))
      return
    }

    setIsSwitchingEnterprise(true)
    setSwitchEnterpriseMessage("")
    try {
      const response = await fetch("/api/enterprise/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterpriseCode: nextCode }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "enterprise_switch_failed")
      }

      await refreshProfile()
      setSwitchEnterpriseCode("")
      setSwitchEnterpriseMessage(t("已提交更换企业申请。审核通过后才会切换企业绑定。", "Switch request submitted. Binding will change after approval."))
    } catch (error) {
      setSwitchEnterpriseMessage(formatEnterpriseSwitchMessage(error, t("提交更换企业申请失败", "Failed to submit switch request."), locale))
    } finally {
      setIsSwitchingEnterprise(false)
    }
  }

  const reviewRequest = async (requestId: number, action: "approve" | "reject") => {
    const res = await fetch(`/api/enterprise/requests/${requestId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })

    const json = await res.json()
    if (!res.ok) {
      window.alert(json.error || t("审核失败", "Review failed."))
      return
    }

    await loadAdminData()
    await refreshProfile()
  }

  const saveMemberPermissions = async (targetUserId: number) => {
    const permissions = permissionDrafts[targetUserId]
    const res = await fetch("/api/enterprise/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, permissions }),
    })

    const json = await res.json()
    if (!res.ok) {
      window.alert(json.error || t("权限保存失败", "Permission save failed."))
      return
    }

    await loadAdminData()
    if (targetUserId === userId) {
      await refreshProfile()
    }
  }

  const updateEnterpriseDifyEnabled = async (nextEnabled: boolean) => {
    if (!canManageEnterpriseDify) return

    const previousEnabled = difyEnabled
    if (nextEnabled && !difyBaseUrl.trim()) {
      setDifyMessage(t("启用企业知识检索前，请先在数据库中配置 Dify API Base URL。", "Configure Dify API Base URL before enabling enterprise knowledge retrieval."))
      return
    }
    if (nextEnabled && !difyHasApiKey) {
      setDifyMessage(t("启用企业知识检索前，请先在数据库中配置 Dify API Key。", "Configure Dify API Key before enabling enterprise knowledge retrieval."))
      return
    }
    if (nextEnabled && enabledDifyDatasetCount === 0) {
      setDifyMessage(t("启用企业知识检索前，请至少在数据库中启用一个知识库。", "Enable at least one dataset before enabling enterprise knowledge retrieval."))
      return
    }

    setDifyEnabled(nextEnabled)
    setSavingDifyConfig(true)
    setDifyMessage("")
    try {
      const response = await fetch("/api/enterprise/dify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      })

      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || t("Dify 配置保存失败", "Failed to save Dify config."))
      }

      const binding = json?.data?.binding
      setDifyBaseUrl(typeof binding?.baseUrl === "string" ? binding.baseUrl : difyBaseUrl)
      setDifyApiKeyMasked(typeof binding?.apiKeyMasked === "string" ? binding.apiKeyMasked : difyApiKeyMasked)
      setDifyHasApiKey(Boolean(binding?.hasApiKey))
      setDifyEnabled(Boolean(binding?.enabled))
      setDifyDatasets(
        Array.isArray(binding?.datasets)
          ? binding.datasets.map((dataset: any) => ({
            datasetId: String(dataset?.datasetId || ""),
            datasetName: String(dataset?.datasetName || ""),
            scope: dataset?.scope || "general",
            priority: Number(dataset?.priority || 100),
            enabled: Boolean(dataset?.enabled),
          }))
          : [],
      )
      setDifyMessage(nextEnabled ? t("企业知识库已启用。", "Enterprise knowledge base enabled.") : t("企业知识库已停用。", "Enterprise knowledge base disabled."))
    } catch (error) {
      setDifyEnabled(previousEnabled)
      setDifyMessage(formatEnterpriseDifyMessage(error, t("Dify 配置保存失败", "Failed to save Dify config."), locale))
    } finally {
      setSavingDifyConfig(false)
    }
  }

  const saveLeadHunterExecutionMode = async (
    advisorType: LeadHunterAdvisorType,
    executionMode: "dify" | "skill",
  ) => {
    setSavingLeadHunterAdvisorType(advisorType)
    setAdvisorConfigMessage("")
    try {
      const response = await fetch("/api/enterprise/dify/advisors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advisorType,
          enabled: true,
          executionMode,
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "advisor_config_save_failed")
      }

      applyAdvisorConfigPayload(json?.data)
      setAdvisorConfigMessage(
        executionMode === "skill"
          ? t("客户画像执行模式已切换为 Skill。", "Customer Profile execution mode switched to Skill.")
          : t("客户画像执行模式已切换为 Dify。", "Customer Profile execution mode switched to Dify."),
      )
    } catch (error) {
      if (error instanceof Error && error.message === "advisor_base_url_and_api_key_required") {
        setAdvisorConfigMessage(
          t(
            "切换到 Dify 前，请先在数据库中配置该顾问的 Dify Base URL 和 API Key。",
            "Configure Dify Base URL and API key in database for this advisor before switching to Dify.",
          ),
        )
      } else {
        setAdvisorConfigMessage(
          error instanceof Error
            ? error.message
            : t("保存顾问配置失败。", "Failed to save advisor config."),
        )
      }
    } finally {
      setSavingLeadHunterAdvisorType(null)
    }
  }

  const statusText = useMemo(() => {
    if (!user?.enterpriseStatus) return t("未知", "Unknown")
    if (user.enterpriseStatus === "pending") return t("待审核", "Pending")
    if (user.enterpriseStatus === "active") return t("已激活", "Active")
    if (user.enterpriseStatus === "rejected") return t("已拒绝", "Rejected")
    return user.enterpriseStatus
  }, [t, user?.enterpriseStatus])

  const configurableFeatureKeys = useMemo(
    () => FEATURE_KEYS.filter((feature) => isFeatureRuntimeEnabled(feature)),
    [],
  )
  const enabledDifyDatasetCount = useMemo(
    () => difyDatasets.filter((dataset) => dataset.enabled).length,
    [difyDatasets],
  )
  const hasEnterpriseKnowledgeBinding = useMemo(
    () => Boolean(difyBaseUrl.trim() || difyHasApiKey || difyDatasets.length > 0),
    [difyBaseUrl, difyDatasets.length, difyHasApiKey],
  )
  const advisorCards: Array<{ advisorType: EnterpriseAdvisorType; title: string; description: string }> = [
    {
      advisorType: "brand-strategy",
      title: t("品牌顾问", "Brand advisor"),
      description: t("优先读取企业数据库中的 workflow；未配置企业专属 workflow 时回退到系统默认 workflow。", "Prefer enterprise workflow from database; fallback to system default workflow when enterprise override is not configured."),
    },
    {
      advisorType: "growth",
      title: t("增长顾问", "Growth advisor"),
      description: t("优先读取企业数据库中的 workflow；未配置企业专属 workflow 时回退到系统默认 workflow。", "Prefer enterprise workflow from database; fallback to system default workflow when enterprise override is not configured."),
    },
    ...(advisorOverrides["lead-hunter"]
      ? [
        {
          advisorType: "lead-hunter" as const,
          title: t("客户画像（Customer Profile）", "Customer Profile"),
          description: t("客户画像入口为独立入口，可在企业数据库中切换执行模式（Dify/Skill）。", "Customer profile is a dedicated entry and can switch execution mode (Dify/Skill) in enterprise database."),
        },
      ]
      : []),
    ...(advisorOverrides["company-search"]
      ? [
        {
          advisorType: "company-search" as const,
          title: t("公司搜索（Company Search）", "Company Search"),
          description: t("保留原有 Dify workflow。仅当前企业在数据库中配置了 company search workflow 时展示。", "Keeps original Dify workflow. Shown only when company-search workflow is configured in enterprise database."),
        },
      ]
      : []),
    ...(advisorOverrides["contact-mining"]
      ? [
        {
          advisorType: "contact-mining" as const,
          title: t("联系人挖掘（Contact Mining）", "Contact Mining"),
          description: t("保留原有 Dify workflow。仅当前企业在数据库中配置了 contact mining workflow 时展示。", "Keeps original Dify workflow. Shown only when contact-mining workflow is configured in enterprise database."),
        },
      ]
      : []),
  ]
  const overviewMetrics = useMemo(
    () => [
      {
        icon: User,
        label: t("账号状态", "Account status"),
        value: statusText,
        hint: user?.enterpriseName ? `${user.enterpriseName} / ${user.enterpriseRole || "member"}` : t("当前账号尚未绑定企业。", "This account is not bound to a company yet."),
        tone: "warm" as const,
      },
      {
        icon: Users,
        label: t("企业治理", "Company governance"),
        value: isEnterpriseAdmin ? `${members.length}` : t("只读", "Read only"),
        hint: isEnterpriseAdmin ? t(`成员 ${members.length} 人，待审核 ${requests.length} 项。`, `${members.length} members, ${requests.length} pending requests.`) : t("仅企业管理员可处理成员与权限配置。", "Only enterprise admins can manage members and permissions."),
        tone: "teal" as const,
      },
      {
        icon: Database,
        label: t("知识资源", "Knowledge resources"),
        value: `${enabledDifyDatasetCount}/${difyDatasets.length}`,
        hint: canViewEnterpriseDify ? t("显示已启用知识库数量 / 已绑定知识库总数。", "Shows enabled datasets / total bound datasets.") : t("企业激活后可查看企业知识检索配置。", "Available after enterprise activation."),
        tone: "ink" as const,
      },
      {
        icon: Bot,
        label: t("顾问工作流", "Advisor workflows"),
        value: `${advisorCards.length}`,
        hint: isEnterpriseAdmin ? t("展示当前可见的顾问 workflow 条目。", "Shows visible advisor workflow entries.") : t("顾问 workflow 详情仅向企业管理员开放。", "Advisor workflow details are available to enterprise admins only."),
        tone: "warm" as const,
      },
    ],
    [
      advisorCards.length,
      canViewEnterpriseDify,
      difyDatasets.length,
      enabledDifyDatasetCount,
      isEnterpriseAdmin,
      members.length,
      requests.length,
      statusText,
      t,
      user?.enterpriseName,
      user?.enterpriseRole,
    ],
  )

  return (
    <div className="h-full overflow-y-auto px-6 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[32px] border-2 border-border bg-card">
          <div className="grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {t("设置控制台", "Settings Console")}
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">{t("用户设置", "User settings")}</h1>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground lg:text-lg">
                  {t("将账号资料、企业治理和 AI 资源配置放进同一个工作台，减少切页和状态判断。", "Keep profile, enterprise governance, and AI resources in one workspace to reduce context switching.")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-full border-2 border-border bg-background px-4 py-2 text-sm font-medium text-foreground">
                  {t("企业状态", "Enterprise status")}: {statusText}
                </div>
                <div className="rounded-full border-2 border-border bg-background px-4 py-2 text-sm font-medium text-foreground">
                  {t("成员角色", "Member role")}: {user?.enterpriseRole || t("未绑定", "Unbound")}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border-2 border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">{t("身份摘要", "Identity Brief")}</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{user?.name || t("未命名成员", "Unnamed member")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{user?.email || t("未绑定邮箱", "No email bound")}</p>

              <div className="mt-5 space-y-3">
                <div className="rounded-[22px] border-2 border-border bg-card px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("企业信息", "Enterprise")}</p>
                  <p className="mt-2 text-sm text-foreground">{user?.enterpriseName || t("尚未绑定企业", "No enterprise bound")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{user?.enterpriseCode || t("无企业 ID", "No enterprise code")}</p>
                </div>
                <div className="rounded-[22px] border-2 border-border bg-card px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("配置状态", "Configuration")}</p>
                  <p className="mt-2 text-sm text-foreground">
                    {canViewEnterpriseDify ? t("已连接企业知识资源", "Enterprise knowledge connected") : t("等待企业激活或配置", "Waiting for enterprise activation/configuration")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isEnterpriseAdmin ? t("你可以管理成员权限和顾问配置。", "You can manage member permissions and advisor config.") : t("你当前拥有只读或有限配置权限。", "You currently have read-only or limited configuration permission.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {user?.enterpriseStatus === "pending" && (
          <div className="rounded-[1.6rem] border border-amber-300/80 bg-amber-50/90 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-sans text-lg font-semibold text-amber-900">{t("加入企业待审核", "Enterprise join request pending")}</p>
                <p className="mt-1 text-sm leading-6 text-amber-800/85">{t("企业管理员审核通过后，企业功能权限与知识资源才会对当前账号生效。", "Enterprise permissions and knowledge resources will be enabled after admin approval.")}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{t("个人设置", "Personal settings")}</p>
                <h2 className="font-sans text-2xl font-semibold text-foreground">{t("账号与企业身份", "Account and enterprise identity")}</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("优先保证账号基础资料、企业归属和身份状态清晰，避免后续工作台入口与权限判断出现偏差。", "Keep account basics, enterprise ownership, and identity status clear to avoid later access confusion.")}</p>
              </div>

              <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-xl"><User className="h-5 w-5 text-primary" />{t("账号信息", "Account profile")}</CardTitle>
                  <CardDescription>{t("可修改显示名称。企业信息由企业管理员维护。", "You can edit display name. Enterprise info is managed by company admins.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="display-name">{t("显示名称", "Display name")}</Label>
                      <Input id="display-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("请输入显示名称", "Enter display name")} />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("邮箱", "Email")}</Label>
                      <Input value={user?.email || ""} disabled />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-2"><Label>{t("企业 ID", "Company ID")}</Label><Input value={user?.enterpriseCode || t("未绑定", "Unbound")} disabled /></div>
                    <div className="grid gap-2"><Label>{t("企业名称", "Company name")}</Label><Input value={user?.enterpriseName || t("未绑定", "Unbound")} disabled /></div>
                    <div className="grid gap-2"><Label>{t("企业角色", "Company role")}</Label><Input value={user?.enterpriseRole || t("未知", "Unknown")} disabled /></div>
                    <div className="grid gap-2"><Label>{t("账号状态", "Account status")}</Label><Input value={statusText} disabled /></div>
                  </div>

                  {Boolean(user?.enterpriseId) && !isEnterpriseAdmin ? (
                    <div className="rounded-[20px] border border-border/70 bg-background/70 p-4">
                      <p className="text-sm font-medium text-foreground">{t("更换企业绑定", "Switch company binding")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("输入目标企业 ID 后将发起换绑申请。审核通过前，当前企业绑定保持不变。", "Submit target company ID to request binding switch. Current binding remains unchanged until approval.")}
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="grid min-w-[220px] flex-1 gap-2">
                          <Label htmlFor="switch-enterprise-code">{t("目标企业 ID", "Target company ID")}</Label>
                          <Input
                            id="switch-enterprise-code"
                            value={switchEnterpriseCode}
                            onChange={(event) => setSwitchEnterpriseCode(event.target.value)}
                            placeholder={t("请输入企业 ID", "Enter company ID")}
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={handleSwitchEnterprise}
                          disabled={isSwitchingEnterprise || !switchEnterpriseCode.trim()}
                          className="rounded-full px-5"
                        >
                          {isSwitchingEnterprise ? t("提交中...", "Submitting...") : t("提交更换申请", "Submit switch request")}
                        </Button>
                      </div>
                      {switchEnterpriseMessage ? (
                        <p className="mt-3 text-xs text-muted-foreground">{switchEnterpriseMessage}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={handleSaveProfile} disabled={isSaving} className="rounded-full px-5"><Save className="mr-2 h-4 w-4" />{isSaving ? t("保存中...", "Saving...") : t("保存设置", "Save settings")}</Button>
                    {saveMessage && <span className="text-sm text-muted-foreground">{saveMessage}</span>}
                  </div>
                </CardContent>
              </Card>
            </section>

            {isEnterpriseAdmin && (
              <section className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{t("企业治理", "Enterprise governance")}</p>
                  <h2 className="font-sans text-2xl font-semibold text-foreground">{t("成员审核与权限分配", "Member reviews and permissions")}</h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("把待审核申请和成员权限放在同一段，先处理准入，再决定每个成员可进入哪些工作台。", "Handle access reviews and permission allocation in one place.")}</p>
                </div>

                <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-sans text-xl"><Building2 className="h-5 w-5 text-primary" />{t("企业成员申请审核", "Enterprise member request review")}</CardTitle>
                    <CardDescription>{t("审核待加入企业的成员申请。", "Review pending requests to join the enterprise.")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
              {loadingAdminData && <p className="text-sm text-muted-foreground">{t("加载中...", "Loading...")}</p>}
              {!loadingAdminData && requests.length === 0 && <p className="text-sm text-muted-foreground">{t("暂无待审核申请。", "No pending requests.")}</p>}
              {requests.map((request) => (
                <div key={request.requestId} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{request.userName}（{request.userEmail}）</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("申请时间：", "Requested at: ")}{new Date(request.createdAt).toLocaleString()}</p>
                    {request.note && <p className="mt-1 text-xs text-muted-foreground">{t("说明：", "Note: ")}{request.note}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => reviewRequest(request.requestId, "reject")} className="rounded-full"><X className="mr-1 h-4 w-4" />{t("拒绝", "Reject")}</Button>
                    <Button size="sm" onClick={() => reviewRequest(request.requestId, "approve")} className="rounded-full"><Check className="mr-1 h-4 w-4" />{t("通过", "Approve")}</Button>
                  </div>
                </div>
              ))}
                  </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-sans text-xl"><Shield className="h-5 w-5 text-primary" />{t("成员功能权限", "Member feature permissions")}</CardTitle>
                    <CardDescription>{t("配置成员可访问的功能模块。专家顾问与客户画像入口可分别授权；企业管理员始终可见。", "Configure feature access for members. Expert Advisor and Customer Profile entry can be granted independently; enterprise admins always can.")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
              {members.length === 0 && !loadingAdminData ? (
                <p className="text-sm text-muted-foreground">{t("当前没有可配置权限的企业成员。", "No enterprise members available for permission configuration.")}</p>
              ) : null}
              {members.map((member) => {
                const draft = permissionDrafts[member.id] || buildPermissionMap(false)
                return (
                  <div key={member.id} className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.name}（{member.email}）</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("角色：", "Role: ")}{member.enterpriseRole || "member"} / {t("状态：", "Status: ")}{member.enterpriseStatus || "unknown"}</p>
                      </div>
                      <Button size="sm" onClick={() => saveMemberPermissions(member.id)} disabled={member.enterpriseStatus !== "active"} className="rounded-full">{t("保存权限", "Save permissions")}</Button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {configurableFeatureKeys.map((feature) => (
                        <label key={feature} className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={Boolean(draft[feature])}
                            onChange={(event) => {
                              setPermissionDrafts((prev) => ({
                                ...prev,
                                [member.id]: {
                                  ...draft,
                                  [feature]: event.target.checked,
                                },
                              }))
                            }}
                          />
                          <span>{featureLabels[feature]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
                  </CardContent>
                </Card>
              </section>
            )}

            {(canViewEnterpriseDify || isEnterpriseAdmin) && (
              <section className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{t("AI 资源配置", "AI resource configuration")}</p>
                  <h2 className="font-sans text-2xl font-semibold text-foreground">{t("企业知识库与顾问工作流", "Enterprise knowledge and advisor workflows")}</h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("把知识检索和顾问 workflow 放在同一层，便于判断当前企业到底拥有哪些 AI 能力，以及哪些只是系统默认兜底。", "View knowledge retrieval and advisor workflows in one place to separate enterprise capabilities from system defaults.")}</p>
                </div>

                {canViewEnterpriseDify && (
                  <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-sans text-xl"><Database className="h-5 w-5 text-primary" />{t("Dify 企业知识库", "Dify enterprise knowledge")}</CardTitle>
                      <CardDescription>
                {hasEnterpriseKnowledgeBinding
                  ? t("当前企业已配置专属 Dify 知识库。设置页展示数据库中的绑定信息；只有企业管理员可启用或停用企业知识库。", "Enterprise-specific Dify knowledge is configured. This page shows database bindings; only enterprise admins can toggle it.")
                  : t("当前企业还没有配置 Dify 企业知识库。", "No enterprise Dify knowledge is configured yet.")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
              {hasEnterpriseKnowledgeBinding ? (
                <>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{t("当前企业已配置知识库", "Knowledge base configured for current enterprise")}</p>
                      <p>{t("已读取数据库中的 Dify Base URL、脱敏 API Key 和 dataset 绑定信息。", "Loaded Dify Base URL, masked API key, and dataset bindings from database.")}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="dify-base-url">Dify API Base URL</Label>
                      <Input
                        id="dify-base-url"
                        value={difyBaseUrl || t("未在数据库中配置", "Not configured in database")}
                        disabled
                      />
                      <p className="text-xs text-muted-foreground">{t("只读展示当前数据库中的企业 Dify Base URL；如需修改，请直接更新数据库。", "Read-only display of enterprise Dify Base URL from database. Update database directly to change it.")}</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="dify-api-key">Dify API Key</Label>
                      <Input
                        id="dify-api-key"
                        value={difyHasApiKey ? difyApiKeyMasked : t("未在数据库中配置", "Not configured in database")}
                        disabled
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("API Key 已做脱敏展示，不会在页面明文返回。当前已启用 ", "API key is masked and never returned in plain text. Currently enabled ")}{enabledDifyDatasetCount}{t(" 个知识库。", " dataset(s).")}
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={difyEnabled}
                      disabled={!canManageEnterpriseDify || savingDifyConfig}
                      onChange={(event) => void updateEnterpriseDifyEnabled(event.target.checked)}
                    />
                    <span>{t("启用企业统一知识检索", "Enable enterprise knowledge retrieval")}{!canManageEnterpriseDify ? t("（仅企业管理员可修改）", " (admins only)") : ""}</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    {loadingDifyConfig && <span className="text-sm text-muted-foreground">{t("正在读取已保存配置...", "Loading saved configuration...")}</span>}
                    {savingDifyConfig && <span className="text-sm text-muted-foreground">{t("正在更新企业知识库状态...", "Updating enterprise knowledge status...")}</span>}
                    {difyMessage && <span className="text-sm text-muted-foreground">{difyMessage}</span>}
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t("知识库绑定与检索用途", "Dataset bindings and retrieval use")}</p>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          {t("企业知识库绑定仅支持数据库配置。设置页只展示当前已保存的 dataset 绑定，不提供远端拉取和页面内编辑，避免共享 Dify 时误拉到其他企业知识库。", "Bindings are managed in database only. This page is read-only for saved dataset bindings to avoid pulling wrong enterprise datasets in shared Dify scenarios.")}
                        </p>
                        <p className="text-xs leading-6 text-muted-foreground">{t("优先级数字越小越靠前；当前单次检索最多使用前 4 个符合用途的知识库。", "Lower priority number means earlier usage. A single retrieval uses up to 4 matching datasets.")}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t("数据库已配置 ", "Configured ")}{difyDatasets.length}{t(" 个 / 已启用 ", " / Enabled ")}{enabledDifyDatasetCount}{t(" 个", "")}
                      </span>
                    </div>

                    {difyDatasets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("当前没有已保存的 dataset 绑定。请直接在数据库中维护 `enterprise_dify_datasets`。", "No saved dataset bindings. Maintain `enterprise_dify_datasets` in database directly.")}</p>
                    ) : (
                      <div className="space-y-3">
                        {difyDatasets.map((dataset) => (
                          <div key={dataset.datasetId} className="rounded-2xl border border-border/70 bg-card/80 p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-1 text-sm">
                                <p className="font-medium text-foreground">{dataset.datasetName}</p>
                                <p className="text-xs text-muted-foreground">{dataset.datasetId}</p>
                              </div>
                              <div className="grid min-w-[220px] gap-3 sm:grid-cols-3">
                                <div className="grid gap-1 text-xs text-muted-foreground">
                                  <span>{t("状态", "Status")}</span>
                                  <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground">
                                    {dataset.enabled ? t("已启用", "Enabled") : t("已停用", "Disabled")}
                                  </span>
                                </div>
                                <div className="grid gap-1 text-xs text-muted-foreground">
                                  <span>{t("检索用途", "Scope")}</span>
                                  <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground">
                                    {knowledgeScopeOptions.find((option) => option.value === dataset.scope)?.label || dataset.scope}
                                  </span>
                                </div>
                                <div className="grid gap-1 text-xs text-muted-foreground">
                                  <span>{t("优先级", "Priority")}</span>
                                  <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground">
                                    {dataset.priority}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{t("当前企业未配置知识库", "No knowledge base configured for current enterprise")}</p>
                  </div>
                </div>
              )}
                    </CardContent>
                  </Card>
                )}

                {isEnterpriseAdmin && (
                  <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-sans text-xl"><Workflow className="h-5 w-5 text-primary" />{t("专家顾问与客户画像 Dify Workflow 配置", "Advisor and Customer Profile Dify workflow config")}</CardTitle>
                      <CardDescription>{t("品牌顾问和增长顾问只读展示。客户画像（Customer Profile）可在此切换执行模式（Dify/Skill）；公司搜索与联系人挖掘保持原有 Dify workflow。", "Brand/Growth workflows are read-only. Customer Profile can switch execution mode (Dify/Skill); Company Search and Contact Mining keep original Dify workflows.")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
              {loadingAdvisorConfig && <p className="text-sm text-muted-foreground">{t("正在读取顾问配置...", "Loading advisor config...")}</p>}
              {advisorConfigMessage && <p className="text-sm text-muted-foreground">{advisorConfigMessage}</p>}
              <div className="grid gap-4">
                {advisorCards.map((card) => {
                  const override = advisorOverrides[card.advisorType]
                  const isLeadHunterWorkflow = card.advisorType === "lead-hunter"
                  const leadHunterAdvisorType = isLeadHunterWorkflow ? (card.advisorType as LeadHunterAdvisorType) : null
                  const defaultInfo =
                    card.advisorType === "brand-strategy"
                      ? advisorDefaults?.brandStrategy
                      : card.advisorType === "growth"
                        ? advisorDefaults?.growth
                        : card.advisorType === "lead-hunter"
                          ? advisorDefaults?.leadHunter
                        : card.advisorType === "company-search"
                          ? advisorDefaults?.companySearch
                          : advisorDefaults?.contactMining
                  const hasEnterpriseWorkflow = Boolean(override?.baseUrl && override?.hasApiKey)
                  const enterpriseEnabled = Boolean(hasEnterpriseWorkflow && override?.enabled)
                  const hasSystemDefault = Boolean(defaultInfo?.configured)
                  const currentLeadHunterMode = override?.executionMode === "skill" ? "skill" : "dify"
                  const leadHunterModeDraft =
                    isLeadHunterWorkflow && leadHunterAdvisorType
                      ? leadHunterModeDrafts[leadHunterAdvisorType] || currentLeadHunterMode
                      : "dify"
                  const isSavingLeadHunterMode =
                    isLeadHunterWorkflow && leadHunterAdvisorType
                      ? savingLeadHunterAdvisorType === leadHunterAdvisorType
                      : false
                  const canSaveLeadHunterMode =
                    isLeadHunterWorkflow && leadHunterAdvisorType
                      ? leadHunterModeDraft !== currentLeadHunterMode
                      : false
                  const statusLabel =
                    isLeadHunterWorkflow
                          ? enterpriseEnabled
                        ? override?.executionMode === "skill"
                          ? t("当前生效：企业数据库（Skill）", "Current source: enterprise database (skill)")
                          : t("当前生效：企业数据库（Dify）", "Current source: enterprise database (dify)")
                        : t("当前状态：未启用", "Current status: disabled")
                      : enterpriseEnabled
                        ? t("当前生效：企业数据库", "Current source: enterprise database")
                        : hasSystemDefault
                          ? t("当前生效：系统默认", "Current source: system default")
                          : t("当前生效：未配置", "Current source: not configured")
                  return (
                    <div key={card.advisorType} className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{card.title}</p>
                          <p className="mt-1 text-xs leading-6 text-muted-foreground">{card.description}</p>
                        </div>
                        <span className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-xs text-muted-foreground">
                          {statusLabel}
                        </span>
                      </div>

                      <div className="grid gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-sm">
                        {isLeadHunterWorkflow ? (
                          <div className="space-y-4">
                            <p className="text-xs leading-6 text-muted-foreground">
                              {t("客户画像（Customer Profile）没有系统默认 workflow。只有企业数据库里存在可用配置时，侧边栏和 Dashboard 才会显示对应入口。", "Customer Profile has no system-default workflow. Entry appears only when enterprise database configuration is available.")}
                            </p>
                            {leadHunterAdvisorType ? (
                              <div className="space-y-3 rounded-xl border border-border/70 bg-background/70 p-3">
                                <p className="text-xs text-muted-foreground">{t("执行模式（数据库配置）", "Execution mode (database config)")}</p>
                                <div className="flex flex-wrap gap-3">
                                  <label className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-sm text-foreground">
                                    <input
                                      type="radio"
                                      name={`${leadHunterAdvisorType}-mode`}
                                      className="border-border"
                                      checked={leadHunterModeDraft === "dify"}
                                      onChange={() =>
                                        setLeadHunterModeDrafts((prev) => ({ ...prev, [leadHunterAdvisorType]: "dify" }))
                                      }
                                      disabled={isSavingLeadHunterMode}
                                    />
                                    <span>Dify</span>
                                  </label>
                                  <label className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-sm text-foreground">
                                    <input
                                      type="radio"
                                      name={`${leadHunterAdvisorType}-mode`}
                                      className="border-border"
                                      checked={leadHunterModeDraft === "skill"}
                                      onChange={() =>
                                        setLeadHunterModeDrafts((prev) => ({ ...prev, [leadHunterAdvisorType]: "skill" }))
                                      }
                                      disabled={isSavingLeadHunterMode}
                                    />
                                    <span>Skill</span>
                                  </label>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="rounded-full"
                                    onClick={() =>
                                      void saveLeadHunterExecutionMode(
                                        leadHunterAdvisorType,
                                        leadHunterModeDraft,
                                      )
                                    }
                                    disabled={isSavingLeadHunterMode || !canSaveLeadHunterMode}
                                  >
                                    {isSavingLeadHunterMode
                                      ? t("保存中...", "Saving...")
                                      : t("保存执行模式", "Save mode")}
                                  </Button>
                                  <span className="text-xs text-muted-foreground">
                                    {t("仅修改执行引擎，不会改动企业工作流的 Base URL / API Key。", "Only execution engine is updated; Base URL/API Key remain unchanged.")}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1">
                              <span className="text-xs text-muted-foreground">{t("系统默认 Base URL", "System default Base URL")}</span>
                              <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-foreground">
                                {defaultInfo?.baseUrl || advisorDefaults?.baseUrl || t("未配置", "Not configured")}
                              </span>
                            </div>
                            <div className="grid gap-1">
                              <span className="text-xs text-muted-foreground">{t("系统默认 API Key", "System default API key")}</span>
                              <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-foreground">
                                {defaultInfo?.configured ? t("已配置", "Configured") : t("未配置", "Not configured")}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
                    </CardContent>
                  </Card>
                )}
              </section>
            )}

            <section className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{t("个性化记忆", "Personalization memory")}</p>
                <h2 className="font-sans text-2xl font-semibold text-foreground">{t("写作记忆与风格", "Writer memory and style")}</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("仅在 Settings 提供管理入口。该区块当前展示 writer 作用域下的跨会话记忆。", "Management entry exists only in Settings. This section currently shows cross-session memory in writer scope.")}</p>
              </div>
              <WriterMemorySettingsSection agentType="writer" />
            </section>

            <section className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{t("危险操作", "Danger zone")}</p>
                <h2 className="font-sans text-2xl font-semibold text-foreground">{t("会话与退出", "Session and logout")}</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("单独放出退出操作，避免与普通配置动作并排出现导致误触。", "Keep logout separate from normal configuration actions to avoid accidental clicks.")}</p>
              </div>

              <Card className="rounded-[1.75rem] border-destructive/30 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-xl text-destructive"><AlertTriangle className="h-5 w-5" />{t("会话管理", "Session management")}</CardTitle>
                  <CardDescription>{t("退出登录会清除当前服务端会话，并返回登录页。", "Logging out clears current server session and returns to login page.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut} className="rounded-full px-5"><LogOut className="mr-2 h-4 w-4" />{isLoggingOut ? t("退出中...", "Logging out...") : t("退出登录", "Log out")}</Button>
                  {isDemoMode && <p className="text-xs text-muted-foreground">{t("当前为体验账号。", "Current account is in demo mode.")}</p>}
                </CardContent>
              </Card>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            <div className="rounded-[1.75rem] border border-border/70 bg-card/80 p-5 shadow-[0_20px_60px_-48px_rgba(31,41,55,0.5)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">{t("管理摘要", "Management brief")}</p>
              <h2 className="mt-2 font-sans text-xl font-semibold text-foreground">{t("当前配置摘要", "Current configuration summary")}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{t("右侧摘要不承载操作，只帮助管理员快速确认企业状态、资源规模和治理负载。", "The side summary is read-only and helps admins quickly verify enterprise status, resource scale, and governance workload.")}</p>
            </div>

            {overviewMetrics.map((metric) => (
              <OverviewMetric key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} hint={metric.hint} tone={metric.tone} />
            ))}

            <div className="rounded-[1.75rem] border border-border/70 bg-card/80 p-5 shadow-[0_20px_60px_-48px_rgba(31,41,55,0.5)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Workflow className="h-4 w-4 text-primary" />
                {t("优化原则", "Optimization principles")}
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <p>{t("先确认身份和企业状态，再处理成员准入和权限，最后才是知识库与顾问资源。", "Confirm identity and enterprise status first, then handle member access and permissions, then tune knowledge/advisor resources.")}</p>
                <p>{t("知识库与 workflow 分开展示来源，但在同一个版块内查看，减少“为什么看得到入口却用不了”的理解成本。", "Show dataset and workflow sources separately but in one section to reduce confusion about unavailable entries.")}</p>
                <p>{t("危险操作单独成段，和保存类动作分离，避免误触。", "Keep dangerous actions isolated from save actions to avoid accidental operations.")}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
