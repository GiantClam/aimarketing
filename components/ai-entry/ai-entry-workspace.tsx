"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  LibraryBig,
  LinkIcon,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react"

import {
  Message,
  MessageAction,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-entry/prompt-kit/message"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ai-entry/prompt-kit/prompt-input"
import { useI18n } from "@/components/locale-provider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TextMorph } from "@/components/ui/text-morph"
import { TypingIndicator } from "@/components/ui/typing-indicator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkspaceTaskEvents } from "@/components/workspace/workspace-message-primitives"
import type { PendingTaskEvent } from "@/lib/assistant-task-events"
import {
  AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT,
  AI_ENTRY_CONSULTING_ENTRY_MODE,
  isConsultingAdvisorEntryMode,
  pickConsultingModelId,
  pickPptAssistantDefaultModelId,
  shouldLockConsultingAdvisorModel,
} from "@/lib/ai-entry/model-policy"
import { resolveEquivalentModelId } from "@/lib/ai-entry/model-id-registry"
import { buildPptToolResultMessage } from "@/lib/ai-entry/ppt-tool-result-message"
import type { KnowledgeScope } from "@/lib/knowledge/types"
import { cn } from "@/lib/utils"

type ChatAttachment = {
  id: string
  name: string
  mediaType: string
  size: number
  artifactId?: number
  dataUrl?: string
  text?: string
}

type Copy = {
  title: string
  subtitle: string
  placeholder: string
  send: string
  loading: string
  restoring: string
  quickStart: string
  modelLabel: string
  modelLoading: string
  modelEmpty: string
  agentLabel: string
  agentLoading: string
  agentEmpty: string
  agentRecommended: string
  selectedAgent: string
  landingHint: string
  copy: string
  copied: string
  copyReply: string
  copiedReply: string
  knowledgeLabel: string
  knowledgeDisabled: string
  knowledgeAllEnabled: string
  knowledgeSelectedCount: string
  knowledgeAdd: string
  knowledgeChoose: string
  knowledgeLoading: string
  knowledgeEmpty: string
  knowledgeSearch: string
  enableKnowledge: string
  disableKnowledge: string
  uploadFile: string
  addMenu: string
  unknownError: string
  errorPrefix: string
}
type ExtractedChatAttachmentResponse = {
  data?: {
    id?: string
    name?: string
    mediaType?: string
    originalMediaType?: string
    size?: number
    text?: string
    textCharCount?: number
    truncated?: boolean
  }
  error?: string
}
type UploadedAssetLibraryAttachmentResponse = {
  data?: {
    artifact?: {
      id?: number
    }
  }
  error?: string
}
type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  attachments?: ChatAttachment[]
  createdAt?: number
}
type ModelOption = {
  id: string
  name: string
  modelId?: string
  providerId?: string
  providerLabel?: string
  runtimeId?: string
  canonicalId?: string
  aliases?: string[]
}
type ModelGroupOption = { family: string; label: string; models: ModelOption[] }
type AgentOption = { id: string; category: string; name: string; description: string }
type AgentGroupOption = { id: string; label: string; agents: AgentOption[] }
type ParsedArtifactRow = {
  label: string
  value: string
  href: string | null
}
type ParsedArtifactResult = {
  body: string
  title: string
  rows: ParsedArtifactRow[]
  workHref: string | null
  downloadHref: string | null
}

type MessageApiResponse = {
  data?: Array<{ id?: string; role?: "user" | "assistant"; content?: string; created_at?: number }>
  conversation?: {
    current_model_id?: string | null
  } | null
}
type ChatApiResponse = {
  message?: string
  conversationId?: string
  agentId?: string | null
  error?: string
}
type ChatStreamApiResponse = {
  event?: string
  conversation_id?: string
  answer?: string
  provider?: string
  provider_model?: string
  agent_id?: string | null
  error?: string
  data?: {
    toolName?: string
    toolCallId?: string
    status?: "hit" | "miss" | "failed"
    snippetCount?: number
    datasetCount?: number
    message?: string
    args?: {
      query?: string
      intent?: string
    }
    result?: {
      query?: string
      results?: Array<{ title?: string; url?: string; snippet?: string; provider?: string }>
    }
  } | null
}

function formatMessageTime(timestamp: number | undefined, locale: "zh" | "en") {
  if (!timestamp) return locale === "zh" ? "刚刚" : "Just now"
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return locale === "zh" ? "刚刚" : "Just now"
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function parseMarkdownLink(value: string) {
  const match = value.match(/^\[([^\]]+)]\(([^)]+)\)$/)
  if (!match) return { label: value, href: null }
  return { label: match[1] || value, href: match[2] || null }
}

function parseArtifactResult(content: string): ParsedArtifactResult | null {
  const lines = content.split(/\r?\n/)
  let headingIndex = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const isArtifactHeading =
      /^已生成.+[:：]$/.test(trimmed) ||
      /^(HTML|PPT|Deliverable).+generated:?$/i.test(trimmed)
    if (isArtifactHeading) {
      headingIndex = index
      break
    }
  }
  if (headingIndex < 0) return null

  const rows: ParsedArtifactRow[] = []
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (!trimmed.startsWith("- ")) break
    const rowText = trimmed.slice(2)
    const separatorIndex = rowText.indexOf(":")
    const label = separatorIndex >= 0 ? rowText.slice(0, separatorIndex).trim() : rowText.trim()
    const rawValue = separatorIndex >= 0 ? rowText.slice(separatorIndex + 1).trim() : ""
    const parsed = parseMarkdownLink(rawValue)
    rows.push({ label, value: parsed.label, href: parsed.href })
  }

  if (rows.length === 0) return null

  const workHref = rows.find((row) => /作品库|work library/i.test(row.label))?.href ?? null
  const downloadHref = rows.find((row) => /下载|download/i.test(row.label))?.href ?? null
  const body = lines.slice(0, headingIndex).join("\n").trim()
  const title = lines[headingIndex]?.trim().replace(/[:：]$/, "") || "Artifact"

  return { body, title, rows, workHref, downloadHref }
}

function getArtifactRowIcon(label: string) {
  if (/文件|file/i.test(label)) return FileText
  if (/状态|status/i.test(label)) return Check
  if (/下载|download/i.test(label)) return Download
  if (/作品库|work library/i.test(label)) return LibraryBig
  if (/链接|link|preview|open/i.test(label)) return LinkIcon
  return FileText
}

function ArtifactResultBlock({ artifact }: { artifact: ParsedArtifactResult }) {
  return (
    <div className="artifact-block">
      <div className="artifact-title">
        <FileText className="h-5 w-5" />
        {artifact.title}
      </div>
      <div>
        {artifact.rows.map((row) => {
          const Icon = getArtifactRowIcon(row.label)
          const isFile = /文件|file/i.test(row.label)
          const isStatus = /状态|status/i.test(row.label)

          return (
            <div key={`${row.label}:${row.value}`} className="artifact-row">
              <div className="artifact-label">
                <Icon className="h-4 w-4" />
                {row.label}
              </div>
              <div className="artifact-value">
                {row.href ? (
                  <a className="artifact-link" href={row.href} target="_blank" rel="noreferrer">
                    {row.value || row.href}
                    <ExternalLink className="ml-1 inline h-3.5 w-3.5" />
                  </a>
                ) : isStatus ? (
                  <span className="status-badge">
                    <span className="status-dot" />
                    {row.value}
                  </span>
                ) : isFile ? (
                  <span className="file-name">{row.value}</span>
                ) : (
                  row.value
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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
      enabled?: boolean
    }>
  }
  error?: string
}

export type AiEntryWorkspaceLinkAction = {
  label: string
  href: string
}

export type AiEntryWorkspaceGuideMessage = {
  title: string
  body: string
  promptLabel?: string
  prompts?: string[]
}

type ModelApiResponse = {
  providerId?: string | null
  selectedProviderId?: string | null
  providers?: Array<{ id?: string; label?: string }>
  selectedModelId?: string | null
  modelGroups?: Array<{
    family?: string
    label?: string
    models?: Array<{
      id?: string
      name?: string
      modelId?: string
      providerId?: string
      providerLabel?: string
      runtimeId?: string
      canonicalId?: string
      aliases?: string[]
    }>
  }>
  models?: Array<{
    id?: string
    name?: string
    modelId?: string
    providerId?: string
    providerLabel?: string
    runtimeId?: string
    canonicalId?: string
    aliases?: string[]
  }>
}
type AgentApiResponse = {
  defaultAgentId?: string | null
  agents?: Array<{ id?: string; category?: string; name?: { zh?: string; en?: string }; description?: { zh?: string; en?: string } }>
  groups?: Array<{ id?: string; label?: { zh?: string; en?: string } }>
}

const AI_ENTRY_SELECTED_MODEL_STORAGE_KEY = "ai-entry-selected-model-id-v1"
const AI_ENTRY_PENDING_CONVERSATION_STORAGE_PREFIX = "ai-entry-pending-conversation-v1:"
const AI_ENTRY_MAX_ATTACHMENTS = 4
const AI_ENTRY_MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

function getPendingConversationStorageKey(conversationId: string) {
  return `${AI_ENTRY_PENDING_CONVERSATION_STORAGE_PREFIX}${conversationId}`
}

function readPendingConversationMessages(conversationId: string | null) {
  if (!conversationId || typeof window === "undefined") return []
  try {
    const raw = window.sessionStorage.getItem(getPendingConversationStorageKey(conversationId))
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const id = typeof item?.id === "string" && item.id.trim() ? item.id : `cached-${Date.now()}`
        const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null
        const content = typeof item?.content === "string" ? item.content : ""
        const attachments = Array.isArray(item?.attachments) ? item.attachments : undefined
        if (!role) return null
        return { id, role, content, attachments } as ChatMessage
      })
      .filter((item): item is ChatMessage => Boolean(item))
  } catch {
    return []
  }
}

function savePendingConversationMessages(conversationId: string | null, messages: ChatMessage[]) {
  if (!conversationId || typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      getPendingConversationStorageKey(conversationId),
      JSON.stringify(messages),
    )
  } catch {
    // sessionStorage is a best-effort bridge across the first route transition.
  }
}

function clearPendingConversationMessages(conversationId: string | null) {
  if (!conversationId || typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(getPendingConversationStorageKey(conversationId))
  } catch {
    // ignore storage cleanup failures
  }
}

function readInitialAgentFromLocation() {
  if (typeof window === "undefined") return null
  const raw = new URLSearchParams(window.location.search).get("agent")
  if (!raw) return null
  const normalized = raw.trim()
  return normalized.length > 0 ? normalized : null
}

function readInitialDraftFromLocation() {
  if (typeof window === "undefined") return ""
  const raw = new URLSearchParams(window.location.search).get("draft")
  return typeof raw === "string" ? raw.trim() : ""
}

function readPersistedSelectedModelId() {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(AI_ENTRY_SELECTED_MODEL_STORAGE_KEY)
    const normalized = typeof raw === "string" ? raw.trim() : ""
    return normalized || null
  } catch {
    return null
  }
}

function resolveDisplayModelId(
  rawModelId: string | null | undefined,
  models: ModelOption[],
) {
  const normalized = typeof rawModelId === "string" ? rawModelId.trim() : ""
  if (!normalized) return null

  const exact = models.find((item) => item.id === normalized)
  if (exact) return exact.id

  const candidates = models.flatMap((item) =>
    [item.id, item.runtimeId, item.canonicalId, ...(item.aliases || [])]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => ({ optionId: item.id, value })),
  )

  const matched = resolveEquivalentModelId(
    normalized,
    candidates.map((item) => item.value),
  )
  if (!matched) return null

  const mapped = candidates.find((item) => item.value === matched)
  return mapped?.optionId || null
}

function resolveDisplayModelIdForProvider(input: {
  rawModelId: string | null | undefined
  providerId?: string | null | undefined
  models: ModelOption[]
}) {
  const normalizedProviderId =
    typeof input.providerId === "string" ? input.providerId.trim().toLowerCase() : ""
  if (normalizedProviderId) {
    const scopedModels = input.models.filter((item) => {
      const providerId =
        typeof item.providerId === "string" ? item.providerId.trim().toLowerCase() : ""
      return providerId === normalizedProviderId
    })
    const scopedMatch = resolveDisplayModelId(input.rawModelId, scopedModels)
    if (scopedMatch) return scopedMatch
  }

  return resolveDisplayModelId(input.rawModelId, input.models)
}

function dedupeStringList(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : ""
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function dedupeModelsById(models: ModelOption[]) {
  const seen = new Set<string>()
  return models.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function dedupeModelGroups(groups: ModelGroupOption[]) {
  const seen = new Set<string>()
  return groups
    .map((group) => {
      const models = group.models.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      if (models.length === 0) return null
      return {
        ...group,
        models,
      } satisfies ModelGroupOption
    })
    .filter((group): group is ModelGroupOption => Boolean(group))
}

function inferProviderFamilyFromModel(model: ModelOption | null) {
  const text = [
    model?.id,
    model?.runtimeId,
    model?.canonicalId,
    ...(model?.aliases || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (!text) return null
  if (text.includes("claude") || text.includes("anthropic")) return "anthropic"
  if (text.includes("gemini") || text.includes("google")) return "gemini"
  if (text.includes("minimax") || text.includes("abab")) return "minimax"
  if (
    text.includes("gpt") ||
    text.includes("openai") ||
    /\bo[1345]\b/.test(text)
  ) {
    return "openai"
  }
  return null
}

function resolvePreferredProviderForModel(input: {
  selectedModel: ModelOption | null
  selectedProviderId: string | null
  fallbackProviderId: string | null
}) {
  const explicitProviderId =
    typeof input.selectedModel?.providerId === "string" && input.selectedModel.providerId.trim()
      ? input.selectedModel.providerId.trim()
      : null
  if (explicitProviderId) return explicitProviderId
  const family = inferProviderFamilyFromModel(input.selectedModel)
  if (family === "openai") return "pptoken"
  if (family === "anthropic" || family === "gemini" || family === "minimax") {
    return "aiberm"
  }
  return input.selectedProviderId || input.fallbackProviderId || null
}

function isTextLikeFile(file: File) {
  return (
    file.type.startsWith("text/") ||
    file.type.includes("json") ||
    file.type.includes("csv") ||
    /\.(txt|md|csv|json)$/i.test(file.name)
  )
}

function isParseableDocumentFile(file: File) {
  const normalizedType = file.type.toLowerCase()
  return (
    /\.(docx|pdf)$/i.test(file.name) ||
    normalizedType === "application/pdf" ||
    normalizedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
}

async function extractDocumentAttachment(file: File): Promise<ChatAttachment> {
  const formData = new FormData()
  formData.set("file", file)
  formData.set("surface", "ai-entry")

  const response = await fetch("/api/chat-attachments/extract", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  })
  const payload = (await response.json().catch(() => null)) as ExtractedChatAttachmentResponse | null

  if (!response.ok || !payload?.data?.text) {
    throw new Error(payload?.error || `attachment_extract_failed_${response.status}`)
  }

  return {
    id: payload.data.id || `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: payload.data.name || file.name,
    mediaType: payload.data.mediaType || "text/plain",
    size: typeof payload.data.size === "number" ? payload.data.size : file.size,
    text: payload.data.text,
  }
}

async function uploadChatAttachmentToAssetLibrary(file: File): Promise<number> {
  const formData = new FormData()
  formData.set("file", file)
  formData.set("surface", "ai-entry")

  const response = await fetch("/api/platform/assets/upload", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  })
  const payload = (await response.json().catch(() => null)) as UploadedAssetLibraryAttachmentResponse | null
  const artifactId = payload?.data?.artifact?.id

  if (!response.ok || typeof artifactId !== "number" || artifactId <= 0) {
    throw new Error(payload?.error || `asset_library_upload_failed_${response.status}`)
  }

  return artifactId
}

function renderAttachmentError(code: string, isZh: boolean) {
  const messages: Record<string, { zh: string; en: string }> = {
    unsupported_file_type: {
      zh: "暂不支持该文件类型，请上传 DOCX、可复制文字 PDF、TXT、MD 或图片。",
      en: "This file type is not supported. Upload DOCX, copyable-text PDF, TXT, MD, or images.",
    },
    file_too_large: {
      zh: "单个附件不能超过 4MB。",
      en: "Each attachment must be 4MB or smaller.",
    },
    pdf_encrypted: {
      zh: "该 PDF 已加密，无法解析。",
      en: "This PDF is encrypted and cannot be parsed.",
    },
    pdf_no_extractable_text: {
      zh: "该 PDF 没有可提取文字。扫描版 PDF 暂不支持 OCR。",
      en: "This PDF has no extractable text. Scanned PDFs are not supported yet.",
    },
    extracted_text_empty: {
      zh: "附件中没有可读取的文字。",
      en: "No readable text was found in this attachment.",
    },
    docx_parse_failed: {
      zh: "DOCX 解析失败，请确认文件未损坏。",
      en: "DOCX parsing failed. Check that the file is not corrupted.",
    },
    asset_library_upload_failed: {
      zh: "附件写入素材库失败，请稍后重试。",
      en: "Failed to save the attachment into the asset library. Please try again.",
    },
    pdf_parse_failed: {
      zh: "PDF 解析失败，请确认文件可打开且包含可复制文字。",
      en: "PDF parsing failed. Check that the file opens and contains copyable text.",
    },
  }
  const normalizedCode = code.startsWith("asset_library_upload_failed") ? "asset_library_upload_failed" : code
  const message = messages[normalizedCode]
  if (message) return isZh ? message.zh : message.en
  return isZh ? `附件解析失败：${code}` : `Attachment parsing failed: ${code}`
}

function modelSupportsImageInput(model: ModelOption | null) {
  const normalized = [model?.id, model?.runtimeId, model?.canonicalId, ...(model?.aliases || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  if (!normalized) return false
  return (
    normalized.includes("gemini") ||
    normalized.includes("claude") ||
    normalized.includes("gpt-4") ||
    normalized.includes("gpt-5") ||
    normalized.includes("o3") ||
    normalized.includes("o4") ||
    normalized.includes("vision") ||
    normalized.includes("vl") ||
    normalized.includes("pixtral")
  )
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error || new Error("file_read_failed"))
    reader.readAsDataURL(file)
  })
}

function consumeSseBuffer<T extends object>(buffer: string) {
  const blocks = buffer.split(/\r?\n\r?\n/)
  const rest = blocks.pop() ?? ""
  const events: T[] = []

  for (const block of blocks) {
    const payload = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim()

    if (!payload || payload === "[DONE]") continue

    try {
      events.push(JSON.parse(payload) as T)
    } catch {
      continue
    }
  }

  return { events, rest }
}

function renderAiEntryErrorMessage(
  value: unknown,
  copy: { unknownError: string },
) {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return copy.unknownError
  return raw
}

export function AiEntryWorkspace({
  initialConversationId,
  embedded = false,
  compactEmbedded = false,
  forcedAgentId = null,
  draftSeed = "",
  embeddedPromptButtons = [],
  embeddedLinkActions = [],
  embeddedContextChips = [],
  embeddedGuideMessage = null,
  onConversationIdChange,
}: {
  initialConversationId: string | null
  embedded?: boolean
  compactEmbedded?: boolean
  forcedAgentId?: string | null
  draftSeed?: string
  embeddedPromptButtons?: string[]
  embeddedLinkActions?: AiEntryWorkspaceLinkAction[]
  embeddedContextChips?: string[]
  embeddedGuideMessage?: AiEntryWorkspaceGuideMessage | null
  onConversationIdChange?: (conversationId: string | null) => void
}) {
  const { locale } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isZh = locale === "zh"
  const displayLocale = isZh ? "zh" : "en"

  const copy = useMemo(
    () =>
      isZh
        ? {
            title: "AI 对话",
            subtitle: "企业 AI 营销对话入口",
            placeholder: "输入你的问题...",
            send: "发送",
            loading: "正在生成...",
            restoring: "正在恢复会话...",
            quickStart: "快速提问",
            modelLabel: "模型",
            modelLoading: "加载模型中...",
            modelEmpty: "无可用模型",
            agentLabel: "顾问",
            agentLoading: "加载顾问中...",
            agentEmpty: "无可用顾问",
            agentRecommended: "推荐 Agent",
            selectedAgent: "已选择顾问",
            landingHint: "你说需求，我来生成第一版方案",
            copy: "复制",
            copied: "已复制",
            copyReply: "复制回复",
            copiedReply: "已复制",
            knowledgeLabel: "知识库",
            knowledgeDisabled: "知识库未启用",
            knowledgeAllEnabled: "全部已启用知识库",
            knowledgeSelectedCount: "已选知识库",
            knowledgeAdd: "添加知识库",
            knowledgeChoose: "选择知识库",
            knowledgeLoading: "加载知识库中...",
            knowledgeEmpty: "当前没有可选知识库",
            knowledgeSearch: "搜索知识库...",
            enableKnowledge: "启用知识库",
            disableKnowledge: "关闭知识库",
            uploadFile: "上传文件",
            addMenu: "添加内容",
            unknownError: "未知错误",
            errorPrefix: "请求失败：",
          }
        : {
            title: "AI Chat",
            subtitle: "Enterprise AI marketing chat entry",
            placeholder: "Ask anything...",
            send: "Send",
            loading: "Generating...",
            restoring: "Restoring conversation...",
            quickStart: "Quick tips",
            modelLabel: "Model",
            modelLoading: "Loading models...",
            modelEmpty: "No models",
            agentLabel: "Advisor",
            agentLoading: "Loading advisors...",
            agentEmpty: "No advisors",
            agentRecommended: "Recommended Agent",
            selectedAgent: "Selected advisor",
            landingHint: "Describe it once, and I'll generate the first draft",
            copy: "Copy",
            copied: "Copied",
            copyReply: "Copy reply",
            copiedReply: "Copied",
            knowledgeLabel: "Knowledge",
            knowledgeDisabled: "Knowledge disabled",
            knowledgeAllEnabled: "All enabled knowledge bases",
            knowledgeSelectedCount: "Selected knowledge bases",
            knowledgeAdd: "Add knowledge base",
            knowledgeChoose: "Choose knowledge base",
            knowledgeLoading: "Loading knowledge bases...",
            knowledgeEmpty: "No knowledge bases available",
            knowledgeSearch: "Search knowledge bases...",
            enableKnowledge: "Enable knowledge",
            disableKnowledge: "Disable knowledge",
            uploadFile: "Upload file",
            addMenu: "Add content",
            unknownError: "Unknown error",
            errorPrefix: "Request failed: ",
          },
    [isZh],
  )

  const quickPrompts = useMemo(
    () =>
      isZh
        ? [
            "先调研市场，再给我 30 天执行计划",
            "给我一套高转化落地页文案框架",
            "请用专家顾问模式给出经营诊断与优先动作",
          ]
        : [
            "Research this market first, then give me a 30-day plan",
            "Create a conversion-focused landing page copy framework",
            "Use executive advisor mode and provide diagnosis plus top priorities",
          ],
    [isZh],
  )

  const initialMessages = readPendingConversationMessages(initialConversationId)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false)
  const [isConversationLoading, setIsConversationLoading] = useState(Boolean(initialConversationId) && initialMessages.length === 0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [pendingTaskEvents, setPendingTaskEvents] = useState<PendingTaskEvent[]>([])
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false)
  const [knowledgePickerOpen, setKnowledgePickerOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [knowledgeDatasets, setKnowledgeDatasets] = useState<KnowledgeDatasetOption[]>([])
  const [knowledgeDatasetsLoading, setKnowledgeDatasetsLoading] = useState(true)
  const [selectedKnowledgeDatasetIds, setSelectedKnowledgeDatasetIds] = useState<number[]>([])

  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelProviderId, setModelProviderId] = useState<string | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelGroups, setModelGroups] = useState<ModelGroupOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [modelSelectOpen, setModelSelectOpen] = useState(false)

  const [agentLoading, setAgentLoading] = useState(true)
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [agentGroups, setAgentGroups] = useState<AgentGroupOption[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [isAgentSelectionExplicit, setIsAgentSelectionExplicit] = useState(false)
  const [agentQueryReady, setAgentQueryReady] = useState(false)
  const [initialAgentFromQuery] = useState<string | null>(() => readInitialAgentFromLocation())
  const [initialDraftFromQuery] = useState<string>(() => readInitialDraftFromLocation())

  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(initialMessages.length)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const latestConversationIdRef = useRef<string | null>(initialConversationId)
  const isLoadingRef = useRef(false)
  const onConversationIdChangeRef = useRef<typeof onConversationIdChange>(onConversationIdChange)
  const pendingFirstConversationRouteRef = useRef(false)
  const search = searchParams.toString()
  const routeAgentId = forcedAgentId || (searchParams.get("agent") || "").trim() || null
  const routeDraft = embedded ? draftSeed.trim() : (searchParams.get("draft") || "").trim()
  const routeEntryMode = (searchParams.get("entry") || "").trim()
  const isPptAssistantRoute = routeAgentId === "executive-ppt"
  const isConsultingEntry = useMemo(
    () => isConsultingAdvisorEntryMode(routeEntryMode) && !isPptAssistantRoute,
    [isPptAssistantRoute, routeEntryMode],
  )
  const effectiveEntryMode = isConsultingEntry ? AI_ENTRY_CONSULTING_ENTRY_MODE : null
  const shouldLockModel = useMemo(
    () =>
      shouldLockConsultingAdvisorModel({
        entryMode: effectiveEntryMode,
        agentId: routeAgentId,
      }),
    [effectiveEntryMode, routeAgentId],
  )
  const workspaceTitle = isConsultingEntry
    ? (isZh ? "咨询专家" : "Consulting Advisor")
    : copy.title
  const workspaceSubtitle = isConsultingEntry
    ? (isZh ? "企业咨询专家对话入口" : "Enterprise consulting advisor entry")
    : copy.subtitle
  const lockedConsultingModelId = useMemo(
    () =>
      pickConsultingModelId(models) ||
      AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT,
    [models],
  )
  const preferredUnlockedModelId = useMemo(() => {
    if (models.length === 0) return null
    if (isPptAssistantRoute) {
      return pickPptAssistantDefaultModelId(models) || models[0]?.id || null
    }
    return models[0]?.id || null
  }, [isPptAssistantRoute, models])
  const showLanding =
    !embedded &&
    !isConversationLoading &&
    messages.length === 0 &&
    !(isConsultingEntry && Boolean(conversationId))
  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedModelId) || null,
    [models, selectedModelId],
  )
  const composerPromptButtons = useMemo(() => {
    if (embedded && compactEmbedded) {
      return embeddedPromptButtons.filter((item) => item.trim()).slice(0, 4)
    }
    return quickPrompts
  }, [compactEmbedded, embedded, embeddedPromptButtons, quickPrompts])
  const composerLinkActions = useMemo(
    () => (embedded && compactEmbedded ? embeddedLinkActions.slice(0, 6) : []),
    [compactEmbedded, embedded, embeddedLinkActions],
  )
  const composerContextChips = useMemo(
    () => (embedded && compactEmbedded ? embeddedContextChips.filter((item) => item.trim()).slice(0, 6) : []),
    [compactEmbedded, embedded, embeddedContextChips],
  )
  const shouldShowEmbeddedGuide =
    embedded &&
    compactEmbedded &&
    !isConversationLoading &&
    messages.length === 0 &&
    Boolean(embeddedGuideMessage?.title || embeddedGuideMessage?.body)
  const embeddedGuideContent = useMemo(() => {
    if (!shouldShowEmbeddedGuide || !embeddedGuideMessage) return ""

    const lines: string[] = []
    if (embeddedGuideMessage.title.trim()) {
      lines.push(`**${embeddedGuideMessage.title.trim()}**`)
    }
    if (embeddedGuideMessage.body.trim()) {
      lines.push(embeddedGuideMessage.body.trim())
    }

    const prompts = (embeddedGuideMessage.prompts || [])
      .map((prompt) => prompt.trim())
      .filter(Boolean)
      .slice(0, 2)

    if (prompts.length > 0) {
      lines.push(embeddedGuideMessage.promptLabel?.trim() || (isZh ? "你可以这样开始：" : "You can start with:"))
      lines.push(...prompts.map((prompt) => `- ${prompt}`))
    }

    return lines.join("\n\n")
  }, [embeddedGuideMessage, isZh, shouldShowEmbeddedGuide])

  useEffect(() => {
    latestConversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    onConversationIdChangeRef.current = onConversationIdChange
  }, [onConversationIdChange])

  useEffect(() => {
    onConversationIdChangeRef.current?.(conversationId)
  }, [conversationId])

  useEffect(() => {
    const previousCount = previousMessageCountRef.current
    previousMessageCountRef.current = messages.length
    if (messages.length <= previousCount) return

    scrollAnchorRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
  }, [messages.length])

  useEffect(() => {
    if (embedded) return
    if (!isPptAssistantRoute || !isConsultingAdvisorEntryMode(routeEntryMode)) return
    const params = new URLSearchParams(search)
    params.delete("entry")
    const nextSearch = params.toString()
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname)
  }, [embedded, isPptAssistantRoute, pathname, routeEntryMode, router, search])

  useEffect(() => {
    if (shouldLockModel) return
    if (typeof window === "undefined") return
    try {
      const normalized = typeof selectedModelId === "string" ? selectedModelId.trim() : ""
      if (normalized) {
        window.localStorage.setItem(AI_ENTRY_SELECTED_MODEL_STORAGE_KEY, normalized)
      } else {
        window.localStorage.removeItem(AI_ENTRY_SELECTED_MODEL_STORAGE_KEY)
      }
    } catch {
      // ignore localStorage write failures
    }
  }, [selectedModelId, shouldLockModel])

  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === selectedAgentId) || null,
    [agents, selectedAgentId],
  )
  const selectedKnowledgeDatasets = useMemo(
    () =>
      selectedKnowledgeDatasetIds
        .map((datasetId) => knowledgeDatasets.find((item) => item.id === datasetId) || null)
        .filter((item): item is KnowledgeDatasetOption => Boolean(item)),
    [knowledgeDatasets, selectedKnowledgeDatasetIds],
  )
  const knowledgeSummaryLabel = useMemo(() => {
    if (!knowledgeEnabled) return copy.knowledgeDisabled
    if (selectedKnowledgeDatasets.length === 0) return copy.knowledgeAllEnabled
    return `${copy.knowledgeSelectedCount} ${selectedKnowledgeDatasets.length}`
  }, [copy.knowledgeAllEnabled, copy.knowledgeDisabled, copy.knowledgeSelectedCount, knowledgeEnabled, selectedKnowledgeDatasets.length])
  const handleAgentSelectionChange = useCallback((nextAgentId: string | null) => {
    setSelectedAgentId(nextAgentId)
    setIsAgentSelectionExplicit(Boolean(nextAgentId))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadKnowledgeDatasets() {
      setKnowledgeDatasetsLoading(true)
      try {
        const response = await fetch("/api/knowledge/datasets", {
          credentials: "same-origin",
        })
        const payload = (await response.json().catch(() => null)) as KnowledgeDatasetsApiResponse | null
        if (!response.ok) {
          throw new Error(payload?.error || "knowledge_datasets_failed")
        }

        const nextDatasets = (payload?.data?.items || [])
          .map((item) => {
            if (!item || typeof item.id !== "number" || !item.name || !item.category) return null
            return {
              id: item.id,
              name: item.name,
              category: item.category,
            } satisfies KnowledgeDatasetOption
          })
          .filter((item): item is KnowledgeDatasetOption => Boolean(item))

        if (cancelled) return
        setKnowledgeDatasets(nextDatasets)
        setSelectedKnowledgeDatasetIds((current) => current.filter((datasetId) => nextDatasets.some((item) => item.id === datasetId)))
      } catch {
        if (cancelled) return
        setKnowledgeDatasets([])
      } finally {
        if (!cancelled) {
          setKnowledgeDatasetsLoading(false)
        }
      }
    }

    void loadKnowledgeDatasets()

    return () => {
      cancelled = true
    }
  }, [])

  const toggleKnowledgeDataset = useCallback((datasetId: number) => {
    setKnowledgeEnabled(true)
    setSelectedKnowledgeDatasetIds((current) =>
      current.includes(datasetId)
        ? current.filter((item) => item !== datasetId)
        : [...current, datasetId],
    )
  }, [])

  const disableKnowledge = useCallback(() => {
    setKnowledgeEnabled(false)
    setKnowledgePickerOpen(false)
    setSelectedKnowledgeDatasetIds([])
  }, [])

  const loadingEventSummary = useMemo(() => {
    const totalCount = pendingTaskEvents.length
    const completedCount = pendingTaskEvents.filter((item) => item.status === "completed").length
    const currentLabel = pendingTaskEvents.at(-1)?.label || copy.loading
    const progressPercent =
      totalCount > 0
        ? Math.round((completedCount / totalCount) * 100)
        : 0

    return {
      totalCount,
      completedCount,
      currentLabel,
      progressPercent: Math.min(100, Math.max(0, progressPercent)),
    }
  }, [copy.loading, pendingTaskEvents])

  const recommendedAgents = useMemo(() => {
    if (agentGroups.length > 0) {
      const seen = new Set<string>()
      const merged: AgentOption[] = []
      for (const group of agentGroups) {
        for (const agent of group.agents) {
          if (seen.has(agent.id)) continue
          seen.add(agent.id)
          merged.push(agent)
        }
      }
      return merged
    }

    return agents
  }, [agentGroups, agents])

  useEffect(() => {
    if (embedded) return
    const targetPath = conversationId ? `/dashboard/ai/${conversationId}` : "/dashboard/ai"
    const params = new URLSearchParams(search)
    if (conversationId) {
      params.delete("draft")
    }
    const nextSearch = params.toString()
    if (pathname !== targetPath || nextSearch !== search) {
      router.replace(nextSearch ? `${targetPath}?${nextSearch}` : targetPath)
    }
  }, [conversationId, embedded, initialConversationId, pathname, router, search])

  useEffect(() => {
    if (embedded) return
    if (!agentQueryReady) return
    const fromRoute = (searchParams.get("agent") || "").trim() || null
    setSelectedAgentId((current) => (current === fromRoute ? current : fromRoute))
    setIsAgentSelectionExplicit(Boolean(fromRoute))
  }, [agentQueryReady, embedded, searchParams])

  useEffect(() => {
    if (!embedded) return
    setSelectedAgentId(forcedAgentId)
    setIsAgentSelectionExplicit(Boolean(forcedAgentId))
  }, [embedded, forcedAgentId])

  useEffect(() => {
    if (initialConversationId) return
    if (messages.length > 0) return
    const nextDraft = routeDraft || (!embedded ? initialDraftFromQuery : "")
    if (!nextDraft) return
    setInput((current) => (current.trim() ? current : nextDraft))
  }, [embedded, initialConversationId, initialDraftFromQuery, messages.length, routeDraft])

  useEffect(() => {
    if (embedded) return
    if (!agentQueryReady) return
    if (!isAgentSelectionExplicit) return
    if (
      pendingFirstConversationRouteRef.current &&
      latestConversationIdRef.current &&
      pathname === "/dashboard/ai"
    ) {
      return
    }
    const params = new URLSearchParams(search)
    if (selectedAgentId) {
      params.set("agent", selectedAgentId)
    } else {
      params.delete("agent")
    }
    const nextSearch = params.toString()
    if (nextSearch !== search) router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname)
  }, [
    agentQueryReady,
    embedded,
    isAgentSelectionExplicit,
    pathname,
    router,
    search,
    selectedAgentId,
    shouldLockModel,
  ])

  useEffect(() => {
    let cancelled = false
    const loadModels = async () => {
      setModelsLoading(true)
      try {
        const response = await fetch("/api/ai/models", { cache: "no-store", credentials: "same-origin" })
        const payload = (await response.json().catch(() => null)) as ModelApiResponse | null
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)

        const normalizeModel = (
          item: {
            id?: string
            name?: string
            modelId?: string
            providerId?: string
            providerLabel?: string
            runtimeId?: string
            canonicalId?: string
            aliases?: string[]
          } | null | undefined,
        ) => {
          const id = typeof item?.id === "string" ? item.id.trim() : ""
          if (!id) return null
          const runtimeId =
            typeof item?.runtimeId === "string" && item.runtimeId.trim()
              ? item.runtimeId.trim()
              : undefined
          const canonicalId =
            typeof item?.canonicalId === "string" && item.canonicalId.trim()
              ? item.canonicalId.trim()
              : undefined
          const modelId =
            typeof item?.modelId === "string" && item.modelId.trim()
              ? item.modelId.trim()
              : runtimeId || canonicalId || id
          const providerId =
            typeof item?.providerId === "string" && item.providerId.trim()
              ? item.providerId.trim()
              : undefined
          const providerLabel =
            typeof item?.providerLabel === "string" && item.providerLabel.trim()
              ? item.providerLabel.trim()
              : undefined
          const normalizedAliases = dedupeStringList([
            ...(Array.isArray(item?.aliases) ? item.aliases : []),
            id,
            modelId,
            runtimeId,
            canonicalId,
          ])
          return {
            id,
            name: typeof item?.name === "string" && item.name.trim() ? item.name.trim() : id,
            modelId,
            providerId,
            providerLabel,
            runtimeId,
            canonicalId,
            aliases: normalizedAliases,
          } as ModelOption
        }

        const normalizedGroups = (payload?.modelGroups || [])
          .map((group) => {
            const family = typeof group.family === "string" && group.family.trim() ? group.family.trim() : "other"
            const label = typeof group.label === "string" && group.label.trim() ? group.label.trim() : family
            const groupModels = dedupeModelsById(
              (group.models || []).map(normalizeModel).filter((item): item is ModelOption => Boolean(item)),
            )
            if (groupModels.length === 0) return null
            return { family, label, models: groupModels } as ModelGroupOption
          })
          .filter((item): item is ModelGroupOption => Boolean(item))
        const dedupedModelGroups = dedupeModelGroups(normalizedGroups)

        const normalizedModels = dedupeModelsById(
          dedupedModelGroups.length > 0
            ? dedupedModelGroups.flatMap((group) => group.models)
            : (payload?.models || []).map(normalizeModel).filter((item): item is ModelOption => Boolean(item)),
        )

        const selectedProviderId =
          typeof payload?.selectedProviderId === "string" && payload.selectedProviderId.trim()
            ? payload.selectedProviderId.trim()
            : typeof payload?.providerId === "string" && payload.providerId.trim()
              ? payload.providerId.trim()
              : null
        setModelProviderId(selectedProviderId)
        setModels(normalizedModels)
        setModelGroups(
          dedupedModelGroups.length > 0
            ? dedupedModelGroups
            : normalizedModels.length > 0
              ? [{ family: "all", label: "All models", models: normalizedModels }]
              : [],
        )
        const preferredFromCatalog =
          typeof payload?.selectedModelId === "string" ? payload.selectedModelId : null
        const preferredFromStorage =
          shouldLockModel || isPptAssistantRoute ? null : readPersistedSelectedModelId()
        const consultingModelFallback =
          pickConsultingModelId(normalizedModels) ||
          AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT
        const pptAssistantDefaultModelId = isPptAssistantRoute
          ? pickPptAssistantDefaultModelId(normalizedModels)
          : null

        setSelectedModelId((current) => {
          if (shouldLockModel) {
            return consultingModelFallback
          }

          if (pptAssistantDefaultModelId) {
            return pptAssistantDefaultModelId
          }

          const normalizedCurrent =
            typeof current === "string" && current.trim() ? current.trim() : null
          if (normalizedCurrent) {
            const resolvedCurrent = resolveDisplayModelId(normalizedCurrent, normalizedModels)
            if (resolvedCurrent) return resolvedCurrent
          }

          if (preferredFromStorage) {
            const resolvedPreferredFromStorage = resolveDisplayModelId(
              preferredFromStorage,
              normalizedModels,
            )
            if (resolvedPreferredFromStorage) return resolvedPreferredFromStorage
          }

          if (preferredFromCatalog) {
            const resolvedPreferred = resolveDisplayModelId(
              preferredFromCatalog,
              normalizedModels,
            )
            if (resolvedPreferred) return resolvedPreferred
          }

          return normalizedModels[0]?.id || null
        })
      } catch (error) {
        if (cancelled) return
        console.error("ai-entry.models.load.failed", error)
        setModelProviderId(null)
        setModels([])
        setModelGroups([])
        setSelectedModelId(null)
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }

    void loadModels()
    return () => {
      cancelled = true
    }
  }, [isPptAssistantRoute, isZh, shouldLockModel])

  useEffect(() => {
    let cancelled = false
    const loadAgents = async () => {
      setAgentLoading(true)
      try {
        const response = await fetch("/api/ai/agents", { cache: "no-store", credentials: "same-origin" })
        const payload = (await response.json().catch(() => null)) as AgentApiResponse | null
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)

        const normalizedAgents = (payload?.agents || [])
          .map((item) => {
            const id = typeof item?.id === "string" ? item.id.trim() : ""
            if (!id) return null
            const category = typeof item?.category === "string" && item.category.trim() ? item.category.trim() : "general"
            const name = (isZh ? item?.name?.zh : item?.name?.en) || item?.name?.en || item?.name?.zh || id
            const description = (isZh ? item?.description?.zh : item?.description?.en) || item?.description?.en || item?.description?.zh || ""
            return { id, category, name: String(name), description: String(description) } as AgentOption
          })
          .filter((item): item is AgentOption => Boolean(item))

        const normalizedGroups = (payload?.groups || [])
          .map((group) => {
            const id = typeof group?.id === "string" ? group.id.trim() : ""
            if (!id) return null
            const label = (isZh ? group?.label?.zh : group?.label?.en) || group?.label?.en || group?.label?.zh || id
            return { id, label: String(label) }
          })
          .filter((item): item is { id: string; label: string } => Boolean(item))

        const groups: AgentGroupOption[] = normalizedGroups
          .map((group) => {
            const list = normalizedAgents.filter((agent) => agent.category === group.id)
            if (list.length === 0) return null
            return { id: group.id, label: group.label, agents: list } as AgentGroupOption
          })
          .filter((item): item is AgentGroupOption => Boolean(item))

        const leftovers = normalizedAgents.filter((agent) => !normalizedGroups.some((group) => group.id === agent.category))
        if (leftovers.length > 0) groups.push({ id: "other", label: "Other", agents: leftovers })

        const validIds = new Set(normalizedAgents.map((item) => item.id))
        const fromForcedAgent =
          forcedAgentId && validIds.has(forcedAgentId) ? forcedAgentId : null
        const fromQuery =
          !embedded && initialAgentFromQuery && validIds.has(initialAgentFromQuery)
            ? initialAgentFromQuery
            : null
        const nextSelectedAgentId = fromForcedAgent || fromQuery

        setAgents(normalizedAgents)
        setAgentGroups(groups)
        setSelectedAgentId(nextSelectedAgentId)
        setIsAgentSelectionExplicit(Boolean(nextSelectedAgentId))
      } catch (error) {
        if (cancelled) return
        console.error("ai-entry.agents.load.failed", error)
        setAgents([])
        setAgentGroups([])
        setSelectedAgentId(null)
        setIsAgentSelectionExplicit(false)
      } finally {
        if (!cancelled) {
          setAgentLoading(false)
          setAgentQueryReady(true)
        }
      }
    }

    void loadAgents()
    return () => {
      cancelled = true
    }
  }, [embedded, forcedAgentId, initialAgentFromQuery, isZh, shouldLockModel])

  useEffect(() => {
    if (shouldLockModel) {
      if (selectedModelId !== lockedConsultingModelId) {
        setSelectedModelId(lockedConsultingModelId)
      }
      return
    }

    if (models.length === 0) {
      if (selectedModelId !== null) setSelectedModelId(null)
      return
    }

    if (!selectedModelId || !models.some((item) => item.id === selectedModelId)) {
      setSelectedModelId(preferredUnlockedModelId)
    }
  }, [lockedConsultingModelId, models, preferredUnlockedModelId, selectedModelId, shouldLockModel])

  useEffect(() => {
    setErrorMessage(null)

    if (!initialConversationId) {
      if (pendingFirstConversationRouteRef.current) {
        setIsConversationLoading(false)
        return
      }
      setConversationId(null)
      latestConversationIdRef.current = null
      setMessages([])
      setIsConversationLoading(false)
      if (!shouldLockModel && models.length > 0) {
        setSelectedModelId((current) => {
          if (current && models.some((item) => item.id === current)) return current
          return preferredUnlockedModelId
        })
      }
      return
    }

    if (
      isLoadingRef.current ||
      (
        pendingFirstConversationRouteRef.current &&
        latestConversationIdRef.current === initialConversationId
      )
    ) {
      setConversationId(initialConversationId)
      latestConversationIdRef.current = initialConversationId
      setIsConversationLoading(false)
      return
    }

    pendingFirstConversationRouteRef.current = false
    setConversationId(initialConversationId)
    latestConversationIdRef.current = initialConversationId
    let cancelled = false
    const loadMessages = async () => {
      setIsConversationLoading(true)
      try {
        const params = new URLSearchParams({ conversation_id: initialConversationId, limit: "200" })
        if (effectiveEntryMode) params.set("entryMode", effectiveEntryMode)
        if (routeAgentId) params.set("agent", routeAgentId)
        const response = await fetch(`/api/ai/messages?${params.toString()}`, { cache: "no-store", credentials: "same-origin" })
        const payload = (await response.json().catch(() => null)) as MessageApiResponse | null
        if (cancelled) return
        if (!response.ok) {
          const apiError =
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error.trim()
              : ""
          if (response.status === 404 && apiError === "conversation_not_found") {
            clearPendingConversationMessages(initialConversationId)
            setConversationId(null)
            latestConversationIdRef.current = null
            setMessages([])
            setErrorMessage(null)
            return
          }
          throw new Error(`http_${response.status}`)
        }

        const restored = (payload?.data || [])
          .map((item) => {
            const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null
            const content = typeof item.content === "string" ? item.content : ""
            const id = typeof item.id === "string" ? item.id : `${role || "msg"}-${Math.random()}`
            const createdAt =
              typeof item.created_at === "number" && Number.isFinite(item.created_at)
                ? item.created_at
                : undefined
            if (!role || !content.trim()) return null
            return { id, role, content, createdAt } as ChatMessage
          })
          .filter((item): item is ChatMessage => Boolean(item))

        setMessages(restored)
        clearPendingConversationMessages(initialConversationId)

        const conversationModelId =
          typeof payload?.conversation?.current_model_id === "string" &&
          payload.conversation.current_model_id.trim()
            ? payload.conversation.current_model_id.trim()
            : null

        if (conversationModelId && !shouldLockModel) {
          const resolvedModelId = resolveDisplayModelId(conversationModelId, models)
          setSelectedModelId(resolvedModelId || null)
        }
      } catch (error) {
        if (cancelled) return
        setMessages((current) => (current.length > 0 ? current : []))
        setErrorMessage(
          `${copy.errorPrefix}${renderAiEntryErrorMessage(
            error instanceof Error ? error.message : error,
            copy,
          )}`,
        )
      } finally {
        if (!cancelled) setIsConversationLoading(false)
      }
    }

    void loadMessages()
    return () => {
      cancelled = true
    }
  }, [copy, effectiveEntryMode, initialConversationId, models, preferredUnlockedModelId, routeAgentId, shouldLockModel])

  const renderModelSelectContent = useCallback(() => {
    if (modelsLoading) return <SelectItem value="__loading" disabled>{copy.modelLoading}</SelectItem>
    if (models.length === 0) return <SelectItem value="__empty" disabled>{copy.modelEmpty}</SelectItem>
    return modelGroups.map((group, idx) => (
      <SelectGroup key={`${group.family}-${idx}`}>
        <SelectLabel>{group.label}</SelectLabel>
        {group.models.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
        {idx < modelGroups.length - 1 ? <SelectSeparator /> : null}
      </SelectGroup>
    ))
  }, [copy.modelEmpty, copy.modelLoading, modelGroups, models.length, modelsLoading])

  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 1200)
    } catch {
      setCopiedMessageId(null)
    }
  }, [])

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))
  }, [])

  const handleAttachmentFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList || [])
      if (!files.length) return

      if (attachments.length + files.length > AI_ENTRY_MAX_ATTACHMENTS) {
        setErrorMessage(isZh ? "一次最多上传 4 个附件。" : "You can upload up to 4 attachments at a time.")
        return
      }

      setIsPreparingAttachments(true)
      try {
        const nextAttachments: ChatAttachment[] = []
        let hadAttachmentError = false
        for (const file of files) {
          if (file.size > AI_ENTRY_MAX_ATTACHMENT_BYTES) {
            setErrorMessage(isZh ? "单个附件不能超过 4MB。" : "Each attachment must be 4MB or smaller.")
            hadAttachmentError = true
            continue
          }

          let artifactId: number
          try {
            artifactId = await uploadChatAttachmentToAssetLibrary(file)
          } catch (error) {
            const code = error instanceof Error ? error.message : "asset_library_upload_failed"
            setErrorMessage(renderAttachmentError(code, isZh))
            hadAttachmentError = true
            continue
          }

          if (file.type.startsWith("image/")) {
            nextAttachments.push({
              id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: file.name,
              mediaType: file.type,
              size: file.size,
              artifactId,
              dataUrl: await readFileAsDataUrl(file),
            })
            continue
          }

          if (isTextLikeFile(file)) {
            nextAttachments.push({
              id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: file.name,
              mediaType: file.type || "text/plain",
              size: file.size,
              artifactId,
              text: await file.text(),
            })
            continue
          }

          if (isParseableDocumentFile(file)) {
            try {
              nextAttachments.push({
                ...(await extractDocumentAttachment(file)),
                artifactId,
              })
            } catch (error) {
              const code = error instanceof Error ? error.message : "attachment_parse_failed"
              setErrorMessage(renderAttachmentError(code, isZh))
              hadAttachmentError = true
            }
            continue
          }

          setErrorMessage(isZh ? "当前对话暂不支持该文件类型，请上传图片、文本、DOCX 或 PDF 文件。" : "This chat does not support that file type yet. Upload an image, text, DOCX, or PDF file.")
          hadAttachmentError = true
        }

        if (nextAttachments.length > 0) {
          setAttachments((current) => [...current, ...nextAttachments].slice(0, AI_ENTRY_MAX_ATTACHMENTS))
          if (!hadAttachmentError) setErrorMessage(null)
        }
      } finally {
        setIsPreparingAttachments(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [attachments.length, isZh],
  )

  const handleSend = useCallback(async () => {
    const prompt = input.trim()
    if ((!prompt && attachments.length === 0) || isLoading || isConversationLoading || isPreparingAttachments) return
    const hasImageAttachments = attachments.some((attachment) => attachment.mediaType.startsWith("image/"))
    if (hasImageAttachments && !modelSupportsImageInput(selectedModel)) {
      setErrorMessage(isZh ? "当前所选模型不支持图片上传或识别，请切换到支持视觉的模型后再发送。" : "The selected model does not support image upload or recognition. Switch to a vision-capable model before sending.")
      return
    }
    const sentAttachments = attachments
    const userMessageContent = prompt || (isZh ? "请识别附件内容。" : "Please analyze the attached content.")
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: userMessageContent, attachments: sentAttachments }
    const assistantMessageId = `assistant-${Date.now()}`
    const contextMessages = [
      ...messages.filter((message) => message.content.trim()).map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: userMessageContent },
    ]

    setInput("")
    setAttachments([])
    setErrorMessage(null)
    setPendingTaskEvents([
      {
        type: "request_start",
        label: "Request sent",
        status: "running",
        at: Date.now(),
      },
    ])
    setMessages((previous) => [...previous, userMessage, { id: assistantMessageId, role: "assistant", content: "" }])
    isLoadingRef.current = true
    setIsLoading(true)
    if (!conversationId) {
      pendingFirstConversationRouteRef.current = true
    }

    try {
      const effectiveRequestAgentId =
        embedded && forcedAgentId
          ? forcedAgentId
          : selectedAgentId
      const shouldSendAgentConfig =
        isConsultingEntry ||
        Boolean(effectiveRequestAgentId && (embedded || isAgentSelectionExplicit))

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          stream: true,
          messages: contextMessages,
          attachments: sentAttachments,
          enterpriseKnowledge: {
            enabled: knowledgeEnabled,
            datasetIds: selectedKnowledgeDatasetIds,
          },
          conversationId,
          conversationScope: isConsultingEntry ? "consulting" : "chat",
          modelConfig:
            selectedModelId
              ? {
                  providerId:
                    resolvePreferredProviderForModel({
                      selectedModel,
                      selectedProviderId: modelProviderId,
                      fallbackProviderId: modelProviderId,
                    }) || undefined,
                  modelId:
                    selectedModel?.modelId ||
                    selectedModel?.runtimeId ||
                    selectedModel?.canonicalId ||
                    selectedModelId,
                }
              : undefined,
          agentConfig:
            shouldSendAgentConfig
              ? {
                  ...(effectiveRequestAgentId
                    ? { agentId: effectiveRequestAgentId }
                    : {}),
                  ...(isConsultingEntry
                    ? {
                        entryMode: AI_ENTRY_CONSULTING_ENTRY_MODE,
                      }
                    : {}),
                }
              : undefined,
        }),
      })

      const pushTaskEvent = (nextEvent: PendingTaskEvent) => {
        setPendingTaskEvents((current) => [...current, nextEvent].slice(-12))
      }

      const upsertTaskEvent = (nextEvent: PendingTaskEvent) => {
        setPendingTaskEvents((current) => {
          const targetIndex = current.findIndex((item) => item.type === nextEvent.type)
          if (targetIndex < 0) return [...current, nextEvent].slice(-12)
          const next = [...current]
          next[targetIndex] = nextEvent
          return next.slice(-12)
        })
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ChatApiResponse | null
        throw new Error(payload?.error || `http_${response.status}`)
      }

      const contentType = response.headers.get("content-type") || ""
      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ""
        let streamedText = ""
        let streamError: string | null = null
        let streamedToolAppendix = ""

        const processEvent = (event: ChatStreamApiResponse) => {
          const now = Date.now()
          const streamConversationId =
            typeof event.conversation_id === "string" && event.conversation_id.trim()
              ? event.conversation_id.trim()
              : null
          if (streamConversationId) {
            latestConversationIdRef.current = streamConversationId
            savePendingConversationMessages(streamConversationId, [
              ...messages,
              userMessage,
              { id: assistantMessageId, role: "assistant", content: streamedText },
            ])
            setConversationId(streamConversationId)
          }

          if (event.event === "conversation_init") {
            upsertTaskEvent({
              type: "conversation_init",
              label: "Conversation ready",
              status: "completed",
              at: now,
            })
            return
          }

          if (event.event === "provider_selected" || event.event === "provider_fallback") {
            const normalizedProviderModel = resolveDisplayModelIdForProvider({
              rawModelId: typeof event.provider_model === "string" ? event.provider_model : null,
              providerId: typeof event.provider === "string" ? event.provider : null,
              models,
            })
            const detail = [event.provider, normalizedProviderModel || selectedModelId]
              .filter(Boolean)
              .join(" / ")
            upsertTaskEvent({
              type: "provider",
              label: "Model routing",
              detail: detail || undefined,
              status: event.event === "provider_fallback" ? "info" : "running",
              at: now,
            })
            return
          }

          if (event.event === "knowledge_query_start") {
            upsertTaskEvent({
              type: "knowledge_query",
              label: "Query enterprise knowledge",
              status: "running",
              at: now,
            })
            return
          }

          if (event.event === "knowledge_query_result") {
            const status = event.data?.status || "miss"
            const snippetCount =
              typeof event.data?.snippetCount === "number" ? event.data.snippetCount : 0
            const datasetCount =
              typeof event.data?.datasetCount === "number" ? event.data.datasetCount : 0
            const detail =
              status === "failed"
                ? event.data?.message || "failed"
                : `${snippetCount} snippets / ${datasetCount} datasets`

            upsertTaskEvent({
              type: "knowledge_query",
              label: "Enterprise knowledge queried",
              detail,
              status:
                status === "failed"
                  ? "failed"
                  : status === "hit"
                    ? "completed"
                    : "info",
              at: now,
            })
            return
          }

          if (event.event === "tool_call") {
            const toolName = event.data?.toolName || "tool"
            const toolId = event.data?.toolCallId || toolName
            const isWebSearch = toolName === "web_search"
            upsertTaskEvent({
              type: `tool:${toolId}`,
              label: isWebSearch ? (isZh ? "\u6b63\u5728\u641c\u7d22\u7f51\u9875" : "Searching the web") : `Tool: ${toolName}`,
              detail: isWebSearch ? event.data?.args?.query : undefined,
              status: "running",
              at: now,
            })
            return
          }

          if (event.event === "tool_result") {
            const toolName = event.data?.toolName || "tool"
            const toolId = event.data?.toolCallId || toolName
            const isWebSearch = toolName === "web_search"
            const toolMessage = buildPptToolResultMessage({
              toolName,
              result: event.data?.result ?? null,
              origin: typeof window !== "undefined" ? window.location.origin : null,
              isZh,
            })
            const sources = Array.isArray(event.data?.result?.results)
              ? event.data.result.results.filter((source) => typeof source?.url === "string" && source.url.trim())
              : []
            const sourceDetail = sources.length
              ? `${sources.length} ${isZh ? "\u4e2a\u6765\u6e90" : "sources"}: ${sources.slice(0, 2).map((source) => source.title || source.url).filter(Boolean).join(" / ")}`
              : undefined

            if (toolMessage && !streamedToolAppendix.includes(toolMessage)) {
              streamedToolAppendix = `${streamedToolAppendix}${toolMessage}`
              const nextContent = `${streamedText}${streamedToolAppendix}`
              setMessages((previous) => {
                const next = previous.map((item) =>
                  item.id === assistantMessageId
                    ? { ...item, content: nextContent }
                    : item,
                )
                savePendingConversationMessages(latestConversationIdRef.current, next)
                return next
              })
            }

            upsertTaskEvent({
              type: `tool:${toolId}`,
              label: isWebSearch ? (isZh ? "\u7f51\u9875\u641c\u7d22\u5b8c\u6210" : "Web search completed") : `Tool: ${toolName}`,
              detail: isWebSearch ? sourceDetail : undefined,
              status: "completed",
              at: now,
            })
            return
          }

          if (event.event === "message") {
            const delta = typeof event.answer === "string" ? event.answer : ""
            if (!delta) return
            streamedText += delta
            setMessages((previous) =>
              {
                const nextContent = `${streamedText}${streamedToolAppendix}`
                const next = previous.map((item) =>
                  item.id === assistantMessageId
                    ? { ...item, content: nextContent }
                    : item,
                )
                savePendingConversationMessages(latestConversationIdRef.current, next)
                return next
              },
            )
            return
          }

          if (event.event === "message_end") {
            const finalText = typeof event.answer === "string" && event.answer.trim()
              ? event.answer.trim()
              : streamedText.trim()
            const resolvedTextWithTools =
              streamedToolAppendix.trim() && finalText.includes(streamedToolAppendix.trim())
                ? finalText
                : `${finalText}${streamedToolAppendix}`.trim()

            const resolvedProviderModelId = resolveDisplayModelIdForProvider({
              rawModelId: typeof event.provider_model === "string" ? event.provider_model : null,
              providerId: typeof event.provider === "string" ? event.provider : null,
              models,
            })
            if (resolvedProviderModelId) {
              setSelectedModelId(resolvedProviderModelId)
            }

            upsertTaskEvent({
              type: "response",
              label: "Response complete",
              detail:
                [event.provider, resolvedProviderModelId || selectedModelId]
                  .filter(Boolean)
                  .join(" / ") || undefined,
              status: "completed",
              at: now,
            })

            upsertTaskEvent({
              type: "request_start",
              label: "Request sent",
              status: "completed",
              at: now,
            })

            setMessages((previous) =>
              {
                const next = previous.map((item) =>
                  item.id === assistantMessageId
                    ? { ...item, content: resolvedTextWithTools || copy.unknownError }
                    : item,
                )
                savePendingConversationMessages(latestConversationIdRef.current, next)
                return next
              },
            )
            return
          }

          if (event.event === "error") {
            streamError = renderAiEntryErrorMessage(event.error, copy)
            upsertTaskEvent({
              type: "request_start",
              label: "Request sent",
              status: "completed",
              at: now,
            })
            pushTaskEvent({
              type: "stream_error",
              label: "Request failed",
              detail: streamError || undefined,
              status: "failed",
              at: now,
            })
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          sseBuffer += decoder.decode(value || new Uint8Array(), { stream: !done })
          const parsed = consumeSseBuffer<ChatStreamApiResponse>(sseBuffer)
          sseBuffer = parsed.rest
          parsed.events.forEach(processEvent)
          if (done) break
        }

        const flushed = consumeSseBuffer<ChatStreamApiResponse>(sseBuffer)
        flushed.events.forEach(processEvent)

        if (streamError) throw new Error(streamError)
        if (!streamedText.trim()) {
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId
                ? { ...item, content: copy.unknownError }
                : item,
            ),
          )
        }
      } else {
        const payload = (await response.json().catch(() => null)) as ChatApiResponse | null
        const assistantText = (payload?.message || "").trim()
        const completedMessages = [
          ...messages,
          userMessage,
          { id: assistantMessageId, role: "assistant" as const, content: assistantText || copy.unknownError },
        ]
        setMessages(completedMessages)
        if (typeof payload?.conversationId === "string" && payload.conversationId) {
          latestConversationIdRef.current = payload.conversationId
          savePendingConversationMessages(payload.conversationId, completedMessages)
          setConversationId(payload.conversationId)
        }
        setPendingTaskEvents((current) => [
          ...current.filter((event) => event.type !== "request_start"),
          {
            type: "request_start",
            label: "Request sent",
            status: "completed",
            at: Date.now(),
          },
        ])
      }
    } catch (error) {
      const renderedError = `${copy.errorPrefix}${renderAiEntryErrorMessage(
        error instanceof Error ? error.message : error,
        copy,
      )}`
      const failedEvent: PendingTaskEvent = {
        type: "request_failed",
        label: "Request failed",
        detail: renderedError,
        status: "failed",
        at: Date.now(),
      }
      setErrorMessage(renderedError)
      setMessages((previous) => previous.map((item) => item.id === assistantMessageId ? { ...item, content: renderedError } : item))
      setPendingTaskEvents((current) => [...current, failedEvent].slice(-12))
    } finally {
      pendingFirstConversationRouteRef.current = false
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [
    attachments,
    conversationId,
    copy,
    input,
    isConversationLoading,
    isPreparingAttachments,
    isLoading,
    isZh,
    embedded,
    forcedAgentId,
    knowledgeEnabled,
    messages,
    modelProviderId,
    models,
    selectedKnowledgeDatasetIds,
    isConsultingEntry,
    isAgentSelectionExplicit,
    selectedAgentId,
    selectedModel,
    selectedModelId,
  ])

  const renderSelectors = (buttonHeight: "h-10" | "h-9") => (
    <div className="flex min-w-0 items-center gap-2 px-1">
      {shouldLockModel ? (
        <div
          className={`model-select inline-flex min-w-0 max-w-[44vw] items-center text-xs text-foreground sm:max-w-[260px] ${buttonHeight}`}
          title={selectedModel?.name || lockedConsultingModelId}
        >
          <span className="truncate">
            {copy.modelLabel}: {selectedModel?.name || lockedConsultingModelId}
          </span>
        </div>
      ) : (
        <Select
          open={modelSelectOpen}
          onOpenChange={setModelSelectOpen}
          value={selectedModelId ?? undefined}
          onValueChange={(nextValue) => {
            setSelectedModelId(nextValue || null)
            setModelSelectOpen(false)
          }}
          disabled={isLoading || modelsLoading || models.length === 0}
        >
          <SelectTrigger className={`model-select min-w-0 w-[140px] max-w-[44vw] rounded-[8px] px-3 text-xs text-foreground outline-none focus:border-primary sm:w-[220px] sm:max-w-[220px] ${buttonHeight}`}>
            <SelectValue placeholder={`${copy.modelLabel}: ${modelsLoading ? copy.modelLoading : copy.modelEmpty}`} />
          </SelectTrigger>
          <SelectContent>{renderModelSelectContent()}</SelectContent>
        </Select>
      )}
    </div>
  )

  const renderSelectedAttachments = () => {
    if (attachments.length === 0 && !isPreparingAttachments) return null
    return (
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
        {isPreparingAttachments ? (
          <div className="dashboard-chip inline-flex items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{isZh ? "正在解析附件" : "Parsing attachment"}</span>
          </div>
        ) : null}
        {attachments.map((attachment) => {
          const isImage = attachment.mediaType.startsWith("image/")
          return (
            <div key={attachment.id} className="dashboard-chip inline-flex max-w-[260px] items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-xs text-muted-foreground">
              {isImage ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate" title={attachment.name}>{attachment.name}</span>
              <button
                type="button"
                className="rounded-[4px] p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label={isZh ? "移除附件" : "Remove attachment"}
                onClick={() => removeAttachment(attachment.id)}
                disabled={isLoading}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  const renderKnowledgeControl = () => {
    if (!knowledgeEnabled) return null

    return (
      <div className="flex items-center gap-1">
        <Popover open={knowledgePickerOpen} onOpenChange={setKnowledgePickerOpen}>
          <PromptInputAction tooltip={copy.knowledgeChoose}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="dashboard-button-secondary h-9 max-w-[220px] gap-2 px-3"
                disabled={isLoading || isConversationLoading || isPreparingAttachments}
              >
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{copy.knowledgeLabel}</span>
                <span className="truncate text-muted-foreground">{knowledgeSummaryLabel}</span>
              </Button>
            </PopoverTrigger>
          </PromptInputAction>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <div className="border-b border-border px-3 py-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[6px] border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/50"
                  onClick={disableKnowledge}
                >
                  <span>{copy.disableKnowledge}</span>
                </button>
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-between rounded-[6px] px-1 py-1 text-left text-xs text-muted-foreground transition hover:text-foreground"
                  onClick={() => setSelectedKnowledgeDatasetIds([])}
                >
                  <span>{copy.knowledgeAllEnabled}</span>
                  {selectedKnowledgeDatasetIds.length === 0 ? <Check className="h-4 w-4 text-primary" /> : null}
                </button>
              </div>
              <CommandInput placeholder={copy.knowledgeSearch} />
              <CommandList>
                <CommandEmpty>{knowledgeDatasetsLoading ? copy.knowledgeLoading : copy.knowledgeEmpty}</CommandEmpty>
                <CommandGroup>
                  {knowledgeDatasets.map((dataset) => {
                    const selected = selectedKnowledgeDatasetIds.includes(dataset.id)
                    return (
                      <CommandItem
                        key={dataset.id}
                        onSelect={() => toggleKnowledgeDataset(dataset.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Database className="h-4 w-4 shrink-0" />
                          <div className="min-w-0">
                            <div className="truncate text-sm">{dataset.name}</div>
                            <div className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                              {dataset.category}
                            </div>
                          </div>
                        </div>
                        {selected ? <Check className="ml-2 h-4 w-4 text-primary" /> : null}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <PromptInputAction tooltip={copy.disableKnowledge}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="dashboard-button-secondary h-9 px-2.5"
            disabled={isLoading || isConversationLoading || isPreparingAttachments}
            onClick={disableKnowledge}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </PromptInputAction>
      </div>
    )
  }

  const renderMessageAttachments = (items: ChatAttachment[] | undefined) => {
    if (!items?.length) return null
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {items.map((attachment) => (
          <div key={attachment.id} className="dashboard-chip inline-flex max-w-[240px] items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-xs text-muted-foreground">
            {attachment.mediaType.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate" title={attachment.name}>{attachment.name}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderAttachmentPicker = () => (
    <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
      <PromptInputAction tooltip={copy.addMenu}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="composer-add"
            disabled={isLoading || isConversationLoading || isPreparingAttachments}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
      </PromptInputAction>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm transition hover:bg-accent"
            onClick={() => {
              setAddMenuOpen(false)
              fileInputRef.current?.click()
            }}
            disabled={attachments.length >= AI_ENTRY_MAX_ATTACHMENTS}
          >
            <Paperclip className="h-4 w-4 shrink-0" />
            <span>{copy.uploadFile}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-sm transition hover:bg-accent"
            onClick={() => {
              setAddMenuOpen(false)
              setKnowledgeEnabled(true)
              setKnowledgePickerOpen(true)
            }}
          >
            <Database className="h-4 w-4 shrink-0" />
            <span>{copy.knowledgeAdd}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )

  const renderRecommendedAgents = (size: "landing" | "inline") => {
    const containerClassName = size === "landing" ? "mx-auto mt-8 max-w-5xl" : "mt-3"
    const tabClassName =
      size === "landing"
        ? "h-9 rounded-full px-4 text-sm"
        : "h-8 rounded-full px-3 text-xs"

    return (
      <div className={containerClassName}>
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {copy.agentRecommended}
        </div>
        {agentLoading ? (
          <div className="text-xs text-muted-foreground">{copy.agentLoading}</div>
        ) : recommendedAgents.length === 0 ? (
          <div className="text-xs text-muted-foreground">{copy.agentEmpty}</div>
        ) : (
          <div className="dashboard-panel rounded-[10px] px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {recommendedAgents.map((agent) => {
                const isSelected = selectedAgentId === agent.id
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() =>
                      handleAgentSelectionChange(selectedAgentId === agent.id ? null : agent.id)
                    }
                    className={cn(
                      "dashboard-kicker inline-flex items-center rounded-[4px] border px-4 transition",
                      tabClassName,
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-primary/5",
                    )}
                    title={agent.description}
                  >
                    {agent.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (showLanding) {
    return (
      <TooltipProvider>
        <div className="dashboard-shell flex h-full min-h-0 justify-center overflow-hidden bg-background">
          <section className="flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden px-4 pt-10 lg:px-8">
            <div className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col pb-6">
                  <div className="mx-auto max-w-4xl text-center">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1">
                      <span className="public-signal" aria-hidden="true" />
                      <span className="dashboard-kicker text-muted-foreground">AI Workspace</span>
                    </div>
                    <h1 className="dashboard-title text-5xl tracking-tight text-foreground lg:text-6xl">{workspaceTitle}</h1>
                    <p className="mt-4 text-lg text-muted-foreground">{copy.landingHint}</p>
                  </div>

                  {!embedded && !shouldLockModel ? renderRecommendedAgents("landing") : null}

                  <div className="mx-auto mt-10 grid max-w-5xl gap-3 lg:grid-cols-3">
                    {quickPrompts.map((prompt) => (
                      <button key={prompt} type="button" className="dashboard-panel rounded-[10px] p-4 text-left transition hover:border-primary/60 hover:bg-primary/5" onClick={() => setInput(prompt)}>
                        <div className="dashboard-kicker mb-2 inline-flex items-center gap-1 text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5" />
                          {copy.quickStart}
                        </div>
                        <div className="text-sm leading-6 text-foreground">{prompt}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>

            <div className="sticky bottom-0 z-20 shrink-0 bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:px-0">
              <div className="dashboard-panel mx-auto max-w-5xl rounded-[12px] p-4 shadow-sm">
                <PromptInput value={input} onValueChange={setInput} onSubmit={handleSend} isLoading={isLoading} maxHeight={220} className="border-0 bg-transparent p-0 shadow-none">
                  {isAgentSelectionExplicit && selectedAgent ? (
                    <div className="px-1 pb-2 text-xs text-muted-foreground">
                      {copy.selectedAgent}: <span className="font-medium text-foreground">{selectedAgent.name}</span>
                    </div>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.txt,.md,.docx,.pdf,.csv,.json,text/*,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(event) => void handleAttachmentFiles(event.target.files)}
                  />
                  {renderSelectedAttachments()}
                  <PromptInputTextarea placeholder={copy.placeholder} className="min-h-[120px] text-base" />
                  <PromptInputActions>
                    <div className="flex items-center gap-2">
                      {renderAttachmentPicker()}
                      {renderKnowledgeControl()}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      {renderSelectors("h-10")}
                      <PromptInputAction tooltip={copy.send}>
                        <Button type="button" size="sm" className="dashboard-button-primary h-10 shrink-0 px-4" onClick={() => void handleSend()} disabled={(!input.trim() && attachments.length === 0) || isLoading || isConversationLoading || isPreparingAttachments || modelsLoading}>
                          {isLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="mr-1.5 h-3.5 w-3.5" />}
                          {copy.send}
                        </Button>
                      </PromptInputAction>
                    </div>
                  </PromptInputActions>
                </PromptInput>
              </div>
            </div>
          </section>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="chat-canvas flex h-full min-h-0 justify-center">
        <section className="flex h-full min-h-0 w-full max-w-[1320px] flex-col overflow-hidden">
          {!embedded || !compactEmbedded ? (
            <header className="chat-page-header px-4 pt-6 lg:px-8">
              <div>
                <div className="dashboard-kicker text-muted-foreground">AI CHAT</div>
                <h1 className="chat-page-title mt-2 text-foreground">{workspaceTitle}</h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{workspaceSubtitle}</p>
              </div>
              <div className="grid shrink-0 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div className="chat-status-card">
                  <div className="chat-status-label">{isZh ? "作品库" : "Work Library"}</div>
                  <div className="chat-status-value">247</div>
                </div>
                <div className="chat-status-card">
                  <div className="chat-status-label">{isZh ? "今日会话" : "Active Conversations"}</div>
                  <div className="chat-status-value">12</div>
                </div>
                <div className="chat-status-card">
                  <div className="chat-status-label">{copy.modelLabel}</div>
                  <div className="chat-status-value truncate text-[1.15rem]">{selectedModel?.name || "Active"}</div>
                </div>
              </div>
            </header>
          ) : null}

        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div
              className={cn(
                "mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-4 pb-6 lg:px-6",
                embedded && compactEmbedded ? "min-h-[280px] sm:min-h-[320px]" : undefined,
              )}
            >
              {isConversationLoading && messages.length === 0 ? <div className="dashboard-panel rounded-[10px] p-4 text-sm text-muted-foreground"><div className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{copy.restoring}</div></div> : null}

              {shouldShowEmbeddedGuide && embeddedGuideContent ? (
                <article className="message-card">
                  <div className="message-header">
                    <div className="ai-avatar">AI</div>
                    <div className="min-w-0 flex-1">
                      <div className="dashboard-kicker text-foreground">AI WORKSPACE</div>
                      <div className="message-time">{formatMessageTime(undefined, displayLocale)}</div>
                    </div>
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <MessageContent bare markdown role="assistant" className="message-body p-0">{embeddedGuideContent}</MessageContent>
                </article>
              ) : null}

              {messages.map((message, index) => {
                const isAssistant = message.role === "assistant"
                const copied = copiedMessageId === message.id
                const isPendingAssistant =
                  isAssistant &&
                  isLoading &&
                  index === messages.length - 1 &&
                  !message.content.trim()
                const shouldShowLoadingDetails = isPendingAssistant
                const artifact = isAssistant ? parseArtifactResult(message.content) : null
                const bodyContent = artifact?.body ?? message.content
                return isAssistant ? (
                  <article key={message.id} className="message-card">
                    <div className="message-header">
                      <div className="ai-avatar">AI</div>
                      <div className="min-w-0 flex-1">
                        <div className="dashboard-kicker text-foreground">AI RESPONSE</div>
                        <div className="message-time">{formatMessageTime(message.createdAt, displayLocale)}</div>
                      </div>
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {isPendingAssistant ? (
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <TypingIndicator />
                        <span>{copy.loading}</span>
                      </div>
                    ) : bodyContent ? (
                      <MessageContent bare markdown role="assistant" className="message-body p-0">{bodyContent}</MessageContent>
                    ) : null}
                    {artifact ? (
                      <>
                        <div className="message-divider" />
                        <ArtifactResultBlock artifact={artifact} />
                      </>
                    ) : null}
                    {shouldShowLoadingDetails ? (
                      <div className="mt-5 rounded-[12px] border border-[#e7e7df] bg-[#fafaf7] p-4">
                        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <TypingIndicator />
                          <span className="truncate">{loadingEventSummary.currentLabel}</span>
                        </div>
                        {loadingEventSummary.totalCount > 0 ? (
                          <div className="mb-2 rounded-[8px] border border-border/70 bg-background/70 px-2.5 py-2">
                            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="truncate">{isZh ? "处理中" : "Processing"}</span>
                              <span>{`${loadingEventSummary.completedCount}/${loadingEventSummary.totalCount}`}</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-300"
                                style={{ width: `${loadingEventSummary.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                        <WorkspaceTaskEvents events={pendingTaskEvents} limit={4} className="pl-0" />
                      </div>
                    ) : null}
                    {message.content.trim() ? (
                      <div className="message-actions">
                        <MessageAction tooltip={copied ? copy.copiedReply : copy.copyReply}>
                          <button type="button" className="action-primary" onClick={() => void handleCopyMessage(message.id, message.content)}>
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            <TextMorph text={copied ? copy.copied : copy.copy} />
                          </button>
                        </MessageAction>
                        {artifact?.workHref ? (
                          <a className="action-secondary" href={artifact.workHref}>
                            <LibraryBig className="h-4 w-4" />
                            {isZh ? "打开作品库" : "Open in Works"}
                          </a>
                        ) : null}
                        {artifact?.downloadHref ? (
                          <a className="action-secondary" href={artifact.downloadHref} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" />
                            {isZh ? "导出" : "Export"}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ) : (
                  <Message key={message.id} className="justify-end">
                    <div className="message-card-user">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="dashboard-kicker text-primary">{isZh ? "你的指令" : "Your Command"}</div>
                        <div className="text-xs text-white/55">{formatMessageTime(message.createdAt, displayLocale)}</div>
                      </div>
                      <MessageContent bare role="user" className="p-0 text-sm leading-7 text-white">{message.content}</MessageContent>
                      {renderMessageAttachments(message.attachments)}
                    </div>
                    <MessageAvatar alt="User" fallback="U" />
                  </Message>
                )
              })}

              {errorMessage ? <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">{errorMessage}</div> : null}
              <div ref={scrollAnchorRef} className="h-px w-full shrink-0 scroll-mt-4" aria-hidden="true" />
            </div>
          </ScrollArea>
        </div>

        <div className="sticky bottom-0 z-20 shrink-0 bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:px-6">
          <div className="chat-composer mx-auto">
            {!isConversationLoading && messages.length === 0 ? (
              <div className="mb-2">
                <div className="flex flex-wrap gap-2">
                  {composerPromptButtons.map((prompt) => (
                    <button key={prompt} type="button" className="dashboard-chip max-w-[260px] truncate rounded-[4px] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary" title={prompt} onClick={() => setInput(prompt)} disabled={isLoading}>{prompt}</button>
                  ))}
                </div>
              </div>
            ) : null}

            {!compactEmbedded && (composerLinkActions.length > 0 || composerContextChips.length > 0) ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {composerLinkActions.map((action) => (
                  <Button
                    key={`${action.href}:${action.label}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-[6px] px-3 text-xs"
                    asChild
                  >
                    <Link href={action.href}>
                      {action.label}
                      <ArrowRight className="ml-1.5 h-3 w-3" />
                    </Link>
                  </Button>
                ))}
                {composerContextChips.map((chip) => (
                  <span
                    key={chip}
                    className="dashboard-chip inline-flex items-center rounded-[4px] px-3 py-1.5 text-[11px] text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}

            <PromptInput
              value={input}
              onValueChange={setInput}
              onSubmit={handleSend}
              isLoading={isLoading}
              maxHeight={220}
              className="border-0 bg-transparent p-0 shadow-none"
            >
              {isAgentSelectionExplicit && selectedAgent ? (
                <div className="px-1 pb-2 text-xs text-muted-foreground">
                  {copy.selectedAgent}: <span className="font-medium text-foreground">{selectedAgent.name}</span>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.txt,.md,.docx,.pdf,.csv,.json,text/*,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(event) => void handleAttachmentFiles(event.target.files)}
              />
              {renderSelectedAttachments()}
              <PromptInputTextarea placeholder={copy.placeholder} className={cn("composer-input", compactEmbedded ? "min-h-[88px]" : undefined)} />
              <PromptInputActions className="items-end gap-3 p-0">
                <div className="flex items-center gap-2">
                  {renderAttachmentPicker()}
                  {renderKnowledgeControl()}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {renderSelectors("h-9")}
                  <PromptInputAction tooltip={copy.send}>
                    <Button type="button" size="sm" className="send-button shrink-0 px-5" onClick={() => void handleSend()} disabled={(!input.trim() && attachments.length === 0) || isLoading || isConversationLoading || isPreparingAttachments || modelsLoading}>
                      {isLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      {copy.send}
                    </Button>
                  </PromptInputAction>
                </div>
              </PromptInputActions>
            </PromptInput>

            {!embedded && !shouldLockModel && !isConversationLoading && messages.length === 0
              ? renderRecommendedAgents("inline")
              : null}
          </div>
        </div>
        </section>
      </div>
    </TooltipProvider>
  )
}
