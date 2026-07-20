"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  WorkflowRunResultsPage,
  type WorkflowRunResultsDetail,
} from "@/components/workflows/workflow-run-results-page"
import { listCustomAgentTemplates, type CustomAgentTemplate } from "@/lib/platform/custom-agent-templates"
import {
  mergeCustomAgentProjectionMetadata,
  readCustomAgentWorkflowArchiveMetadata,
  readCustomAgentProjectionMetadata,
} from "@/lib/platform/custom-agent-projection"
import { buildCustomAgentRuntimeId } from "@/lib/platform/custom-agent-runtime-id"
import { CORE_WORKSPACE_BUSINESS_SLUGS } from "@/lib/platform/workspace-business"

type CustomAgentStatus = "draft" | "published" | "disabled" | "archived"
type CustomAgentVisibility = "private" | "shared"
type BindingMode = "existing_runtime" | "deferred" | "external_runtime"

type CustomAgentTestRecord = {
  id: string
  mode: "direct_agent" | "workflow_backed"
  prompt: string
  status: "succeeded" | "failed"
  resultSummary: string
  createdAt: string
}

type CustomAgentRecord = {
  id: number
  ownerUserId: number
  linkedWorkflowId: number | null
  linkedWorkflowTitle: string | null
  name: string
  slug: string
  summary: string
  systemPrompt: string
  systemPromptSummary: string | null
  goal: string | null
  scope: string | null
  guardrails: string | null
  defaultOutputType: string
  knowledgeBindings: number[]
  enterpriseKnowledgeDatasetIds: number[]
  enterpriseKnowledgeBindingDetails: Array<{
    id: number
    name: string
    category: string
  }>
  knowledgeRetrievalPolicy: {
    retrievalMode?: "semantic" | "keyword" | "hybrid"
    maxChunks?: number
    requiredCitations?: boolean
    enterpriseDatasetIds?: number[]
  } | null
  artifactKinds: string[]
  visibility: CustomAgentVisibility
  status: CustomAgentStatus
  executionMode: "direct_agent" | "workflow_backed"
  metadata: Record<string, unknown> | null
  canEdit: boolean
  businessBindings: Array<{
    businessSlug: string
    displayPriority: number
    enabled: boolean
  }>
  workflowBindings: Array<{
    workflowId: number
    workflowTitle: string | null
    enabled: boolean
  }>
  recentTestRecords?: CustomAgentTestRecord[]
}

type WorkflowOption = {
  id: number
  title: string
  slug: string
  status: string
}

type PersonalKnowledgeDataset = {
  id: number
  name: string
  category: string
}

type EnterpriseKnowledgeDataset = {
  id: number
  name: string
  category: string
}

type Draft = {
  templateSlug: string
  name: string
  summary: string
  systemPrompt: string
  systemPromptSummary: string
  goal: string
  scope: string
  guardrails: string
  defaultOutputType: string
  visibility: CustomAgentVisibility
  linkedWorkflowId: string
  knowledgeBindings: number[]
  enterpriseKnowledgeDatasetIds: number[]
  retrievalMode: "semantic" | "keyword" | "hybrid"
  maxChunks: string
  requiredCitations: boolean
  menuExposure: boolean
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: BindingMode
  artifactKindsText: string
  businessSlugs: string[]
  workflowBindingIds: number[]
}

type CustomAgentTestState = {
  prompt: string
  running: boolean
  directResult: string | null
  workflowDetail: WorkflowRunResultsDetail | null
  resultSummary: string | null
  error: string | null
  savedMessage: string | null
}

function createEmptyDraft(): Draft {
  return {
    templateSlug: "",
    name: "",
    summary: "",
    systemPrompt: "",
    systemPromptSummary: "",
    goal: "",
    scope: "",
    guardrails: "",
    defaultOutputType: "text",
    visibility: "private",
    linkedWorkflowId: "",
    knowledgeBindings: [],
    enterpriseKnowledgeDatasetIds: [],
    retrievalMode: "hybrid",
    maxChunks: "4",
    requiredCitations: true,
    menuExposure: false,
    publicVisible: false,
    workspaceVisible: true,
    bindingTarget: "agent-platform",
    bindingMode: "existing_runtime",
    artifactKindsText: "",
    businessSlugs: [],
    workflowBindingIds: [],
  }
}

function createEmptyTestState(): CustomAgentTestState {
  return {
    prompt: "",
    running: false,
    directResult: null,
    workflowDetail: null,
    resultSummary: null,
    error: null,
    savedMessage: null,
  }
}

function createDraftFromAgent(agent: CustomAgentRecord): Draft {
  const projection = readCustomAgentProjectionMetadata(agent.metadata)
  return {
    templateSlug: "",
    name: agent.name,
    summary: agent.summary,
    systemPrompt: agent.systemPrompt,
    systemPromptSummary: agent.systemPromptSummary || "",
    goal: agent.goal || "",
    scope: agent.scope || "",
    guardrails: agent.guardrails || "",
    defaultOutputType: agent.defaultOutputType || "text",
    visibility: agent.visibility,
    linkedWorkflowId: agent.linkedWorkflowId ? String(agent.linkedWorkflowId) : "",
    knowledgeBindings: agent.knowledgeBindings || [],
    enterpriseKnowledgeDatasetIds:
      agent.enterpriseKnowledgeDatasetIds ||
      (Array.isArray(agent.knowledgeRetrievalPolicy?.enterpriseDatasetIds)
        ? agent.knowledgeRetrievalPolicy.enterpriseDatasetIds.filter(
            (value): value is number => Number.isInteger(value) && value > 0,
          )
        : []),
    retrievalMode: agent.knowledgeRetrievalPolicy?.retrievalMode || "hybrid",
    maxChunks:
      typeof agent.knowledgeRetrievalPolicy?.maxChunks === "number" && agent.knowledgeRetrievalPolicy.maxChunks > 0
        ? String(agent.knowledgeRetrievalPolicy.maxChunks)
        : "4",
    requiredCitations: agent.knowledgeRetrievalPolicy?.requiredCitations !== false,
    menuExposure: projection.menuExposure,
    publicVisible: projection.visibilityPolicy.publicVisible,
    workspaceVisible: projection.visibilityPolicy.workspaceVisible,
    bindingTarget: projection.visibilityPolicy.bindingTarget,
    bindingMode: projection.visibilityPolicy.bindingMode,
    artifactKindsText: agent.artifactKinds.join(", "),
    businessSlugs: agent.businessBindings.filter((binding) => binding.enabled).map((binding) => binding.businessSlug),
    workflowBindingIds: agent.workflowBindings.filter((binding) => binding.enabled).map((binding) => binding.workflowId),
  }
}

function parseArtifactKinds(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]
}

function summarizeText(value: string, maxLength = 240) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function parseRecentTestRecords(input: unknown): CustomAgentTestRecord[] {
  const metadata = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const records = Array.isArray(metadata.recentTestRecords) ? metadata.recentTestRecords : []
  return records
    .map((record) => {
      const candidate =
        record && typeof record === "object" && !Array.isArray(record) ? (record as Record<string, unknown>) : null
      if (!candidate) return null

      const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
      const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : ""
      const resultSummary = typeof candidate.resultSummary === "string" ? candidate.resultSummary.trim() : ""
      const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt.trim() : ""
      const mode = candidate.mode === "workflow_backed" ? "workflow_backed" : "direct_agent"
      const status = candidate.status === "failed" ? "failed" : "succeeded"

      if (!id || !prompt || !resultSummary || !createdAt) return null

      return {
        id,
        mode,
        prompt,
        status,
        resultSummary,
        createdAt,
      } satisfies CustomAgentTestRecord
    })
    .filter((record): record is CustomAgentTestRecord => Boolean(record))
    .slice(0, 8)
}

function formatTestRecordTime(locale: "zh" | "en", value: string) {
  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

function createDraftFromTemplate(template: CustomAgentTemplate): Draft {
  return {
    ...createEmptyDraft(),
    templateSlug: template.slug,
    name: template.name,
    summary: template.summary,
    systemPrompt: template.systemPrompt,
    systemPromptSummary: template.systemPromptSummary,
    goal: template.goal,
    scope: template.scope,
    guardrails: template.guardrails,
    defaultOutputType: template.defaultOutputType,
    artifactKindsText: template.artifactKinds.join(", "),
    businessSlugs: [...template.businessSlugs],
  }
}

function buildCopy(locale: "zh" | "en") {
  if (locale === "zh") {
    return {
      eyebrow: "Custom Agents",
      title: "企业自定义 Agent",
      description: "在智能体中台内创建、编辑、发布和绑定自定义 Agent。业务入口和 workflow 只引用这里的 Agent。",
      createTitle: "创建 Agent",
      templateTitle: "创建模板",
      listTitle: "我的 Agent",
      detailTitle: "Agent 详情",
      empty: "当前还没有自定义 Agent。",
      loadFailed: "加载失败",
      create: "创建",
      applyTemplate: "应用模板",
      save: "保存",
      publish: "发布",
      disable: "停用",
      archive: "归档",
      duplicate: "复制",
      refresh: "刷新",
      created: "已创建",
      saved: "已保存",
      bindingsSaved: "绑定已保存",
      published: "已发布",
      disabled: "已停用",
      archived: "已归档",
      duplicated: "已复制",
      workflows: "Workflow 绑定",
      business: "业务入口绑定",
      knowledge: "个人知识库",
      enterpriseKnowledge: "企业知识库",
      knowledgePolicy: "检索策略",
      retrievalMode: "检索模式",
      maxChunks: "最大片段数",
      requiredCitations: "要求引用",
      menuExposure: "加入企业菜单投影",
      publicVisible: "公开前台可见",
      workspaceVisible: "企业工作台可见",
      bindingTarget: "菜单绑定目标",
      bindingMode: "绑定模式",
      openWorkflow: "打开 Workflow",
      openAgent: "打开详情页",
      status: "状态",
      mode: "模式",
      private: "私有",
      shared: "共享",
      name: "名称",
      summary: "简介",
      systemPrompt: "系统提示词",
      systemPromptSummary: "提示词摘要",
      goal: "业务目标",
      scope: "适用范围",
      guardrails: "风险边界",
      defaultOutputType: "默认输出",
      linkedWorkflow: "执行骨架 Workflow",
      artifactKinds: "输出类型（逗号分隔）",
      template: "创建模板",
      noTemplate: "从空白创建",
      templateHint: "模板会预填系统提示词、目标、边界和推荐业务挂载。",
      noWorkflow: "不绑定 workflow",
      noKnowledge: "当前没有个人知识库",
      noWorkflowOptions: "当前没有可绑定的 workflow",
      canEditHint: "仅所有者或企业管理员可编辑。",
      testTitle: "测试工作台",
      testPrompt: "测试输入",
      testRun: "运行测试",
      testSave: "保存测试记录",
      testPlaceholder: "输入一个测试场景，验证 Agent 的输出结构、边界和知识引用是否符合预期……",
      testDirectHint: "direct_agent 会走真实 AI chat runtime。",
      testWorkflowHint: "workflow_backed 会走真实 workflow run runtime。",
      testRiskDirect: "重点确认输出结构、引用和越权边界，再决定是否发布。",
      testRiskWorkflow: "重点确认节点取数、分支命中和失败恢复是否符合预期。",
      testNoHistory: "还没有保存过测试记录。",
      testResult: "测试结果",
      testPromptRequired: "先输入测试场景。",
      testSaveFirst: "先运行一次测试，再保存记录。",
      testSaved: "测试记录已保存",
      testHistory: "最近测试记录",
      testResultEmpty: "运行结果会显示在这里，方便发布前做最后校验。",
      workflowArchivedWarning: "关联 workflow 已归档，当前 Agent 已自动停用。请重新绑定可用 workflow 或归档该 Agent。",
      archivedHiddenNotice: "已归档 Agent 不显示在默认列表中，可通过直达链接继续查看详情。",
    }
  }

  return {
    eyebrow: "Custom Agents",
    title: "Enterprise custom agents",
    description: "Create, edit, publish, and bind custom agents inside the agent platform. Business entries and workflows reference agents from here.",
    createTitle: "Create agent",
    templateTitle: "Templates",
    listTitle: "My agents",
    detailTitle: "Agent details",
    empty: "No custom agents yet.",
    loadFailed: "Load failed",
    create: "Create",
    applyTemplate: "Apply template",
    save: "Save",
    publish: "Publish",
    disable: "Disable",
    archive: "Archive",
    duplicate: "Duplicate",
    refresh: "Refresh",
    created: "Created",
    saved: "Saved",
    bindingsSaved: "Bindings saved",
    published: "Published",
    disabled: "Disabled",
    archived: "Archived",
    duplicated: "Duplicated",
    workflows: "Workflow bindings",
    business: "Business bindings",
    knowledge: "Personal knowledge",
    enterpriseKnowledge: "Enterprise knowledge",
    knowledgePolicy: "Retrieval policy",
    retrievalMode: "Retrieval mode",
    maxChunks: "Max chunks",
    requiredCitations: "Require citations",
    menuExposure: "Project into enterprise menu",
    publicVisible: "Visible on public site",
    workspaceVisible: "Visible in workspace",
    bindingTarget: "Binding target",
    bindingMode: "Binding mode",
    openWorkflow: "Open workflow",
    openAgent: "Open detail",
    status: "Status",
    mode: "Mode",
    private: "Private",
    shared: "Shared",
    name: "Name",
    summary: "Summary",
    systemPrompt: "System prompt",
    systemPromptSummary: "Prompt summary",
    goal: "Goal",
    scope: "Scope",
    guardrails: "Guardrails",
    defaultOutputType: "Default output",
    linkedWorkflow: "Execution workflow",
    artifactKinds: "Artifact kinds (comma-separated)",
    template: "Template",
    noTemplate: "Start blank",
    templateHint: "Templates prefill prompts, goals, guardrails, and suggested business bindings.",
    noWorkflow: "No workflow binding",
    noKnowledge: "No personal knowledge datasets yet",
    noWorkflowOptions: "No workflows available yet",
    canEditHint: "Only the owner or an enterprise admin can edit.",
    testTitle: "Test workbench",
    testPrompt: "Test input",
    testRun: "Run test",
    testSave: "Save test record",
    testPlaceholder: "Enter a scenario to validate output shape, guardrails, and knowledge usage before publishing...",
    testDirectHint: "direct_agent uses the live AI chat runtime.",
    testWorkflowHint: "workflow_backed uses the live workflow runtime.",
    testRiskDirect: "Validate output shape, citations, and guardrails before publishing.",
    testRiskWorkflow: "Validate node inputs, branching, and recovery behavior before publishing.",
    testNoHistory: "No saved test records yet.",
    testResult: "Test result",
    testPromptRequired: "Enter a test prompt first.",
    testSaveFirst: "Run a test first, then save the record.",
    testSaved: "Test record saved",
    testHistory: "Recent test records",
    testResultEmpty: "Run output will appear here so you can validate the agent before publishing.",
    workflowArchivedWarning: "The linked workflow has been archived. This agent was auto-disabled. Rebind it to an active workflow or archive the agent.",
    archivedHiddenNotice: "Archived agents stay out of the default list, but direct links can still open the detail view.",
  }
}

function normalizeWorkflowId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export function WorkspaceCustomAgentStudio({
  locale,
  initialSelectedAgentId = null,
}: {
  locale: "zh" | "en"
  initialSelectedAgentId?: number | null
}) {
  const copy = buildCopy(locale)
  const router = useRouter()
  const templates = useMemo(() => listCustomAgentTemplates(locale), [locale])
  const [agents, setAgents] = useState<CustomAgentRecord[]>([])
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([])
  const [knowledgeDatasets, setKnowledgeDatasets] = useState<PersonalKnowledgeDataset[]>([])
  const [enterpriseKnowledgeDatasets, setEnterpriseKnowledgeDatasets] = useState<EnterpriseKnowledgeDataset[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(initialSelectedAgentId)
  const [createDraft, setCreateDraft] = useState<Draft>(() => createEmptyDraft())
  const [editDraft, setEditDraft] = useState<Draft>(() => createEmptyDraft())
  const [message, setMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testState, setTestState] = useState<CustomAgentTestState>(() => createEmptyTestState())

  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === selectedAgentId) || null,
    [agents, selectedAgentId],
  )
  const selectedAgentTestRecords = useMemo(
    () => parseRecentTestRecords(selectedAgent?.metadata),
    [selectedAgent],
  )
  const selectedAgentWorkflowArchive = useMemo(
    () => readCustomAgentWorkflowArchiveMetadata(selectedAgent?.metadata),
    [selectedAgent],
  )
  const visibleAgents = useMemo(
    () => agents.filter((item) => item.status !== "archived"),
    [agents],
  )

  useEffect(() => {
    if (!selectedAgent) return
    setEditDraft(createDraftFromAgent(selectedAgent))
    setTestState(createEmptyTestState())
  }, [selectedAgent])

  const load = async (preferredAgentId?: number | null) => {
    setLoading(true)
    setErrorMessage("")
    try {
      const [agentsResponse, workflowsResponse, knowledgeResponse, enterpriseKnowledgeResponse] = await Promise.all([
        fetch("/api/platform/custom-agents", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/workflows", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/knowledge/personal-datasets", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/knowledge/datasets", { credentials: "same-origin", cache: "no-store" }),
      ])

      const [agentsPayload, workflowsPayload, knowledgePayload, enterpriseKnowledgePayload] = await Promise.all([
        agentsResponse.json().catch(() => null),
        workflowsResponse.json().catch(() => null),
        knowledgeResponse.json().catch(() => null),
        enterpriseKnowledgeResponse.json().catch(() => null),
      ])

      if (!agentsResponse.ok) {
        throw new Error(typeof agentsPayload?.error === "string" ? agentsPayload.error : "custom_agents_load_failed")
      }
      if (!workflowsResponse.ok) {
        throw new Error(typeof workflowsPayload?.error === "string" ? workflowsPayload.error : "workflows_load_failed")
      }

      const nextAgents = Array.isArray(agentsPayload?.data?.items) ? (agentsPayload.data.items as CustomAgentRecord[]) : []
      const nextWorkflows = Array.isArray(workflowsPayload?.data)
        ? (workflowsPayload.data as WorkflowOption[])
        : []
      const nextKnowledge = Array.isArray(knowledgePayload?.data?.items)
        ? (knowledgePayload.data.items as PersonalKnowledgeDataset[])
        : []
      const nextEnterpriseKnowledge = Array.isArray(enterpriseKnowledgePayload?.data?.items)
        ? (enterpriseKnowledgePayload.data.items as EnterpriseKnowledgeDataset[])
        : []

      setAgents(nextAgents)
      setWorkflows(nextWorkflows)
      setKnowledgeDatasets(nextKnowledge)
      setEnterpriseKnowledgeDatasets(nextEnterpriseKnowledge)

      const nextSelected =
        nextAgents.find((item) => item.id === (preferredAgentId ?? initialSelectedAgentId ?? selectedAgentId))?.id ??
        nextAgents[0]?.id ??
        null
      setSelectedAgentId(nextSelected)
    } catch (error) {
      setErrorMessage(`${copy.loadFailed}: ${error instanceof Error ? error.message : "unknown"}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(initialSelectedAgentId)
    // initialSelectedAgentId is stable for the page lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateCreateDraft = (patch: Partial<Draft>) => {
    setCreateDraft((current) => ({ ...current, ...patch }))
  }

  const updateEditDraft = (patch: Partial<Draft>) => {
    setEditDraft((current) => ({ ...current, ...patch }))
  }

  const toggleStringValue = (values: string[], value: string) => {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
  }

  const toggleNumberValue = (values: number[], value: number) => {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
  }

  const updateTestState = (patch: Partial<CustomAgentTestState>) => {
    setTestState((current) => ({ ...current, ...patch }))
  }

  const buildAgentPayload = (draft: Draft, baseMetadata?: Record<string, unknown> | null) => {
    const linkedWorkflowId = normalizeWorkflowId(draft.linkedWorkflowId)
    return {
      name: draft.name,
      summary: draft.summary,
      systemPrompt: draft.systemPrompt,
      systemPromptSummary: draft.systemPromptSummary || null,
      goal: draft.goal || null,
      scope: draft.scope || null,
      guardrails: draft.guardrails || null,
      defaultOutputType: draft.defaultOutputType || "text",
      visibility: draft.visibility,
      linkedWorkflowId,
      knowledgeBindings: draft.knowledgeBindings,
      knowledgeRetrievalPolicy: {
        enterpriseDatasetIds: draft.enterpriseKnowledgeDatasetIds,
        retrievalMode: draft.retrievalMode,
        maxChunks: Number.isInteger(Number(draft.maxChunks)) && Number(draft.maxChunks) > 0 ? Number(draft.maxChunks) : 4,
        requiredCitations: draft.requiredCitations,
      },
      artifactKinds: parseArtifactKinds(draft.artifactKindsText),
      metadata: mergeCustomAgentProjectionMetadata({
        metadata: baseMetadata,
        menuExposure: draft.menuExposure,
        visibilityPolicy: {
          publicVisible: draft.publicVisible,
          workspaceVisible: draft.workspaceVisible,
          bindingTarget: draft.bindingTarget,
          bindingMode: draft.bindingMode,
        },
      }),
    }
  }

  const handleCreate = async () => {
    setSaving("create")
    setMessage("")
    setErrorMessage("")
    try {
      const createResponse = await fetch("/api/platform/custom-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(buildAgentPayload(createDraft)),
      })
      const createPayload = await createResponse.json().catch(() => null)
      if (!createResponse.ok || !createPayload?.data?.id) {
        throw new Error(typeof createPayload?.error === "string" ? createPayload.error : "custom_agent_create_failed")
      }

      const newAgentId = Number(createPayload.data.id)
      const workflowBindingIds = new Set<number>(createDraft.workflowBindingIds)
      const linkedWorkflowId = normalizeWorkflowId(createDraft.linkedWorkflowId)
      if (linkedWorkflowId) workflowBindingIds.add(linkedWorkflowId)

      await Promise.all([
        fetch(`/api/platform/custom-agents/${newAgentId}/bindings/business`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            bindings: createDraft.businessSlugs.map((businessSlug, index) => ({
              businessSlug,
              displayPriority: index * 10,
              enabled: true,
            })),
          }),
        }),
        fetch(`/api/platform/custom-agents/${newAgentId}/bindings/workflows`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            bindings: [...workflowBindingIds].map((workflowId) => ({
              workflowId,
              enabled: true,
            })),
          }),
        }),
      ])

      setCreateDraft(createEmptyDraft())
      setMessage(copy.created)
      await load(newAgentId)
      router.push(`/dashboard/agent-platform/${newAgentId}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "custom_agent_create_failed")
    } finally {
      setSaving(null)
    }
  }

  const handleSave = async () => {
    if (!selectedAgent) return
    setSaving("save")
    setMessage("")
    setErrorMessage("")
    try {
      const workflowBindingIds = new Set<number>(editDraft.workflowBindingIds)
      const linkedWorkflowId = normalizeWorkflowId(editDraft.linkedWorkflowId)
      if (linkedWorkflowId) workflowBindingIds.add(linkedWorkflowId)

      const [agentResponse, businessResponse, workflowResponse] = await Promise.all([
        fetch(`/api/platform/custom-agents/${selectedAgent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(buildAgentPayload(editDraft, selectedAgent.metadata)),
        }),
        fetch(`/api/platform/custom-agents/${selectedAgent.id}/bindings/business`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            bindings: editDraft.businessSlugs.map((businessSlug, index) => ({
              businessSlug,
              displayPriority: index * 10,
              enabled: true,
            })),
          }),
        }),
        fetch(`/api/platform/custom-agents/${selectedAgent.id}/bindings/workflows`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            bindings: [...workflowBindingIds].map((workflowId) => ({
              workflowId,
              enabled: true,
            })),
          }),
        }),
      ])

      const [agentPayload, businessPayload, workflowPayload] = await Promise.all([
        agentResponse.json().catch(() => null),
        businessResponse.json().catch(() => null),
        workflowResponse.json().catch(() => null),
      ])

      if (!agentResponse.ok) {
        throw new Error(typeof agentPayload?.error === "string" ? agentPayload.error : "custom_agent_update_failed")
      }
      if (!businessResponse.ok) {
        throw new Error(typeof businessPayload?.error === "string" ? businessPayload.error : "custom_agent_business_bindings_failed")
      }
      if (!workflowResponse.ok) {
        throw new Error(typeof workflowPayload?.error === "string" ? workflowPayload.error : "custom_agent_workflow_bindings_failed")
      }

      setMessage(copy.saved)
      await load(selectedAgent.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "custom_agent_update_failed")
    } finally {
      setSaving(null)
    }
  }

  const handleLifecycle = async (action: "publish" | "disable" | "archive" | "duplicate") => {
    if (!selectedAgent) return
    setSaving(action)
    setMessage("")
    setErrorMessage("")
    try {
      const response = await fetch(`/api/platform/custom-agents/${selectedAgent.id}/${action}`, {
        method: "POST",
        credentials: "same-origin",
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `custom_agent_${action}_failed`)
      }

      const nextAgentId = Number(payload?.data?.id || selectedAgent.id)
      setMessage(
        action === "publish"
          ? copy.published
          : action === "disable"
            ? copy.disabled
            : action === "archive"
              ? copy.archived
              : copy.duplicated,
      )
      await load(nextAgentId)
      router.push(`/dashboard/agent-platform/${nextAgentId}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `custom_agent_${action}_failed`)
    } finally {
      setSaving(null)
    }
  }

  const handleRunTest = async () => {
    if (!selectedAgent) return

    const prompt = testState.prompt.trim()
    if (!prompt) {
      updateTestState({ error: copy.testPromptRequired, savedMessage: null })
      return
    }

    updateTestState({
      running: true,
      error: null,
      savedMessage: null,
      directResult: null,
      workflowDetail: null,
      resultSummary: null,
    })

    try {
      if (selectedAgent.executionMode === "workflow_backed") {
        if (!selectedAgent.linkedWorkflowId) {
          throw new Error("custom_agent_workflow_binding_required")
        }

        const workflowResponse = await fetch(`/api/workflows/${selectedAgent.linkedWorkflowId}`, {
          credentials: "same-origin",
          cache: "no-store",
        })
        const workflowPayload = (await workflowResponse.json().catch(() => null)) as { data?: { revision?: number } } | null
        const workflowRevision = workflowPayload?.data?.revision
        if (!workflowResponse.ok || !Number.isInteger(workflowRevision)) {
          throw new Error("workflow_revision_unavailable")
        }
        const response = await fetch(`/api/workflows/${selectedAgent.linkedWorkflowId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            revision: workflowRevision,
            iterationsEnabled: true,
            prompt,
            sourceAgentId: buildCustomAgentRuntimeId(selectedAgent.id),
          }),
        })
        const payload = (await response.json().catch(() => null)) as
          | { data?: WorkflowRunResultsDetail & { executionMode?: string }; error?: string }
          | null

        if (!response.ok || !payload?.data?.run?.id) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "custom_agent_test_failed")
        }

        updateTestState({
          workflowDetail: payload.data,
          resultSummary: summarizeText(
            locale === "zh"
              ? `工作流运行 #${payload.data.run.id} · ${payload.data.run.status}`
              : `Workflow run #${payload.data.run.id} · ${payload.data.run.status}`,
          ),
        })
        return
      }

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          stream: false,
          conversationScope: "chat",
          messages: [{ role: "user", content: prompt }],
          agentConfig: {
            agentId: buildCustomAgentRuntimeId(selectedAgent.id),
          },
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string; provider?: string; providerModel?: string }
        | null

      if (!response.ok || typeof payload?.message !== "string") {
        throw new Error(typeof payload?.error === "string" ? payload.error : "custom_agent_test_failed")
      }

      const summary = summarizeText(payload.message)
      updateTestState({
        directResult: payload.message,
        resultSummary: summary,
      })
    } catch (error) {
      updateTestState({
        error: error instanceof Error ? error.message : "custom_agent_test_failed",
      })
    } finally {
      setTestState((current) => ({ ...current, running: false }))
    }
  }

  const handleSaveTestRecord = async () => {
    if (!selectedAgent) return
    if (!testState.resultSummary) {
      updateTestState({ error: copy.testSaveFirst, savedMessage: null })
      return
    }

    updateTestState({ running: true, error: null, savedMessage: null })

    try {
      const nextRecord: CustomAgentTestRecord = {
        id: `test-${Date.now()}`,
        mode: selectedAgent.executionMode,
        prompt: testState.prompt.trim(),
        status: "succeeded",
        resultSummary: testState.resultSummary,
        createdAt: new Date().toISOString(),
      }
      const nextMetadata = {
        ...(selectedAgent.metadata && typeof selectedAgent.metadata === "object" && !Array.isArray(selectedAgent.metadata)
          ? selectedAgent.metadata
          : {}),
        recentTestRecords: [nextRecord, ...selectedAgentTestRecords].slice(0, 8),
      }

      const response = await fetch(`/api/platform/custom-agents/${selectedAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          metadata: nextMetadata,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "custom_agent_test_record_save_failed")
      }

      setMessage(copy.testSaved)
      await load(selectedAgent.id)
    } catch (error) {
      updateTestState({
        error: error instanceof Error ? error.message : "custom_agent_test_record_save_failed",
      })
    } finally {
      setTestState((current) => ({ ...current, running: false }))
    }
  }

  const renderAgentForm = (draft: Draft, onChange: (patch: Partial<Draft>) => void, editable: boolean) => (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm text-foreground">
        <span className="dashboard-kicker text-muted-foreground">{copy.name}</span>
        <input
          className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
          value={draft.name}
          disabled={!editable}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <label className="grid gap-2 text-sm text-foreground">
        <span className="dashboard-kicker text-muted-foreground">{copy.summary}</span>
        <textarea
          className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm"
          value={draft.summary}
          disabled={!editable}
          onChange={(event) => onChange({ summary: event.target.value })}
        />
      </label>
      <label className="grid gap-2 text-sm text-foreground">
        <span className="dashboard-kicker text-muted-foreground">{copy.systemPrompt}</span>
        <textarea
          className="dashboard-chip min-h-32 rounded-[4px] border border-border bg-background px-3 py-3 text-sm"
          value={draft.systemPrompt}
          disabled={!editable}
          onChange={(event) => onChange({ systemPrompt: event.target.value })}
        />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.systemPromptSummary}</span>
          <input
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.systemPromptSummary}
            disabled={!editable}
            onChange={(event) => onChange({ systemPromptSummary: event.target.value })}
          />
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.defaultOutputType}</span>
          <input
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.defaultOutputType}
            disabled={!editable}
            onChange={(event) => onChange({ defaultOutputType: event.target.value })}
          />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.goal}</span>
          <textarea
            className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm"
            value={draft.goal}
            disabled={!editable}
            onChange={(event) => onChange({ goal: event.target.value })}
          />
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.scope}</span>
          <textarea
            className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm"
            value={draft.scope}
            disabled={!editable}
            onChange={(event) => onChange({ scope: event.target.value })}
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm text-foreground">
        <span className="dashboard-kicker text-muted-foreground">{copy.guardrails}</span>
        <textarea
          className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm"
          value={draft.guardrails}
          disabled={!editable}
          onChange={(event) => onChange({ guardrails: event.target.value })}
        />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.linkedWorkflow}</span>
          <select
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.linkedWorkflowId}
            disabled={!editable}
            onChange={(event) => onChange({ linkedWorkflowId: event.target.value })}
          >
            <option value="">{copy.noWorkflow}</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.title} ({workflow.status})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.artifactKinds}</span>
          <input
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.artifactKindsText}
            disabled={!editable}
            onChange={(event) => onChange({ artifactKindsText: event.target.value })}
          />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
          <span>{copy.private}</span>
          <input
            type="radio"
            name={`visibility-${editable ? "editable" : "readonly"}`}
            checked={draft.visibility === "private"}
            disabled={!editable}
            onChange={() => onChange({ visibility: "private" })}
          />
        </label>
        <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
          <span>{copy.shared}</span>
          <input
            type="radio"
            name={`visibility-${editable ? "editable" : "readonly"}`}
            checked={draft.visibility === "shared"}
            disabled={!editable}
            onChange={() => onChange({ visibility: "shared" })}
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
          <span>{copy.menuExposure}</span>
          <input
            type="checkbox"
            checked={draft.menuExposure}
            disabled={!editable}
            onChange={(event) => onChange({ menuExposure: event.target.checked })}
          />
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.bindingTarget}</span>
          <select
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.bindingTarget}
            disabled={!editable}
            onChange={(event) => onChange({ bindingTarget: event.target.value })}
          >
            <option value="agent-platform">agent-platform</option>
            <option value="campaign-launch">campaign-launch</option>
            <option value="content-repurpose">content-repurpose</option>
            <option value="lead-to-outreach">lead-to-outreach</option>
            <option value="visual-ad-pipeline">visual-ad-pipeline</option>
            <option value="knowledge-base">knowledge-base</option>
          </select>
        </label>
        <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
          <span>{copy.publicVisible}</span>
          <input
            type="checkbox"
            checked={draft.publicVisible}
            disabled={!editable}
            onChange={(event) => onChange({ publicVisible: event.target.checked })}
          />
        </label>
        <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
          <span>{copy.workspaceVisible}</span>
          <input
            type="checkbox"
            checked={draft.workspaceVisible}
            disabled={!editable}
            onChange={(event) => onChange({ workspaceVisible: event.target.checked })}
          />
        </label>
        <label className="grid gap-2 text-sm text-foreground lg:col-span-2">
          <span className="dashboard-kicker text-muted-foreground">{copy.bindingMode}</span>
          <select
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.bindingMode}
            disabled={!editable}
            onChange={(event) => onChange({ bindingMode: event.target.value as BindingMode })}
          >
            <option value="existing_runtime">existing_runtime</option>
            <option value="deferred">deferred</option>
            <option value="external_runtime">external_runtime</option>
          </select>
        </label>
      </div>

      <div className="grid gap-2">
        <div className="dashboard-kicker text-sm text-muted-foreground">{copy.knowledge}</div>
        <div className="grid gap-2 lg:grid-cols-2">
          {knowledgeDatasets.length === 0 ? (
            <div className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-muted-foreground">{copy.noKnowledge}</div>
          ) : (
            knowledgeDatasets.map((dataset) => (
              <label key={dataset.id} className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                <span>{dataset.name}</span>
                <input
                  type="checkbox"
                  checked={draft.knowledgeBindings.includes(dataset.id)}
                  disabled={!editable}
                  onChange={() =>
                    onChange({
                      knowledgeBindings: toggleNumberValue(draft.knowledgeBindings, dataset.id),
                    })
                  }
                />
              </label>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="dashboard-kicker text-sm text-muted-foreground">{copy.enterpriseKnowledge}</div>
        <div className="grid gap-2 lg:grid-cols-2">
          {enterpriseKnowledgeDatasets.length === 0 ? (
            <div className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-muted-foreground">
              {copy.noKnowledge}
            </div>
          ) : (
            enterpriseKnowledgeDatasets.map((dataset) => (
              <label key={dataset.id} className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                <span>
                  {dataset.name}
                  <span className="ml-2 text-xs text-muted-foreground">({dataset.category})</span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.enterpriseKnowledgeDatasetIds.includes(dataset.id)}
                  disabled={!editable}
                  onChange={() =>
                    onChange({
                      enterpriseKnowledgeDatasetIds: toggleNumberValue(draft.enterpriseKnowledgeDatasetIds, dataset.id),
                    })
                  }
                />
              </label>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.retrievalMode}</span>
          <select
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.retrievalMode}
            disabled={!editable}
            onChange={(event) =>
              onChange({ retrievalMode: event.target.value as "semantic" | "keyword" | "hybrid" })
            }
          >
            <option value="hybrid">hybrid</option>
            <option value="semantic">semantic</option>
            <option value="keyword">keyword</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          <span className="dashboard-kicker text-muted-foreground">{copy.maxChunks}</span>
          <input
            className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
            value={draft.maxChunks}
            disabled={!editable}
            onChange={(event) => onChange({ maxChunks: event.target.value })}
          />
        </label>
        <label className="dashboard-chip mt-6 flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
          <span>{copy.requiredCitations}</span>
          <input
            type="checkbox"
            checked={draft.requiredCitations}
            disabled={!editable}
            onChange={(event) => onChange({ requiredCitations: event.target.checked })}
          />
        </label>
      </div>

      <div className="grid gap-2">
        <div className="dashboard-kicker text-sm text-muted-foreground">{copy.business}</div>
        <div className="grid gap-2 lg:grid-cols-2">
          {CORE_WORKSPACE_BUSINESS_SLUGS.map((slug) => (
            <label key={slug} className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
              <span>{slug}</span>
              <input
                type="checkbox"
                checked={draft.businessSlugs.includes(slug)}
                disabled={!editable}
                onChange={() => onChange({ businessSlugs: toggleStringValue(draft.businessSlugs, slug) })}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="dashboard-kicker text-sm text-muted-foreground">{copy.workflows}</div>
        <div className="grid gap-2 lg:grid-cols-2">
          {workflows.length === 0 ? (
            <div className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-muted-foreground">{copy.noWorkflowOptions}</div>
          ) : (
            workflows.map((workflow) => (
              <label key={workflow.id} className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                <span>{workflow.title}</span>
                <input
                  type="checkbox"
                  checked={draft.workflowBindingIds.includes(workflow.id)}
                  disabled={!editable}
                  onChange={() =>
                    onChange({
                      workflowBindingIds: toggleNumberValue(draft.workflowBindingIds, workflow.id),
                    })
                  }
                />
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  )

  return (
    <section className="public-grid-bg workspace-page-shell-bottom mx-auto max-w-7xl">
      <div className="workspace-stack">
        <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
          <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
          {message ? <div className="mt-4 text-sm text-emerald-400">{message}</div> : null}
          {errorMessage ? <div className="mt-4 text-sm text-rose-400">{errorMessage}</div> : null}
          <div className="mt-4">
            <Button variant="outline" onClick={() => void load(selectedAgentId)} disabled={loading}>
              {copy.refresh}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">{copy.listTitle}</div>
              <div className="text-xs text-muted-foreground">{visibleAgents.length}</div>
            </div>
            <div className="grid gap-3">
              {loading ? (
                <div className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-muted-foreground">Loading…</div>
              ) : null}
              {!loading && visibleAgents.length === 0 ? (
                <div className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-muted-foreground">{copy.empty}</div>
              ) : null}
              {visibleAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`rounded-[8px] border px-3 py-3 text-left transition ${
                    agent.id === selectedAgentId
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/60 hover:bg-background"
                  }`}
                  onClick={() => {
                    setSelectedAgentId(agent.id)
                    router.push(`/dashboard/agent-platform/${agent.id}`)
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{agent.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{agent.slug}</div>
                    </div>
                    <div className="text-[11px] uppercase text-muted-foreground">{agent.status}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{agent.executionMode}</div>
                </button>
              ))}
            </div>
          </aside>

          <div className="grid gap-4">
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="mb-4 text-sm font-semibold text-foreground">{copy.createTitle}</div>
              <div className="mb-4 grid gap-2">
                <div className="dashboard-kicker text-sm text-muted-foreground">{copy.templateTitle}</div>
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
                    value={createDraft.templateSlug}
                    onChange={(event) => {
                      const nextSlug = event.target.value
                      if (!nextSlug) {
                        updateCreateDraft(createEmptyDraft())
                        return
                      }
                      const matched = templates.find((item) => item.slug === nextSlug)
                      if (matched) {
                        setCreateDraft(createDraftFromTemplate(matched))
                      }
                    }}
                  >
                    <option value="">{copy.noTemplate}</option>
                    {templates.map((template) => (
                      <option key={template.slug} value={template.slug}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const matched = templates.find((item) => item.slug === createDraft.templateSlug)
                      if (matched) setCreateDraft(createDraftFromTemplate(matched))
                    }}
                    disabled={!createDraft.templateSlug}
                  >
                    {copy.applyTemplate}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">{copy.templateHint}</div>
              </div>
              {renderAgentForm(createDraft, updateCreateDraft, true)}
              <div className="mt-4">
                <Button onClick={() => void handleCreate()} disabled={saving === "create"}>
                  {copy.create}
                </Button>
              </div>
            </article>

            {selectedAgent ? (
              <>
                <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{copy.detailTitle}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {copy.status}: {selectedAgent.status} · {copy.mode}: {selectedAgent.executionMode}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgent.linkedWorkflowId ? (
                        <Button type="button" variant="outline" asChild>
                          <Link href={`/dashboard/workflows/${selectedAgent.linkedWorkflowId}`}>{copy.openWorkflow}</Link>
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" asChild>
                        <Link href={`/dashboard/agent-platform/${selectedAgent.id}`}>{copy.openAgent}</Link>
                      </Button>
                    </div>
                  </div>

                  {!selectedAgent.canEdit ? (
                    <div className="mb-4 text-sm text-muted-foreground">{copy.canEditHint}</div>
                  ) : null}
                  {selectedAgentWorkflowArchive.workflowArchived ? (
                    <div className="mb-4 rounded-[10px] border border-amber-300/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
                      {copy.workflowArchivedWarning}
                    </div>
                  ) : null}
                  {selectedAgent.status === "archived" ? (
                    <div className="mb-4 rounded-[10px] border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      {copy.archivedHiddenNotice}
                    </div>
                  ) : null}

                  {renderAgentForm(editDraft, updateEditDraft, selectedAgent.canEdit)}

                  {selectedAgent.canEdit ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={() => void handleSave()} disabled={saving === "save"}>
                        {copy.save}
                      </Button>
                      <Button variant="outline" onClick={() => void handleLifecycle("publish")} disabled={saving === "publish"}>
                        {copy.publish}
                      </Button>
                      <Button variant="outline" onClick={() => void handleLifecycle("disable")} disabled={saving === "disable"}>
                        {copy.disable}
                      </Button>
                      <Button variant="outline" onClick={() => void handleLifecycle("archive")} disabled={saving === "archive"}>
                        {copy.archive}
                      </Button>
                      <Button variant="outline" onClick={() => void handleLifecycle("duplicate")} disabled={saving === "duplicate"}>
                        {copy.duplicate}
                      </Button>
                    </div>
                  ) : null}
                </article>

                <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{copy.testTitle}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedAgent.executionMode === "workflow_backed" ? copy.testWorkflowHint : copy.testDirectHint}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedAgent.executionMode === "workflow_backed" ? copy.testRiskWorkflow : copy.testRiskDirect}
                    </div>
                  </div>

                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.testPrompt}</span>
                    <Textarea
                      className="min-h-28 rounded-[8px] border-border bg-background"
                      placeholder={copy.testPlaceholder}
                      value={testState.prompt}
                      onChange={(event) =>
                        updateTestState({
                          prompt: event.target.value,
                          savedMessage: null,
                          error: null,
                        })
                      }
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void handleRunTest()} disabled={testState.running}>
                      {copy.testRun}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void handleSaveTestRecord()} disabled={testState.running}>
                      {copy.testSave}
                    </Button>
                    {testState.savedMessage ? <span className="text-sm text-emerald-400">{testState.savedMessage}</span> : null}
                    {testState.error ? <span className="text-sm text-rose-400">{testState.error}</span> : null}
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="grid gap-3">
                      <div className="dashboard-kicker text-sm text-muted-foreground">{copy.testResult}</div>
                      {testState.workflowDetail ? (
                        <div className="min-h-[260px] overflow-hidden rounded-[10px] border border-border bg-background/70">
                          <WorkflowRunResultsPage
                            locale={locale}
                            detail={testState.workflowDetail}
                            firstArtifactSourceUrl={null}
                            embedded
                            onDetailChange={(detail) => {
                              updateTestState({
                                workflowDetail: detail,
                                resultSummary: summarizeText(
                                  locale === "zh"
                                    ? `工作流运行 #${detail.run.id} · ${detail.run.status}`
                                    : `Workflow run #${detail.run.id} · ${detail.run.status}`,
                                ),
                              })
                            }}
                            onDismiss={() => {
                              updateTestState({
                                workflowDetail: null,
                              })
                            }}
                          />
                        </div>
                      ) : testState.directResult ? (
                        <div className="rounded-[10px] border border-border bg-background/70 p-4">
                          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                            {testState.directResult}
                          </pre>
                        </div>
                      ) : (
                        <div className="rounded-[10px] border border-dashed border-border/80 bg-muted/10 p-4 text-sm text-muted-foreground">
                          {copy.testResultEmpty}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3">
                      <div className="dashboard-kicker text-sm text-muted-foreground">{copy.testHistory}</div>
                      {selectedAgentTestRecords.length === 0 ? (
                        <div className="rounded-[10px] border border-dashed border-border/80 bg-muted/10 p-4 text-sm text-muted-foreground">
                          {copy.testNoHistory}
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {selectedAgentTestRecords.map((record) => (
                            <div key={record.id} className="rounded-[10px] border border-border bg-background/70 p-4">
                              <div className="flex items-center justify-between gap-3 text-[11px] uppercase text-muted-foreground">
                                <span>{record.mode}</span>
                                <span>{formatTestRecordTime(locale, record.createdAt)}</span>
                              </div>
                              <div className="mt-2 text-sm font-semibold text-foreground">{summarizeText(record.prompt, 96)}</div>
                              <div className="mt-2 text-xs leading-6 text-muted-foreground">{record.resultSummary}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
