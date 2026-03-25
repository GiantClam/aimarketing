"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Bot, Building2, Check, Clock3, Database, LogOut, Save, Shield, Sparkles, User, Users, Workflow, X, type LucideIcon } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FEATURE_KEYS, FEATURE_LABELS, buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"
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

type EnterpriseAdvisorType = "brand-strategy" | "growth" | "lead-hunter"

type AdvisorWorkflowSummary = {
  configured: boolean
  baseUrl: string | null
}

type AdvisorDefaultsSummary = {
  baseUrl: string | null
  brandStrategy: AdvisorWorkflowSummary
  growth: AdvisorWorkflowSummary
  leadHunter: AdvisorWorkflowSummary
}

type AdvisorOverrideSummary = {
  id: number
  advisorType: EnterpriseAdvisorType
  baseUrl: string
  apiKeyMasked: string
  hasApiKey: boolean
  enabled: boolean
}

const KNOWLEDGE_SCOPE_OPTIONS = [
  { value: "general", label: "综合资料" },
  { value: "brand", label: "品牌资料" },
  { value: "product", label: "产品资料" },
  { value: "case-study", label: "案例资料" },
  { value: "compliance", label: "合规资料" },
  { value: "campaign", label: "活动资料" },
] as const

function formatEnterpriseDifyMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ""
  if (message === "base_url_required") return "请填写 Dify API Base URL。"
  if (message === "api_key_required_when_enabled") return "启用企业知识检索前，请先填写 Dify API Key。"
  if (message === "datasets_required_when_enabled") return "启用企业知识检索前，请至少启用一个知识库。"
  if (message === "dify_config_incomplete") return "请先填写完整的 Dify API Base URL 和 API Key。"
  return message || fallback
}

function formatEnterpriseSwitchMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ""
  if (message === "enterprise_admin_cannot_switch") return "企业管理员不支持在此处更换绑定企业。"
  if (message === "enterprise_not_bound") return "当前账号尚未绑定企业，无法执行更换。"
  if (message === "enterprise_code_required") return "请输入目标企业 ID。"
  if (message === "enterprise_not_found") return "未找到该企业 ID，请检查后重试。"
  if (message === "enterprise_already_bound") return "当前账号已绑定该企业，无需重复提交。"
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
  const { user, isDemoMode, isEnterpriseAdmin, updateProfile, refreshProfile, logout } = useAuth()

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

  const loadAdvisorConfig = useCallback(async () => {
    if (!isEnterpriseAdmin || !Number.isFinite(userId) || userId <= 0) return

    setLoadingAdvisorConfig(true)
    try {
      const response = await fetch("/api/enterprise/dify/advisors", { cache: "no-store" })
      if (!response.ok) return

      const json = await response.json()
      const defaults = json?.data?.defaults
      const overrides = Array.isArray(json?.data?.overrides) ? json.data.overrides : []
      setAdvisorDefaults(defaults)

      const nextOverrides: Partial<Record<EnterpriseAdvisorType, AdvisorOverrideSummary>> = {}

      for (const override of overrides) {
        if (
          override?.advisorType === "brand-strategy" ||
          override?.advisorType === "growth" ||
          override?.advisorType === "lead-hunter"
        ) {
          const advisorType = override.advisorType as EnterpriseAdvisorType
          nextOverrides[advisorType] = {
            id: Number(override?.id || 0),
            advisorType,
            baseUrl: String(override?.baseUrl || ""),
            apiKeyMasked: String(override?.apiKeyMasked || ""),
            hasApiKey: Boolean(override?.hasApiKey),
            enabled: Boolean(override?.enabled),
          }
        }
      }

      setAdvisorOverrides(nextOverrides)
    } finally {
      setLoadingAdvisorConfig(false)
    }
  }, [isEnterpriseAdmin, userId])

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
      setSaveMessage("显示名称不能为空")
      return
    }

    setIsSaving(true)
    try {
      await updateProfile({ name: nextName })
      await refreshProfile()
      setSaveMessage("保存成功")
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "保存失败")
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
      setSwitchEnterpriseMessage("请输入目标企业 ID。")
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
      setSwitchEnterpriseMessage("已提交更换企业申请。审核通过后才会切换企业绑定。")
    } catch (error) {
      setSwitchEnterpriseMessage(formatEnterpriseSwitchMessage(error, "提交更换企业申请失败"))
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
      window.alert(json.error || "审核失败")
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
      window.alert(json.error || "权限保存失败")
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
      setDifyMessage("启用企业知识检索前，请先在数据库中配置 Dify API Base URL。")
      return
    }
    if (nextEnabled && !difyHasApiKey) {
      setDifyMessage("启用企业知识检索前，请先在数据库中配置 Dify API Key。")
      return
    }
    if (nextEnabled && enabledDifyDatasetCount === 0) {
      setDifyMessage("启用企业知识检索前，请至少在数据库中启用一个知识库。")
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
        throw new Error(json?.error || "Dify 配置保存失败")
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
      setDifyMessage(nextEnabled ? "企业知识库已启用。" : "企业知识库已停用。")
    } catch (error) {
      setDifyEnabled(previousEnabled)
      setDifyMessage(formatEnterpriseDifyMessage(error, "Dify 配置保存失败"))
    } finally {
      setSavingDifyConfig(false)
    }
  }

  const statusText = useMemo(() => {
    if (!user?.enterpriseStatus) return "未知"
    if (user.enterpriseStatus === "pending") return "待审核"
    if (user.enterpriseStatus === "active") return "已激活"
    if (user.enterpriseStatus === "rejected") return "已拒绝"
    return user.enterpriseStatus
  }, [user?.enterpriseStatus])

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
      title: "品牌顾问",
      description: "优先读取企业数据库中的 workflow；未配置企业专属 workflow 时回退到系统默认 workflow。",
    },
    {
      advisorType: "growth",
      title: "增长顾问",
      description: "优先读取企业数据库中的 workflow；未配置企业专属 workflow 时回退到系统默认 workflow。",
    },
    ...(advisorOverrides["lead-hunter"]
      ? [
        {
          advisorType: "lead-hunter" as const,
          title: "海外猎客",
          description: "仅当前企业在数据库中配置了 lead hunter workflow 时展示；每次只触发当前搜索条件对应的 workflow。",
        },
      ]
      : []),
  ]
  const overviewMetrics = useMemo(
    () => [
      {
        icon: User,
        label: "账号状态",
        value: statusText,
        hint: user?.enterpriseName ? `${user.enterpriseName} / ${user.enterpriseRole || "member"}` : "当前账号尚未绑定企业。",
        tone: "warm" as const,
      },
      {
        icon: Users,
        label: "企业治理",
        value: isEnterpriseAdmin ? `${members.length}` : "只读",
        hint: isEnterpriseAdmin ? `成员 ${members.length} 人，待审核 ${requests.length} 项。` : "仅企业管理员可处理成员与权限配置。",
        tone: "teal" as const,
      },
      {
        icon: Database,
        label: "知识资源",
        value: `${enabledDifyDatasetCount}/${difyDatasets.length}`,
        hint: canViewEnterpriseDify ? "显示已启用知识库数量 / 已绑定知识库总数。" : "企业激活后可查看企业知识检索配置。",
        tone: "ink" as const,
      },
      {
        icon: Bot,
        label: "顾问工作流",
        value: `${advisorCards.length}`,
        hint: isEnterpriseAdmin ? "展示当前可见的顾问 workflow 条目。" : "顾问 workflow 详情仅向企业管理员开放。",
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
                Settings Console
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">用户设置</h1>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground lg:text-lg">
                  将账号资料、企业治理和 AI 资源配置放进同一个工作台，减少切页和状态判断。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-full border-2 border-border bg-background px-4 py-2 text-sm font-medium text-foreground">
                  企业状态: {statusText}
                </div>
                <div className="rounded-full border-2 border-border bg-background px-4 py-2 text-sm font-medium text-foreground">
                  成员角色: {user?.enterpriseRole || "未绑定"}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border-2 border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">Identity Brief</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{user?.name || "未命名成员"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{user?.email || "未绑定邮箱"}</p>

              <div className="mt-5 space-y-3">
                <div className="rounded-[22px] border-2 border-border bg-card px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Enterprise</p>
                  <p className="mt-2 text-sm text-foreground">{user?.enterpriseName || "尚未绑定企业"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{user?.enterpriseCode || "No enterprise code"}</p>
                </div>
                <div className="rounded-[22px] border-2 border-border bg-card px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Configuration</p>
                  <p className="mt-2 text-sm text-foreground">
                    {canViewEnterpriseDify ? "已连接企业知识资源" : "等待企业激活或配置"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isEnterpriseAdmin ? "你可以管理成员权限和顾问配置。" : "你当前拥有只读或有限配置权限。"}
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
                <p className="font-sans text-lg font-semibold text-amber-900">加入企业待审核</p>
                <p className="mt-1 text-sm leading-6 text-amber-800/85">企业管理员审核通过后，企业功能权限与知识资源才会对当前账号生效。</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">个人设置</p>
                <h2 className="font-sans text-2xl font-semibold text-foreground">账号与企业身份</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">优先保证账号基础资料、企业归属和身份状态清晰，避免后续工作台入口与权限判断出现偏差。</p>
              </div>

              <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-xl"><User className="h-5 w-5 text-primary" />账号信息</CardTitle>
                  <CardDescription>可修改显示名称。企业信息由企业管理员维护。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="display-name">显示名称</Label>
                      <Input id="display-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入显示名称" />
                    </div>
                    <div className="grid gap-2">
                      <Label>邮箱</Label>
                      <Input value={user?.email || ""} disabled />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-2"><Label>企业 ID</Label><Input value={user?.enterpriseCode || "未绑定"} disabled /></div>
                    <div className="grid gap-2"><Label>企业名称</Label><Input value={user?.enterpriseName || "未绑定"} disabled /></div>
                    <div className="grid gap-2"><Label>企业角色</Label><Input value={user?.enterpriseRole || "未知"} disabled /></div>
                    <div className="grid gap-2"><Label>账号状态</Label><Input value={statusText} disabled /></div>
                  </div>

                  {Boolean(user?.enterpriseId) && !isEnterpriseAdmin ? (
                    <div className="rounded-[20px] border border-border/70 bg-background/70 p-4">
                      <p className="text-sm font-medium text-foreground">更换企业绑定</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        输入目标企业 ID 后将发起换绑申请。审核通过前，当前企业绑定保持不变。
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="grid min-w-[220px] flex-1 gap-2">
                          <Label htmlFor="switch-enterprise-code">目标企业 ID</Label>
                          <Input
                            id="switch-enterprise-code"
                            value={switchEnterpriseCode}
                            onChange={(event) => setSwitchEnterpriseCode(event.target.value)}
                            placeholder="请输入企业 ID"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={handleSwitchEnterprise}
                          disabled={isSwitchingEnterprise || !switchEnterpriseCode.trim()}
                          className="rounded-full px-5"
                        >
                          {isSwitchingEnterprise ? "提交中..." : "提交更换申请"}
                        </Button>
                      </div>
                      {switchEnterpriseMessage ? (
                        <p className="mt-3 text-xs text-muted-foreground">{switchEnterpriseMessage}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={handleSaveProfile} disabled={isSaving} className="rounded-full px-5"><Save className="mr-2 h-4 w-4" />{isSaving ? "保存中..." : "保存设置"}</Button>
                    {saveMessage && <span className="text-sm text-muted-foreground">{saveMessage}</span>}
                  </div>
                </CardContent>
              </Card>
            </section>

            {isEnterpriseAdmin && (
              <section className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">企业治理</p>
                  <h2 className="font-sans text-2xl font-semibold text-foreground">成员审核与权限分配</h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">把待审核申请和成员权限放在同一段，先处理准入，再决定每个成员可进入哪些工作台。</p>
                </div>

                <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-sans text-xl"><Building2 className="h-5 w-5 text-primary" />企业成员申请审核</CardTitle>
                    <CardDescription>审核待加入企业的成员申请。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
              {loadingAdminData && <p className="text-sm text-muted-foreground">加载中...</p>}
              {!loadingAdminData && requests.length === 0 && <p className="text-sm text-muted-foreground">暂无待审核申请。</p>}
              {requests.map((request) => (
                <div key={request.requestId} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{request.userName}（{request.userEmail}）</p>
                    <p className="mt-1 text-xs text-muted-foreground">申请时间：{new Date(request.createdAt).toLocaleString()}</p>
                    {request.note && <p className="mt-1 text-xs text-muted-foreground">说明：{request.note}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => reviewRequest(request.requestId, "reject")} className="rounded-full"><X className="mr-1 h-4 w-4" />拒绝</Button>
                    <Button size="sm" onClick={() => reviewRequest(request.requestId, "approve")} className="rounded-full"><Check className="mr-1 h-4 w-4" />通过</Button>
                  </div>
                </div>
              ))}
                  </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-sans text-xl"><Shield className="h-5 w-5 text-primary" />成员功能权限</CardTitle>
                    <CardDescription>配置成员可访问的功能模块。开启“专家顾问”后，成员可看到品牌顾问与增长顾问；企业管理员始终可见。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
              {members.length === 0 && !loadingAdminData ? (
                <p className="text-sm text-muted-foreground">当前没有可配置权限的企业成员。</p>
              ) : null}
              {members.map((member) => {
                const draft = permissionDrafts[member.id] || buildPermissionMap(false)
                return (
                  <div key={member.id} className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.name}（{member.email}）</p>
                        <p className="mt-1 text-xs text-muted-foreground">角色：{member.enterpriseRole || "member"} / 状态：{member.enterpriseStatus || "unknown"}</p>
                      </div>
                      <Button size="sm" onClick={() => saveMemberPermissions(member.id)} disabled={member.enterpriseStatus !== "active"} className="rounded-full">保存权限</Button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {configurableFeatureKeys.map((feature) => (
                        <label key={feature} className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={Boolean(draft[feature])}
                            disabled={member.enterpriseRole === "admin" && member.id !== userId}
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
                          <span>{FEATURE_LABELS[feature]}</span>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">AI 资源配置</p>
                  <h2 className="font-sans text-2xl font-semibold text-foreground">企业知识库与顾问工作流</h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">把知识检索和顾问 workflow 放在同一层，便于判断当前企业到底拥有哪些 AI 能力，以及哪些只是系统默认兜底。</p>
                </div>

                {canViewEnterpriseDify && (
                  <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-sans text-xl"><Database className="h-5 w-5 text-primary" />Dify 企业知识库</CardTitle>
                      <CardDescription>
                {hasEnterpriseKnowledgeBinding
                  ? "当前企业已配置专属 Dify 知识库。设置页展示数据库中的绑定信息；只有企业管理员可启用或停用企业知识库。"
                  : "当前企业还没有配置 Dify 企业知识库。"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
              {hasEnterpriseKnowledgeBinding ? (
                <>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">当前企业已配置知识库</p>
                      <p>已读取数据库中的 Dify Base URL、脱敏 API Key 和 dataset 绑定信息。</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="dify-base-url">Dify API Base URL</Label>
                      <Input
                        id="dify-base-url"
                        value={difyBaseUrl || "未在数据库中配置"}
                        disabled
                      />
                      <p className="text-xs text-muted-foreground">只读展示当前数据库中的企业 Dify Base URL；如需修改，请直接更新数据库。</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="dify-api-key">Dify API Key</Label>
                      <Input
                        id="dify-api-key"
                        value={difyHasApiKey ? difyApiKeyMasked : "未在数据库中配置"}
                        disabled
                      />
                      <p className="text-xs text-muted-foreground">
                        API Key 已做脱敏展示，不会在页面明文返回。当前已启用 {enabledDifyDatasetCount} 个知识库。
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
                    <span>启用企业统一知识检索{!canManageEnterpriseDify ? "（仅企业管理员可修改）" : ""}</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    {loadingDifyConfig && <span className="text-sm text-muted-foreground">正在读取已保存配置...</span>}
                    {savingDifyConfig && <span className="text-sm text-muted-foreground">正在更新企业知识库状态...</span>}
                    {difyMessage && <span className="text-sm text-muted-foreground">{difyMessage}</span>}
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">知识库绑定与检索用途</p>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          企业知识库绑定仅支持数据库配置。设置页只展示当前已保存的 dataset 绑定，不提供远端拉取和页面内编辑，避免共享 Dify 时误拉到其他企业知识库。
                        </p>
                        <p className="text-xs leading-6 text-muted-foreground">优先级数字越小越靠前；当前单次检索最多使用前 4 个符合用途的知识库。</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        数据库已配置 {difyDatasets.length} 个 / 已启用 {enabledDifyDatasetCount} 个
                      </span>
                    </div>

                    {difyDatasets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">当前没有已保存的 dataset 绑定。请直接在数据库中维护 `enterprise_dify_datasets`。</p>
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
                                  <span>状态</span>
                                  <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground">
                                    {dataset.enabled ? "已启用" : "已停用"}
                                  </span>
                                </div>
                                <div className="grid gap-1 text-xs text-muted-foreground">
                                  <span>检索用途</span>
                                  <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground">
                                    {KNOWLEDGE_SCOPE_OPTIONS.find((option) => option.value === dataset.scope)?.label || dataset.scope}
                                  </span>
                                </div>
                                <div className="grid gap-1 text-xs text-muted-foreground">
                                  <span>优先级</span>
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
                    <p className="font-medium text-foreground">当前企业未配置知识库</p>
                  </div>
                </div>
              )}
                    </CardContent>
                  </Card>
                )}

                {isEnterpriseAdmin && (
                  <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-sans text-xl"><Workflow className="h-5 w-5 text-primary" />专家顾问 Dify Workflow 配置</CardTitle>
                      <CardDescription>设置页只展示当前工作流信息。企业数据库中的 workflow 优先级高于系统默认 workflow；只有当前企业已配置 lead hunter 时才展示该项。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
              {loadingAdvisorConfig && <p className="text-sm text-muted-foreground">正在读取顾问配置...</p>}
              <div className="grid gap-4">
                {advisorCards.map((card) => {
                  const override = advisorOverrides[card.advisorType]
                  const defaultInfo =
                    card.advisorType === "brand-strategy"
                      ? advisorDefaults?.brandStrategy
                      : card.advisorType === "growth"
                        ? advisorDefaults?.growth
                        : advisorDefaults?.leadHunter
                  const hasEnterpriseWorkflow = Boolean(override?.baseUrl && override?.hasApiKey)
                  const enterpriseEnabled = Boolean(hasEnterpriseWorkflow && override?.enabled)
                  const hasSystemDefault = Boolean(defaultInfo?.configured)
                  const statusLabel =
                    card.advisorType === "lead-hunter"
                      ? enterpriseEnabled
                        ? "当前生效：企业数据库"
                        : "当前状态：未启用"
                      : enterpriseEnabled
                        ? "当前生效：企业数据库"
                        : hasSystemDefault
                          ? "当前生效：系统默认"
                          : "当前生效：未配置"
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
                        {card.advisorType === "lead-hunter" ? (
                          <p className="text-xs leading-6 text-muted-foreground">
                            海外猎客没有系统默认 workflow。只有企业数据库里存在可用配置时，侧边栏和 Dashboard 才会显示该入口。
                          </p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1">
                              <span className="text-xs text-muted-foreground">系统默认 Base URL</span>
                              <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-foreground">
                                {defaultInfo?.baseUrl || advisorDefaults?.baseUrl || "未配置"}
                              </span>
                            </div>
                            <div className="grid gap-1">
                              <span className="text-xs text-muted-foreground">系统默认 API Key</span>
                              <span className="rounded-xl border border-border/70 bg-background px-3 py-2 text-foreground">
                                {defaultInfo?.configured ? "已配置" : "未配置"}
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
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">危险操作</p>
                <h2 className="font-sans text-2xl font-semibold text-foreground">会话与退出</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">单独放出退出操作，避免与普通配置动作并排出现导致误触。</p>
              </div>

              <Card className="rounded-[1.75rem] border-destructive/30 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-xl text-destructive"><AlertTriangle className="h-5 w-5" />会话管理</CardTitle>
                  <CardDescription>退出登录会清除当前服务端会话，并返回登录页。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut} className="rounded-full px-5"><LogOut className="mr-2 h-4 w-4" />{isLoggingOut ? "退出中..." : "退出登录"}</Button>
                  {isDemoMode && <p className="text-xs text-muted-foreground">当前为体验账号。</p>}
                </CardContent>
              </Card>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            <div className="rounded-[1.75rem] border border-border/70 bg-card/80 p-5 shadow-[0_20px_60px_-48px_rgba(31,41,55,0.5)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">Management Brief</p>
              <h2 className="mt-2 font-sans text-xl font-semibold text-foreground">当前配置摘要</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">右侧摘要不承载操作，只帮助管理员快速确认企业状态、资源规模和治理负载。</p>
            </div>

            {overviewMetrics.map((metric) => (
              <OverviewMetric key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} hint={metric.hint} tone={metric.tone} />
            ))}

            <div className="rounded-[1.75rem] border border-border/70 bg-card/80 p-5 shadow-[0_20px_60px_-48px_rgba(31,41,55,0.5)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Workflow className="h-4 w-4 text-primary" />
                优化原则
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <p>先确认身份和企业状态，再处理成员准入和权限，最后才是知识库与顾问资源。</p>
                <p>知识库与 workflow 分开展示来源，但在同一个版块内查看，减少“为什么看得到入口却用不了”的理解成本。</p>
                <p>危险操作单独成段，和保存类动作分离，避免误触。</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
