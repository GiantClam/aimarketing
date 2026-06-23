"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUp,
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  FolderOpen,
  Grid2X2,
  Link2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DashboardFilterToolbar } from "@/components/ui/dashboard-filter-toolbar"
import type { EnterpriseUnifiedAssetLibraryItem } from "@/lib/platform/assets"
import { cn } from "@/lib/utils"

type WorkspaceAssetLibraryItem = EnterpriseUnifiedAssetLibraryItem
type AssetViewMode = "grid" | "table"
type AssetTabId = "all" | "workflow" | "uploads" | "recent" | "favorites" | "documents"
type AssetSourceBucket = "upload" | "workflow" | "ai" | "manual"
type AssetTypeKey = "image" | "video" | "audio" | "document" | "ppt" | "spreadsheet" | "archive" | "other"
type AssetNotice = { tone: "success" | "error"; message: string } | null

const DEFAULT_PAGE_SIZE = 12
const DAY_MS = 24 * 60 * 60 * 1000
const FAVORITES_STORAGE_KEY = "aimarketing:asset-library:favorites"

function parseDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateTime(value: string | null, locale: "zh" | "en") {
  const parsed = parseDate(value)
  if (!parsed) return locale === "zh" ? "未记录" : "Not recorded"
  return parsed.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelativeTime(value: string | null, locale: "zh" | "en") {
  const parsed = parseDate(value)
  if (!parsed) return locale === "zh" ? "未记录" : "Not recorded"

  const diffMs = parsed.getTime() - Date.now()
  const absSeconds = Math.round(Math.abs(diffMs) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { numeric: "auto" })

  if (absSeconds < 60) return rtf.format(Math.round(diffMs / 1000), "second")

  const absMinutes = Math.round(absSeconds / 60)
  if (absMinutes < 60) return rtf.format(Math.round(diffMs / (60 * 1000)), "minute")

  const absHours = Math.round(absMinutes / 60)
  if (absHours < 24) return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), "hour")

  const absDays = Math.round(absHours / 24)
  if (absDays < 30) return rtf.format(Math.round(diffMs / DAY_MS), "day")

  return formatDateTime(value, locale)
}

function getAssetPath(item: WorkspaceAssetLibraryItem) {
  if (!item.storageKey) return "/external"
  const segments = item.storageKey.split("/").filter(Boolean)
  if (segments.length <= 1) return "/"
  return `/${segments.slice(0, -1).join("/")}`
}

function isPdfAsset(item: WorkspaceAssetLibraryItem) {
  const mime = item.mimeType?.toLowerCase() || ""
  return mime === "application/pdf" || item.title.toLowerCase().endsWith(".pdf")
}

function getAssetSourceBucket(item: WorkspaceAssetLibraryItem): AssetSourceBucket {
  const source = item.sourceType?.toLowerCase() || ""
  if (source.includes("workflow") || item.hasWorkItem) return "workflow"
  if (source.includes("generated") || source.includes("assistant")) return "ai"
  if (source.includes("upload") || source.includes("chat") || source.includes("import")) return "upload"
  return "manual"
}

function getAssetTypeKey(item: WorkspaceAssetLibraryItem): AssetTypeKey {
  const mime = item.mimeType?.toLowerCase() || ""
  const title = item.title.toLowerCase()

  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.includes("presentation") || mime.includes("powerpoint") || /\.(ppt|pptx)$/i.test(title)) return "ppt"
  if (mime.includes("spreadsheet") || mime.includes("excel") || /\.(xls|xlsx|csv)$/i.test(title)) return "spreadsheet"
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    /\.(zip|rar|7z|tar|gz)$/i.test(title)
  ) {
    return "archive"
  }
  if (item.formatGroup === "document") return "document"
  return "other"
}

function buildAssetTags(item: WorkspaceAssetLibraryItem, locale: "zh" | "en") {
  const tags = new Set<string>()
  const typeKey = getAssetTypeKey(item)
  const sourceBucket = getAssetSourceBucket(item)

  if (locale === "zh") {
    if (typeKey === "ppt") tags.add("PPT")
    if (typeKey === "spreadsheet") tags.add("表格")
    if (typeKey === "archive") tags.add("压缩包")
    if (sourceBucket === "workflow") tags.add("工作流")
    if (sourceBucket === "ai") tags.add("AI")
    if (sourceBucket === "upload") tags.add("上传")
  } else {
    if (typeKey === "ppt") tags.add("PPT")
    if (typeKey === "spreadsheet") tags.add("Spreadsheet")
    if (typeKey === "archive") tags.add("Archive")
    if (sourceBucket === "workflow") tags.add("Workflow")
    if (sourceBucket === "ai") tags.add("AI")
    if (sourceBucket === "upload") tags.add("Upload")
  }

  if (item.referenceCount > 1) {
    tags.add(locale === "zh" ? `${item.referenceCount} 个引用` : `${item.referenceCount} refs`)
  }

  return [...tags]
}

function getAssetTypeMeta(item: WorkspaceAssetLibraryItem, locale: "zh" | "en") {
  const typeKey = getAssetTypeKey(item)
  if (typeKey === "image") {
    return {
      label: locale === "zh" ? "图片" : "Image",
      className: "border-[#cfe0ff] bg-[#eef4ff] text-[#2f68d8]",
      icon: FileImage,
    }
  }
  if (typeKey === "video") {
    return {
      label: locale === "zh" ? "视频" : "Video",
      className: "border-[#dacbff] bg-[#f3edff] text-[#6b45d7]",
      icon: Film,
    }
  }
  if (typeKey === "audio") {
    return {
      label: locale === "zh" ? "音频" : "Audio",
      className: "border-[#caefd9] bg-[#eefaf2] text-[#168449]",
      icon: AudioLines,
    }
  }
  if (typeKey === "ppt") {
    return {
      label: "PPT",
      className: "border-[#ffd9bf] bg-[#fff4eb] text-[#c25f15]",
      icon: FileText,
    }
  }
  if (typeKey === "spreadsheet") {
    return {
      label: locale === "zh" ? "表格" : "Sheet",
      className: "border-[#d5ecd0] bg-[#eff9ee] text-[#2b8b47]",
      icon: FileSpreadsheet,
    }
  }
  if (typeKey === "archive") {
    return {
      label: locale === "zh" ? "压缩包" : "Archive",
      className: "border-[#ece3a8] bg-[#fffbe5] text-[#8a7500]",
      icon: FileArchive,
    }
  }
  if (typeKey === "document") {
    return {
      label: locale === "zh" ? "文档" : "Document",
      className: "border-[#ffd9bf] bg-[#fff4eb] text-[#c25f15]",
      icon: FileText,
    }
  }
  return {
    label: locale === "zh" ? "其他" : "Other",
    className: "border-[#dfdfd8] bg-[#f7f7f2] text-[#666]",
    icon: FileText,
  }
}

function getAssetSourceMeta(item: WorkspaceAssetLibraryItem, locale: "zh" | "en") {
  const bucket = getAssetSourceBucket(item)
  if (bucket === "workflow") {
    return {
      label: locale === "zh" ? "Workflow" : "Workflow",
      className: "border-[#d8c9ff] bg-[#f2ecff] text-[#6b45d7]",
    }
  }
  if (bucket === "ai") {
    return {
      label: locale === "zh" ? "AI 生成" : "AI Generated",
      className: "border-[#cfe0ff] bg-[#eef4ff] text-[#2f68d8]",
    }
  }
  if (bucket === "upload") {
    return {
      label: locale === "zh" ? "上传" : "Upload",
      className: "border-[#d9d9d0] bg-[#f7f7f2] text-[#666]",
    }
  }
  return {
    label: locale === "zh" ? "手动" : "Manual",
    className: "border-[#d9d9d0] bg-[#f7f7f2] text-[#666]",
  }
}

function getStatusMeta(locale: "zh" | "en") {
  return {
    label: locale === "zh" ? "Ready" : "Ready",
    className: "border-[#ccefd7] bg-[#eefaf2] text-[#23a55a]",
  }
}

function getAssetPreviewIcon(item: WorkspaceAssetLibraryItem) {
  const typeMeta = getAssetTypeMeta(item, "en")
  return typeMeta.icon
}

function AssetMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accentClassName = "bg-[#f5ef3d]",
}: {
  icon: typeof Sparkles
  label: string
  value: string
  detail: string
  accentClassName?: string
}) {
  return (
    <article className="rounded-2xl border border-[#e7e7df] bg-white p-5 shadow-[0_10px_28px_rgba(0,0,0,0.055)]">
      <div className="flex items-start gap-4">
        <div className={cn("flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[12px] text-[#111]", accentClassName)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#6f6f6f]">{label}</div>
          <div className="mt-2 font-display text-3xl font-black uppercase leading-none text-[#111]">{value}</div>
          <div className="mt-2 text-xs font-semibold text-[#666]">{detail}</div>
        </div>
      </div>
    </article>
  )
}

function AssetBadge({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-black uppercase", className)}>
      {label}
    </span>
  )
}

function AssetPagination({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  locale,
}: {
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (value: number) => void
  onPageSizeChange: (value: number) => void
  locale: "zh" | "en"
}) {
  if (totalItems === 0) return null

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(totalItems, currentPage * pageSize)

  return (
    <div className="flex flex-col gap-3 border-t border-[#efefe7] pt-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="text-sm text-[#666]">
        {locale === "zh" ? `显示 ${start} - ${end} / ${totalItems} 个资产` : `Showing ${start} - ${end} of ${totalItems} assets`}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-[#666]">
          <span>{locale === "zh" ? "每页" : "Rows"}</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 rounded-[8px] border border-[#deded6] bg-white px-3 text-sm font-bold text-[#111]"
          >
            <option value={12}>12</option>
            <option value={20}>20</option>
            <option value={40}>40</option>
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1)
            .slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5)
            .map((page) => (
              <button
                key={page}
                type="button"
                className={cn(
                  "h-9 min-w-9 rounded-[8px] px-3 text-sm font-black",
                  page === currentPage
                    ? "border border-[#ded735] bg-[#f5ef3d] text-[#111]"
                    : "border border-[#deded6] bg-white text-[#111]",
                )}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            ))}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function AssetThumbnail({
  item,
  onOpenPreview,
}: {
  item: WorkspaceAssetLibraryItem
  onOpenPreview: (item: WorkspaceAssetLibraryItem) => void
}) {
  const Icon = getAssetPreviewIcon(item)

  if (item.previewKind === "image") {
    return (
      <button
        type="button"
        onClick={() => onOpenPreview(item)}
        className="block h-full w-full overflow-hidden rounded-[12px] bg-[#f3f3ef]"
      >
        <img src={item.previewUrl} alt={item.title} className="h-full w-full object-cover" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpenPreview(item)}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-[12px] border border-[#e7e7df] text-[#111]",
        item.previewKind === "video" && "bg-[#151515] text-white",
        item.previewKind === "audio" && "bg-[#eefaf2]",
        item.previewKind === "file" && "bg-[#fafaf7]",
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <Icon className="h-8 w-8" />
        <span className="text-sm font-semibold">
          {item.previewKind === "video"
            ? "Preview"
            : item.previewKind === "audio"
              ? "Audio"
              : isPdfAsset(item)
                ? "PDF"
                : "File"}
        </span>
      </div>
    </button>
  )
}

export function WorkspaceAssetLibrary({
  locale,
  artifacts,
}: {
  locale: "zh" | "en"
  artifacts: WorkspaceAssetLibraryItem[]
}) {
  const router = useRouter()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState(artifacts)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<AssetTabId>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<AssetViewMode>("grid")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [previewItem, setPreviewItem] = useState<WorkspaceAssetLibraryItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<WorkspaceAssetLibraryItem | null>(null)
  const [submittingDelete, setSubmittingDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<AssetNotice>(null)
  const [favoriteIds, setFavoriteIds] = useState<number[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Asset Library",
          title: "资产库",
          description: "在同一个企业资产中心里管理 AI 生成物、上传素材、工作流产物和营销文件，按类型、来源与状态快速筛选、预览与下载。",
          uploadAssets: "上传素材",
          uploadPending: "上传中...",
          openWorkflows: "打开工作流",
          refresh: "刷新",
          metricsTotal: "总资产数",
          metricsImages: "图片",
          metricsVideos: "视频",
          metricsDocuments: "文档",
          metricsWorkflow: "工作流产物",
          metricsUpdated: "最近更新",
          tabsAll: "全部资产",
          tabsWorkflow: "工作流产物",
          tabsUploads: "上传",
          tabsRecent: "最近",
          tabsFavorites: "收藏",
          tabsDocuments: "文档",
          searchPlaceholder: "按名称、标签或类型搜索资产...",
          filterType: "资产类型",
          filterSource: "来源",
          filterStatus: "状态",
          filterCreated: "创建时间",
          allTypes: "全部类型",
          allSources: "全部来源",
          allStatus: "全部状态",
          allDates: "全部时间",
          last7d: "最近 7 天",
          last30d: "最近 30 天",
          ready: "Ready",
          grid: "网格",
          table: "表格",
          selected: "已选择",
          clearSelection: "清空选择",
          totalAssetsDetail: (count: number) => `统一资产中心内共 ${count} 个共享文件`,
          percentOfTotal: (count: number, total: number) =>
            total > 0 ? `占总量 ${(count / total * 100).toFixed(1)}%` : "暂无数据",
          workflowOutputsDetail: (count: number) => `${count} 个资产带有 workflow / work-library 引用`,
          lastUpdatedDetail: "最近一个资产的更新时间",
          panelTitle: "ASSET LIBRARY",
          panelDescription: "统一查看上传、生成和 workflow 产物，支持搜索、筛选、收藏、预览和下载。",
          emptyTitle: "还没有资产",
          emptyDescription: "上传首个文件、生成图片，或运行工作流后，这里会成为企业共享资产的统一入口。",
          generateImage: "打开能力中心",
          noResults: "没有匹配当前筛选条件的资产。",
          name: "名称",
          type: "类型",
          source: "来源",
          created: "创建时间",
          status: "状态",
          tags: "标签",
          actions: "操作",
          path: "路径",
          preview: "预览",
          copyLink: "复制链接",
          download: "下载",
          delete: "删除",
          removeTitle: "删除资产",
          removeDescription: "这会删除底层 artifact，并清除相关作品记录。此操作不可撤销。",
          cancel: "取消",
          confirmDelete: "确认删除",
          deleting: "删除中...",
          deleteFailed: "删除失败，请稍后重试。",
          copySuccess: "已复制资产链接。",
          copyFailed: "复制失败，请检查浏览器权限。",
          uploadSuccess: (count: number) => `已上传 ${count} 个资产。`,
          uploadFailed: "上传失败，请稍后重试。",
          nothingSelected: "当前页没有可选择的资产。",
          fileMissing: "该资产暂时没有可预览的源文件。",
          favoritesOnly: "收藏",
        }
      : {
          eyebrow: "Asset Library",
          title: "ASSET LIBRARY",
          description: "Manage generated assets, uploaded files, workflow outputs, and marketing artifacts from one shared enterprise library.",
          uploadAssets: "Upload assets",
          uploadPending: "Uploading...",
          openWorkflows: "Open workflows",
          refresh: "Refresh",
          metricsTotal: "Total assets",
          metricsImages: "Images",
          metricsVideos: "Videos",
          metricsDocuments: "Documents",
          metricsWorkflow: "Workflow outputs",
          metricsUpdated: "Last updated",
          tabsAll: "All assets",
          tabsWorkflow: "Workflow outputs",
          tabsUploads: "Uploads",
          tabsRecent: "Recent",
          tabsFavorites: "Favorites",
          tabsDocuments: "Documents",
          searchPlaceholder: "Search assets by name, tag, or type...",
          filterType: "Asset type",
          filterSource: "Source",
          filterStatus: "Status",
          filterCreated: "Created",
          allTypes: "All types",
          allSources: "All sources",
          allStatus: "All status",
          allDates: "All dates",
          last7d: "Last 7 days",
          last30d: "Last 30 days",
          ready: "Ready",
          grid: "Grid",
          table: "Table",
          selected: "Selected",
          clearSelection: "Clear",
          totalAssetsDetail: (count: number) => `${count} shared files in the unified asset center`,
          percentOfTotal: (count: number, total: number) =>
            total > 0 ? `${(count / total * 100).toFixed(1)}% of total` : "No data yet",
          workflowOutputsDetail: (count: number) => `${count} assets with workflow / work-library references`,
          lastUpdatedDetail: "Freshness of the most recently stored asset",
          panelTitle: "ASSET LIBRARY",
          panelDescription: "Search, filter, favorite, preview, and download uploaded files, AI output, and workflow results from one library.",
          emptyTitle: "No assets yet",
          emptyDescription: "Upload your first file, generate an image, or run a workflow to create reusable assets for your workspace.",
          generateImage: "Open capabilities",
          noResults: "No assets match the current filters.",
          name: "Name",
          type: "Type",
          source: "Source",
          created: "Created",
          status: "Status",
          tags: "Tags",
          actions: "Actions",
          path: "Path",
          preview: "Preview",
          copyLink: "Copy link",
          download: "Download",
          delete: "Delete",
          removeTitle: "Delete asset",
          removeDescription: "This removes the underlying artifact and clears its related work records. This cannot be undone.",
          cancel: "Cancel",
          confirmDelete: "Confirm delete",
          deleting: "Deleting...",
          deleteFailed: "Delete failed. Please retry.",
          copySuccess: "Asset link copied.",
          copyFailed: "Copy failed. Check browser permissions.",
          uploadSuccess: (count: number) => `Uploaded ${count} assets.`,
          uploadFailed: "Upload failed. Please retry.",
          nothingSelected: "No assets are selectable on this page.",
          fileMissing: "This asset does not currently expose a previewable file.",
          favoritesOnly: "Favorite",
        }

  useEffect(() => {
    setItems(artifacts)
  }, [artifacts])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as unknown
      if (Array.isArray(parsed)) {
        setFavoriteIds(parsed.filter((value): value is number => typeof value === "number"))
      }
    } catch {
      // ignore local preference read failures
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds))
    } catch {
      // ignore local preference write failures
    }
  }, [favoriteIds])

  const assetMetrics = useMemo(() => {
    const total = items.length
    const images = items.filter((item) => item.formatGroup === "image").length
    const videos = items.filter((item) => item.formatGroup === "video").length
    const documents = items.filter((item) => item.formatGroup === "document").length
    const workflowOutputs = items.filter((item) => item.hasWorkItem).length
    const latestAsset = items[0]

    return {
      total,
      images,
      videos,
      documents,
      workflowOutputs,
      lastUpdated: latestAsset ? formatRelativeTime(latestAsset.createdAt, locale) : "—",
    }
  }, [items, locale])

  const tabs = useMemo(
    () => [
      { id: "all" as const, label: copy.tabsAll, count: items.length },
      { id: "workflow" as const, label: copy.tabsWorkflow, count: items.filter((item) => item.hasWorkItem || getAssetSourceBucket(item) === "workflow").length },
      { id: "uploads" as const, label: copy.tabsUploads, count: items.filter((item) => getAssetSourceBucket(item) === "upload").length },
      { id: "recent" as const, label: copy.tabsRecent, count: items.filter((item) => {
        const created = parseDate(item.createdAt)
        return created ? Date.now() - created.getTime() <= 7 * DAY_MS : false
      }).length },
      { id: "favorites" as const, label: copy.tabsFavorites, count: items.filter((item) => favoriteIds.includes(item.artifactId)).length },
      { id: "documents" as const, label: copy.tabsDocuments, count: items.filter((item) => item.formatGroup === "document").length },
    ],
    [copy.tabsAll, copy.tabsDocuments, copy.tabsFavorites, copy.tabsRecent, copy.tabsUploads, copy.tabsWorkflow, favoriteIds, items],
  )

  const sourceOptions = useMemo(() => {
    const values = new Set<AssetSourceBucket>(items.map((item) => getAssetSourceBucket(item)))
    return [...values]
  }, [items])

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const now = Date.now()

    return items.filter((item) => {
      if (activeTab === "workflow" && !(item.hasWorkItem || getAssetSourceBucket(item) === "workflow")) return false
      if (activeTab === "uploads" && getAssetSourceBucket(item) !== "upload") return false
      if (activeTab === "recent") {
        const created = parseDate(item.createdAt)
        if (!created || now - created.getTime() > 7 * DAY_MS) return false
      }
      if (activeTab === "favorites" && !favoriteIds.includes(item.artifactId)) return false
      if (activeTab === "documents" && item.formatGroup !== "document") return false

      if (typeFilter !== "all" && getAssetTypeKey(item) !== typeFilter) return false
      if (sourceFilter !== "all" && getAssetSourceBucket(item) !== sourceFilter) return false
      if (statusFilter !== "all" && item.status !== statusFilter) return false
      if (dateFilter !== "all") {
        const created = parseDate(item.createdAt)
        const maxAge = dateFilter === "7d" ? 7 * DAY_MS : 30 * DAY_MS
        if (!created || now - created.getTime() > maxAge) return false
      }

      if (!normalizedQuery) return true

      const tags = buildAssetTags(item, locale).join(" ").toLowerCase()
      return [
        item.title,
        item.mimeType,
        item.kind,
        item.sourceType,
        item.storageKey,
        getAssetPath(item),
        tags,
        String(item.artifactId),
        item.hasWorkItem ? "workflow" : "",
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    })
  }, [activeTab, dateFilter, favoriteIds, items, locale, searchQuery, sourceFilter, statusFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const pagedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredItems.slice(startIndex, startIndex + pageSize)
  }, [currentPage, filteredItems, pageSize])

  const allVisibleSelected =
    pagedItems.length > 0 && pagedItems.every((item) => selectedIds.includes(item.artifactId))

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, dateFilter, pageSize, searchQuery, sourceFilter, statusFilter, typeFilter, viewMode])

  function setSuccessNotice(message: string) {
    setNotice({ tone: "success", message })
  }

  function setErrorNotice(message: string) {
    setNotice({ tone: "error", message })
  }

  function toggleFavorite(artifactId: number) {
    setFavoriteIds((current) =>
      current.includes(artifactId) ? current.filter((id) => id !== artifactId) : [...current, artifactId],
    )
  }

  function toggleSelection(artifactId: number) {
    setSelectedIds((current) =>
      current.includes(artifactId) ? current.filter((id) => id !== artifactId) : [...current, artifactId],
    )
  }

  function toggleSelectAllVisible() {
    if (pagedItems.length === 0) {
      setErrorNotice(copy.nothingSelected)
      return
    }

    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !pagedItems.some((item) => item.artifactId === id))
      }

      const next = new Set(current)
      for (const item of pagedItems) next.add(item.artifactId)
      return [...next]
    })
  }

  async function handleUploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setUploading(true)
    setNotice(null)

    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData()
        formData.set("file", file)
        formData.set("surface", "asset-library")

        const response = await fetch("/api/platform/assets/upload", {
          method: "POST",
          body: formData,
          credentials: "same-origin",
        })

        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) {
          throw new Error(payload?.error || "asset_library_upload_failed")
        }
      }

      setSuccessNotice(copy.uploadSuccess(fileList.length))
      router.refresh()
    } catch {
      setErrorNotice(copy.uploadFailed)
    } finally {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ""
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    setNotice(null)
    router.refresh()
    setTimeout(() => {
      setRefreshing(false)
    }, 600)
  }

  async function handleCopyLink(item: WorkspaceAssetLibraryItem) {
    try {
      await navigator.clipboard.writeText(item.sourceUrl || item.downloadUrl)
      setSuccessNotice(copy.copySuccess)
    } catch {
      setErrorNotice(copy.copyFailed)
    }
  }

  async function handleDelete() {
    if (!deleteItem) return

    setSubmittingDelete(true)
    setNotice(null)

    try {
      const response = await fetch(`/api/platform/artifacts/${deleteItem.artifactId}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || "asset_delete_failed")
      }

      setItems((current) => current.filter((item) => item.artifactId !== deleteItem.artifactId))
      setSelectedIds((current) => current.filter((id) => id !== deleteItem.artifactId))
      setFavoriteIds((current) => current.filter((id) => id !== deleteItem.artifactId))
      setDeleteItem(null)
    } catch {
      setErrorNotice(copy.deleteFailed)
    } finally {
      setSubmittingDelete(false)
    }
  }

  const tableRows = pagedItems.map((item) => {
    const typeMeta = getAssetTypeMeta(item, locale)
    const sourceMeta = getAssetSourceMeta(item, locale)
    const statusMeta = getStatusMeta(locale)
    const tags = buildAssetTags(item, locale)
    const favorite = favoriteIds.includes(item.artifactId)
    const selected = selectedIds.includes(item.artifactId)
    const assetPath = getAssetPath(item)
    const PreviewIcon = getAssetPreviewIcon(item)

    return (
      <tr key={item.artifactId} className="align-middle">
        <td className="border-t border-[#ededE7] px-4 py-4">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggleSelection(item.artifactId)}
            className="h-4 w-4 rounded border-[#d5d5cc] text-[#111]"
          />
        </td>
        <td className="border-t border-[#ededE7] px-4 py-4">
          <div className="flex min-w-[260px] items-center gap-3">
            <button
              type="button"
              onClick={() => setPreviewItem(item)}
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#ecece3] bg-[#fafaf7]"
            >
              {item.previewKind === "image" ? (
                <img src={item.previewUrl} alt={item.title} className="h-full w-full object-cover" />
              ) : (
                <PreviewIcon className="h-5 w-5 text-[#111]" />
              )}
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold text-[#111]" title={item.title}>
                {item.title}
              </div>
              <div className="mt-1 truncate text-xs text-[#777]" title={assetPath}>
                {assetPath}
              </div>
            </div>
          </div>
        </td>
        <td className="border-t border-[#ededE7] px-4 py-4">
          <AssetBadge label={typeMeta.label} className={typeMeta.className} />
        </td>
        <td className="border-t border-[#ededE7] px-4 py-4">
          <AssetBadge label={sourceMeta.label} className={sourceMeta.className} />
        </td>
        <td className="border-t border-[#ededE7] px-4 py-4 text-sm text-[#111]">{formatDateTime(item.createdAt, locale)}</td>
        <td className="border-t border-[#ededE7] px-4 py-4">
          <AssetBadge label={statusMeta.label} className={statusMeta.className} />
        </td>
        <td className="border-t border-[#ededE7] px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-flex h-6 items-center rounded-full border border-[#e6e6de] bg-[#f2f2ee] px-2.5 text-[11px] font-semibold text-[#555]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 2 ? (
              <span className="inline-flex h-6 items-center rounded-full border border-[#e6e6de] bg-[#f2f2ee] px-2.5 text-[11px] font-semibold text-[#555]">
                +{tags.length - 2}
              </span>
            ) : null}
          </div>
        </td>
        <td className="border-t border-[#ededE7] px-4 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              title={copy.preview}
              aria-label={copy.preview}
              onClick={() => setPreviewItem(item)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={copy.favoritesOnly}
              aria-label={copy.favoritesOnly}
              onClick={() => toggleFavorite(item.artifactId)}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-[8px] border transition",
                favorite
                  ? "border-[#ded735] bg-[#f5ef3d] text-[#111]"
                  : "border-[#deded6] bg-white text-[#111] hover:border-[#c8c22b] hover:bg-[#f5ef3d]",
              )}
            >
              <Star className={cn("h-4 w-4", favorite && "fill-current")} />
            </button>
            <button
              type="button"
              title={copy.copyLink}
              aria-label={copy.copyLink}
              onClick={() => void handleCopyLink(item)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
            >
              <Link2 className="h-4 w-4" />
            </button>
            <a
              href={item.downloadUrl}
              title={copy.download}
              aria-label={copy.download}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              title={copy.delete}
              aria-label={copy.delete}
              onClick={() => setDeleteItem(item)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#f0d0d0] bg-white text-[#d93025] transition hover:bg-[#fff0f0]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    )
  })

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6f6f6f]">{copy.eyebrow}</div>
              <h1 className="mt-2 font-display text-5xl font-black uppercase leading-[0.95] text-[#111] lg:text-[78px]">
                {copy.title}
              </h1>
              <p className="mt-4 max-w-[760px] text-[15px] leading-7 text-[#666] lg:text-base">{copy.description}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => void handleUploadFiles(event.target.files)}
              />
              <Button
                className="h-11 rounded-[9px] border border-[#ded735] bg-[#f5ef3d] px-[22px] text-sm font-black text-[#111] hover:bg-[#f5ef3d]/90"
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? copy.uploadPending : copy.uploadAssets}
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-[9px] border-[#deded6] bg-white px-[18px] text-sm font-extrabold text-[#111]"
                asChild
              >
                <Link href="/dashboard/workflows">
                  <Workflow className="mr-2 h-4 w-4" />
                  {copy.openWorkflows}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-[9px] border-[#deded6] bg-white px-[18px] text-sm font-extrabold text-[#111]"
                onClick={() => void handleRefresh()}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
                {copy.refresh}
              </Button>
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <AssetMetricCard
              icon={Sparkles}
              label={copy.metricsTotal}
              value={String(assetMetrics.total)}
              detail={copy.totalAssetsDetail(assetMetrics.total)}
            />
            <AssetMetricCard
              icon={FileImage}
              label={copy.metricsImages}
              value={String(assetMetrics.images)}
              detail={copy.percentOfTotal(assetMetrics.images, assetMetrics.total)}
              accentClassName="bg-[#eef4ff]"
            />
            <AssetMetricCard
              icon={Film}
              label={copy.metricsVideos}
              value={String(assetMetrics.videos)}
              detail={copy.percentOfTotal(assetMetrics.videos, assetMetrics.total)}
              accentClassName="bg-[#f2ecff]"
            />
            <AssetMetricCard
              icon={FileText}
              label={copy.metricsDocuments}
              value={String(assetMetrics.documents)}
              detail={copy.percentOfTotal(assetMetrics.documents, assetMetrics.total)}
              accentClassName="bg-[#fff4eb]"
            />
            <AssetMetricCard
              icon={Workflow}
              label={copy.metricsWorkflow}
              value={String(assetMetrics.workflowOutputs)}
              detail={copy.workflowOutputsDetail(assetMetrics.workflowOutputs)}
              accentClassName="bg-[#eefaf2]"
            />
            <AssetMetricCard
              icon={RefreshCw}
              label={copy.metricsUpdated}
              value={assetMetrics.lastUpdated}
              detail={copy.lastUpdatedDetail}
              accentClassName="bg-[#faf6db]"
            />
          </div>

          <section className="rounded-[18px] border border-[#e7e7df] bg-white p-6 shadow-[0_14px_34px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-3 border-b border-[#efefe7] pb-5">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#777]">{copy.panelTitle}</div>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="max-w-3xl text-sm leading-6 text-[#666]">{copy.panelDescription}</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "inline-flex h-10 items-center gap-2 border-b-2 px-1 text-sm font-bold transition",
                        activeTab === tab.id ? "border-[#f5ef3d] text-[#111]" : "border-transparent text-[#666]",
                      )}
                    >
                      <span>{tab.label}</span>
                      <span className="text-xs text-[#888]">{tab.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DashboardFilterToolbar
              className="mt-5"
              searchClassName="xl:max-w-[460px]"
              search={
                <label className="relative block min-w-0">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    className="h-11 w-full rounded-[10px] border border-[#deded6] bg-white pl-10 pr-4 text-sm text-[#111] outline-none transition focus:border-[#111]"
                  />
                </label>
              }
              filters={
                <>
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="h-11 w-full rounded-[10px] border border-[#deded6] bg-white px-4 text-sm font-bold text-[#111] sm:min-w-[150px] sm:w-auto"
                  >
                    <option value="all">{copy.allTypes}</option>
                    <option value="image">{locale === "zh" ? "图片" : "Image"}</option>
                    <option value="video">{locale === "zh" ? "视频" : "Video"}</option>
                    <option value="audio">{locale === "zh" ? "音频" : "Audio"}</option>
                    <option value="document">{locale === "zh" ? "文档" : "Document"}</option>
                    <option value="ppt">PPT</option>
                    <option value="spreadsheet">{locale === "zh" ? "表格" : "Spreadsheet"}</option>
                    <option value="archive">{locale === "zh" ? "压缩包" : "Archive"}</option>
                  </select>

                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                    className="h-11 w-full rounded-[10px] border border-[#deded6] bg-white px-4 text-sm font-bold text-[#111] sm:min-w-[150px] sm:w-auto"
                  >
                    <option value="all">{copy.allSources}</option>
                    {sourceOptions.includes("upload") ? <option value="upload">{locale === "zh" ? "上传" : "Upload"}</option> : null}
                    {sourceOptions.includes("workflow") ? <option value="workflow">Workflow</option> : null}
                    {sourceOptions.includes("ai") ? <option value="ai">{locale === "zh" ? "AI 生成" : "AI Generated"}</option> : null}
                    {sourceOptions.includes("manual") ? <option value="manual">{locale === "zh" ? "手动" : "Manual"}</option> : null}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="h-11 w-full rounded-[10px] border border-[#deded6] bg-white px-4 text-sm font-bold text-[#111] sm:min-w-[140px] sm:w-auto"
                  >
                    <option value="all">{copy.allStatus}</option>
                    <option value="ready">{copy.ready}</option>
                  </select>

                  <select
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                    className="h-11 w-full rounded-[10px] border border-[#deded6] bg-white px-4 text-sm font-bold text-[#111] sm:min-w-[160px] sm:w-auto"
                  >
                    <option value="all">{copy.allDates}</option>
                    <option value="7d">{copy.last7d}</option>
                    <option value="30d">{copy.last30d}</option>
                  </select>
                </>
              }
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    aria-label={copy.grid}
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-[8px] border",
                      viewMode === "grid"
                        ? "border-[#ded735] bg-[#f5ef3d] text-[#111]"
                        : "border-[#deded6] bg-white text-[#111]",
                    )}
                  >
                    <Grid2X2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    aria-label={copy.table}
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-[8px] border",
                      viewMode === "table"
                        ? "border-[#ded735] bg-[#f5ef3d] text-[#111]"
                        : "border-[#deded6] bg-white text-[#111]",
                    )}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </>
              }
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[#666]">
                {copy.selected}: <span className="font-bold text-[#111]">{selectedIds.length}</span>
              </div>
              {selectedIds.length > 0 ? (
                <button type="button" className="text-sm font-extrabold text-[#111]" onClick={() => setSelectedIds([])}>
                  {copy.clearSelection}
                </button>
              ) : null}
            </div>

            {notice ? (
              <div
                className={cn(
                  "mt-4 rounded-[12px] border px-4 py-3 text-sm font-semibold",
                  notice.tone === "success" && "border-[#ccefd7] bg-[#eefaf2] text-[#168449]",
                  notice.tone === "error" && "border-[#ffd6d6] bg-[#fff0f0] text-[#d93025]",
                )}
              >
                {notice.message}
              </div>
            ) : null}

            {items.length === 0 ? (
              <div className="mt-5 rounded-[18px] border border-dashed border-[#deded6] bg-[#fafaf7] px-6 py-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[14px] bg-[#f5ef3d] text-[#111]">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="mt-5 font-display text-[32px] font-black uppercase text-[#111]">{copy.emptyTitle}</h2>
                <p className="mx-auto mt-3 max-w-[640px] text-sm leading-7 text-[#666]">{copy.emptyDescription}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button
                    className="h-11 rounded-[9px] border border-[#ded735] bg-[#f5ef3d] px-5 text-sm font-black text-[#111] hover:bg-[#f5ef3d]/90"
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {copy.uploadAssets}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-[9px] border-[#deded6] bg-white px-5 text-sm font-extrabold text-[#111]"
                    asChild
                  >
                    <Link href="/dashboard/capabilities">
                      <Sparkles className="mr-2 h-4 w-4" />
                      {copy.generateImage}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-[9px] border-[#deded6] bg-white px-5 text-sm font-extrabold text-[#111]"
                    asChild
                  >
                    <Link href="/dashboard/workflows">
                      <Workflow className="mr-2 h-4 w-4" />
                      {copy.openWorkflows}
                    </Link>
                  </Button>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="mt-5 rounded-[18px] border border-dashed border-[#deded6] bg-[#fafaf7] px-6 py-10 text-center text-sm text-[#666]">
                {copy.noResults}
              </div>
            ) : viewMode === "grid" ? (
              <div className="mt-5 grid gap-[22px] md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {pagedItems.map((item) => {
                  const typeMeta = getAssetTypeMeta(item, locale)
                  const sourceMeta = getAssetSourceMeta(item, locale)
                  const favorite = favoriteIds.includes(item.artifactId)
                  const selected = selectedIds.includes(item.artifactId)
                  const tags = buildAssetTags(item, locale)

                  return (
                    <article
                      key={item.artifactId}
                      className="overflow-hidden rounded-[14px] border border-[#e7e7df] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.045)]"
                    >
                      <div className="relative aspect-[16/10] bg-[#f3f3ef]">
                        <AssetThumbnail item={item} onOpenPreview={setPreviewItem} />
                        <div className="absolute left-3 top-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSelection(item.artifactId)}
                            className={cn(
                              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border bg-white/95",
                              selected ? "border-[#ded735] text-[#111]" : "border-[#deded6] text-[#666]",
                            )}
                          >
                            {selected ? <Check className="h-4 w-4" /> : null}
                          </button>
                        </div>
                        <div className="absolute right-3 top-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleFavorite(item.artifactId)}
                            className={cn(
                              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border bg-white/95",
                              favorite ? "border-[#ded735] text-[#111]" : "border-[#deded6] text-[#666]",
                            )}
                          >
                            <Star className={cn("h-4 w-4", favorite && "fill-current")} />
                          </button>
                        </div>
                      </div>

                      <div className="p-[14px]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="line-clamp-2 text-sm font-extrabold leading-6 text-[#111]" title={item.title}>
                              {item.title}
                            </h3>
                            <div className="mt-1 text-xs text-[#777]">
                              {formatDateTime(item.createdAt, locale)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCopyLink(item)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
                            aria-label={copy.copyLink}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <AssetBadge label={typeMeta.label} className={typeMeta.className} />
                          <AssetBadge label={sourceMeta.label} className={sourceMeta.className} />
                        </div>

                        <div className="mt-3 text-xs text-[#777]">{getAssetPath(item)}</div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex h-6 items-center rounded-full border border-[#e6e6de] bg-[#f2f2ee] px-2.5 text-[11px] font-semibold text-[#555]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
                            aria-label={copy.preview}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <a
                            href={item.downloadUrl}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#deded6] bg-white text-[#111] transition hover:border-[#c8c22b] hover:bg-[#f5ef3d]"
                            aria-label={copy.download}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setDeleteItem(item)}
                            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#f0d0d0] bg-white text-[#d93025] transition hover:bg-[#fff0f0]"
                            aria-label={copy.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[14px] border border-[#ededE7] bg-white">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#fafaf7] text-[#555]">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={() => toggleSelectAllVisible()}
                          className="h-4 w-4 rounded border-[#d5d5cc] text-[#111]"
                        />
                      </th>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">{copy.name}</th>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">{copy.type}</th>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">{copy.source}</th>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">{copy.created}</th>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">{copy.status}</th>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">{copy.tags}</th>
                      <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em]">{copy.actions}</th>
                    </tr>
                  </thead>
                  <tbody>{tableRows}</tbody>
                </table>
              </div>
            )}

            <div className="mt-5">
              <AssetPagination
                currentPage={currentPage}
                pageSize={pageSize}
                totalItems={filteredItems.length}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                locale={locale}
              />
            </div>
          </section>
        </div>
      </section>

      <div className="fixed right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-2 rounded-full bg-[#111] p-2 shadow-[0_14px_30px_rgba(0,0,0,0.18)] xl:flex">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
          onClick={() => void handleRefresh()}
          aria-label={copy.refresh}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </button>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => (!open ? setPreviewItem(null) : null)}>
        <DialogContent className="max-w-5xl border-border bg-background/95 p-4 sm:p-5">
          <DialogTitle className="sr-only">{previewItem?.title ?? copy.preview}</DialogTitle>
          {previewItem?.previewKind === "image" ? (
            <img src={previewItem.previewUrl} alt={previewItem.title} className="max-h-[80vh] w-full rounded-[10px] object-contain" />
          ) : null}
          {previewItem?.previewKind === "video" ? (
            <video src={previewItem.previewUrl} controls className="max-h-[80vh] w-full rounded-[10px] bg-black" />
          ) : null}
          {previewItem?.previewKind === "audio" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AudioLines className="h-5 w-5" />
                <span>{previewItem.title}</span>
              </div>
              <audio src={previewItem.previewUrl} controls className="w-full" />
            </div>
          ) : null}
          {previewItem && previewItem.previewKind === "file" ? (
            isPdfAsset(previewItem) ? (
              <iframe title={previewItem.title} src={previewItem.previewUrl} className="h-[80vh] w-full rounded-[10px] border border-border" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-5 w-5" />
                  <span>{previewItem.title}</span>
                </div>
                <div className="rounded-[10px] border border-[#ecece3] bg-[#fafaf7] p-4 text-sm text-[#666]">
                  {previewItem.sourceUrl ? (
                    <a
                      href={previewItem.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-md border border-[#deded6] px-3 py-2 text-sm font-semibold text-[#111]"
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      {copy.preview}
                    </a>
                  ) : (
                    copy.fileMissing
                  )}
                </div>
              </div>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteItem)} onOpenChange={(open) => (!open ? setDeleteItem(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.removeTitle}</DialogTitle>
            <DialogDescription>{copy.removeDescription}</DialogDescription>
          </DialogHeader>
          {deleteItem ? (
            <div className="rounded-[10px] border border-border/70 bg-background/70 p-4 text-sm">
              <div className="font-medium text-foreground">{deleteItem.title}</div>
              <div className="mt-2 text-muted-foreground">
                {copy.path}: {getAssetPath(deleteItem)}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={submittingDelete}>
              {copy.cancel}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={submittingDelete}>
              {submittingDelete ? copy.deleting : copy.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
