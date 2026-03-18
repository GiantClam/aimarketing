"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, Clock3, LogOut, Save, Shield, User, X } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FEATURE_KEYS, FEATURE_LABELS, buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"
import { isFeatureRuntimeEnabled } from "@/lib/runtime-features"

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

type EnterpriseDifyRemoteDataset = {
  id: string
  name: string
  description: string
  suggestedScope?: EnterpriseDifyDataset["scope"]
  coverageTags?: Array<
    "company-facts" | "product-system" | "application-scenarios" | "technical-proof" | "delivery-service" | "brand-proof" | "faq"
  >
  documentCount?: number
  sampleDocuments?: string[]
}

type EnterpriseAdvisorType = "brand-strategy" | "growth" | "lead-hunter"

type AdvisorSettingsDraft = {
  useDefault: boolean
  baseUrl: string
  apiKey: string
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

const KNOWLEDGE_COVERAGE_LABELS = {
  "company-facts": "企业总览",
  "product-system": "产品体系",
  "application-scenarios": "场景映射",
  "technical-proof": "技术与资质",
  "delivery-service": "交付服务",
  "brand-proof": "品牌与证据",
  faq: "问答资料",
} as const

function formatEnterpriseDifyMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ""
  if (message === "base_url_required") return "请填写 Dify API Base URL。"
  if (message === "api_key_required_when_enabled") return "启用企业知识检索前，请先填写 Dify API Key。"
  if (message === "datasets_required_when_enabled") return "启用企业知识检索前，请至少启用一个知识库。"
  if (message === "dify_config_incomplete") return "请先填写完整的 Dify API Base URL 和 API Key。"
  return message || fallback
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, isDemoMode, isEnterpriseAdmin, updateProfile, refreshProfile, logout } = useAuth()

  const [name, setName] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingAdminData, setLoadingAdminData] = useState(false)
  const [permissionDrafts, setPermissionDrafts] = useState<Record<number, PermissionMap>>({})
  const [difyBaseUrl, setDifyBaseUrl] = useState("")
  const [difyApiKey, setDifyApiKey] = useState("")
  const [difyEnabled, setDifyEnabled] = useState(false)
  const [difyDatasets, setDifyDatasets] = useState<EnterpriseDifyDataset[]>([])
  const [remoteDatasets, setRemoteDatasets] = useState<EnterpriseDifyRemoteDataset[]>([])
  const [loadingDifyConfig, setLoadingDifyConfig] = useState(false)
  const [loadingRemoteDatasets, setLoadingRemoteDatasets] = useState(false)
  const [savingDifyConfig, setSavingDifyConfig] = useState(false)
  const [difyMessage, setDifyMessage] = useState("")
  const [advisorDefaults, setAdvisorDefaults] = useState<{
    baseUrl: string | null
    brandStrategy: { configured: boolean; baseUrl: string | null }
    growth: { configured: boolean; baseUrl: string | null }
    leadHunter: { configured: boolean; baseUrl: string | null }
  } | null>(null)
  const [advisorDrafts, setAdvisorDrafts] = useState<Record<EnterpriseAdvisorType, AdvisorSettingsDraft>>({
    "brand-strategy": { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
    growth: { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
    "lead-hunter": { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
  })
  const [loadingAdvisorConfig, setLoadingAdvisorConfig] = useState(false)
  const [savingAdvisorType, setSavingAdvisorType] = useState<EnterpriseAdvisorType | null>(null)
  const [advisorMessage, setAdvisorMessage] = useState("")

  useEffect(() => {
    setName(user?.name || "")
  }, [user?.name])

  const userId = Number(user?.id)

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
    if (!isEnterpriseAdmin || !Number.isFinite(userId) || userId <= 0) return

    setLoadingDifyConfig(true)
    try {
      const response = await fetch("/api/enterprise/dify", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json()
      const binding = json?.data?.binding
      setDifyBaseUrl(typeof binding?.baseUrl === "string" ? binding.baseUrl : "")
      setDifyApiKey(typeof binding?.apiKey === "string" ? binding.apiKey : "")
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
  }, [isEnterpriseAdmin, userId])

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

      const nextDrafts: Record<EnterpriseAdvisorType, AdvisorSettingsDraft> = {
        "brand-strategy": { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
        growth: { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
        "lead-hunter": { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
      }

      for (const override of overrides) {
        if (
          override?.advisorType === "brand-strategy" ||
          override?.advisorType === "growth" ||
          override?.advisorType === "lead-hunter"
        ) {
          const advisorType = override.advisorType as EnterpriseAdvisorType
          nextDrafts[advisorType] = {
            useDefault: false,
            baseUrl: String(override?.baseUrl || ""),
            apiKey: String(override?.apiKey || ""),
            enabled: Boolean(override?.enabled),
          }
        }
      }

      setAdvisorDrafts(nextDrafts)
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

  const fetchRemoteDifyDatasets = async () => {
    setLoadingRemoteDatasets(true)
    setDifyMessage("")
    try {
      const response = await fetch("/api/enterprise/dify/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: difyBaseUrl, apiKey: difyApiKey }),
      })

      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "知识库拉取失败")
      }

      const datasets: EnterpriseDifyRemoteDataset[] = Array.isArray(json?.data?.datasets) ? json.data.datasets : []
      setRemoteDatasets(datasets)
      setDifyDatasets((current) => {
        const next = [...current]
        for (const dataset of datasets) {
          if (!next.some((item) => item.datasetId === dataset.id)) {
            next.push({
              datasetId: dataset.id,
              datasetName: dataset.name,
              scope: dataset.suggestedScope || "general",
              priority: 100,
              enabled: false,
            })
          }
        }
        return next
      })
      setDifyMessage(`已拉取 ${datasets.length} 个 Dify 知识库。`)
    } catch (error) {
      setDifyMessage(formatEnterpriseDifyMessage(error, "知识库拉取失败"))
    } finally {
      setLoadingRemoteDatasets(false)
    }
  }

  const updateDifyDataset = (datasetId: string, patch: Partial<EnterpriseDifyDataset>) => {
    setDifyDatasets((current) =>
      current.map((dataset) => (dataset.datasetId === datasetId ? { ...dataset, ...patch } : dataset)),
    )
  }

  const saveDifyConfig = async () => {
    const enabledDatasets = difyDatasets.filter((dataset) => dataset.enabled)
    if (difyEnabled && !difyApiKey.trim()) {
      setDifyMessage("启用企业知识检索前，请先填写 Dify API Key。")
      return
    }
    if (difyEnabled && enabledDatasets.length === 0) {
      setDifyMessage("启用企业知识检索前，请至少启用一个知识库。")
      return
    }

    setSavingDifyConfig(true)
    setDifyMessage("")
    try {
      const response = await fetch("/api/enterprise/dify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: difyBaseUrl,
          apiKey: difyApiKey,
          enabled: difyEnabled,
          datasets: enabledDatasets,
        }),
      })

      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "Dify 配置保存失败")
      }

      const binding = json?.data?.binding
      setDifyBaseUrl(typeof binding?.baseUrl === "string" ? binding.baseUrl : difyBaseUrl)
      setDifyApiKey(typeof binding?.apiKey === "string" ? binding.apiKey : difyApiKey)
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
      setDifyMessage("Dify 企业知识配置已保存。")
    } catch (error) {
      setDifyMessage(formatEnterpriseDifyMessage(error, "Dify 配置保存失败"))
    } finally {
      setSavingDifyConfig(false)
    }
  }

  const updateAdvisorDraft = (advisorType: EnterpriseAdvisorType, patch: Partial<AdvisorSettingsDraft>) => {
    setAdvisorDrafts((current) => ({
      ...current,
      [advisorType]: {
        ...current[advisorType],
        ...patch,
      },
    }))
  }

  const saveAdvisorConfig = async (advisorType: EnterpriseAdvisorType) => {
    setSavingAdvisorType(advisorType)
    setAdvisorMessage("")
    try {
      const draft = advisorDrafts[advisorType]
      const response = await fetch("/api/enterprise/dify/advisors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advisorType,
          useDefault: draft.useDefault,
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey,
          enabled: draft.enabled,
        }),
      })

      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "顾问配置保存失败")
      }

      const defaults = json?.data?.defaults
      const overrides = Array.isArray(json?.data?.overrides) ? json.data.overrides : []
      setAdvisorDefaults(defaults)

      const nextDrafts: Record<EnterpriseAdvisorType, AdvisorSettingsDraft> = {
        "brand-strategy": { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
        growth: { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
        "lead-hunter": { useDefault: true, baseUrl: "", apiKey: "", enabled: true },
      }

      for (const override of overrides) {
        if (
          override?.advisorType === "brand-strategy" ||
          override?.advisorType === "growth" ||
          override?.advisorType === "lead-hunter"
        ) {
          const advisorType = override.advisorType as EnterpriseAdvisorType
          nextDrafts[advisorType] = {
            useDefault: false,
            baseUrl: String(override?.baseUrl || ""),
            apiKey: String(override?.apiKey || ""),
            enabled: Boolean(override?.enabled),
          }
        }
      }

      setAdvisorDrafts(nextDrafts)
      setAdvisorMessage(
        `${advisorType === "brand-strategy" ? "品牌顾问" : advisorType === "growth" ? "增长顾问" : "海外猎客"} 配置已保存。`,
      )
    } catch (error) {
      setAdvisorMessage(error instanceof Error ? error.message : "顾问配置保存失败")
    } finally {
      setSavingAdvisorType(null)
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
  const advisorCards: Array<{ advisorType: EnterpriseAdvisorType; title: string; description: string }> = [
    {
      advisorType: "brand-strategy",
      title: "品牌顾问",
      description: "默认走系统品牌顾问 workflow；如需企业专属 workflow，可在这里覆盖。",
    },
    {
      advisorType: "growth",
      title: "增长顾问",
      description: "默认走系统增长顾问 workflow；如需企业专属 workflow，可在这里覆盖。",
    },
    {
      advisorType: "lead-hunter",
      title: "海外猎客",
      description: "仅在企业数据库里配置后才展示。会话交互与专家顾问一致，但每次只触发当前搜索条件对应的 Dify workflow。",
    },
  ]

  return (
    <div className="h-full overflow-y-auto bg-muted/10 p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="font-sans text-2xl font-bold text-foreground">用户设置</h1>
            <p className="mt-1 text-sm font-manrope text-muted-foreground">管理账号资料、企业归属和成员权限。</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" />账号信息</CardTitle>
              <CardDescription>可修改显示名称。企业信息由企业管理员维护。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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

              <div className="grid gap-4 md:grid-cols-4">
                <div className="grid gap-2"><Label>企业 ID</Label><Input value={user?.enterpriseCode || "未绑定"} disabled /></div>
                <div className="grid gap-2"><Label>企业名称</Label><Input value={user?.enterpriseName || "未绑定"} disabled /></div>
                <div className="grid gap-2"><Label>企业角色</Label><Input value={user?.enterpriseRole || "未知"} disabled /></div>
                <div className="grid gap-2"><Label>账号状态</Label><Input value={statusText} disabled /></div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveProfile} disabled={isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? "保存中..." : "保存设置"}</Button>
                {saveMessage && <span className="text-sm text-muted-foreground">{saveMessage}</span>}
              </div>
            </CardContent>
          </Card>

          {user?.enterpriseStatus === "pending" && (
            <Card className="border-amber-300 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700"><Clock3 className="h-4 w-4" />加入企业待审核</CardTitle>
                <CardDescription>企业管理员审核通过后，企业功能权限才会生效。</CardDescription>
              </CardHeader>
            </Card>
          )}

          {isEnterpriseAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />企业成员申请审核</CardTitle>
                <CardDescription>审核待加入企业的成员申请。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingAdminData && <p className="text-sm text-muted-foreground">加载中...</p>}
                {!loadingAdminData && requests.length === 0 && <p className="text-sm text-muted-foreground">暂无待审核申请。</p>}
                {requests.map((request) => (
                  <div key={request.requestId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{request.userName}（{request.userEmail}）</p>
                      <p className="text-xs text-muted-foreground">申请时间：{new Date(request.createdAt).toLocaleString()}</p>
                      {request.note && <p className="text-xs text-muted-foreground">说明：{request.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => reviewRequest(request.requestId, "reject")}><X className="mr-1 h-4 w-4" />拒绝</Button>
                      <Button size="sm" onClick={() => reviewRequest(request.requestId, "approve")}><Check className="mr-1 h-4 w-4" />通过</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isEnterpriseAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4" />成员功能权限</CardTitle>
              <CardDescription>配置成员可访问的功能模块。开启“专家顾问”后，成员可看到品牌顾问与增长顾问；企业管理员始终可见。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {members.map((member) => {
                  const draft = permissionDrafts[member.id] || buildPermissionMap(false)
                  return (
                    <div key={member.id} className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{member.name}（{member.email}）</p>
                          <p className="text-xs text-muted-foreground">角色：{member.enterpriseRole || "member"} / 状态：{member.enterpriseStatus || "unknown"}</p>
                        </div>
                        <Button size="sm" onClick={() => saveMemberPermissions(member.id)} disabled={member.enterpriseStatus !== "active"}>保存权限</Button>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        {configurableFeatureKeys.map((feature) => (
                          <label key={feature} className="flex items-center gap-2 text-sm">
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
          )}

          {isEnterpriseAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />Dify 企业知识库</CardTitle>
                <CardDescription>配置企业统一的 Dify API 与知识库绑定。当前写作助手已接入，其他 agent 后续也可按检索用途复用这套企业知识。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="dify-base-url">Dify API Base URL</Label>
                    <Input
                      id="dify-base-url"
                      value={difyBaseUrl}
                      onChange={(event) => setDifyBaseUrl(event.target.value)}
                      placeholder="https://your-dify.example.com/v1"
                    />
                    <p className="text-xs text-muted-foreground">建议填写包含 <code>/v1</code> 的 API 基础地址；未填写时企业知识检索不会启用。</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dify-api-key">Dify API Key</Label>
                    <Input
                      id="dify-api-key"
                      value={difyApiKey}
                      onChange={(event) => setDifyApiKey(event.target.value)}
                      placeholder="app-xxx / dataset-scope key"
                    />
                    <p className="text-xs text-muted-foreground">仅企业管理员可查看和修改。当前已启用 {enabledDifyDatasetCount} 个知识库。</p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={difyEnabled}
                    onChange={(event) => setDifyEnabled(event.target.checked)}
                  />
                  <span>启用企业统一知识检索</span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={fetchRemoteDifyDatasets}
                    disabled={loadingRemoteDatasets || !difyBaseUrl.trim() || !difyApiKey.trim()}
                  >
                    {loadingRemoteDatasets ? "拉取中..." : "测试并拉取知识库"}
                  </Button>
                  <Button onClick={saveDifyConfig} disabled={savingDifyConfig || !difyBaseUrl.trim()}>
                    {savingDifyConfig ? "保存中..." : "保存 Dify 配置"}
                  </Button>
                  {loadingDifyConfig && <span className="text-sm text-muted-foreground">正在读取已保存配置...</span>}
                  {difyMessage && <span className="text-sm text-muted-foreground">{difyMessage}</span>}
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">知识库绑定与检索用途</p>
                      <p className="text-xs text-muted-foreground">
                        为企业配置统一可复用的 Dify 知识库，并指定主要检索用途。系统会根据文档自动给出建议用途，便于后续按 agent、场景和工作流复用。
                      </p>
                      <p className="text-xs text-muted-foreground">优先级数字越小越靠前；当前单次检索最多使用前 4 个符合用途的知识库。</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      已发现 {remoteDatasets.length} 个 / 已启用 {enabledDifyDatasetCount} 个
                    </span>
                  </div>

                  {difyDatasets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">先填写 Dify 配置并点击“测试并拉取知识库”。</p>
                  ) : (
                    <div className="space-y-3">
                      {difyDatasets.map((dataset) => {
                        const remote = remoteDatasets.find((item) => item.id === dataset.datasetId)
                        return (
                          <div key={dataset.datasetId} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <label className="flex items-start gap-3 text-sm">
                                <input
                                  type="checkbox"
                                  className="mt-1 rounded border-border"
                                  checked={dataset.enabled}
                                  onChange={(event) => updateDifyDataset(dataset.datasetId, { enabled: event.target.checked })}
                                />
                                <span className="space-y-1">
                                  <span className="block font-medium">{dataset.datasetName}</span>
                                  <span className="block text-xs text-muted-foreground">{remote?.description || dataset.datasetId}</span>
                                  {remote?.coverageTags && remote.coverageTags.length > 0 && (
                                    <span className="block text-xs text-muted-foreground">
                                      建议配置：{KNOWLEDGE_SCOPE_OPTIONS.find((option) => option.value === (remote.suggestedScope || "general"))?.label || "综合资料"}
                                      {" · 覆盖 "}
                                      {remote.coverageTags
                                        .map((tag) => KNOWLEDGE_COVERAGE_LABELS[tag])
                                        .filter(Boolean)
                                        .join(" / ")}
                                    </span>
                                  )}
                                  {remote?.sampleDocuments && remote.sampleDocuments.length > 0 && (
                                    <span className="block text-xs text-muted-foreground">
                                      样本文档：{remote.sampleDocuments.slice(0, 3).join(" / ")}
                                    </span>
                                  )}
                                </span>
                              </label>
                              <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  <span>检索用途</span>
                                  <select
                                    className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
                                    value={dataset.scope}
                                    onChange={(event) =>
                                      updateDifyDataset(dataset.datasetId, {
                                        scope: event.target.value as EnterpriseDifyDataset["scope"],
                                      })
                                    }
                                  >
                                    {KNOWLEDGE_SCOPE_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  <span>优先级</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={dataset.priority}
                                    onChange={(event) =>
                                      updateDifyDataset(dataset.datasetId, { priority: Number(event.target.value || 100) })
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isEnterpriseAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4" />专家顾问 Dify Workflow 配置</CardTitle>
              <CardDescription>品牌顾问和增长顾问默认走系统通用 workflow，所有已激活企业管理员可直接使用；如企业配置了专属 workflow，会覆盖系统默认配置。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingAdvisorConfig && <p className="text-sm text-muted-foreground">正在读取顾问配置...</p>}
                {advisorMessage && <p className="text-sm text-muted-foreground">{advisorMessage}</p>}
                <div className="grid gap-4">
                  {advisorCards.map((card) => {
                    const draft = advisorDrafts[card.advisorType]
                    const defaultInfo =
                      card.advisorType === "brand-strategy"
                        ? advisorDefaults?.brandStrategy
                        : card.advisorType === "growth"
                          ? advisorDefaults?.growth
                          : advisorDefaults?.leadHunter
                    return (
                      <div key={card.advisorType} className="space-y-4 rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{card.title}</p>
                            <p className="text-xs text-muted-foreground">{card.description}</p>
                          </div>
                          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                            {draft.useDefault ? (card.advisorType === "lead-hunter" ? "当前：未配置" : "当前：系统默认") : "当前：企业定制"}
                          </span>
                        </div>

                        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                          {card.advisorType === "lead-hunter" ? (
                            <>
                              <p>海外猎客没有系统默认配置。</p>
                              <p>只有保存企业定制 Base URL 和 API Key 后，侧边栏和 Dashboard 才会显示该入口。</p>
                            </>
                          ) : (
                            <>
                              <p>系统默认 Base URL：{defaultInfo?.baseUrl || advisorDefaults?.baseUrl || "未配置"}</p>
                              <p>系统默认 Key：{defaultInfo?.configured ? "已配置" : "未配置"}</p>
                            </>
                          )}
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={draft.useDefault}
                            onChange={(event) => updateAdvisorDraft(card.advisorType, { useDefault: event.target.checked })}
                          />
                          <span>{card.advisorType === "lead-hunter" ? "关闭海外猎客入口（删除企业配置）" : "使用系统默认配置"}</span>
                        </label>

                        {!draft.useDefault && (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label htmlFor={`${card.advisorType}-base-url`}>企业定制 Base URL</Label>
                              <Input
                                id={`${card.advisorType}-base-url`}
                                value={draft.baseUrl}
                                onChange={(event) => updateAdvisorDraft(card.advisorType, { baseUrl: event.target.value })}
                                placeholder="https://your-dify.example.com/v1"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`${card.advisorType}-api-key`}>企业定制 API Key</Label>
                              <Input
                                id={`${card.advisorType}-api-key`}
                                value={draft.apiKey}
                                onChange={(event) => updateAdvisorDraft(card.advisorType, { apiKey: event.target.value })}
                                placeholder="app-xxx"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm md:col-span-2">
                              <input
                                type="checkbox"
                                className="rounded border-border"
                                checked={draft.enabled}
                                onChange={(event) => updateAdvisorDraft(card.advisorType, { enabled: event.target.checked })}
                              />
                              <span>启用企业定制顾问配置</span>
                            </label>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <Button onClick={() => saveAdvisorConfig(card.advisorType)} disabled={savingAdvisorType === card.advisorType}>
                            {savingAdvisorType === card.advisorType ? "保存中..." : `保存${card.title}配置`}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive"><Shield className="h-4 w-4" />会话管理</CardTitle>
              <CardDescription>退出登录会清除当前服务端会话，并返回登录页。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut}><LogOut className="mr-2 h-4 w-4" />{isLoggingOut ? "退出中..." : "退出登录"}</Button>
              {isDemoMode && <p className="mt-2 text-xs text-muted-foreground">当前为体验账号。</p>}
            </CardContent>
          </Card>
        </div>
      </div>
  )
}
