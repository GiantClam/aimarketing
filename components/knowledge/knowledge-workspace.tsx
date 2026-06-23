"use client"

import type { ChangeEvent, FormEvent } from "react"
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, Clock3, Database, FileText, Link2, RefreshCcw, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AppLocale } from "@/lib/i18n/config"
import type {
  KnowledgeDocument,
  KnowledgeOverview,
  KnowledgeRecentActivity,
  KnowledgeScope,
  KnowledgeSourceClientState,
  KnowledgeSourceTestResult,
} from "@/lib/knowledge/types"

type Copy = {
  eyebrow: string
  title: string
  description: string
  upload: string
  addLink: string
  helper: string
  docs: string
  processing: string
  chunks: string
  updated: string
  documents: string
  recent: string
  search: string
  all: string
  retry: string
  deleteLabel: string
  detail: string
  categoryGeneral: string
  categoryBrand: string
  categoryProduct: string
  categoryCaseStudy: string
  categoryCompliance: string
  categoryCampaign: string
  typeFile: string
  typeUrl: string
  noDocuments: string
  testConnection: string
  linkPlaceholder: string
  uploadError: string
  filterReady: string
  filterProcessing: string
  filterFailed: string
  deleteConfirm: string
  deleteSuccess: string
  targetDataset: string
  targetDatasetPlaceholder: string
  datasetColumn: string
  datasetOverview: string
  datasetDocumentCount: string
  datasetUnassigned: string
  datasetEmpty: string
  viewAllDatasets: string
  viewCurrentDataset: string
  createDataset: string
  createDatasetTitle: string
  createDatasetDescription: string
  createDatasetName: string
  createDatasetNamePlaceholder: string
  createDatasetCategory: string
  createDatasetChunkMethod: string
  createDatasetDescriptionField: string
  createDatasetDescriptionPlaceholder: string
  createDatasetSubmit: string
  createDatasetCancel: string
  createDatasetSuccess: string
  createDatasetRequiresConnection: string
  manageConnection: string
  chunkMethodNaive: string
  chunkMethodBook: string
  chunkMethodManual: string
  chunkMethodQa: string
  chunkMethodTable: string
  chunkMethodPresentation: string
}

type KnowledgeDatasetOption = {
  id: number
  name: string
  category: KnowledgeScope
}

type KnowledgeDatasetsApiResponse = {
  data?: {
    items?: Array<{
      id?: number
      name?: string
      category?: KnowledgeScope
    }>
  }
  error?: string
}

type KnowledgeDatasetCreateApiResponse = {
  data?: {
    id?: number
    name?: string
    category?: KnowledgeScope
  }
  error?: string
}

type KnowledgeSourceTestApiResponse = {
  data?: {
    test?: KnowledgeSourceTestResult
    source?: KnowledgeSourceClientState | null
  }
  error?: string
}

type KnowledgeSourceApiResponse = {
  data?: KnowledgeSourceClientState | null
  error?: string
}

function getCreateDatasetErrorMessage(locale: AppLocale, message: string) {
  if (
    message === "knowledge_source_not_configured" ||
    /401/i.test(message) ||
    /unauthorized/i.test(message)
  ) {
    return locale === "zh"
      ? "RAGFlow 连接鉴权失败，当前 API Key 无效或已失效。请先前往企业设置更新 API Key，再重新创建知识库。"
      : "RAGFlow authentication failed. The current API key is invalid or expired. Update the API key in platform settings, then try again."
  }

  if (message === "knowledge_dataset_create_failed") {
    return locale === "zh"
      ? "RAGFlow 没有返回新知识库 ID，本次创建未成功。"
      : "RAGFlow did not return a new dataset ID, so the knowledge base was not created."
  }

  if (message === "knowledge_dataset_sync_failed") {
    return locale === "zh"
      ? "RAGFlow 已创建知识库，但本地列表同步失败，请刷新页面后确认。"
      : "RAGFlow created the dataset, but local sync failed. Refresh the page and confirm."
  }

  return message
}

function getSourceBadgeLabel(params: {
  locale: AppLocale
  pending: boolean
  source: KnowledgeSourceClientState | null
}) {
  if (params.pending) {
    return params.locale === "zh" ? "RAGFlow 检测中" : "Checking RAGFlow"
  }

  if (!params.source?.enabled || !params.source.baseUrl) {
    return params.locale === "zh" ? "RAGFlow 未连接" : "RAGFlow disconnected"
  }

  if (params.source.status === "healthy") {
    return params.locale === "zh" ? "RAGFlow 已连接" : "RAGFlow connected"
  }

  if (params.source.status === "degraded") {
    return params.locale === "zh" ? "RAGFlow 连接异常" : "RAGFlow degraded"
  }

  return params.locale === "zh" ? "RAGFlow 不可用" : "RAGFlow unavailable"
}

function getDatasetDocumentSummary(locale: AppLocale, count: number) {
  return locale === "zh"
    ? `${count} 个文档`
    : `${count} document${count === 1 ? "" : "s"}`
}

async function fetchKnowledgeDatasets() {
  const response = await fetch("/api/knowledge/datasets", {
    cache: "no-store",
    credentials: "same-origin",
  })
  const payload = (await response.json().catch(() => null)) as KnowledgeDatasetsApiResponse | null
  if (!response.ok) {
    throw new Error(payload?.error || "knowledge_datasets_failed")
  }

  return (payload?.data?.items || [])
    .map((item) => {
      if (!item || typeof item.id !== "number" || !item.name || !item.category) return null
      return {
        id: item.id,
        name: item.name,
        category: item.category,
      } satisfies KnowledgeDatasetOption
    })
    .filter((item): item is KnowledgeDatasetOption => Boolean(item))
}

function getCopy(locale: AppLocale): Copy {
  if (locale === "zh") {
    return {
      eyebrow: "Enterprise Knowledge",
      title: "Knowledge Base",
      description: "统一管理企业资料、网页内容与检索状态，让 AI 对话、Writer 和顾问能力复用同一套知识底座。",
      upload: "上传文件",
      addLink: "添加链接",
      helper: "上传后将自动解析并进入企业知识库。",
      docs: "文档总数",
      processing: "处理中",
      chunks: "Chunk 总数",
      updated: "最近更新",
      documents: "文档列表",
      recent: "最近处理记录",
      search: "搜索文档或链接",
      all: "全部",
      retry: "重试",
      deleteLabel: "删除",
      detail: "查看详情",
      categoryGeneral: "通用",
      categoryBrand: "品牌",
      categoryProduct: "产品",
      categoryCaseStudy: "案例",
      categoryCompliance: "合规",
      categoryCampaign: "活动",
      typeFile: "文件",
      typeUrl: "链接",
      noDocuments: "还没有知识文档。先上传一份品牌资料或添加一个网页链接。",
      testConnection: "测试连接",
      linkPlaceholder: "输入网页链接后加入知识库",
      uploadError: "当前仅管理员可管理知识库。",
      filterReady: "已完成",
      filterProcessing: "处理中",
      filterFailed: "失败",
      deleteConfirm: "确认删除该知识文档吗？删除后将同时移除已同步的 chunk 以及远端 RAGFlow 文档。",
      deleteSuccess: "知识文档已删除",
      targetDataset: "目标知识库",
      targetDatasetPlaceholder: "选择知识库",
      datasetColumn: "所属知识库",
      datasetOverview: "知识库关联",
      datasetDocumentCount: "文档数",
      datasetUnassigned: "未关联知识库",
      datasetEmpty: "当前还没有可用知识库，请先完成知识库连接与启用。",
      viewAllDatasets: "全部知识库",
      viewCurrentDataset: "当前知识库",
      createDataset: "新建知识库",
      createDatasetTitle: "创建知识库",
      createDatasetDescription: "在 AIMARKETING 内创建新的 RAGFlow 知识库，创建后即可直接用于上传文档、添加网页和 AI 对话检索。",
      createDatasetName: "知识库名称",
      createDatasetNamePlaceholder: "例如：品牌资料库 / 产品 FAQ / 合规手册",
      createDatasetCategory: "用途分类",
      createDatasetChunkMethod: "Chunk 策略",
      createDatasetDescriptionField: "备注说明",
      createDatasetDescriptionPlaceholder: "可选，说明这个知识库服务的场景、文档范围或维护约定。",
      createDatasetSubmit: "创建并启用",
      createDatasetCancel: "取消",
      createDatasetSuccess: "知识库已创建，并已设为当前上传目标",
      createDatasetRequiresConnection: "请先保存并启用 RAGFlow 连接，再创建知识库。",
      manageConnection: "管理连接",
      chunkMethodNaive: "通用切块",
      chunkMethodBook: "书籍/长文",
      chunkMethodManual: "手册/说明文档",
      chunkMethodQa: "问答型",
      chunkMethodTable: "表格型",
      chunkMethodPresentation: "演示文稿",
    }
  }

  return {
    eyebrow: "Enterprise Knowledge",
    title: "Knowledge base",
    description: "Manage enterprise documents, web content, and retrieval status in one place so AI chat, Writer, and advisor flows reuse the same knowledge foundation.",
    upload: "Upload file",
    addLink: "Add link",
    helper: "Uploaded content will be parsed and added to enterprise knowledge automatically.",
    docs: "Documents",
    processing: "Processing",
    chunks: "Chunks",
    updated: "Last updated",
    documents: "Documents",
    recent: "Recent activity",
    search: "Search documents or links",
    all: "All",
    retry: "Retry",
    deleteLabel: "Delete",
    detail: "View detail",
    categoryGeneral: "General",
    categoryBrand: "Brand",
    categoryProduct: "Product",
    categoryCaseStudy: "Case study",
    categoryCompliance: "Compliance",
    categoryCampaign: "Campaign",
    typeFile: "File",
    typeUrl: "Link",
    noDocuments: "No knowledge documents yet. Upload a brand file or add a web link to get started.",
    testConnection: "Test connection",
    linkPlaceholder: "Paste a web link to add it to the knowledge base",
    uploadError: "Only admins can manage this knowledge base right now.",
    filterReady: "Ready",
    filterProcessing: "Processing",
    filterFailed: "Failed",
    deleteConfirm: "Delete this knowledge document? This also removes synced chunks and the remote RAGFlow document.",
    deleteSuccess: "Knowledge document deleted",
    targetDataset: "Target knowledge base",
    targetDatasetPlaceholder: "Choose knowledge base",
    datasetColumn: "Knowledge base",
    datasetOverview: "Knowledge mapping",
    datasetDocumentCount: "Documents",
    datasetUnassigned: "Unassigned",
    datasetEmpty: "No available knowledge bases yet. Connect and enable at least one dataset first.",
    viewAllDatasets: "All knowledge bases",
    viewCurrentDataset: "Current knowledge base",
    createDataset: "Create knowledge base",
    createDatasetTitle: "Create knowledge base",
    createDatasetDescription: "Create a new RAGFlow knowledge base inside AIMARKETING, then use it immediately for document uploads, link ingestion, and AI retrieval.",
    createDatasetName: "Knowledge base name",
    createDatasetNamePlaceholder: "Example: Brand library / Product FAQ / Compliance handbook",
    createDatasetCategory: "Usage category",
    createDatasetChunkMethod: "Chunk strategy",
    createDatasetDescriptionField: "Description",
    createDatasetDescriptionPlaceholder: "Optional. Describe the scope, expected documents, or maintenance notes for this knowledge base.",
    createDatasetSubmit: "Create and enable",
    createDatasetCancel: "Cancel",
    createDatasetSuccess: "Knowledge base created and selected as the current upload target",
    createDatasetRequiresConnection: "Save and enable the RAGFlow connection before creating a knowledge base.",
    manageConnection: "Manage connection",
    chunkMethodNaive: "General",
    chunkMethodBook: "Book / long-form",
    chunkMethodManual: "Manual / docs",
    chunkMethodQa: "Q&A",
    chunkMethodTable: "Table",
    chunkMethodPresentation: "Presentation",
  }
}

function getCategoryLabel(copy: Copy, category: KnowledgeScope) {
  switch (category) {
    case "brand":
      return copy.categoryBrand
    case "product":
      return copy.categoryProduct
    case "case-study":
      return copy.categoryCaseStudy
    case "compliance":
      return copy.categoryCompliance
    case "campaign":
      return copy.categoryCampaign
    default:
      return copy.categoryGeneral
  }
}

function getStatusClass(status: KnowledgeDocument["status"]) {
  if (status === "ready") return "status-ready"
  if (status === "failed") return "status-failed"
  if (status === "disabled") return "status-disabled"
  return "status-processing"
}

function getStatusLabel(locale: AppLocale, status: KnowledgeDocument["status"]) {
  if (locale === "zh") {
    if (status === "ready") return "已完成"
    if (status === "failed") return "失败"
    if (status === "reparsing") return "重解析中"
    if (status === "parsing") return "解析中"
    if (status === "disabled") return "已停用"
    return "已上传"
  }
  if (status === "ready") return "Ready"
  if (status === "failed") return "Failed"
  if (status === "reparsing") return "Reparsing"
  if (status === "parsing") return "Parsing"
  if (status === "disabled") return "Disabled"
  return "Uploaded"
}

function formatTimestamp(locale: AppLocale, value: string | null) {
  if (!value) return locale === "zh" ? "暂无" : "N/A"
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function KnowledgeWorkspace({
  locale,
  initialOverview,
  initialDocuments,
  initialRecentActivity,
  initialSource,
  canManage,
}: {
  locale: AppLocale
  initialOverview: KnowledgeOverview
  initialDocuments: KnowledgeDocument[]
  initialRecentActivity: KnowledgeRecentActivity[]
  initialSource: KnowledgeSourceClientState | null
  canManage: boolean
}) {
  const copy = getCopy(locale)
  const router = useRouter()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [linkUrl, setLinkUrl] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "processing" | "ready" | "failed">("all")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sourceState, setSourceState] = useState<KnowledgeSourceClientState | null>(initialSource)
  const [sourceCheckPending, setSourceCheckPending] = useState(false)
  const [datasets, setDatasets] = useState<KnowledgeDatasetOption[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("")
  const [showCreateDatasetForm, setShowCreateDatasetForm] = useState(false)
  const [createDatasetName, setCreateDatasetName] = useState("")
  const [createDatasetCategory, setCreateDatasetCategory] = useState<KnowledgeScope>("general")
  const [createDatasetChunkMethod, setCreateDatasetChunkMethod] = useState("naive")
  const [createDatasetDescription, setCreateDatasetDescription] = useState("")
  const [createDatasetMessage, setCreateDatasetMessage] = useState<string | null>(null)
  const [datasetViewMode, setDatasetViewMode] = useState<"all" | "current">("current")
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const hasConnectedSource = Boolean(sourceState?.enabled && sourceState.baseUrl)
  const sourceStateRef = useRef<KnowledgeSourceClientState | null>(initialSource)
  const selectedDatasetIdRef = useRef("")
  const datasetSelectionStorageKey = useMemo(() => {
    const enterpriseId = sourceState?.enterpriseId || initialSource?.enterpriseId || "default"
    return `aimarketing:knowledge-base:selected-dataset:${enterpriseId}`
  }, [initialSource?.enterpriseId, sourceState?.enterpriseId])
  const datasetViewModeStorageKey = useMemo(() => {
    const enterpriseId = sourceState?.enterpriseId || initialSource?.enterpriseId || "default"
    return `aimarketing:knowledge-base:view-mode:${enterpriseId}`
  }, [initialSource?.enterpriseId, sourceState?.enterpriseId])

  const applySourceState = useCallback((nextSource: KnowledgeSourceClientState | null) => {
    sourceStateRef.current = nextSource
    setSourceState(nextSource)
  }, [])

  useEffect(() => {
    sourceStateRef.current = sourceState
  }, [sourceState])

  useEffect(() => {
    selectedDatasetIdRef.current = selectedDatasetId
  }, [selectedDatasetId])

  const readStoredDatasetId = useCallback(() => {
    if (typeof window === "undefined") return ""
    return window.localStorage.getItem(datasetSelectionStorageKey) || ""
  }, [datasetSelectionStorageKey])

  useEffect(() => {
    const storedDatasetId = readStoredDatasetId()
    if (storedDatasetId) {
      selectedDatasetIdRef.current = storedDatasetId
      setSelectedDatasetId((current) => current || storedDatasetId)
    }
  }, [readStoredDatasetId])

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedViewMode = window.localStorage.getItem(datasetViewModeStorageKey)
    if (storedViewMode === "all" || storedViewMode === "current") {
      setDatasetViewMode(storedViewMode)
    }
  }, [datasetViewModeStorageKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (selectedDatasetId) {
      window.localStorage.setItem(datasetSelectionStorageKey, selectedDatasetId)
      return
    }
    window.localStorage.removeItem(datasetSelectionStorageKey)
  }, [datasetSelectionStorageKey, selectedDatasetId])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(datasetViewModeStorageKey, datasetViewMode)
  }, [datasetViewMode, datasetViewModeStorageKey])

  useEffect(() => {
    let cancelled = false

    async function loadDatasets() {
      try {
        const nextDatasets = await fetchKnowledgeDatasets()
        if (cancelled) return
        setDatasets(nextDatasets)
        setSelectedDatasetId((current) => {
          const preferredDatasetId = current || selectedDatasetIdRef.current || readStoredDatasetId()
          if (preferredDatasetId && nextDatasets.some((dataset) => String(dataset.id) === preferredDatasetId)) {
            return preferredDatasetId
          }
          return nextDatasets[0] ? String(nextDatasets[0].id) : ""
        })
      } catch {
        if (cancelled) return
        setDatasets([])
        setSelectedDatasetId("")
      }
    }

    void loadDatasets()
    return () => {
      cancelled = true
    }
  }, [readStoredDatasetId])

  const datasetNameById = useMemo(
    () => new Map(datasets.map((dataset) => [dataset.id, dataset.name])),
    [datasets],
  )

  const selectedDatasetNumberId = useMemo(() => {
    const parsed = Number.parseInt(selectedDatasetId, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }, [selectedDatasetId])

  const isCurrentDatasetView = datasetViewMode === "current" && Boolean(selectedDatasetNumberId)

  const scopedDocuments = useMemo(() => {
    if (!isCurrentDatasetView || !selectedDatasetNumberId) return initialDocuments
    return initialDocuments.filter((document) => document.datasetId === selectedDatasetNumberId)
  }, [initialDocuments, isCurrentDatasetView, selectedDatasetNumberId])

  const scopedOverviewStats = useMemo(() => {
    if (!isCurrentDatasetView || !selectedDatasetNumberId) {
      return initialOverview.stats
    }

    let processingCount = 0
    let chunkCount = 0
    let lastUpdatedAt: string | null = null

    for (const document of scopedDocuments) {
      if (document.status === "uploaded" || document.status === "parsing" || document.status === "reparsing") {
        processingCount += 1
      }
      chunkCount += document.chunkCount || 0
      if (document.updatedAt && (!lastUpdatedAt || new Date(document.updatedAt).getTime() > new Date(lastUpdatedAt).getTime())) {
        lastUpdatedAt = document.updatedAt
      }
    }

    return {
      documentCount: scopedDocuments.length,
      processingCount,
      chunkCount,
      lastUpdatedAt,
    }
  }, [initialOverview.stats, isCurrentDatasetView, scopedDocuments, selectedDatasetNumberId])

  const datasetOverviewItems = useMemo(() => {
    const counts = new Map<number, number>()
    let unassignedCount = 0

    for (const document of initialDocuments) {
      if (typeof document.datasetId === "number" && document.datasetId > 0) {
        counts.set(document.datasetId, (counts.get(document.datasetId) || 0) + 1)
      } else {
        unassignedCount += 1
      }
    }

    const items = datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      category: dataset.category,
      documentCount: counts.get(dataset.id) || 0,
    }))

    if (unassignedCount > 0) {
      items.push({
        id: -1,
        name: copy.datasetUnassigned,
        category: "general" as const,
        documentCount: unassignedCount,
      })
    }

    if (isCurrentDatasetView && selectedDatasetNumberId) {
      return items.filter((dataset) => dataset.id === selectedDatasetNumberId)
    }

    return items
  }, [copy.datasetUnassigned, datasets, initialDocuments, isCurrentDatasetView, selectedDatasetNumberId])

  const filteredDocuments = useMemo(() => {
    return scopedDocuments.filter((document) => {
      const normalizedSearch = deferredSearchQuery.trim().toLowerCase()
      const matchesSearch =
        normalizedSearch.length === 0 ||
        document.name.toLowerCase().includes(normalizedSearch) ||
        (document.sourceUrl || "").toLowerCase().includes(normalizedSearch)

      if (!matchesSearch) return false
      if (statusFilter === "all") return true
      if (statusFilter === "processing") {
        return document.status === "uploaded" || document.status === "parsing" || document.status === "reparsing"
      }
      return document.status === statusFilter
    })
  }, [deferredSearchQuery, scopedDocuments, statusFilter])

  const scopedRecentActivity = useMemo(() => {
    if (!isCurrentDatasetView || !selectedDatasetNumberId) return initialRecentActivity

    const scopedDocumentIds = new Set(scopedDocuments.map((document) => document.id))
    return initialRecentActivity.filter((activity) => (
      typeof activity.documentId === "number" && scopedDocumentIds.has(activity.documentId)
    ))
  }, [initialRecentActivity, isCurrentDatasetView, scopedDocuments, selectedDatasetNumberId])

  async function refreshWorkspace() {
    router.refresh()
  }

  const reloadDatasets = useCallback(async (nextSelectedDatasetId?: string) => {
    const nextDatasets = await fetchKnowledgeDatasets()
    setDatasets(nextDatasets)
    setSelectedDatasetId(() => {
      const preferredDatasetId = nextSelectedDatasetId || selectedDatasetIdRef.current || readStoredDatasetId()
      if (preferredDatasetId && nextDatasets.some((dataset) => String(dataset.id) === preferredDatasetId)) {
        return preferredDatasetId
      }
      return nextDatasets[0] ? String(nextDatasets[0].id) : ""
    })
  }, [readStoredDatasetId])

  const handleDatasetSelectionChange = useCallback(
    (nextDatasetId: string) => {
      setSelectedDatasetId(nextDatasetId)
      setDatasetViewMode("current")
      setCreateDatasetMessage(null)
      setMessage((current) => (current === copy.createDatasetSuccess ? null : current))
    },
    [copy.createDatasetSuccess],
  )

  const runSourceHealthCheck = useCallback(async (options?: {
    silent?: boolean
  }) => {
    if (!options?.silent) {
      setSourceCheckPending(true)
    }
    try {
      const response = await fetch("/api/knowledge/source/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
      const payload = (await response.json().catch(() => null)) as KnowledgeSourceTestApiResponse | null
      if (!response.ok) {
        throw new Error(payload?.error || "knowledge_source_test_failed")
      }

      const previousStatus = sourceStateRef.current?.status || null
      const nextSource = payload?.data?.source || sourceStateRef.current
      const test = payload?.data?.test || null

      if (nextSource) {
        applySourceState(nextSource)
      }

      if (test?.ok) {
        await reloadDatasets(selectedDatasetIdRef.current || undefined)
        if (!options?.silent) {
          setMessage(test.message || "OK")
        } else if (previousStatus && previousStatus !== "healthy") {
          toast.success(locale === "zh" ? "RAGFlow 已自动恢复连接" : "RAGFlow reconnected automatically")
        }
      } else if (!options?.silent) {
        setMessage(test?.message || "knowledge_source_test_failed")
      }
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "knowledge_source_test_failed")
      }
    } finally {
      if (!options?.silent) {
        setSourceCheckPending(false)
      }
    }
  }, [applySourceState, locale, reloadDatasets])

  const loadSourceState = useCallback(async (options?: {
    silent?: boolean
    triggerHealthCheck?: boolean
  }) => {
    try {
      const response = await fetch("/api/knowledge/source", {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      })
      const payload = (await response.json().catch(() => null)) as KnowledgeSourceApiResponse | null
      if (!response.ok) {
        throw new Error(payload?.error || "knowledge_source_read_failed")
      }

      const nextSource = payload?.data || null
      applySourceState(nextSource)

      if (options?.triggerHealthCheck && nextSource?.enabled && nextSource.baseUrl) {
        await runSourceHealthCheck({ silent: options.silent })
      }
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "knowledge_source_read_failed")
      }
    }
  }, [applySourceState, runSourceHealthCheck])

  useEffect(() => {
    void loadSourceState({ silent: true, triggerHealthCheck: true })

    const handleWindowFocus = () => {
      void loadSourceState({ silent: true, triggerHealthCheck: true })
    }

    const handleOnline = () => {
      void loadSourceState({ silent: true, triggerHealthCheck: true })
    }

    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("online", handleOnline)

    return () => {
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("online", handleOnline)
    }
  }, [loadSourceState])

  async function handleConnectionTest() {
    setBusy("test")
    setMessage(null)
    try {
      await runSourceHealthCheck()
      await refreshWorkspace()
    } finally {
      setBusy(null)
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!canManage) {
      setMessage(copy.uploadError)
      event.target.value = ""
      return
    }

    setBusy("upload")
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("category", "general")
      if (selectedDatasetId) {
        formData.append("datasetId", selectedDatasetId)
      }
      const response = await fetch("/api/knowledge/documents/upload", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_document_upload_failed")
      event.target.value = ""
      await refreshWorkspace()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_document_upload_failed")
    } finally {
      setBusy(null)
    }
  }

  async function handleLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage) {
      setMessage(copy.uploadError)
      return
    }
    if (!linkUrl.trim()) return

    setBusy("link")
    setMessage(null)
    try {
      const response = await fetch("/api/knowledge/documents/url", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url: linkUrl.trim(),
          datasetId: selectedDatasetId ? Number.parseInt(selectedDatasetId, 10) : null,
          category: "general",
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_document_url_failed")
      setLinkUrl("")
      await refreshWorkspace()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_document_url_failed")
    } finally {
      setBusy(null)
    }
  }

  async function handleRetry(documentId: number) {
    setBusy(`reparse-${documentId}`)
    setMessage(null)
    try {
      const response = await fetch(`/api/knowledge/documents/${documentId}/reparse`, {
        method: "POST",
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_document_reparse_failed")
      await refreshWorkspace()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_document_reparse_failed")
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(document: KnowledgeDocument) {
    if (!canManage) {
      setMessage(copy.uploadError)
      return
    }

    const confirmed = window.confirm(
      locale === "zh" ? `${copy.deleteConfirm}\n\n${document.name}` : `${copy.deleteConfirm}\n\n${document.name}`,
    )
    if (!confirmed) return

    setBusy(`delete-${document.id}`)
    setMessage(null)
    try {
      const response = await fetch(`/api/knowledge/documents/${document.id}`, {
        method: "DELETE",
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_document_delete_failed")
      setMessage(copy.deleteSuccess)
      await refreshWorkspace()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_document_delete_failed")
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateDataset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage) {
      setCreateDatasetMessage(copy.uploadError)
      return
    }
    if (!hasConnectedSource) {
      setCreateDatasetMessage(copy.createDatasetRequiresConnection)
      return
    }

    const name = createDatasetName.trim()
    if (!name) {
      setCreateDatasetMessage(locale === "zh" ? "请填写知识库名称" : "Knowledge base name is required")
      return
    }

    setBusy("create-dataset")
    setCreateDatasetMessage(null)
    try {
      const response = await fetch("/api/knowledge/datasets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          category: createDatasetCategory,
          chunkMethod: createDatasetChunkMethod,
          description: createDatasetDescription.trim() || null,
        }),
      })
      const payload = (await response.json().catch(() => null)) as KnowledgeDatasetCreateApiResponse | null
      if (!response.ok) {
        throw new Error(payload?.error || "knowledge_dataset_create_failed")
      }

      const createdId =
        typeof payload?.data?.id === "number" && payload.data.id > 0 ? String(payload.data.id) : undefined
      setShowCreateDatasetForm(false)
      setCreateDatasetName("")
      setCreateDatasetCategory("general")
      setCreateDatasetChunkMethod("naive")
      setCreateDatasetDescription("")
      setCreateDatasetMessage(null)
      setDatasetViewMode("current")
      setMessage(copy.createDatasetSuccess)
      await reloadDatasets(createdId)
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "knowledge_dataset_create_failed"
      setCreateDatasetMessage(getCreateDatasetErrorMessage(locale, rawMessage))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="knowledge-page h-full overflow-auto">
      <section className="mx-auto max-w-[1440px] px-4 py-6 lg:px-8 lg:py-8">
        <header className="knowledge-page-header">
          <div className="max-w-[760px]">
            <div className="knowledge-eyebrow">{copy.eyebrow}</div>
            <h1 className="knowledge-title">{copy.title}</h1>
            <p className="mt-4 max-w-[680px] text-[15px] leading-7 text-[#666]">{copy.description}</p>
          </div>
        </header>

        <div className="connection-action-row">
          <div className="connection-pill">
            <span className="h-2 w-2 rounded-full bg-[#111]" />
            {getSourceBadgeLabel({ locale, pending: sourceCheckPending, source: sourceState })}
          </div>
          {canManage ? (
            <Button
              type="button"
              className="primary-black-btn"
              onClick={() => {
                setShowCreateDatasetForm((current) => !current)
                setMessage(null)
                setCreateDatasetMessage(null)
              }}
            >
              <Database className="h-4 w-4" />
              {copy.createDataset}
            </Button>
          ) : null}
          <Button
            type="button"
            className="secondary-btn"
            onClick={handleConnectionTest}
            disabled={busy === "test"}
          >
            <RefreshCcw className="h-4 w-4" />
            {copy.testConnection}
          </Button>
          <Button type="button" className="secondary-btn" asChild>
            <Link href="/dashboard/platform-settings/knowledge">
              <Link2 className="h-4 w-4" />
              {copy.manageConnection}
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: copy.docs, value: String(scopedOverviewStats.documentCount), icon: FileText },
            { label: copy.processing, value: String(scopedOverviewStats.processingCount), icon: Clock3 },
            { label: copy.chunks, value: String(scopedOverviewStats.chunkCount), icon: Database },
            { label: copy.updated, value: formatTimestamp(locale, scopedOverviewStats.lastUpdatedAt), icon: CheckCircle2 },
          ].map((item) => {
            const Icon = item.icon
            return (
              <article key={item.label} className="knowledge-metric-card">
                <div className="knowledge-metric-icon">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="knowledge-card-label">{item.label}</div>
                  <div className="knowledge-metric-value">{item.value}</div>
                </div>
              </article>
            )
          })}
        </div>

        <main className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <article className="ingest-panel">
              <div className="knowledge-card-label text-[#111]">
                {locale === "zh" ? "添加内容到知识库" : "Add content to your knowledge base"}
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-5 grid gap-3 lg:grid-cols-[auto_minmax(210px,260px)_minmax(260px,1fr)]">
                <Button
                  type="button"
                  className="upload-btn"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={busy === "upload" || datasets.length === 0}
                >
                  <UploadCloud className="h-4 w-4" />
                  {copy.upload}
                </Button>
                <Select value={selectedDatasetId || undefined} onValueChange={handleDatasetSelectionChange}>
                  <SelectTrigger className="kb-select">
                    <SelectValue placeholder={copy.targetDatasetPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={String(dataset.id)}>
                        {dataset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <form className="flex min-w-0 gap-3" onSubmit={handleLinkSubmit}>
                  <Input
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder={copy.linkPlaceholder}
                    className="web-link-input min-w-0 flex-1"
                  />
                  <Button
                    type="submit"
                    className="add-link-btn"
                    disabled={busy === "link" || datasets.length === 0}
                  >
                    <Link2 className="h-4 w-4" />
                    {copy.addLink}
                  </Button>
                </form>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-[#777]">
                <span>{copy.targetDataset}:</span>
                <span className="rounded-md border border-[#e6e6df] bg-[#f7f7f3] px-2 py-1 font-mono text-[#111]">
                  {selectedDatasetId
                    ? (datasetNameById.get(Number.parseInt(selectedDatasetId, 10)) || copy.targetDatasetPlaceholder)
                    : copy.targetDatasetPlaceholder}
                </span>
              </div>
              <p className="mt-3 text-xs leading-6 text-[#777]">{copy.helper}</p>
              {datasets.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-[#e7e7df] bg-[#fafaf7] px-3 py-2 text-xs text-[#777]">
                  {copy.datasetEmpty}
                </div>
              ) : null}
              {message ? (
                <div className="mt-3 rounded-lg border border-[#e7e7df] bg-[#fafaf7] px-3 py-2 text-xs text-[#555]">
                  {message}
                </div>
              ) : null}
            </article>

            <article className="documents-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="knowledge-card-label">{copy.documents}</div>
                  <h2 className="mt-2 font-display text-[34px] font-black uppercase leading-none text-[#111]">
                    {copy.documents}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    className={`filter-tab ${datasetViewMode === "all" ? "active" : ""}`}
                    onClick={() => setDatasetViewMode("all")}
                  >
                    {copy.viewAllDatasets}
                  </Button>
                  <Button
                    type="button"
                    className={`filter-tab ${datasetViewMode === "current" ? "active" : ""}`}
                    onClick={() => setDatasetViewMode("current")}
                    disabled={!selectedDatasetId}
                  >
                    {copy.viewCurrentDataset}
                  </Button>
                  {[
                    { key: "all" as const, label: copy.all },
                    { key: "processing" as const, label: copy.filterProcessing },
                    { key: "ready" as const, label: copy.filterReady },
                    { key: "failed" as const, label: copy.filterFailed },
                  ].map((filter) => (
                    <Button
                      key={filter.key}
                      type="button"
                      className={`filter-tab ${statusFilter === filter.key ? "active" : ""}`}
                      onClick={() => setStatusFilter(filter.key)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex gap-3">
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={copy.search}
                  className="document-search"
                />
                <Button type="button" className="filter-btn">
                  {locale === "zh" ? "筛选" : "Filters"}
                </Button>
              </div>

              {filteredDocuments.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-[#e7e7df] bg-[#fafaf7] p-5 text-sm leading-7 text-[#777]">
                  {scopedDocuments.length === 0
                    ? copy.noDocuments
                    : locale === "zh"
                      ? "没有符合当前筛选条件的文档。"
                      : "No documents match the current filters."}
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="documents-table">
                    <thead className="table-header">
                      <tr>
                        <th className="px-4 py-3 text-left">{locale === "zh" ? "名称" : "Name"}</th>
                        <th className="px-4 py-3 text-left">{copy.datasetColumn}</th>
                        <th className="px-4 py-3 text-left">{locale === "zh" ? "分类" : "Category"}</th>
                        <th className="px-4 py-3 text-left">{locale === "zh" ? "类型" : "Type"}</th>
                        <th className="px-4 py-3 text-left">{locale === "zh" ? "状态" : "Status"}</th>
                        <th className="px-4 py-3 text-left">{locale === "zh" ? "更新时间" : "Updated"}</th>
                        <th className="px-4 py-3 text-left">{locale === "zh" ? "操作" : "Actions"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocuments.map((document) => (
                        <tr key={document.id}>
                          <td className="table-cell min-w-[260px]">
                            <div className="flex gap-3">
                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e4e4dc] bg-[#fafaf7]">
                                {document.sourceType === "url" ? (
                                  <Link2 className="h-4 w-4 text-[#111]" />
                                ) : (
                                  <FileText className="h-4 w-4 text-[#111]" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="document-name">{document.name}</div>
                                {document.errorMessage ? (
                                  <div className="document-log">{document.errorMessage}</div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="table-cell text-[#666]">
                            {typeof document.datasetId === "number"
                              ? (datasetNameById.get(document.datasetId) || `#${document.datasetId}`)
                              : copy.datasetUnassigned}
                          </td>
                          <td className="table-cell">{getCategoryLabel(copy, document.category)}</td>
                          <td className="table-cell">{document.sourceType === "url" ? copy.typeUrl : copy.typeFile}</td>
                          <td className="table-cell">
                            <span className={getStatusClass(document.status)}>
                              {getStatusLabel(locale, document.status)}
                            </span>
                          </td>
                          <td className="table-cell text-[#666]">{formatTimestamp(locale, document.updatedAt)}</td>
                          <td className="table-cell">
                            <div className="flex min-w-[116px] flex-col gap-2">
                              <Button className="row-action" asChild>
                                <Link href={`/dashboard/knowledge-base/documents/${document.id}`}>{copy.detail}</Link>
                              </Button>
                              {(document.status === "failed" || document.status === "ready") && canManage ? (
                                <Button
                                  type="button"
                                  className="row-action"
                                  onClick={() => handleRetry(document.id)}
                                  disabled={busy === `reparse-${document.id}`}
                                >
                                  {copy.retry}
                                </Button>
                              ) : null}
                              {canManage ? (
                                <Button
                                  type="button"
                                  className="row-action delete"
                                  onClick={() => handleDelete(document)}
                                  disabled={busy === `delete-${document.id}`}
                                >
                                  {copy.deleteLabel}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>

          <aside className="space-y-6">
            <article className="side-card">
              <div className="knowledge-card-label">{copy.datasetOverview}</div>
              <div className="mt-5 space-y-3">
                {datasetOverviewItems.length === 0 ? (
                  <div className="text-sm leading-6 text-[#777]">{copy.datasetEmpty}</div>
                ) : (
                  datasetOverviewItems.map((dataset) => (
                    <button
                      key={dataset.id}
                      type="button"
                      className="knowledge-map-item"
                      onClick={() => {
                        if (dataset.id > 0) {
                          setSelectedDatasetId(String(dataset.id))
                          setDatasetViewMode("current")
                          return
                        }

                        setSelectedDatasetId("")
                        setDatasetViewMode("all")
                      }}
                    >
                      <span className="knowledge-metric-icon h-12 w-12">
                        <Database className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-xl font-black uppercase leading-none text-[#111]">
                          {dataset.name}
                        </span>
                        <span className="mt-2 block text-left text-xs font-medium text-[#777]">
                          {getCategoryLabel(copy, dataset.category)} · {getDatasetDocumentSummary(locale, dataset.documentCount)}
                        </span>
                      </span>
                      <span className="rounded-full border border-[#e7e7df] px-2 py-1 text-[10px] font-black uppercase text-[#111]">
                        {locale === "zh" ? "查看" : "View"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </article>

            <article className="side-card">
              <div className="knowledge-card-label">{copy.recent}</div>
              <div className="mt-5 space-y-3">
                {scopedRecentActivity.length === 0 ? (
                  <div className="text-sm leading-6 text-[#777]">{locale === "zh" ? "暂无处理记录" : "No recent activity yet."}</div>
                ) : (
                  scopedRecentActivity.map((activity) => (
                    <div key={activity.id} className="recent-activity-item">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e4e4dc] bg-[#fafaf7]">
                          {activity.status === "failed" ? (
                            <AlertCircle className="h-4 w-4 text-[#d93025]" />
                          ) : (
                            <FileText className="h-4 w-4 text-[#111]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-[#111]">{activity.title}</div>
                          <div className="mt-1 text-xs text-[#777]">{formatTimestamp(locale, activity.at)}</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <span className={getStatusClass(activity.status)}>
                          {getStatusLabel(locale, activity.status)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </aside>
        </main>
      </section>

      <Dialog
        open={showCreateDatasetForm}
        onOpenChange={(open) => {
          setShowCreateDatasetForm(open)
          if (!open) {
            setCreateDatasetMessage(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-extrabold uppercase tracking-[0.02em]">
              {copy.createDatasetTitle}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              {copy.createDatasetDescription}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleCreateDataset}>
            {createDatasetMessage ? (
              <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 lg:col-span-2">
                {createDatasetMessage}
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{copy.createDatasetName}</label>
              <Input
                value={createDatasetName}
                onChange={(event) => setCreateDatasetName(event.target.value)}
                placeholder={copy.createDatasetNamePlaceholder}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{copy.createDatasetCategory}</label>
              <Select
                value={createDatasetCategory}
                onValueChange={(value) => setCreateDatasetCategory(value as KnowledgeScope)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">{copy.categoryGeneral}</SelectItem>
                  <SelectItem value="brand">{copy.categoryBrand}</SelectItem>
                  <SelectItem value="product">{copy.categoryProduct}</SelectItem>
                  <SelectItem value="case-study">{copy.categoryCaseStudy}</SelectItem>
                  <SelectItem value="compliance">{copy.categoryCompliance}</SelectItem>
                  <SelectItem value="campaign">{copy.categoryCampaign}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{copy.createDatasetChunkMethod}</label>
              <Select value={createDatasetChunkMethod} onValueChange={setCreateDatasetChunkMethod}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="naive">{copy.chunkMethodNaive}</SelectItem>
                  <SelectItem value="book">{copy.chunkMethodBook}</SelectItem>
                  <SelectItem value="manual">{copy.chunkMethodManual}</SelectItem>
                  <SelectItem value="qa">{copy.chunkMethodQa}</SelectItem>
                  <SelectItem value="table">{copy.chunkMethodTable}</SelectItem>
                  <SelectItem value="presentation">{copy.chunkMethodPresentation}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-xs text-muted-foreground">{copy.createDatasetDescriptionField}</label>
              <Textarea
                value={createDatasetDescription}
                onChange={(event) => setCreateDatasetDescription(event.target.value)}
                placeholder={copy.createDatasetDescriptionPlaceholder}
                className="min-h-24 bg-background"
              />
            </div>
            <DialogFooter className="gap-3 lg:col-span-2">
              <Button
                type="button"
                className="public-button-secondary h-10 px-4"
                onClick={() => setShowCreateDatasetForm(false)}
                disabled={busy === "create-dataset"}
              >
                {copy.createDatasetCancel}
              </Button>
              <Button
                type="submit"
                className="public-button-primary h-10 px-4"
                disabled={busy === "create-dataset"}
              >
                {copy.createDatasetSubmit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
