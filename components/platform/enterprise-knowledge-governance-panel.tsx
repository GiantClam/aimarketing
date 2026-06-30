"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Database, Workflow } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AppLocale } from "@/lib/i18n/config"
import {
  summarizeSharedKnowledgeTargets,
  type EnterpriseKnowledgeGovernanceDataset,
} from "@/lib/knowledge/governance-targets"
import {
  summarizeWorkflowKnowledgeUsage,
  type WorkflowKnowledgeGovernanceSummary,
} from "@/lib/workflows/knowledge-governance"
import { isWorkflowNodeType, type WorkflowDefinitionNode } from "@/lib/workflows/schema"

type EnterpriseDifyDataset = {
  datasetId: string
  datasetName: string
  scope: "general" | "brand" | "product" | "case-study" | "compliance" | "campaign"
  priority: number
  enabled: boolean
}

type EnterpriseAdvisorType = "brand-strategy" | "growth" | "lead-hunter" | "company-search" | "contact-mining"
type LeadHunterAdvisorType = "lead-hunter"

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

type CustomAgentKnowledgeGovernanceItem = {
  id: number
  name: string
  status: "draft" | "published" | "disabled" | "archived"
  knowledgeBindingDetails: Array<{ id: number; name: string }>
  enterpriseKnowledgeBindingDetails: Array<{ id: number; name: string; category: string }>
  knowledgeRetrievalPolicy: {
    retrievalMode?: "semantic" | "keyword" | "hybrid"
    maxChunks?: number
    requiredCitations?: boolean
  } | null
}

type WorkflowKnowledgeApiRecord = {
  id: number
  title: string
  status: string
  nodes: Array<{
    nodeKey: string
    type: string
    title: string
    config: Record<string, unknown>
    positionX: number
    positionY: number
  }>
}

type PersonalKnowledgeDocumentItem = {
  id: number
  datasetId: number
  datasetName: string
  name: string
  sourceType: string
  status: string
  chunkCount: number
  updatedAt: string
}

type PersonalKnowledgeActivityItem = {
  id: string
  documentId: number
  title: string
  datasetName: string
  status: string
  at: string | null
}

type KnowledgeSaveQueueItem = {
  id: number
  artifactId: number
  status: "queued" | "running" | "succeeded" | "failed" | "rejected"
  targetType: string
  requestPayload: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: string | null
  updatedAt: string | null
  artifact: {
    id: number
    runId: number
    title: string
    mimeType: string | null
    createdAt: string | null
  } | null
}

function formatEnterpriseDifyMessage(error: unknown, fallback: string, locale: AppLocale) {
  const isZh = locale === "zh"
  const message = error instanceof Error ? error.message : ""
  if (message === "base_url_required") return isZh ? "请填写 Dify API Base URL。" : "Please provide Dify API Base URL."
  if (message === "api_key_required_when_enabled") return isZh ? "启用企业知识检索前，请先填写 Dify API Key。" : "Please provide Dify API Key before enabling enterprise knowledge retrieval."
  if (message === "datasets_required_when_enabled") return isZh ? "启用企业知识检索前，请至少启用一个知识库。" : "Enable at least one dataset before enabling enterprise knowledge retrieval."
  if (message === "dify_config_incomplete") return isZh ? "请先填写完整的 Dify API Base URL 和 API Key。" : "Please complete Dify API Base URL and API Key first."
  return message || fallback
}

const panelClassName = "dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85"
const shellClassName = "dashboard-panel rounded-[8px] border border-border bg-background/80 shadow-none"
const insetClassName = "dashboard-panel rounded-[8px] border border-border bg-card/88 shadow-none"
const toggleClassName =
  "dashboard-chip flex items-center gap-2 rounded-[6px] border border-border/80 bg-card px-3 py-2 text-sm text-foreground"
const tagClassName =
  "dashboard-chip inline-flex items-center rounded-[6px] border border-border/80 bg-background px-3 py-2 text-[11px] tracking-[0.14em] text-foreground"
const inputClassName =
  "dashboard-chip h-11 rounded-[6px] border-border/80 bg-background px-3 font-mono text-xs tracking-[0.03em] text-foreground disabled:opacity-100"

export function EnterpriseKnowledgeGovernancePanel({
  locale,
  currentUserId,
  canView,
  canManage,
}: {
  locale: AppLocale
  currentUserId: number
  canView: boolean
  canManage: boolean
}) {
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])

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

  const [difyBaseUrl, setDifyBaseUrl] = useState("")
  const [difyApiKeyMasked, setDifyApiKeyMasked] = useState("")
  const [difyHasApiKey, setDifyHasApiKey] = useState(false)
  const [difyEnabled, setDifyEnabled] = useState(false)
  const [difyDatasets, setDifyDatasets] = useState<EnterpriseDifyDataset[]>([])
  const [enterpriseDatasetGovernance, setEnterpriseDatasetGovernance] = useState<EnterpriseKnowledgeGovernanceDataset[]>([])
  const [loadingDifyConfig, setLoadingDifyConfig] = useState(false)
  const [savingDifyConfig, setSavingDifyConfig] = useState(false)
  const [difyMessage, setDifyMessage] = useState("")

  const [advisorDefaults, setAdvisorDefaults] = useState<AdvisorDefaultsSummary | null>(null)
  const [advisorOverrides, setAdvisorOverrides] = useState<Partial<Record<EnterpriseAdvisorType, AdvisorOverrideSummary>>>({})
  const [loadingAdvisorConfig, setLoadingAdvisorConfig] = useState(false)
  const [leadHunterModeDrafts, setLeadHunterModeDrafts] = useState<Partial<Record<LeadHunterAdvisorType, "dify" | "skill">>>({})
  const [savingLeadHunterAdvisorType, setSavingLeadHunterAdvisorType] = useState<LeadHunterAdvisorType | null>(null)
  const [advisorConfigMessage, setAdvisorConfigMessage] = useState("")
  const [customAgents, setCustomAgents] = useState<CustomAgentKnowledgeGovernanceItem[]>([])
  const [loadingCustomAgents, setLoadingCustomAgents] = useState(false)
  const [workflowKnowledge, setWorkflowKnowledge] = useState<WorkflowKnowledgeGovernanceSummary[]>([])
  const [loadingWorkflowKnowledge, setLoadingWorkflowKnowledge] = useState(false)
  const [personalKnowledgeDocuments, setPersonalKnowledgeDocuments] = useState<PersonalKnowledgeDocumentItem[]>([])
  const [personalKnowledgeActivity, setPersonalKnowledgeActivity] = useState<PersonalKnowledgeActivityItem[]>([])
  const [loadingPersonalKnowledge, setLoadingPersonalKnowledge] = useState(false)
  const [knowledgeSaveQueue, setKnowledgeSaveQueue] = useState<KnowledgeSaveQueueItem[]>([])
  const [loadingKnowledgeSaveQueue, setLoadingKnowledgeSaveQueue] = useState(false)
  const [knowledgeSaveQueueMessage, setKnowledgeSaveQueueMessage] = useState("")
  const [knowledgeSaveQueueAction, setKnowledgeSaveQueueAction] = useState<{ jobId: number; action: "approve" | "reject" } | null>(null)

  const enabledDifyDatasetCount = useMemo(
    () => difyDatasets.filter((dataset) => dataset.enabled).length,
    [difyDatasets],
  )
  const hasEnterpriseKnowledgeBinding = useMemo(
    () => Boolean(difyBaseUrl.trim() || difyHasApiKey || difyDatasets.length > 0),
    [difyBaseUrl, difyDatasets.length, difyHasApiKey],
  )
  const sharedKnowledgeTargets = useMemo(
    () => summarizeSharedKnowledgeTargets(enterpriseDatasetGovernance),
    [enterpriseDatasetGovernance],
  )

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

  const loadDifyConfig = useCallback(async () => {
    if (!canView || !Number.isFinite(currentUserId) || currentUserId <= 0) return

    setLoadingDifyConfig(true)
    try {
      const [response, governanceResponse] = await Promise.all([
        fetch("/api/enterprise/dify", { cache: "no-store" }),
        fetch("/api/knowledge/datasets?includeBindings=1", { cache: "no-store" }),
      ])
      if (!response.ok) return
      const [json, governanceJson] = await Promise.all([
        response.json(),
        governanceResponse.ok ? governanceResponse.json().catch(() => null) : Promise.resolve(null),
      ])
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
      setEnterpriseDatasetGovernance(
        Array.isArray(governanceJson?.data?.items)
          ? (governanceJson.data.items as EnterpriseKnowledgeGovernanceDataset[])
          : [],
      )
    } finally {
      setLoadingDifyConfig(false)
    }
  }, [canView, currentUserId])

  const loadAdvisorConfig = useCallback(async () => {
    if (!canManage || !Number.isFinite(currentUserId) || currentUserId <= 0) return

    setLoadingAdvisorConfig(true)
    try {
      const response = await fetch("/api/enterprise/dify/advisors", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json()
      applyAdvisorConfigPayload(json?.data)
    } finally {
      setLoadingAdvisorConfig(false)
    }
  }, [applyAdvisorConfigPayload, canManage, currentUserId])

  const loadCustomAgents = useCallback(async () => {
    if (!canManage || !Number.isFinite(currentUserId) || currentUserId <= 0) return

    setLoadingCustomAgents(true)
    try {
      const response = await fetch("/api/platform/custom-agents", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json().catch(() => null)
      const items: Record<string, unknown>[] = Array.isArray(json?.data?.items)
        ? json.data.items.filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        : []
      setCustomAgents(
        items
          .map((item): CustomAgentKnowledgeGovernanceItem => ({
            id: Number(item.id || 0),
            name: String(item.name || ""),
            status:
              item.status === "published" || item.status === "disabled" || item.status === "archived"
                ? item.status
                : "draft",
            knowledgeBindingDetails: Array.isArray(item.knowledgeBindingDetails)
              ? item.knowledgeBindingDetails
                  .filter((detail: unknown): detail is { id: number; name: string } => Boolean(detail && typeof detail === "object" && Number.isInteger((detail as { id?: unknown }).id) && typeof (detail as { name?: unknown }).name === "string"))
              : [],
            enterpriseKnowledgeBindingDetails: Array.isArray(item.enterpriseKnowledgeBindingDetails)
              ? item.enterpriseKnowledgeBindingDetails
                  .filter((detail: unknown): detail is { id: number; name: string; category: string } =>
                    Boolean(
                      detail &&
                        typeof detail === "object" &&
                        Number.isInteger((detail as { id?: unknown }).id) &&
                        typeof (detail as { name?: unknown }).name === "string" &&
                        typeof (detail as { category?: unknown }).category === "string",
                    ),
                  )
              : [],
            knowledgeRetrievalPolicy:
              item.knowledgeRetrievalPolicy && typeof item.knowledgeRetrievalPolicy === "object"
                ? (item.knowledgeRetrievalPolicy as CustomAgentKnowledgeGovernanceItem["knowledgeRetrievalPolicy"])
                : null,
          }))
          .filter((item) => item.id > 0),
      )
    } finally {
      setLoadingCustomAgents(false)
    }
  }, [canManage, currentUserId])

  const loadWorkflowKnowledge = useCallback(async () => {
    if (!canView || !Number.isFinite(currentUserId) || currentUserId <= 0) return

    setLoadingWorkflowKnowledge(true)
    try {
      const response = await fetch("/api/workflows", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json().catch(() => null)
      const items = Array.isArray(json?.data) ? (json.data as WorkflowKnowledgeApiRecord[]) : []
      const normalized = items
        .filter((item): item is WorkflowKnowledgeApiRecord => Boolean(item && typeof item === "object" && Array.isArray(item.nodes)))
        .map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          nodes: item.nodes
            .filter(
              (node): node is WorkflowDefinitionNode =>
                Boolean(
                  node &&
                    typeof node === "object" &&
                    typeof node.nodeKey === "string" &&
                    typeof node.title === "string" &&
                    typeof node.positionX === "number" &&
                    typeof node.positionY === "number" &&
                    node.config &&
                    typeof node.config === "object" &&
                    isWorkflowNodeType(node.type),
                ),
            )
            .map((node) => ({
              nodeKey: node.nodeKey,
              type: node.type,
              title: node.title,
              positionX: node.positionX,
              positionY: node.positionY,
              config: node.config,
            })),
        }))
      setWorkflowKnowledge(
        summarizeWorkflowKnowledgeUsage(normalized),
      )
    } finally {
      setLoadingWorkflowKnowledge(false)
    }
  }, [canView, currentUserId])

  const loadPersonalKnowledge = useCallback(async () => {
    if (!canView || !Number.isFinite(currentUserId) || currentUserId <= 0) return

    setLoadingPersonalKnowledge(true)
    try {
      const [documentsResponse, activityResponse] = await Promise.all([
        fetch("/api/knowledge/personal-documents", { cache: "no-store" }),
        fetch("/api/knowledge/personal-activity", { cache: "no-store" }),
      ])
      const [documentsJson, activityJson] = await Promise.all([
        documentsResponse.json().catch(() => null),
        activityResponse.json().catch(() => null),
      ])

      const documents = Array.isArray(documentsJson?.data?.items)
        ? (documentsJson.data.items as PersonalKnowledgeDocumentItem[])
        : []
      const activity = Array.isArray(activityJson?.data?.items)
        ? (activityJson.data.items as PersonalKnowledgeActivityItem[])
        : []

      setPersonalKnowledgeDocuments(documents)
      setPersonalKnowledgeActivity(activity)
    } finally {
      setLoadingPersonalKnowledge(false)
    }
  }, [canView, currentUserId])

  const loadKnowledgeSaveQueue = useCallback(async () => {
    if (!canView || !Number.isFinite(currentUserId) || currentUserId <= 0) return

    setLoadingKnowledgeSaveQueue(true)
    try {
      const response = await fetch("/api/platform/knowledge-save-jobs?limit=20", { cache: "no-store" })
      if (!response.ok) return
      const json = await response.json().catch(() => null)
      const items = Array.isArray(json?.data?.items) ? (json.data.items as KnowledgeSaveQueueItem[]) : []
      setKnowledgeSaveQueue(items)
    } finally {
      setLoadingKnowledgeSaveQueue(false)
    }
  }, [canView, currentUserId])

  useEffect(() => {
    void loadDifyConfig()
  }, [loadDifyConfig])

  useEffect(() => {
    void loadAdvisorConfig()
  }, [loadAdvisorConfig])

  useEffect(() => {
    void loadCustomAgents()
  }, [loadCustomAgents])

  useEffect(() => {
    void loadWorkflowKnowledge()
  }, [loadWorkflowKnowledge])

  useEffect(() => {
    void loadPersonalKnowledge()
  }, [loadPersonalKnowledge])

  useEffect(() => {
    void loadKnowledgeSaveQueue()
  }, [loadKnowledgeSaveQueue])

  const resolveKnowledgeSaveQueueJob = async (jobId: number, action: "approve" | "reject") => {
    setKnowledgeSaveQueueAction({ jobId, action })
    setKnowledgeSaveQueueMessage("")
    try {
      const response = await fetch(`/api/platform/knowledge-save-jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "knowledge_save_job_action_failed")
      }
      await loadKnowledgeSaveQueue()
      setKnowledgeSaveQueueMessage(
        action === "approve"
          ? t("知识入库任务已确认。", "Knowledge save job approved.")
          : t("知识入库任务已驳回。", "Knowledge save job rejected."),
      )
    } catch (error) {
      setKnowledgeSaveQueueMessage(
        error instanceof Error ? error.message : t("知识入库任务处理失败。", "Failed to resolve knowledge save job."),
      )
    } finally {
      setKnowledgeSaveQueueAction(null)
    }
  }

  const updateEnterpriseDifyEnabled = async (nextEnabled: boolean) => {
    if (!canManage) return

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
        setAdvisorConfigMessage(error instanceof Error ? error.message : t("保存顾问配置失败。", "Failed to save advisor config."))
      }
    } finally {
      setSavingLeadHunterAdvisorType(null)
    }
  }

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

  if (!canView && !canManage) {
    return (
      <article className={panelClassName}>
        <div className="dashboard-kicker text-muted-foreground">{t("Knowledge governance", "Knowledge governance")}</div>
        <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
          {t("企业知识配置", "Enterprise knowledge settings")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          {t("企业激活后，成员才能看到统一知识检索绑定；企业管理员还会额外看到顾问工作流配置。", "After enterprise activation, members can inspect shared knowledge bindings; active admins also get advisor workflow controls.")}
        </p>
      </article>
    )
  }

  return (
    <div className="space-y-6">
      {canView ? (
        <article className={panelClassName}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="dashboard-kicker text-muted-foreground">{t("Knowledge retrieval", "Knowledge retrieval")}</div>
              <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {t("企业知识绑定", "Enterprise knowledge bindings")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t("知识连接地址与鉴权已迁到企业设置；这里继续承接共享知识检索的启停状态和绑定的 dataset 列表。", "The shared knowledge connection now lives in enterprise settings; this panel owns retrieval enablement and the bound dataset list.")}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {hasEnterpriseKnowledgeBinding ? (
              <>
                <div className={`${shellClassName} p-4 text-sm text-muted-foreground`}>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{t("当前企业已配置知识库", "Knowledge base configured for current enterprise")}</p>
                    <p>{t("已读取数据库中的 Dify Base URL、脱敏 API Key 和 dataset 绑定信息。", "Loaded Dify Base URL, masked API key, and dataset bindings from database.")}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="enterprise-dify-base-url">{t("Dify API 基础地址", "Dify API Base URL")}</Label>
                    <Input
                      id="enterprise-dify-base-url"
                      value={difyBaseUrl || t("未在数据库中配置", "Not configured in database")}
                      disabled
                      className={inputClassName}
                    />
                    <p className="text-xs text-muted-foreground">{t("只读展示当前数据库中的企业 Dify Base URL；如需修改，请更新企业设置中的连接配置。", "Read-only display of the enterprise Dify Base URL. Update the connection inside enterprise settings to change it.")}</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="enterprise-dify-api-key">{t("Dify API 密钥", "Dify API Key")}</Label>
                    <Input
                      id="enterprise-dify-api-key"
                      value={difyHasApiKey ? difyApiKeyMasked : t("未在数据库中配置", "Not configured in database")}
                      disabled
                      className={inputClassName}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("API Key 已做脱敏展示，不会在页面明文返回。当前已启用 ", "API key is masked and never returned in plain text. Currently enabled ")}
                      {enabledDifyDatasetCount}
                      {t(" 个知识库。", " dataset(s).")}
                    </p>
                  </div>
                </div>

                <label className={`${toggleClassName} bg-background px-4 py-3`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-none border-border bg-background accent-primary"
                    checked={difyEnabled}
                    disabled={!canManage || savingDifyConfig}
                    onChange={(event) => void updateEnterpriseDifyEnabled(event.target.checked)}
                  />
                  <span>
                    {t("启用企业统一知识检索", "Enable enterprise knowledge retrieval")}
                    {!canManage ? t("（由企业管理员维护）", " (maintained by admins)") : ""}
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  {loadingDifyConfig ? <span className="text-sm text-muted-foreground">{t("正在读取已保存配置...", "Loading saved configuration...")}</span> : null}
                  {savingDifyConfig ? <span className="text-sm text-muted-foreground">{t("正在更新企业知识库状态...", "Updating enterprise knowledge status...")}</span> : null}
                  {difyMessage ? <span className="text-sm text-muted-foreground">{difyMessage}</span> : null}
                </div>

                <div className={`${shellClassName} space-y-3 p-4`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("知识库绑定与检索用途", "Dataset bindings and retrieval use")}</p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        {t("当前页只展示已保存的 dataset 绑定，不在这里做远端拉取和页面内编辑，避免共享 Dify 时误拉到其他企业知识库。", "This page shows saved dataset bindings only. Remote pulls and inline editing stay disabled to avoid cross-enterprise mistakes in shared Dify setups.")}
                      </p>
                      <p className="text-xs leading-6 text-muted-foreground">{t("优先级数字越小越靠前；当前单次检索最多使用前 4 个符合用途的知识库。", "Lower priority number means earlier usage. A single retrieval uses up to 4 matching datasets.")}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t("数据库已配置 ", "Configured ")}
                      {difyDatasets.length}
                      {t(" 个 / 已启用 ", " / Enabled ")}
                      {enabledDifyDatasetCount}
                      {t(" 个", "")}
                    </span>
                  </div>

                  {difyDatasets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("当前没有已保存的 dataset 绑定。请直接在数据库中维护 `enterprise_dify_datasets`。", "No saved dataset bindings. Maintain `enterprise_dify_datasets` in database directly.")}</p>
                  ) : (
                    <div className="space-y-3">
                      {difyDatasets.map((dataset) => (
                        <div key={dataset.datasetId} className={`${insetClassName} p-4`}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1 text-sm">
                              <p className="font-medium text-foreground">{dataset.datasetName}</p>
                              <p className="text-xs text-muted-foreground">{dataset.datasetId}</p>
                            </div>
                            <div className="grid min-w-[220px] gap-3 sm:grid-cols-3">
                              <div className="grid gap-1 text-xs text-muted-foreground">
                                <span>{t("状态", "Status")}</span>
                                <span className={tagClassName}>{dataset.enabled ? t("已启用", "Enabled") : t("已停用", "Disabled")}</span>
                              </div>
                              <div className="grid gap-1 text-xs text-muted-foreground">
                                <span>{t("检索用途", "Scope")}</span>
                                <span className={tagClassName}>
                                  {knowledgeScopeOptions.find((option) => option.value === dataset.scope)?.label || dataset.scope}
                                </span>
                              </div>
                              <div className="grid gap-1 text-xs text-muted-foreground">
                                <span>{t("优先级", "Priority")}</span>
                                <span className={tagClassName}>{dataset.priority}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={`${shellClassName} space-y-3 p-4`}>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("知识绑定目标", "Knowledge binding targets")}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {t("展示企业知识数据集当前挂到哪些共享入口，便于核对 AI 对话、Writer 和顾问外部知识是否已纳入统一治理。", "Shows which shared targets each enterprise dataset is bound to so AI chat, Writer, and advisor external knowledge stay under one governance view.")}
                    </p>
                  </div>

                  {enterpriseDatasetGovernance.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("当前没有企业级知识绑定目标。", "No enterprise knowledge binding targets yet.")}</p>
                  ) : (
                    <div className="space-y-3">
                      {enterpriseDatasetGovernance.map((dataset) => (
                        <div key={dataset.id} className={`${insetClassName} p-4`}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">{dataset.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                #{dataset.id} · {dataset.category}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {dataset.bindings.length === 0 ? (
                                <span className="text-sm text-muted-foreground">{t("未绑定共享目标", "No shared targets")}</span>
                              ) : (
                                dataset.bindings.map((binding) => (
                                  <span key={binding.id} className={tagClassName}>
                                    {binding.targetType === "ai_entry"
                                      ? t("AI 对话", "AI chat")
                                      : binding.targetType === "writer"
                                        ? "Writer"
                                        : t("顾问外部知识", "Advisor external knowledge")}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={`${shellClassName} p-4 text-sm text-muted-foreground`}>
                <p className="font-medium text-foreground">{t("当前企业未配置知识库", "No knowledge base configured for current enterprise")}</p>
              </div>
            )}
          </div>
        </article>
      ) : null}

      {canView ? (
        <article className={panelClassName}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="dashboard-kicker text-muted-foreground">{t("Personal knowledge", "Personal knowledge")}</div>
              <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {t("我的知识条目与最近写入", "My knowledge items and recent writes")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t("这里展示当前用户自己的知识条目，以及最近一次写入或更新的个人知识记录。", "This shows the current user's personal knowledge items and the most recent personal writes or updates.")}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <div className={`${shellClassName} p-4`}>
              <p className="text-sm font-medium text-foreground">{t("个人知识条目", "Personal knowledge items")}</p>
              <div className="mt-3 space-y-3">
                {loadingPersonalKnowledge ? (
                  <p className="text-sm text-muted-foreground">{t("正在读取个人知识条目...", "Loading personal knowledge items...")}</p>
                ) : null}
                {!loadingPersonalKnowledge && personalKnowledgeDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("当前还没有个人知识条目。", "No personal knowledge items yet.")}</p>
                ) : null}
                {personalKnowledgeDocuments.map((item) => (
                  <div key={item.id} className={`${insetClassName} space-y-1 p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <span className={tagClassName}>{item.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("数据集", "Dataset")}: {item.datasetName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("来源", "Source")}: {item.sourceType} · {t("分块", "Chunks")} {item.chunkCount}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("最近更新", "Updated")}: {item.updatedAt}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${shellClassName} p-4`}>
              <p className="text-sm font-medium text-foreground">{t("最近写入记录", "Recent writes")}</p>
              <div className="mt-3 space-y-3">
                {loadingPersonalKnowledge ? (
                  <p className="text-sm text-muted-foreground">{t("正在读取最近写入记录...", "Loading recent writes...")}</p>
                ) : null}
                {!loadingPersonalKnowledge && personalKnowledgeActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("当前还没有最近写入记录。", "No recent writes yet.")}</p>
                ) : null}
                {personalKnowledgeActivity.map((item) => (
                  <div key={item.id} className={`${insetClassName} space-y-1 p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <span className={tagClassName}>{item.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("数据集", "Dataset")}: {item.datasetName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("时间", "Time")}: {item.at || t("未知", "Unknown")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      ) : null}

      {canView ? (
        <article className={panelClassName}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="dashboard-kicker text-muted-foreground">{t("Knowledge queue", "Knowledge queue")}</div>
              <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {t("知识入库待处理队列", "Pending knowledge save queue")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t("这里集中展示 workflow 运行产生的知识入库任务，管理员可在治理页统一确认或驳回。", "This centralizes workflow-generated knowledge save jobs so admins can approve or reject them from governance.")} 
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {knowledgeSaveQueueMessage ? <p className="text-sm text-muted-foreground">{knowledgeSaveQueueMessage}</p> : null}
            {loadingKnowledgeSaveQueue ? (
              <p className="text-sm text-muted-foreground">{t("正在读取知识入库队列...", "Loading knowledge save queue...")}</p>
            ) : null}

            {!loadingKnowledgeSaveQueue && knowledgeSaveQueue.length === 0 ? (
              <div className={`${shellClassName} p-4 text-sm text-muted-foreground`}>
                {t("当前没有待处理或历史知识入库任务。", "No pending or historical knowledge save jobs yet.")}
              </div>
            ) : null}

            {knowledgeSaveQueue.map((job) => (
              <div key={job.id} className={`${shellClassName} space-y-4 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {job.artifact?.title || (typeof job.requestPayload?.artifactTitle === "string" ? job.requestPayload.artifactTitle : `#${job.artifactId}`)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      #{job.id} · {job.targetType} · {t("状态", "status")} {job.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={tagClassName}>
                      {t("数据集", "dataset")} #{typeof job.requestPayload?.datasetId === "number" ? job.requestPayload.datasetId : "-"}
                    </span>
                    <span className={tagClassName}>
                      {t("范围", "scope")} {job.requestPayload?.datasetScope === "personal" ? t("个人", "personal") : t("企业", "enterprise")}
                    </span>
                    <span className={tagClassName}>
                      {t("分类", "category")} {typeof job.requestPayload?.knowledgeCategory === "string" ? job.requestPayload.knowledgeCategory : "general"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className={`${insetClassName} space-y-1 p-4 text-sm`}>
                    <div className="text-xs text-muted-foreground">
                      {t("创建时间", "Created")}: {job.createdAt || t("未知", "Unknown")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("运行记录", "Run")}: {job.artifact?.runId ? `#${job.artifact.runId}` : t("未知", "Unknown")}
                    </div>
                    {job.errorMessage ? <div className="text-xs text-red-600">{job.errorMessage}</div> : null}
                  </div>

                  {canManage &&
                  job.status === "queued" &&
                  job.requestPayload?.manualConfirmationRequired === true &&
                  typeof job.requestPayload?.datasetId === "number" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="dashboard-button-primary"
                        disabled={knowledgeSaveQueueAction?.jobId === job.id}
                        onClick={() => void resolveKnowledgeSaveQueueJob(job.id, "approve")}
                      >
                        {t("确认入库", "Approve save")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="dashboard-button-secondary"
                        disabled={knowledgeSaveQueueAction?.jobId === job.id}
                        onClick={() => void resolveKnowledgeSaveQueueJob(job.id, "reject")}
                      >
                        {t("驳回入库", "Reject save")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {canManage ? (
        <article className={panelClassName}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="dashboard-kicker text-muted-foreground">{t("Agent bindings", "Agent bindings")}</div>
              <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {t("Agent 知识库绑定", "Agent knowledge bindings")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t("企业管理员可以在这里核对每个自定义 Agent 绑定了哪些个人知识库、企业知识库，以及当前检索策略。", "Admins can verify each custom agent's personal datasets, enterprise datasets, and retrieval policy here.")}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {loadingCustomAgents ? (
              <p className="text-sm text-muted-foreground">{t("正在读取 Agent 绑定...", "Loading agent bindings...")}</p>
            ) : null}

            {!loadingCustomAgents && customAgents.length === 0 ? (
              <div className={`${shellClassName} p-4 text-sm text-muted-foreground`}>
                {t("当前没有可治理的自定义 Agent。", "No custom agents available for governance yet.")}
              </div>
            ) : null}

            {customAgents.map((agent) => (
              <div key={agent.id} className={`${shellClassName} space-y-4 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{agent.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ID #{agent.id} · {agent.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={tagClassName}>
                      {(agent.knowledgeRetrievalPolicy?.retrievalMode || "hybrid").toString()}
                    </span>
                    <span className={tagClassName}>
                      {t("片段", "chunks")} {agent.knowledgeRetrievalPolicy?.maxChunks || 4}
                    </span>
                    <span className={tagClassName}>
                      {agent.knowledgeRetrievalPolicy?.requiredCitations === false
                        ? t("可不带引用", "citations optional")
                        : t("要求引用", "citations required")}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={`${insetClassName} p-4`}>
                    <p className="text-xs text-muted-foreground">{t("个人知识库", "Personal datasets")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {agent.knowledgeBindingDetails.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t("未绑定", "None")}</span>
                      ) : (
                        agent.knowledgeBindingDetails.map((detail) => (
                          <span key={`personal-${detail.id}`} className={tagClassName}>
                            {detail.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className={`${insetClassName} p-4`}>
                    <p className="text-xs text-muted-foreground">{t("企业知识库", "Enterprise datasets")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {agent.enterpriseKnowledgeBindingDetails.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t("未绑定", "None")}</span>
                      ) : (
                        agent.enterpriseKnowledgeBindingDetails.map((detail) => (
                          <span key={`enterprise-${detail.id}`} className={tagClassName}>
                            {detail.name} ({detail.category})
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {canView ? (
        <article className={panelClassName}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
              <Workflow className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="dashboard-kicker text-muted-foreground">{t("Workflow knowledge", "Workflow knowledge")}</div>
              <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {t("Workflow 知识链路", "Workflow knowledge paths")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t("这里列出哪些 workflow 会显式读取知识库、写入知识库，或把产物排入知识沉淀队列。", "This shows which workflows explicitly read knowledge, write knowledge, or queue outputs for knowledge ingestion.")}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {loadingWorkflowKnowledge ? (
              <p className="text-sm text-muted-foreground">{t("正在读取 Workflow 知识链路...", "Loading workflow knowledge paths...")}</p>
            ) : null}

            {!loadingWorkflowKnowledge && workflowKnowledge.length === 0 ? (
              <div className={`${shellClassName} p-4 text-sm text-muted-foreground`}>
                {t("当前还没有接入知识读写主流程的 workflow。", "No workflows are wired into the knowledge read/write flow yet.")}
              </div>
            ) : null}

            {workflowKnowledge.map((workflow) => (
              <div key={workflow.workflowId} className={`${shellClassName} space-y-4 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{workflow.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ID #{workflow.workflowId} · {workflow.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workflow.readNodes.length > 0 ? (
                      <span className={tagClassName}>
                        {t("读取", "read")} {workflow.readNodes.length}
                      </span>
                    ) : null}
                    {workflow.writeNodes.length > 0 ? (
                      <span className={tagClassName}>
                        {t("写入", "write")} {workflow.writeNodes.length}
                      </span>
                    ) : null}
                    {workflow.queueNodes.length > 0 ? (
                      <span className={tagClassName}>
                        {t("沉淀队列", "queue")} {workflow.queueNodes.length}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <div className={`${insetClassName} p-4`}>
                    <p className="text-xs text-muted-foreground">{t("知识读取节点", "Knowledge read nodes")}</p>
                    <div className="mt-3 space-y-2">
                      {workflow.readNodes.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t("无", "None")}</span>
                      ) : (
                        workflow.readNodes.map((node) => (
                          <div key={node.nodeKey} className="space-y-1 text-sm text-foreground">
                            <div className="font-medium">{node.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {node.selectedDatasetIds.length > 0
                                ? `${t("限定数据集", "datasets")} #${node.selectedDatasetIds.join(", #")}`
                                : node.selectedPersonalDatasetIds.length === 0
                                  ? t("未限定数据集，将按企业知识服务默认范围检索。", "No dataset filter; retrieval follows the enterprise default scope.")
                                  : t("未限定企业数据集。", "No enterprise dataset filter.")}
                            </div>
                            {node.selectedPersonalDatasetIds.length > 0 ? (
                              <div className="text-xs text-muted-foreground">
                                {t("个人数据集", "personal datasets")} #{node.selectedPersonalDatasetIds.join(", #")}
                              </div>
                            ) : null}
                            <div className="text-xs text-muted-foreground">
                              topK {node.topK}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={`${insetClassName} p-4`}>
                    <p className="text-xs text-muted-foreground">{t("知识写入节点", "Knowledge write nodes")}</p>
                    <div className="mt-3 space-y-2">
                      {workflow.writeNodes.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t("无", "None")}</span>
                      ) : (
                        workflow.writeNodes.map((node) => (
                          <div key={node.nodeKey} className="space-y-1 text-sm text-foreground">
                            <div className="font-medium">{node.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {node.datasetId
                                ? `${t("目标数据集", "target dataset")} #${node.datasetId}`
                                : t("未配置目标数据集。", "Target dataset not configured.")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("范围", "scope")}: {node.datasetScope === "personal" ? t("个人知识库", "personal") : t("企业知识库", "enterprise")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("分类", "category")}: {node.knowledgeCategory}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={`${insetClassName} p-4`}>
                    <p className="text-xs text-muted-foreground">{t("资产沉淀到知识库", "Asset to knowledge queue")}</p>
                    <div className="mt-3 space-y-2">
                      {workflow.queueNodes.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t("无", "None")}</span>
                      ) : (
                        workflow.queueNodes.map((node) => (
                          <div key={node.nodeKey} className="space-y-1 text-sm text-foreground">
                            <div className="font-medium">{node.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {t("目标", "target")}: {node.knowledgeTargetType}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {canManage ? (
        <article className={panelClassName}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
              <Workflow className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="dashboard-kicker text-muted-foreground">{t("Advisor orchestration", "Advisor orchestration")}</div>
              <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {t("顾问工作流配置", "Advisor workflow settings")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t("品牌顾问、增长顾问、客户画像等企业级工作流也统一回收到企业设置，不再混在个人设置中。", "Brand advisor, growth advisor, customer profile, and other enterprise workflows now live in enterprise settings instead of personal settings.")}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {loadingAdvisorConfig ? <p className="text-sm text-muted-foreground">{t("正在读取顾问配置...", "Loading advisor config...")}</p> : null}
            {advisorConfigMessage ? <p className="text-sm text-muted-foreground">{advisorConfigMessage}</p> : null}

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
                  <div key={card.advisorType} className={`${shellClassName} space-y-4 p-4`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{card.title}</p>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">{card.description}</p>
                      </div>
                      <span className="dashboard-chip dashboard-kicker inline-flex items-center rounded-[4px] border border-primary/45 bg-primary px-3 py-1.5 text-[11px] tracking-[0.14em] text-primary-foreground">
                        {statusLabel}
                      </span>
                    </div>

                    <div className={`${insetClassName} grid gap-3 p-4 text-sm`}>
                      <div className={`${shellClassName} space-y-2 p-3`}>
                        <p className="text-xs text-muted-foreground">
                          {t("共享知识数据集", "Shared knowledge datasets")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {sharedKnowledgeTargets.advisorDatasets.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              {t("当前没有挂到顾问知识池的数据集。", "No datasets are currently bound to the advisor knowledge pool.")}
                            </span>
                          ) : (
                            sharedKnowledgeTargets.advisorDatasets.map((dataset) => (
                              <span key={`advisor-dataset-${card.advisorType}-${dataset.id}`} className={tagClassName}>
                                {dataset.name} ({dataset.category})
                              </span>
                            ))
                          )}
                        </div>
                        <p className="text-xs leading-6 text-muted-foreground">
                          {t(
                            "当前模型下，内置专家助手共享 advisor_external_knowledge 绑定池；这里展示的是该顾问当前可消费的共享知识集。",
                            "Under the current model, built-in advisors share the advisor_external_knowledge pool; this lists the shared datasets available to the advisor.",
                          )}
                        </p>
                      </div>

                      {isLeadHunterWorkflow ? (
                        <div className="space-y-4">
                          <p className="text-xs leading-6 text-muted-foreground">
                            {t("客户画像（Customer Profile）没有系统默认 workflow。只有企业数据库里存在可用配置时，侧边栏和 Dashboard 才会显示对应入口。", "Customer Profile has no system-default workflow. Entry appears only when enterprise database configuration is available.")}
                          </p>
                          {leadHunterAdvisorType ? (
                            <div className={`${shellClassName} space-y-3 p-3`}>
                              <p className="text-xs text-muted-foreground">{t("执行模式（数据库配置）", "Execution mode (database config)")}</p>
                              <div className="flex flex-wrap gap-3">
                                <label className={toggleClassName}>
                                  <input
                                    type="radio"
                                    name={`${leadHunterAdvisorType}-mode`}
                                    className="h-4 w-4 border-border bg-background accent-primary"
                                    checked={leadHunterModeDraft === "dify"}
                                    onChange={() => setLeadHunterModeDrafts((prev) => ({ ...prev, [leadHunterAdvisorType]: "dify" }))}
                                    disabled={isSavingLeadHunterMode}
                                  />
                                  <span>{t("Dify", "Dify")}</span>
                                </label>
                                <label className={toggleClassName}>
                                  <input
                                    type="radio"
                                    name={`${leadHunterAdvisorType}-mode`}
                                    className="h-4 w-4 border-border bg-background accent-primary"
                                    checked={leadHunterModeDraft === "skill"}
                                    onChange={() => setLeadHunterModeDrafts((prev) => ({ ...prev, [leadHunterAdvisorType]: "skill" }))}
                                    disabled={isSavingLeadHunterMode}
                                  />
                                  <span>{t("技能", "Skill")}</span>
                                </label>
                              </div>
                              <div className="flex items-center gap-3">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="dashboard-button-primary"
                                  onClick={() => void saveLeadHunterExecutionMode(leadHunterAdvisorType, leadHunterModeDraft)}
                                  disabled={isSavingLeadHunterMode || !canSaveLeadHunterMode}
                                >
                                  {isSavingLeadHunterMode ? t("保存中...", "Saving...") : t("保存执行模式", "Save mode")}
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
                            <span className={tagClassName}>{defaultInfo?.baseUrl || advisorDefaults?.baseUrl || t("未配置", "Not configured")}</span>
                          </div>
                          <div className="grid gap-1">
                            <span className="text-xs text-muted-foreground">{t("系统默认 API Key", "System default API key")}</span>
                            <span className={tagClassName}>{defaultInfo?.configured ? t("已配置", "Configured") : t("未配置", "Not configured")}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </article>
      ) : null}
    </div>
  )
}
