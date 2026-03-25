"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Download,
  Eraser,
  ImageIcon,
  Link2,
  Loader2,
  MousePointer2,
  Palette,
  Pencil,
  Plus,
  Redo2,
  Square,
  Sparkles,
  Type,
  Trash2,
  Undo2,
  X,
} from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { WorkspaceComposerPanel, WorkspacePromptChips, WorkspacePromptGrid } from "@/components/workspace/workspace-primitives"
import {
  WorkspaceConversationSkeleton,
  WorkspaceLoadingMessage,
  WorkspaceMessageFrame,
  WorkspaceSectionCard,
} from "@/components/workspace/workspace-message-primitives"
import {
  findLatestImagePendingTask,
  findImagePendingTask,
  removePendingAssistantTask,
  savePendingAssistantTask,
} from "@/lib/assistant-task-store"
import type { AppMessages } from "@/lib/i18n/messages"
import { exportImageAssistantDataUrl, loadImageForCanvas, renderImageAssistantLayersToCanvas } from "@/lib/image-assistant/export"
import {
  ensureWorkspaceQueryData,
  fetchWorkspaceQueryData,
  getImageAssistantDetailQueryKey,
  getImageAssistantMessagesPage,
  getImageAssistantMessagesQueryKey,
  getImageAssistantSessionDetail,
  getImageAssistantVersionsPage,
  getImageAssistantVersionsQueryKey,
  invalidateImageAssistantSessionQueries,
} from "@/lib/query/workspace-cache"
import {
  getImageAssistantSessionContentCache,
  isImageAssistantSessionContentCacheFresh,
  saveImageAssistantSessionContentCache,
} from "@/lib/image-assistant/session-store"
import { IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS } from "@/lib/image-assistant/skills"
import { getFallbackReferenceAssetIdsFromVersions, shouldUseImplicitEditMode } from "@/lib/image-assistant/turn-routing"
import type {
  ImageAssistantBrief,
  ImageAssistantAsset,
  ImageAssistantCanvasDocument,
  ImageAssistantConversationSummary,
  ImageAssistantGuidedSelection,
  ImageAssistantLayer,
  ImageAssistantMessage,
  ImageAssistantOrchestrationState,
  ImageAssistantPromptOption,
  ImageAssistantResolution,
  ImageAssistantSessionDetail,
  ImageAssistantSizePreset,
  ImageAssistantVersionSummary,
} from "@/lib/image-assistant/types"
import { cn } from "@/lib/utils"

type Availability = {
  enabled: boolean
  reason: string | null
  provider: string
}

type CanvasTool = "select" | "brush" | "eraser" | "shape"
type PaintTool = "brush" | "eraser"

type PaintPreview = {
  layerId: string
  tool: PaintTool
  points: Array<{ x: number; y: number }>
  strokeWidth: number
  color: string
}

type ShapeDraft = {
  start: { x: number; y: number }
  current: { x: number; y: number }
}

type PromptPreset = {
  label: string
  prompt: string
}

type PendingAttachment = {
  id: string
  file: File
  previewUrl: string
  previewWidth?: number
  previewHeight?: number
  width: number
  height: number
  originalFileSize: number
  uploadFileSize: number
  transportOptimized: boolean
  source: "upload" | "canvas" | "generated"
  referenceRole: "subject"
  assetId?: string | null
  assetType?: "reference" | "canvas_snapshot"
  uploading?: boolean
  snapshotSignature?: string | null
  annotationMetadata?: CanvasAnnotationMetadata | null
  maskFile?: File | null
  maskAssetId?: string | null
}

type LayerDragState = {
  layerId: string
  startPoint: { x: number; y: number }
  startTransform: ImageAssistantLayer["transform"]
  beforeDrag: ImageAssistantCanvasDocument
  changed: boolean
}

type LayerResizeState = {
  layerId: string
  startPoint: { x: number; y: number }
  startTransform: ImageAssistantLayer["transform"]
  beforeResize: ImageAssistantCanvasDocument
  changed: boolean
}

type SessionLoadMode = "summary" | "content" | "canvas" | "full"
type ImageAssistantCopy = AppMessages["imageAssistant"]
type ImageAssistantRunKind = "generate" | "edit"

type PendingConversationTurn = {
  id: string
  kind: ImageAssistantRunKind
  prompt: string
  attachments: PendingAttachment[]
  status: "running" | "cancelled"
}

type PromptQuestionSelectionContext = {
  sourceMessageId: string
  questionId: string
}

type PreviewImageState = {
  src: string
  label: string
  aspectRatio: number
}

function getStoredPendingTurn(sessionId: string | null): PendingConversationTurn | null {
  const pendingTask = findImagePendingTask(sessionId)
  if (!pendingTask) return null

  return {
    id: `pending-turn-${pendingTask.taskId}`,
    kind: pendingTask.taskType === "edit" ? "edit" : "generate",
    prompt: pendingTask.prompt || "",
    attachments: [],
    status: "running",
  }
}

type MessageMetaPill = {
  label: string
  value: string
}

const RESOLUTION_DISPLAY: Record<ImageAssistantResolution, { zh: string; en: string }> = {
  "512": { zh: "标清 512", en: "Standard 512" },
  "1K": { zh: "高清 1K", en: "High 1K" },
  "2K": { zh: "超清 2K", en: "Ultra 2K" },
  "4K": { zh: "超高清 4K", en: "Ultra HD 4K" },
}

type CanvasSelectionBounds = {
  x: number
  y: number
  width: number
  height: number
}

type CanvasAnnotationMetadata = {
  selectionBounds: CanvasSelectionBounds | null
  annotationNotes: string | null
  patchBounds: CanvasSelectionBounds | null
  baseAssetId: string | null
}

type CanvasPatchEditMeta = {
  strategy: "browser_patch_composite"
  baseAssetId: string
  maskAssetId: string | null
  patchBounds: CanvasSelectionBounds
}

type CandidatePreviewImageProps = {
  candidateId: string
  fallbackSrc: string | null
  resolvedSrc?: string | null
  loadPreview: () => Promise<string | null>
  onResolved?: (src: string) => void
  className?: string
}

type PersistedMessageAttachment = {
  id: string
  assetId: string
  src: string | null
  width: number | null
  height: number | null
  baseAssetId?: string | null
  maskAssetId?: string | null
  patchBounds?: CanvasSelectionBounds | null
}

function getRunKindLabel(kind: ImageAssistantRunKind, copy: { generateMode: string; editMode: string }) {
  return kind === "edit" ? copy.editMode : copy.generateMode
}

function getMessageReferenceAssetIds(message: ImageAssistantMessage | null | undefined) {
  const requestPayload =
    message?.request_payload && typeof message.request_payload === "object"
      ? (message.request_payload as Record<string, unknown>)
      : null
  return Array.isArray(requestPayload?.referenceAssetIds)
    ? requestPayload.referenceAssetIds.filter((value): value is string => typeof value === "string")
    : []
}

function getClarificationCarryoverReferenceAssetIds(messages: ImageAssistantMessage[]) {
  let latestAssistant: ImageAssistantMessage | null = null
  let latestUserPrompt: ImageAssistantMessage | null = null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!latestAssistant) {
      if (message.role === "assistant") {
        latestAssistant = message
      }
      continue
    }

    if (message.role === "user" && message.message_type === "prompt") {
      latestUserPrompt = message
      break
    }
  }

  if (!latestAssistant || latestAssistant.message_type !== "note") {
    return []
  }

  return getMessageReferenceAssetIds(latestUserPrompt)
}

function getLatestPromptReferenceAssetIds(messages: ImageAssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "user" || message.message_type !== "prompt") continue
    const ids = getMessageReferenceAssetIds(message)
    if (ids.length) return ids
  }
  return []
}

function mergeReferenceAssetIds(...groups: string[][]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const group of groups) {
    for (const value of group) {
      if (!value || seen.has(value)) continue
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

function hasDirectTurnMaterialized(params: {
  detail: ImageAssistantSessionDetail | null | undefined
  outcome?: string
  followUpMessageId?: string | null
  versionId?: string | null
}) {
  if (!params.detail) return false

  if (params.outcome === "needs_clarification") {
    if (!params.followUpMessageId) return true
    return params.detail.messages.some((message) => message.id === params.followUpMessageId)
  }

  if (!params.versionId) return true
  return params.detail.versions.some((version) => version.id === params.versionId)
}

const DEFAULT_IMAGE_RESOLUTION: ImageAssistantResolution = "2K"
const IMAGE_ASSISTANT_GLOBAL_RESOLUTION_KEY = "image-assistant:composer:resolution"
const INITIAL_MESSAGE_LIMIT = 12
const INITIAL_VERSION_LIMIT = 6
const MESSAGE_PAGE_SIZE = 12
const VERSION_PAGE_SIZE = 6
const IMAGE_ASSISTANT_CLIENT_UPLOAD_TARGET_BYTES = 6 * 1024 * 1024
const IMAGE_ASSISTANT_UPLOAD_ROUTE_MAX_BYTES = 10 * 1024 * 1024
const IMAGE_ASSISTANT_ACCEPTED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])
const IMAGE_ASSISTANT_CANDIDATE_PREVIEW_CACHE_LIMIT = 24
const IMAGE_ASSISTANT_TASK_POLL_INTERVAL_MS = 450
const IMAGE_ASSISTANT_TASK_POLL_MAX_DURATION_MS = (() => {
  const parsed = Number.parseInt(process.env.NEXT_PUBLIC_IMAGE_ASSISTANT_TASK_POLL_MAX_DURATION_MS || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 240_000
  return Math.max(60_000, Math.min(600_000, parsed))
})()
const IMAGE_ASSISTANT_TASK_POLL_MAX_FAILURES = 8
const MIN_LAYER_SIZE = 18
const MIN_LINE_LAYER_HEIGHT = 8

function getImageAssistantSessionResolutionKey(sessionId: string) {
  return `image-assistant:${sessionId}:resolution`
}

function isImageAssistantResolution(value: unknown): value is ImageAssistantResolution {
  return value === "512" || value === "1K" || value === "2K" || value === "4K"
}

function getSessionLoadSections(mode: SessionLoadMode) {
  if (mode === "summary") {
    return { messages: true, versions: false, assets: false, canvas: false }
  }
  if (mode === "content") {
    return { messages: true, versions: true, assets: true, canvas: false }
  }
  if (mode === "canvas") {
    return { messages: false, versions: false, assets: false, canvas: true }
  }
  return { messages: true, versions: true, assets: true, canvas: true }
}

function mergeSessionDetail(
  current: ImageAssistantSessionDetail | null,
  next: ImageAssistantSessionDetail,
  mode: SessionLoadMode,
): ImageAssistantSessionDetail {
  const sections = getSessionLoadSections(mode)
  return {
    session: next.session,
    messages: sections.messages ? next.messages : current?.messages || [],
    versions: sections.versions ? next.versions : current?.versions || [],
    assets: sections.assets ? next.assets : current?.assets || [],
    canvas_document: sections.canvas ? next.canvas_document : current?.canvas_document || null,
    meta: {
      messages_total: sections.messages ? next.meta.messages_total : current?.meta.messages_total || 0,
      messages_loaded: sections.messages ? next.meta.messages_loaded : current?.meta.messages_loaded || 0,
      messages_has_more: sections.messages ? next.meta.messages_has_more : current?.meta.messages_has_more || false,
      messages_next_cursor: sections.messages ? next.meta.messages_next_cursor : current?.meta.messages_next_cursor || null,
      versions_total: sections.versions ? next.meta.versions_total : current?.meta.versions_total || 0,
      versions_loaded: sections.versions ? next.meta.versions_loaded : current?.meta.versions_loaded || 0,
      versions_has_more: sections.versions ? next.meta.versions_has_more : current?.meta.versions_has_more || false,
      versions_next_cursor: sections.versions ? next.meta.versions_next_cursor : current?.meta.versions_next_cursor || null,
    },
  }
}

function cloneCanvasDocument(document: ImageAssistantCanvasDocument) {
  return JSON.parse(JSON.stringify(document)) as ImageAssistantCanvasDocument
}

function isSameCanvasDocument(a: ImageAssistantCanvasDocument, b: ImageAssistantCanvasDocument) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getNearestSizePresetForAspectRatio(aspectRatio: number | null): ImageAssistantSizePreset {
  if (!aspectRatio) return "1:1"

  const presets: Array<{ preset: ImageAssistantSizePreset; ratio: number }> = [
    { preset: "1:1", ratio: 1 },
    { preset: "4:5", ratio: 4 / 5 },
    { preset: "3:4", ratio: 3 / 4 },
    { preset: "4:3", ratio: 4 / 3 },
    { preset: "16:9", ratio: 16 / 9 },
    { preset: "9:16", ratio: 9 / 16 },
  ]

  return presets.reduce((closest, current) => {
    const currentDelta = Math.abs(current.ratio - aspectRatio)
    const closestDelta = Math.abs(closest.ratio - aspectRatio)
    return currentDelta < closestDelta ? current : closest
  }).preset
}

function getNearestSizePresetForDimensions(width: number | null | undefined, height: number | null | undefined): ImageAssistantSizePreset {
  if (!width || !height || width <= 0 || height <= 0) {
    return "1:1"
  }

  return getNearestSizePresetForAspectRatio(width / height)
}

function isPatchCompositeCompatible(params: {
  baseWidth: number
  baseHeight: number
  patchWidth: number
  patchHeight: number
  patchBounds: CanvasSelectionBounds
}) {
  if (
    params.baseWidth <= 0 ||
    params.baseHeight <= 0 ||
    params.patchWidth <= 0 ||
    params.patchHeight <= 0 ||
    params.patchBounds.width <= 0 ||
    params.patchBounds.height <= 0
  ) {
    return false
  }

  return true
}

function isFullFramePatchResult(params: {
  baseWidth: number
  baseHeight: number
  patchWidth: number
  patchHeight: number
}) {
  const widthDelta = Math.abs(params.patchWidth - params.baseWidth)
  const heightDelta = Math.abs(params.patchHeight - params.baseHeight)
  if (
    widthDelta <= Math.max(8, params.baseWidth * 0.12) &&
    heightDelta <= Math.max(8, params.baseHeight * 0.12)
  ) {
    return true
  }

  const generatedAspectRatio = params.patchWidth / params.patchHeight
  const baseAspectRatio = params.baseWidth / params.baseHeight
  return Math.abs(generatedAspectRatio - baseAspectRatio) / baseAspectRatio <= 0.08
}

function getImageContainPlacement(params: {
  sourceWidth: number
  sourceHeight: number
  targetWidth: number
  targetHeight: number
}) {
  if (
    params.sourceWidth <= 0 ||
    params.sourceHeight <= 0 ||
    params.targetWidth <= 0 ||
    params.targetHeight <= 0
  ) {
    return null
  }

  const scale = Math.min(params.targetWidth / params.sourceWidth, params.targetHeight / params.sourceHeight)
  const scaledWidth = params.sourceWidth * scale
  const scaledHeight = params.sourceHeight * scale

  return {
    scale,
    offsetX: (params.targetWidth - scaledWidth) / 2,
    offsetY: (params.targetHeight - scaledHeight) / 2,
  }
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const placement = getImageContainPlacement({
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
  })
  if (!placement) {
    return
  }

  ctx.drawImage(
    image,
    0,
    0,
    sourceWidth,
    sourceHeight,
    placement.offsetX,
    placement.offsetY,
    sourceWidth * placement.scale,
    sourceHeight * placement.scale,
  )
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return
  }

  const sourceAspectRatio = sourceWidth / sourceHeight
  const targetAspectRatio = targetWidth / targetHeight

  if (Math.abs(sourceAspectRatio - targetAspectRatio) <= 0.001) {
    ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)
    return
  }

  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceAspectRatio > targetAspectRatio) {
    sw = sourceHeight * targetAspectRatio
    sx = (sourceWidth - sw) / 2
  } else {
    sh = sourceWidth / targetAspectRatio
    sy = (sourceHeight - sh) / 2
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
}

function drawPatchResultToCanvas(params: {
  patchCtx: CanvasRenderingContext2D
  patchImage: HTMLImageElement
  baseWidth: number
  baseHeight: number
  patchWidth: number
  patchHeight: number
  targetWidth: number
  targetHeight: number
  patchBounds: CanvasSelectionBounds
}) {
  const {
    patchCtx,
    patchImage,
    baseWidth,
    baseHeight,
    patchWidth,
    patchHeight,
    targetWidth,
    targetHeight,
    patchBounds,
  } = params

  const shouldCropFromFullFrame =
    patchWidth > patchBounds.width * 3 &&
    patchHeight > patchBounds.height * 3 &&
    isFullFramePatchResult({
      baseWidth,
      baseHeight,
      patchWidth,
      patchHeight,
    })

  if (shouldCropFromFullFrame) {
    const placement = getImageContainPlacement({
      sourceWidth: baseWidth,
      sourceHeight: baseHeight,
      targetWidth: patchWidth,
      targetHeight: patchHeight,
    })
    if (!placement) {
      return
    }

    const cropX = Math.max(0, Math.min(patchWidth, Math.round(placement.offsetX + patchBounds.x * placement.scale)))
    const cropY = Math.max(0, Math.min(patchHeight, Math.round(placement.offsetY + patchBounds.y * placement.scale)))
    const cropWidth = Math.max(1, Math.min(patchWidth - cropX, Math.round(patchBounds.width * placement.scale)))
    const cropHeight = Math.max(1, Math.min(patchHeight - cropY, Math.round(patchBounds.height * placement.scale)))

    patchCtx.drawImage(patchImage, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)
    return
  }

  drawImageContain(
    patchCtx,
    patchImage,
    patchWidth,
    patchHeight,
    targetWidth,
    targetHeight,
  )
}

function dataUrlToFile(dataUrl: string, filename: string) {
  const [header, payload] = dataUrl.split(",")
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png"
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
  return new File([bytes], filename, { type: mime })
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function guessImageFileExtension(mimeType?: string | null, fallbackUrl?: string | null) {
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "image/png") return "png"

  const fromUrl = /\.(png|jpe?g|webp)(?:$|[?#])/i.exec(fallbackUrl || "")
  if (!fromUrl) return "png"
  return fromUrl[1].toLowerCase() === "jpeg" ? "jpg" : fromUrl[1].toLowerCase()
}

function isAcceptedUploadFile(file: File) {
  return IMAGE_ASSISTANT_ACCEPTED_UPLOAD_TYPES.has(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)
}

function hasFileDragData(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false
  if (dataTransfer.files.length > 0) return true
  return Array.from(dataTransfer.items || []).some((item) => item.kind === "file")
}

function parseMessageBubbleContent(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const body: string[] = []
  const meta: MessageMetaPill[] = []

  for (const line of lines) {
    const match = /^(Requested mode|Output spec|Usage|Orientation|Quality|Ratio)\s*:\s*(.+)$/i.exec(line)
    if (match) {
      meta.push({ label: match[1], value: match[2] })
      continue
    }
    body.push(line)
  }

  return {
    body: body.join("\n"),
    meta,
  }
}

function getBubbleAttachmentGridClass(count: number) {
  if (count <= 1) return "grid-cols-1 max-w-[240px]"
  if (count === 2) return "grid-cols-2 max-w-[360px]"
  if (count <= 4) return "grid-cols-2 max-w-[400px]"
  return "grid-cols-3 max-w-[456px]"
}

function getBubbleAttachmentFigureClass(count: number) {
  if (count <= 1) return "max-h-[260px] min-h-[200px]"
  if (count === 2) return "aspect-[4/5] min-h-[148px]"
  return "aspect-square min-h-[112px]"
}

function normalizeCanvasSelectionBounds(
  bounds: CanvasSelectionBounds,
  canvasWidth: number,
  canvasHeight: number,
): CanvasSelectionBounds | null {
  const left = clamp(Math.round(bounds.x), 0, canvasWidth)
  const top = clamp(Math.round(bounds.y), 0, canvasHeight)
  const right = clamp(Math.round(bounds.x + bounds.width), 0, canvasWidth)
  const bottom = clamp(Math.round(bounds.y + bounds.height), 0, canvasHeight)
  if (right <= left || bottom <= top) return null
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function unionCanvasSelectionBounds(
  current: CanvasSelectionBounds | null,
  next: CanvasSelectionBounds | null,
): CanvasSelectionBounds | null {
  if (!current) return next
  if (!next) return current
  const left = Math.min(current.x, next.x)
  const top = Math.min(current.y, next.y)
  const right = Math.max(current.x + current.width, next.x + next.width)
  const bottom = Math.max(current.y + current.height, next.y + next.height)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function isCanvasPatchEditMeta(value: unknown): value is CanvasPatchEditMeta {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<CanvasPatchEditMeta>
  return (
    candidate.strategy === "browser_patch_composite" &&
    typeof candidate.baseAssetId === "string" &&
    typeof candidate.patchBounds?.x === "number" &&
    typeof candidate.patchBounds?.y === "number" &&
    typeof candidate.patchBounds?.width === "number" &&
    typeof candidate.patchBounds?.height === "number"
  )
}

function getCanvasPatchEditMeta(version: ImageAssistantVersionSummary | null | undefined) {
  const patchEdit = version?.meta && typeof version.meta === "object" ? (version.meta.patch_edit as unknown) : null
  return isCanvasPatchEditMeta(patchEdit) ? patchEdit : null
}

function getCandidatePreviewCacheKey(params: {
  versionId: string
  candidateId: string
  baseAssetId: string
  maskAssetId: string | null
  patchBounds: CanvasSelectionBounds
}) {
  const { versionId, candidateId, baseAssetId, maskAssetId, patchBounds } = params
  return [
    versionId,
    candidateId,
    baseAssetId,
    maskAssetId || "none",
    patchBounds.x,
    patchBounds.y,
    patchBounds.width,
    patchBounds.height,
  ].join(":")
}

function getMessageOrchestration(message: ImageAssistantMessage | null | undefined): ImageAssistantOrchestrationState | null {
  if (!message) return null

  const payloads = [message.response_payload, message.request_payload]
  for (const payload of payloads) {
    const orchestration =
      payload && typeof payload === "object" && (payload as Record<string, unknown>).orchestration
        ? ((payload as Record<string, unknown>).orchestration as ImageAssistantOrchestrationState)
        : null
    if (orchestration && typeof orchestration === "object") {
      return orchestration
    }
  }

  return null
}

function hasBriefPatchInput(brief?: Partial<ImageAssistantBrief> | null) {
  if (!brief) return false

  return Boolean(
    brief.usage_preset ||
    brief.usage_label ||
    brief.orientation ||
    brief.resolution ||
    brief.size_preset ||
    brief.ratio_confirmed ||
    brief.goal ||
    brief.subject ||
    brief.style ||
    brief.composition ||
    brief.constraints,
  )
}

function getMessageAttachmentPreviewCacheKey(params: {
  messageId: string
  assetId: string
  baseAssetId: string | null
  maskAssetId: string | null
  patchBounds: CanvasSelectionBounds | null
}) {
  const { messageId, assetId, baseAssetId, maskAssetId, patchBounds } = params
  return [
    messageId,
    assetId,
    baseAssetId || "none",
    maskAssetId || "none",
    patchBounds?.x ?? "na",
    patchBounds?.y ?? "na",
    patchBounds?.width ?? "na",
    patchBounds?.height ?? "na",
  ].join(":")
}

function CandidatePreviewImage(props: CandidatePreviewImageProps) {
  const { candidateId, fallbackSrc, resolvedSrc, loadPreview, onResolved, className } = props
  const [src, setSrc] = useState(resolvedSrc || fallbackSrc || "")

  useEffect(() => {
    setSrc(resolvedSrc || fallbackSrc || "")
  }, [candidateId, fallbackSrc, resolvedSrc])

  useEffect(() => {
    if (resolvedSrc || !fallbackSrc) {
      return
    }

    let cancelled = false
    void loadPreview()
      .then((nextSrc) => {
        if (!nextSrc || cancelled) return
        setSrc(nextSrc)
        onResolved?.(nextSrc)
      })
      .catch((error) => {
        console.error("image-assistant.candidate-preview-load-failed", error)
      })

    return () => {
      cancelled = true
    }
  }, [candidateId, fallbackSrc, loadPreview, onResolved, resolvedSrc])

  if (!src) return null
  return <img src={src} alt="" loading="lazy" decoding="async" className={className} />
}

function replaceFileExtension(filename: string, nextExtension: string) {
  const safeExtension = nextExtension.startsWith(".") ? nextExtension : `.${nextExtension}`
  return filename.replace(/\.[^.]+$/u, "") + safeExtension
}

function blobToFile(blob: Blob, originalFile: File, nextName?: string) {
  return new File([blob], nextName || originalFile.name, {
    type: blob.type || originalFile.type,
    lastModified: originalFile.lastModified,
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type)
  })
}

function loadImageElementFromFile(file: File) {
  return new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ image, objectUrl })
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("image_load_failed"))
    }
    image.src = objectUrl
  })
}

async function losslessOptimizeUploadFile(file: File) {
  if (typeof window === "undefined") {
    return {
      file,
      width: 0,
      height: 0,
      originalFileSize: file.size,
      uploadFileSize: file.size,
      transportOptimized: false,
    }
  }

  const { image, objectUrl } = await loadImageElementFromFile(file)

  try {
    const width = image.naturalWidth || 0
    const height = image.naturalHeight || 0
    const isLosslessFriendlyType = file.type === "image/png" || file.type === "image/webp"

    if (!isLosslessFriendlyType || file.size <= IMAGE_ASSISTANT_CLIENT_UPLOAD_TARGET_BYTES) {
      if (file.size > IMAGE_ASSISTANT_UPLOAD_ROUTE_MAX_BYTES) {
        throw new Error("file_too_large")
      }
      return {
        file,
        width,
        height,
        originalFileSize: file.size,
        uploadFileSize: file.size,
        transportOptimized: false,
      }
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return {
        file,
        width,
        height,
        originalFileSize: file.size,
        uploadFileSize: file.size,
        transportOptimized: false,
      }
    }

    // Normalize the bitmap to strip transport-heavy metadata while keeping pixels unchanged.
    ctx.drawImage(image, 0, 0, width, height)
    const targetMimeType = file.type === "image/webp" ? "image/webp" : "image/png"
    const optimizedBlob = await canvasToBlob(canvas, targetMimeType)
    if (!optimizedBlob || optimizedBlob.size >= file.size) {
      if (file.size > IMAGE_ASSISTANT_UPLOAD_ROUTE_MAX_BYTES) {
        throw new Error("file_too_large")
      }
      return {
        file,
        width,
        height,
        originalFileSize: file.size,
        uploadFileSize: file.size,
        transportOptimized: false,
      }
    }

    if (optimizedBlob.size > IMAGE_ASSISTANT_UPLOAD_ROUTE_MAX_BYTES) {
      throw new Error("file_too_large")
    }

    return {
      file: blobToFile(
        optimizedBlob,
        file,
        targetMimeType === "image/png" ? replaceFileExtension(file.name, ".png") : replaceFileExtension(file.name, ".webp"),
      ),
      width,
      height,
      originalFileSize: file.size,
      uploadFileSize: optimizedBlob.size,
      transportOptimized: true,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function getPaintLayerSelectionBounds(
  layer: ImageAssistantLayer,
  canvasWidth: number,
  canvasHeight: number,
): Promise<CanvasSelectionBounds | null> {
  if (!layer.asset_url) return null

  try {
    const image = await loadImageForCanvas(layer.asset_url)
    const width = image.naturalWidth || image.width || canvasWidth
    const height = image.naturalHeight || image.height || canvasHeight
    if (!width || !height) return null

    const bitmap = document.createElement("canvas")
    bitmap.width = width
    bitmap.height = height
    const ctx = bitmap.getContext("2d")
    if (!ctx) return null

    ctx.drawImage(image, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)

    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3]
        if (alpha < 16) continue
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }

    if (maxX < minX || maxY < minY) return null

    const scaleX = canvasWidth / width
    const scaleY = canvasHeight / height
    return normalizeCanvasSelectionBounds(
      {
        x: minX * scaleX,
        y: minY * scaleY,
        width: (maxX - minX + 1) * scaleX,
        height: (maxY - minY + 1) * scaleY,
      },
      canvasWidth,
      canvasHeight,
    )
  } catch (error) {
    console.warn("image-assistant.paint-layer.bounds-failed", error)
    return null
  }
}

async function deriveCanvasAnnotationMetadata(
  sourceCanvas: ImageAssistantCanvasDocument,
): Promise<CanvasAnnotationMetadata | null> {
  const annotationLayers = sourceCanvas.layers.filter(
    (layer) => layer.visible && layer.layer_type !== "background" && layer.layer_type !== "image",
  )
  if (!annotationLayers.length) return null

  let selectionBounds: CanvasSelectionBounds | null = null
  const textAnnotations: string[] = []
  let paintLayerCount = 0
  let shapeLayerCount = 0

  for (const layer of annotationLayers) {
    if (layer.layer_type === "paint") {
      paintLayerCount += 1
      selectionBounds = unionCanvasSelectionBounds(
        selectionBounds,
        await getPaintLayerSelectionBounds(layer, sourceCanvas.width, sourceCanvas.height),
      )
      continue
    }

    if (layer.layer_type === "shape") {
      shapeLayerCount += 1
      selectionBounds = unionCanvasSelectionBounds(
        selectionBounds,
        normalizeCanvasSelectionBounds(
          {
            x: layer.transform.x,
            y: layer.transform.y,
            width: layer.transform.width,
            height: layer.transform.height,
          },
          sourceCanvas.width,
          sourceCanvas.height,
        ),
      )
      continue
    }

    if (layer.layer_type === "text") {
      const text = (layer.content?.text || "").trim()
      if (text) {
        textAnnotations.push(text)
      }
      selectionBounds = unionCanvasSelectionBounds(
        selectionBounds,
        normalizeCanvasSelectionBounds(
          {
            x: layer.transform.x,
            y: layer.transform.y,
            width: layer.transform.width,
            height: layer.transform.height,
          },
          sourceCanvas.width,
          sourceCanvas.height,
        ),
      )
    }
  }

  const notes: string[] = []
  if (paintLayerCount || shapeLayerCount) {
    notes.push(
      `Canvas annotations mark the local target region with ${paintLayerCount} paint layer(s) and ${shapeLayerCount} shape layer(s). Prioritize edits inside the marked area.`,
    )
  }
  if (textAnnotations.length) {
    notes.push(`Canvas text annotations: ${textAnnotations.map((text) => `"${text}"`).join("; ")}`)
  }

  if (!selectionBounds && !notes.length) return null

  return {
    selectionBounds,
    annotationNotes: notes.length ? notes.join("\n") : null,
    patchBounds: null,
    baseAssetId: sourceCanvas.background_asset_id || null,
  }
}

async function createCanvasMaskDataUrl(sourceCanvas: ImageAssistantCanvasDocument, cropBounds?: CanvasSelectionBounds | null) {
  const annotationLayers = sourceCanvas.layers.filter(
    (layer) => layer.visible && layer.layer_type !== "background" && layer.layer_type !== "image",
  )
  if (!annotationLayers.length) return null

  const maskCanvas = document.createElement("canvas")
  maskCanvas.width = sourceCanvas.width
  maskCanvas.height = sourceCanvas.height
  const ctx = maskCanvas.getContext("2d")
  if (!ctx) return null

  ctx.fillStyle = "#000000"
  ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
  ctx.fillStyle = "#ffffff"
  ctx.strokeStyle = "#ffffff"
  ctx.lineJoin = "round"
  ctx.lineCap = "round"

  for (const layer of annotationLayers) {
    if (layer.layer_type === "paint" && layer.asset_url) {
      try {
        const image = await loadImageForCanvas(layer.asset_url)
        const width = image.naturalWidth || image.width || maskCanvas.width
        const height = image.naturalHeight || image.height || maskCanvas.height
        const layerCanvas = document.createElement("canvas")
        layerCanvas.width = width
        layerCanvas.height = height
        const layerCtx = layerCanvas.getContext("2d")
        if (!layerCtx) continue

        layerCtx.drawImage(image, 0, 0, width, height)
        const imageData = layerCtx.getImageData(0, 0, width, height)
        for (let index = 0; index < imageData.data.length; index += 4) {
          const alpha = imageData.data[index + 3]
          imageData.data[index] = 255
          imageData.data[index + 1] = 255
          imageData.data[index + 2] = 255
          imageData.data[index + 3] = alpha >= 16 ? 255 : 0
        }
        layerCtx.putImageData(imageData, 0, 0)
        ctx.drawImage(layerCanvas, 0, 0, maskCanvas.width, maskCanvas.height)
      } catch (error) {
        console.warn("image-assistant.mask.paint-layer-failed", error)
      }
      continue
    }

    if (layer.layer_type === "shape") {
      const shapeType = layer.content?.shapeType || "rect"
      const strokeWidth = layer.style?.strokeWidth || 6
      if (shapeType === "line" || shapeType === "arrow") {
        ctx.lineWidth = strokeWidth
        ctx.beginPath()
        ctx.moveTo(layer.transform.x, layer.transform.y + layer.transform.height / 2)
        ctx.lineTo(layer.transform.x + layer.transform.width, layer.transform.y + layer.transform.height / 2)
        ctx.stroke()
      } else if (shapeType === "circle") {
        ctx.beginPath()
        ctx.ellipse(
          layer.transform.x + layer.transform.width / 2,
          layer.transform.y + layer.transform.height / 2,
          layer.transform.width / 2,
          layer.transform.height / 2,
          0,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      } else {
        ctx.fillRect(layer.transform.x, layer.transform.y, layer.transform.width, layer.transform.height)
      }
      continue
    }

    if (layer.layer_type === "text") {
      const fontSize = layer.style?.fontSize || 42
      ctx.font = `900 ${fontSize}px sans-serif`
      ctx.textBaseline = "top"
      const text = layer.content?.text || ""
      const lines = text.split(/\r?\n/).filter(Boolean)
      lines.forEach((line, index) => {
        ctx.fillText(line, layer.transform.x, layer.transform.y + index * (fontSize + 8))
      })
    }
  }

  if (!cropBounds) {
    return maskCanvas.toDataURL("image/png")
  }

  const croppedCanvas = document.createElement("canvas")
  croppedCanvas.width = cropBounds.width
  croppedCanvas.height = cropBounds.height
  const croppedCtx = croppedCanvas.getContext("2d")
  if (!croppedCtx) return null
  croppedCtx.drawImage(
    maskCanvas,
    cropBounds.x,
    cropBounds.y,
    cropBounds.width,
    cropBounds.height,
    0,
    0,
    cropBounds.width,
    cropBounds.height,
  )
  return croppedCanvas.toDataURL("image/png")
}

function getCanvasSnapshotSignature(document: ImageAssistantCanvasDocument) {
  return JSON.stringify({
    width: document.width,
    height: document.height,
    backgroundAssetId: document.background_asset_id,
    layers: document.layers,
  })
}

function createPaintLayer(width: number, height: number, copy: ImageAssistantCopy): ImageAssistantLayer {
  return {
    id: `local-paint-${Date.now()}`,
    layer_type: "paint",
    name: copy.paintLayer,
    z_index: Date.now(),
    visible: true,
    locked: false,
    transform: { x: 0, y: 0, width, height, rotation: 0 },
    style: { opacity: 1, stroke: "#111827", strokeWidth: 18 },
    content: null,
    asset_id: null,
    asset_url: null,
  }
}

function createCanvasFromAsset(asset: ImageAssistantAsset, copy: ImageAssistantCopy): ImageAssistantCanvasDocument {
  const width = asset.width || 1080
  const height = asset.height || 1080

  return {
    id: "",
    session_id: asset.session_id || "",
    base_version_id: null,
    width,
    height,
    background_asset_id: asset.id,
    revision: 0,
    status: "draft",
    updated_at: Math.floor(Date.now() / 1000),
    layers: [
      {
        id: `bg-${asset.id}`,
        layer_type: "background",
        name: copy.backgroundLayer,
        z_index: 0,
        visible: true,
        locked: true,
        transform: { x: 0, y: 0, width, height, rotation: 0 },
        style: { opacity: 1 },
        content: null,
        asset_id: asset.id,
        asset_url: asset.url,
      },
    ],
  }
}

async function ensureAssetDimensions(asset: ImageAssistantAsset) {
  if ((asset.width && asset.height) || !asset.url) {
    return asset
  }

  try {
    const image = await loadImageForCanvas(asset.url)
    const width = image.naturalWidth || image.width || asset.width || null
    const height = image.naturalHeight || image.height || asset.height || null
    if (!width || !height) {
      return asset
    }

    return {
      ...asset,
      width,
      height,
    }
  } catch (error) {
    console.warn("image-assistant.asset.dimensions-failed", {
      assetId: asset.id,
      message: error instanceof Error ? error.message : String(error),
    })
    return asset
  }
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const rawError = typeof json?.error === "string" ? json.error : ""
    const normalizedError =
      rawError === "image_assistant_data_temporarily_unavailable" || /^Failed query:/i.test(rawError)
        ? "image_assistant_data_temporarily_unavailable"
        : rawError || `http_${response.status}`
    throw new Error(normalizedError)
  }
  return json
}

function resolveImageAssistantFetchUrl(url: string) {
  if (/^(data:|blob:|\/)/i.test(url)) return url
  return `/api/image-assistant/assets/proxy?url=${encodeURIComponent(url)}`
}

async function persistCanvasDocument(input: {
  sessionId: string
  canvasDocumentId: string | null
  baseVersionId: string | null
  width: number
  height: number
  backgroundAssetId: string | null
  revision: number
  layers: ImageAssistantLayer[]
}) {
  return requestJson("/api/image-assistant/canvas", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

async function wait(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getNextLayerZIndex(layers: ImageAssistantLayer[]) {
  return layers.reduce((max, layer) => Math.max(max, layer.z_index), 0) + 1
}

function isEditableLayer(layer: ImageAssistantLayer) {
  return layer.layer_type !== "background"
}

function formatMessageRoleLabel(role: "user" | "assistant" | "system", copy: ImageAssistantCopy) {
  if (role === "assistant") return copy.assistantName
  if (role === "system") return copy.system
  return copy.user
}

function formatPendingAttachmentLabel(attachment: PendingAttachment, copy: ImageAssistantCopy) {
  return attachment.source === "canvas" ? copy.canvasResult : copy.pendingReference
}

function releaseAttachmentPreviewUrl(url: string) {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url)
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && (error.name === "AbortError" || error.message === "request_aborted")
}

function formatImageAssistantErrorMessage(message: string, copy: ImageAssistantCopy) {
  const copyMap = copy as ImageAssistantCopy & {
    resourceExhausted?: string
    rateLimited?: string
    requestFailedPrefix?: string
    unknownError?: string
    fileTooLarge?: string
    unsupportedFileType?: string
  }
  if (message === "image_assistant_resource_exhausted") {
    return copyMap.resourceExhausted ?? "Image generation quota is currently exhausted. Please try again later."
  }
  if (message === "rate_limited") {
    return copyMap.rateLimited ?? "Too many requests. Please try again later."
  }
  if (message === "image_assistant_data_temporarily_unavailable") {
    return "Image assistant data is temporarily unavailable. Please retry in a moment."
  }
  if (message === "image_assistant_task_poll_timeout") {
    return "Task status polling timed out. Please refresh the session and retry."
  }
  if (message === "image_assistant_task_status_unavailable") {
    return "Task status is temporarily unavailable. Please refresh and try again."
  }
  if (message === "image_assistant_task_timeout") {
    return "Image generation task timed out on the server. Please retry with fewer or smaller reference images."
  }
  if (message === "cancelled" || message === "rejected") {
    return "Task was cancelled before completion."
  }
  if (message === "file_too_large") {
    return copyMap.fileTooLarge ?? "One of the images is still too large after local optimization."
  }
  if (message === "unsupported_file_type") {
    return copyMap.unsupportedFileType ?? "Unsupported image type. Please upload PNG, JPEG, or WEBP."
  }
  if (
    message === "upload_presign_failed" ||
    message === "upload_complete_failed" ||
    message === "uploaded_file_not_found" ||
    message === "invalid_storage_key" ||
    message === "image_assistant_r2_config_missing" ||
    message === "image_assistant_generated_upload_failed" ||
    /^direct_upload_failed(?::\d+)?$/i.test(message)
  ) {
    return "Image upload to storage failed. Check the R2 upload configuration and bucket CORS settings."
  }
  if (!message) {
    return copyMap.unknownError ?? "Unknown error"
  }
  return `${copyMap.requestFailedPrefix ?? "Request failed: "}${message}`
}

function createShapeLayer(
  canvas: ImageAssistantCanvasDocument,
  color: string,
  shapeType: "rect" | "line",
  copy: ImageAssistantCopy,
): ImageAssistantLayer {
  const width = shapeType === "line" ? canvas.width * 0.34 : canvas.width * 0.28
  const height = shapeType === "line" ? 8 : canvas.height * 0.14

  return {
    id: `local-shape-${Date.now()}`,
    layer_type: "shape",
    name: shapeType === "line" ? copy.lineShape : copy.shape,
    z_index: getNextLayerZIndex(canvas.layers),
    visible: true,
    locked: false,
    transform: {
      x: Math.max(32, (canvas.width - width) / 2),
      y: Math.max(32, (canvas.height - height) / 2),
      width,
      height,
      rotation: 0,
    },
    style:
      shapeType === "line"
        ? { stroke: color, strokeWidth: 6, opacity: 1 }
        : { fill: `${color}20`, stroke: color, strokeWidth: 3, opacity: 1, borderRadius: 24 },
    content: { shapeType },
    asset_id: null,
    asset_url: null,
  }
}

function createTextLayer(canvas: ImageAssistantCanvasDocument, color: string, copy: ImageAssistantCopy): ImageAssistantLayer {
  return {
    id: `local-text-${Date.now()}`,
    layer_type: "text",
    name: copy.textLayer,
    z_index: getNextLayerZIndex(canvas.layers),
    visible: true,
    locked: false,
    transform: {
      x: Math.max(36, canvas.width * 0.1),
      y: Math.max(36, canvas.height * 0.14),
      width: canvas.width * 0.52,
      height: 96,
      rotation: 0,
    },
    style: { color, fill: color, fontSize: Math.max(36, Math.round(canvas.width * 0.05)), opacity: 1 },
    content: { text: copy.defaultText },
    asset_id: null,
    asset_url: null,
  }
}

const PROMPT_PRESETS: PromptPreset[] = [
  {
    label: "E-commerce hero",
    prompt: "Create a clean 4:5 e-commerce hero image, keep the product realistic and centered, reserve safe space for title and price badge, and do not render text directly.",
  },
  {
    label: "Campaign KV",
    prompt: "Turn current materials into a branded campaign key visual for a homepage hero banner with clear subject focus and space for headline plus CTA.",
  },
  {
    label: "Social cover",
    prompt: "Generate a social cover image with strong focal point, simplified background, balanced color palette, and safe blank area for overlay text.",
  },
  {
    label: "Summer promo",
    prompt: "Refine this image into a bright summer promotion visual while preserving product authenticity and leaving clear spaces for title and action areas.",
  },
  {
    label: "Premium minimal",
    prompt: "Refine the composition into a premium minimal brand style by reducing clutter, unifying texture and color, and enhancing whitespace quality.",
  },
]

export function ImageAssistantWorkspace({ initialSessionId }: { initialSessionId: string | null }) {
  const queryClient = useQueryClient()
  const { messages: i18n } = useI18n()
  const imageCopy = i18n.imageAssistant
  const isEnglish = imageCopy.assistantName === "Image design assistant"
  const extraCopy = useMemo(
    () => ({
      uploadLimit: `Up to ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} reference images can be attached in one request.`,
      uploadOptimization: "Large PNG/WEBP files are transport-optimized losslessly on-device before upload.",
      optimizedBadge: "Lossless optimized",
      generateMode: "Text-to-image",
      editMode: "Image-guided edit",
      waitingReply: "Waiting for image response...",
      cancelledReply: "This request was cancelled before completion.",
      cancelWaiting: "Cancel wait",
      skillBadge: "Skill",
      toolsBadge: "Tools",
      turnBadge: "Turn",
      additionalNotes: "Additional notes",
      additionalNotesPlaceholder: "Optional details: brand keywords, must-keep elements, text-safe areas, material cues...",
      missingBriefPrefix: "Still need: ",
      pendingImagesLabel: "Attached references",
      attachmentLimitReached: `You can attach up to ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} images in one request.`,
      dragDropHint: "Drop images here to attach them to the conversation.",
      dragDropActiveHint: `Release to attach up to ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} images.`,
      previewImage: isEnglish ? "Preview image" : "预览图片",
      exportImage: isEnglish ? "Export image" : "导出图片",
      editImage: isEnglish ? "Open refine editor" : "打开精修编辑器",
      exportAction: isEnglish ? "Export" : "导出",
      editAction: isEnglish ? "Refine" : "精修",
      addAsAttachment: isEnglish ? "Reference" : "引用",
      addCurrentCanvas: "Add current image to attachments",
      clickImageToPreview: isEnglish ? "Click the image to preview it." : "点击图片仅预览。",
      candidateActionsHint: isEnglish
        ? "Preview by clicking the image. The right-side actions are export, refine, and reference."
        : "点击图片可预览，右侧按钮用于导出、精修和引用。",
    }),
    [isEnglish],
  )
  const chatComposerCopy = useMemo(
    () => ({
      dialogueGuidance:
        "Describe what you want in chat. The assistant will collect the remaining design requirements through follow-up questions before generating.",
      imageOnlyPromptFallback: "Use the uploaded reference images and ask the next design question.",
    }),
    [],
  )
  const promptPresets = useMemo(() => [...imageCopy.promptPresets] as PromptPreset[], [imageCopy.promptPresets])
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId)
  const [detail, setDetail] = useState<ImageAssistantSessionDetail | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [mode, setMode] = useState<"chat" | "canvas">("chat")
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select")
  const [paintPreview, setPaintPreview] = useState<PaintPreview | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null)
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null)
  const [brushColor, setBrushColor] = useState("#2563eb")
  const [prompt, setPrompt] = useState("")
  const [sizePreset, setSizePreset] = useState<ImageAssistantSizePreset>("4:5")
  const [resolution, setResolution] = useState<ImageAssistantResolution>(DEFAULT_IMAGE_RESOLUTION)
  const [isBusy, setIsBusy] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [, setIsLoadingSession] = useState(false)
  const [, setIsHydratingSession] = useState(false)
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT)
  const [versionLimit, setVersionLimit] = useState(INITIAL_VERSION_LIMIT)
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [canvas, setCanvas] = useState<ImageAssistantCanvasDocument | null>(null)
  const [undoStack, setUndoStack] = useState<ImageAssistantCanvasDocument[]>([])
  const [redoStack, setRedoStack] = useState<ImageAssistantCanvasDocument[]>([])
  const [, setIsSavingCanvas] = useState(false)
  const [dirtyCanvas, setDirtyCanvas] = useState(false)
  const [jobError, setJobError] = useState<string | null>(null)
  const [pendingTurn, setPendingTurn] = useState<PendingConversationTurn | null>(() =>
    getStoredPendingTurn(initialSessionId),
  )
  const [pendingTaskRefreshKey, setPendingTaskRefreshKey] = useState(0)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [zoomLevel, setZoomLevel] = useState<"fit" | number>("fit")
  const [isComposerDragActive, setIsComposerDragActive] = useState(false)
  const [candidatePreviewUrls, setCandidatePreviewUrls] = useState<Record<string, string>>({})
  const [messageAttachmentPreviewUrls, setMessageAttachmentPreviewUrls] = useState<Record<string, string>>({})
  const [previewImage, setPreviewImage] = useState<PreviewImageState | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasStageRef = useRef<HTMLDivElement | null>(null)
  const paintStrokeRef = useRef<PaintPreview | null>(null)
  const shapeDraftRef = useRef<ShapeDraft | null>(null)
  const layerDragRef = useRef<LayerDragState | null>(null)
  const layerResizeRef = useRef<LayerResizeState | null>(null)
  const creatingSessionRef = useRef<Promise<string> | null>(null)
  const detailRequestIdRef = useRef(0)
  const modeRef = useRef(mode)
  const detailRef = useRef(detail)
  const messageLimitRef = useRef(messageLimit)
  const versionLimitRef = useRef(versionLimit)
  const isClosingEditorRef = useRef(false)
  const canvasRef = useRef(canvas)
  const scaleRef = useRef(1)
  const pointerMoveRafRef = useRef<number | null>(null)
  const pendingPointerClientRef = useRef<{ x: number; y: number } | null>(null)
  const paintPreviewRafRef = useRef<number | null>(null)
  const pendingTextCaretClientRef = useRef<{ x: number; y: number } | null>(null)
  const attachmentPreviewUrlsRef = useRef<Set<string>>(new Set())
  const attachmentUploadPromisesRef = useRef<Map<string, Promise<{ assetId: string; maskAssetId: string | null }>>>(new Map())
  const composerDragDepthRef = useRef(0)
  const candidatePreviewComposeCacheRef = useRef<Map<string, Promise<string | null>>>(new Map())
  const messageAttachmentPreviewComposeCacheRef = useRef<Map<string, Promise<string | null>>>(new Map())
  const messageHistoryRestoreRef = useRef<{ height: number; top: number } | null>(null)
  const shouldScrollMessagesToBottomRef = useRef(false)
  const previousDisplayMessageCountRef = useRef(0)
  const canvasSnapshotCacheRef = useRef<{
    signature: string
    dataUrl: string
    assetId: string | null
    width: number
    height: number
  } | null>(null)
  const restoredResolutionSessionRef = useRef<string | null>(null)
  const activeJobAbortRef = useRef<AbortController | null>(null)
  const deferredRouteSessionIdRef = useRef<string | null>(null)
  const previousPendingTurnIdRef = useRef<string | null>(pendingTurn?.id || null)
  const previousPendingTurnAttachmentsRef = useRef<PendingAttachment[]>(pendingTurn?.attachments || [])

  const resetCanvasHistory = useCallback(() => {
    setUndoStack([])
    setRedoStack([])
  }, [])

  const applyCanvasChange = useCallback(
    (
      updater: (current: ImageAssistantCanvasDocument) => ImageAssistantCanvasDocument,
      options?: { recordHistory?: boolean; markDirty?: boolean },
    ) => {
      const currentCanvas = canvasRef.current
      if (!currentCanvas) return

      const previousSnapshot = cloneCanvasDocument(currentCanvas)
      const nextSnapshot = updater(cloneCanvasDocument(currentCanvas))
      if (isSameCanvasDocument(previousSnapshot, nextSnapshot)) return

      canvasRef.current = nextSnapshot
      setCanvas(nextSnapshot)
      if (options?.recordHistory !== false) {
        setUndoStack((current) => [...current.slice(-39), previousSnapshot])
        setRedoStack([])
      }
      if (options?.markDirty !== false) {
        setDirtyCanvas(true)
      }
    },
    [],
  )

  const refreshDetail = useCallback(
    async (
      targetSessionId: string,
      options?: {
        mode?: SessionLoadMode
        preserveCanvas?: boolean
        keepEditorOpen?: boolean
        background?: boolean
        force?: boolean
        messageLimit?: number
        versionLimit?: number
      },
    ) => {
      const loadMode = options?.mode || "full"
      const sections = getSessionLoadSections(loadMode)
      const effectiveMessageLimit = options?.messageLimit ?? messageLimitRef.current
      const effectiveVersionLimit = options?.versionLimit ?? versionLimitRef.current
      if (options?.background) {
        setIsHydratingSession(true)
      } else if (loadMode !== "canvas") {
        setIsLoadingSession(true)
      }

      const requestId = ++detailRequestIdRef.current
      try {
        const queryOptions = {
          queryKey: getImageAssistantDetailQueryKey(targetSessionId, {
            mode: loadMode,
            messageLimit: sections.messages && loadMode !== "full" ? effectiveMessageLimit : undefined,
            versionLimit: sections.versions && loadMode !== "full" ? effectiveVersionLimit : undefined,
          }),
          queryFn: () => getImageAssistantSessionDetail(targetSessionId, {
            mode: loadMode,
            messageLimit: sections.messages && loadMode !== "full" ? effectiveMessageLimit : undefined,
            versionLimit: sections.versions && loadMode !== "full" ? effectiveVersionLimit : undefined,
          }),
        }
        const shouldForceFetch = Boolean(options?.force)
        const nextDetail = shouldForceFetch
          ? await fetchWorkspaceQueryData(queryClient, queryOptions)
          : options?.background
            ? await fetchWorkspaceQueryData(queryClient, queryOptions)
            : await ensureWorkspaceQueryData(queryClient, queryOptions)
        const shouldPreserveCanvas = Boolean(options?.preserveCanvas && canvasRef.current)

        if (requestId !== detailRequestIdRef.current) {
          return nextDetail
        }

        const mergedDetail = mergeSessionDetail(detailRef.current, nextDetail, loadMode)
        setDetail(mergedDetail)

        if (sections.versions) {
          setSelectedVersionId((current) => {
            if (current && mergedDetail.versions.some((version) => version.id === current)) {
              return current
            }
            return mergedDetail.session.current_version_id || mergedDetail.versions[0]?.id || null
          })
        }

        if (sections.canvas) {
          if (nextDetail.canvas_document) {
            if (!shouldPreserveCanvas) {
              resetCanvasHistory()
              canvasRef.current = nextDetail.canvas_document
              setCanvas(nextDetail.canvas_document)
            }
          } else if (!shouldPreserveCanvas) {
            resetCanvasHistory()
            canvasRef.current = null
            setCanvas(null)
          }
        }

        if (options?.keepEditorOpen) {
          setMode("canvas")
        } else if (sections.canvas && !shouldPreserveCanvas) {
          setMode("chat")
        }

        return mergedDetail
      } finally {
        if (options?.background) {
          setIsHydratingSession(false)
        } else if (loadMode !== "canvas") {
          setIsLoadingSession(false)
        }
      }
    },
    [queryClient, resetCanvasHistory],
  )

  const syncSessionRoute = useCallback((targetSessionId: string) => {
    if (typeof window === "undefined") return
    const nextPath = `/dashboard/image-assistant/${targetSessionId}`
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath === nextPath) {
      return
    }
    window.history.replaceState(window.history.state, "", nextPath)
  }, [])

  const fitScale = useMemo(() => {
    if (!canvas) return 1
    if (!viewportSize.width || !viewportSize.height) {
      return Math.min(1360 / canvas.width, 820 / canvas.height, 1)
    }
    const availableWidth = Math.max(viewportSize.width - 120, 320)
    const availableHeight = Math.max(viewportSize.height - 148, 320)
    return Math.min(availableWidth / canvas.width, availableHeight / canvas.height, 1)
  }, [canvas, viewportSize.height, viewportSize.width])

  const scale = useMemo(() => {
    if (!canvas) return 1
    if (zoomLevel === "fit") {
      return fitScale
    }
    return clamp(zoomLevel, 0.2, 4)
  }, [canvas, fitScale, zoomLevel])

  const zoomLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale])
  const sortedCanvasLayers = useMemo(
    () => (canvas ? [...canvas.layers].sort((a, b) => a.z_index - b.z_index) : []),
    [canvas],
  )
  const paintPreviewPoints = useMemo(
    () => (paintPreview ? paintPreview.points.map((point) => `${point.x},${point.y}`).join(" ") : ""),
    [paintPreview],
  )

  const composerAttachmentCount = pendingAttachments.length
  const hasCanvasEditAttachment = pendingAttachments.some((attachment) => attachment.source === "canvas")
  const primaryRunKind: ImageAssistantRunKind = composerAttachmentCount > 0 ? "edit" : "generate"
  const composerModeLabel = getRunKindLabel(primaryRunKind, extraCopy)
  const latestOrchestration = useMemo(() => {
    const messages = detail?.messages || []
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const orchestration = getMessageOrchestration(messages[index])
      if (orchestration) {
        return orchestration
      }
    }
    return null
  }, [detail?.messages])
  const latestAssistantMessage = useMemo(() => {
    const messages = detail?.messages || []
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role === "assistant") {
        return message
      }
    }
    return null
  }, [detail?.messages])
  const latestAssistantPromptQuestionId = useMemo(() => {
    if (!latestAssistantMessage) return null
    const orchestration = getMessageOrchestration(latestAssistantMessage)
    return orchestration?.prompt_questions?.[0]?.id || null
  }, [latestAssistantMessage])
  const latestPromptQuestionMessageId = useMemo(() => {
    if (!latestAssistantMessage || !latestAssistantPromptQuestionId) return null
    return latestAssistantMessage.id
  }, [latestAssistantMessage, latestAssistantPromptQuestionId])
  const currentUsageDisplay = latestOrchestration?.brief.usage_label || "Use + ratio pending"
  const currentOrientationDisplay = latestOrchestration?.brief.orientation
    ? latestOrchestration.brief.orientation === "landscape"
      ? "Landscape"
      : "Portrait"
    : "Direction pending"
  const currentResolutionDisplay = latestOrchestration?.brief.resolution
    ? isEnglish
      ? RESOLUTION_DISPLAY[latestOrchestration.brief.resolution].en
      : RESOLUTION_DISPLAY[latestOrchestration.brief.resolution].zh
    : isEnglish
      ? RESOLUTION_DISPLAY[resolution].en
      : RESOLUTION_DISPLAY[resolution].zh
  const clarificationCarryoverReferenceAssetIds = useMemo(
    () => getClarificationCarryoverReferenceAssetIds(detail?.messages || []),
    [detail?.messages],
  )
  const latestPromptReferenceAssetIds = useMemo(
    () => getLatestPromptReferenceAssetIds(detail?.messages || []),
    [detail?.messages],
  )
  const versionById = useMemo(
    () => new Map((detail?.versions || []).map((version) => [version.id, version])),
    [detail?.versions],
  )

  const currentVersion = useMemo(
    () => detail?.versions.find((item) => item.id === selectedVersionId) || detail?.versions[0] || null,
    [detail?.versions, selectedVersionId],
  )
  const implicitVersionReferenceAssetIds = useMemo(
    () =>
      getFallbackReferenceAssetIdsFromVersions({
        versions: detail?.versions || [],
        selectedVersionId: selectedVersionId || null,
        currentVersionId: detail?.session.current_version_id || null,
      }),
    [detail?.session.current_version_id, detail?.versions, selectedVersionId],
  )
  const carryoverReferenceAssetIds = useMemo(
    () =>
      mergeReferenceAssetIds(
        clarificationCarryoverReferenceAssetIds,
        latestPromptReferenceAssetIds,
        implicitVersionReferenceAssetIds,
      ).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS),
    [clarificationCarryoverReferenceAssetIds, implicitVersionReferenceAssetIds, latestPromptReferenceAssetIds],
  )
  const resolveCarryoverReferenceAssetIds = useCallback(
    (targetSessionId?: string | null) => {
      const effectiveSessionId = targetSessionId || sessionId
      const cache = getImageAssistantSessionContentCache(effectiveSessionId)
      const cachedIds = cache ? getLatestPromptReferenceAssetIds(cache.detail.messages || []) : []
      return mergeReferenceAssetIds(
        carryoverReferenceAssetIds,
        getLatestPromptReferenceAssetIds(detailRef.current?.messages || []),
        cachedIds,
      ).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS)
    },
    [carryoverReferenceAssetIds, sessionId],
  )

  const hasMoreMessages = Boolean(detail?.meta.messages_has_more)
  const hasMoreVersions = Boolean(detail?.meta.versions_has_more)

  const selectedLayer = useMemo(
    () => canvas?.layers.find((layer) => layer.id === selectedLayerId) || null,
    [canvas?.layers, selectedLayerId],
  )
  const canAdjustSelectedLayerColor = Boolean(selectedLayer && isEditableLayer(selectedLayer))

  useEffect(() => {
    if (!editingTextLayerId) return
    const editingLayer = canvas?.layers.find((layer) => layer.id === editingTextLayerId) || null
    if (!editingLayer || editingLayer.layer_type !== "text" || selectedLayerId !== editingTextLayerId) {
      setEditingTextLayerId(null)
    }
  }, [canvas?.layers, editingTextLayerId, selectedLayerId])

  useEffect(() => {
    if (!editingTextLayerId) return
    const raf = window.requestAnimationFrame(() => {
      const target = canvasStageRef.current?.querySelector(`[data-text-layer-editor="${editingTextLayerId}"]`) as HTMLDivElement | null
      if (!target) return
      target.focus()
      const selection = window.getSelection()
      if (!selection) return

      const pendingCaret = pendingTextCaretClientRef.current
      pendingTextCaretClientRef.current = null
      if (pendingCaret) {
        const docAny = document as Document & {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
          caretRangeFromPoint?: (x: number, y: number) => Range | null
        }

        if (typeof docAny.caretPositionFromPoint === "function") {
          const caretPos = docAny.caretPositionFromPoint(pendingCaret.x, pendingCaret.y)
          if (caretPos && target.contains(caretPos.offsetNode)) {
            const range = document.createRange()
            range.setStart(caretPos.offsetNode, caretPos.offset)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
            return
          }
        }

        if (typeof docAny.caretRangeFromPoint === "function") {
          const range = docAny.caretRangeFromPoint(pendingCaret.x, pendingCaret.y)
          if (range && target.contains(range.startContainer)) {
            selection.removeAllRanges()
            selection.addRange(range)
            return
          }
        }
      }

      const fallbackRange = document.createRange()
      fallbackRange.selectNodeContents(target)
      fallbackRange.collapse(false)
      selection.removeAllRanges()
      selection.addRange(fallbackRange)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [editingTextLayerId])

  const touchCandidatePreviewComposeCache = useCallback((cacheKey: string, value: Promise<string | null>) => {
    const cache = candidatePreviewComposeCacheRef.current
    if (cache.has(cacheKey)) {
      cache.delete(cacheKey)
    }
    cache.set(cacheKey, value)

    while (cache.size > IMAGE_ASSISTANT_CANDIDATE_PREVIEW_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value
      if (!oldestKey) break
      cache.delete(oldestKey)
    }
  }, [])

  const composeCandidatePreview = useCallback(
    async (version: ImageAssistantVersionSummary, candidateId: string) => {
      const candidate = version.candidates.find((item) => item.id === candidateId) || null
      const patchEdit = getCanvasPatchEditMeta(version)
      if (!candidate?.url || !patchEdit || !detail?.assets?.length) {
        return null
      }

      const baseAsset = detail.assets.find((asset) => asset.id === patchEdit.baseAssetId)
      const maskAsset = patchEdit.maskAssetId ? detail.assets.find((asset) => asset.id === patchEdit.maskAssetId) : null
      if (!baseAsset?.url) {
        return null
      }
      const baseAssetUrl = baseAsset.url
      const candidateUrl = candidate.url

      const cacheKey = getCandidatePreviewCacheKey({
        versionId: version.id,
        candidateId,
        baseAssetId: baseAsset.id,
        maskAssetId: maskAsset?.id || null,
        patchBounds: patchEdit.patchBounds,
      })
      const cachedPreview = candidatePreviewComposeCacheRef.current.get(cacheKey)
      if (cachedPreview) {
        touchCandidatePreviewComposeCache(cacheKey, cachedPreview)
        return cachedPreview
      }

      const nextPreviewPromise = (async () => {
        const baseImage = await loadImageForCanvas(baseAssetUrl)
        const patchImage = await loadImageForCanvas(candidateUrl)
        const baseWidth = baseImage.naturalWidth || baseImage.width
        const baseHeight = baseImage.naturalHeight || baseImage.height
        const patchWidth = patchImage.naturalWidth || patchImage.width
        const patchHeight = patchImage.naturalHeight || patchImage.height
        if (
          !isPatchCompositeCompatible({
            baseWidth,
            baseHeight,
            patchWidth,
            patchHeight,
            patchBounds: patchEdit.patchBounds,
          })
        ) {
          console.warn("image-assistant.patch-composite.skipped", {
            versionId: version.id,
            candidateId,
            baseWidth,
            baseHeight,
            patchWidth,
            patchHeight,
            patchBounds: patchEdit.patchBounds,
          })
          return null
        }

        const compositeCanvas = document.createElement("canvas")
        compositeCanvas.width = baseWidth || patchEdit.patchBounds.x + patchEdit.patchBounds.width
        compositeCanvas.height = baseHeight || patchEdit.patchBounds.y + patchEdit.patchBounds.height
        const compositeCtx = compositeCanvas.getContext("2d")
        if (!compositeCtx) {
          return null
        }

        compositeCtx.drawImage(baseImage, 0, 0, compositeCanvas.width, compositeCanvas.height)

        const patchCanvas = document.createElement("canvas")
        patchCanvas.width = patchEdit.patchBounds.width
        patchCanvas.height = patchEdit.patchBounds.height
        const patchCtx = patchCanvas.getContext("2d")
        if (!patchCtx) {
          return null
        }
        drawPatchResultToCanvas({
          patchCtx,
          patchImage,
          baseWidth,
          baseHeight,
          patchWidth,
          patchHeight,
          targetWidth: patchCanvas.width,
          targetHeight: patchCanvas.height,
          patchBounds: patchEdit.patchBounds,
        })

        if (maskAsset?.url) {
          const maskImage = await loadImageForCanvas(maskAsset.url)
          patchCtx.globalCompositeOperation = "destination-in"
          drawImageCover(
            patchCtx,
            maskImage,
            maskImage.naturalWidth || maskImage.width,
            maskImage.naturalHeight || maskImage.height,
            patchCanvas.width,
            patchCanvas.height,
          )
          patchCtx.globalCompositeOperation = "source-over"
        }

        compositeCtx.drawImage(
          patchCanvas,
          patchEdit.patchBounds.x,
          patchEdit.patchBounds.y,
          patchEdit.patchBounds.width,
          patchEdit.patchBounds.height,
        )

        return compositeCanvas.toDataURL("image/png")
      })().catch((error) => {
        candidatePreviewComposeCacheRef.current.delete(cacheKey)
        throw error
      })

      touchCandidatePreviewComposeCache(cacheKey, nextPreviewPromise)
      return nextPreviewPromise
    },
    [detail?.assets, touchCandidatePreviewComposeCache],
  )

  const touchMessageAttachmentPreviewComposeCache = useCallback((cacheKey: string, value: Promise<string | null>) => {
    const cache = messageAttachmentPreviewComposeCacheRef.current
    if (cache.has(cacheKey)) {
      cache.delete(cacheKey)
    }
    cache.set(cacheKey, value)

    while (cache.size > IMAGE_ASSISTANT_CANDIDATE_PREVIEW_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value
      if (!oldestKey) break
      cache.delete(oldestKey)
    }
  }, [])

  const composeMessageAttachmentPreview = useCallback(
    async (messageId: string, attachment: PersistedMessageAttachment) => {
      if (!detail?.assets?.length || !attachment.baseAssetId || !attachment.patchBounds || !attachment.src) {
        return attachment.src
      }
      const attachmentSrc = attachment.src
      const patchBounds = attachment.patchBounds

      const baseAsset = detail.assets.find((asset) => asset.id === attachment.baseAssetId) || null
      const maskAsset =
        attachment.maskAssetId ? detail.assets.find((asset) => asset.id === attachment.maskAssetId) || null : null
      if (!baseAsset?.url) {
        return attachment.src
      }

      const cacheKey = getMessageAttachmentPreviewCacheKey({
        messageId,
        assetId: attachment.assetId,
        baseAssetId: attachment.baseAssetId,
        maskAssetId: attachment.maskAssetId || null,
        patchBounds: attachment.patchBounds,
      })
      const cachedPreview = messageAttachmentPreviewComposeCacheRef.current.get(cacheKey)
      if (cachedPreview) {
        touchMessageAttachmentPreviewComposeCache(cacheKey, cachedPreview)
        return cachedPreview
      }

      const nextPreviewPromise = (async () => {
        const baseImage = await loadImageForCanvas(baseAsset.url!)
        const patchImage = await loadImageForCanvas(attachmentSrc)
        const baseWidth = baseImage.naturalWidth || baseImage.width
        const baseHeight = baseImage.naturalHeight || baseImage.height
        const patchWidth = patchImage.naturalWidth || patchImage.width
        const patchHeight = patchImage.naturalHeight || patchImage.height
        if (
          !isPatchCompositeCompatible({
            baseWidth,
            baseHeight,
            patchWidth,
            patchHeight,
            patchBounds,
          })
        ) {
          return attachment.src
        }

        const compositeCanvas = document.createElement("canvas")
        compositeCanvas.width = baseWidth
        compositeCanvas.height = baseHeight
        const compositeCtx = compositeCanvas.getContext("2d")
        if (!compositeCtx) {
          return attachment.src
        }

        compositeCtx.drawImage(baseImage, 0, 0, compositeCanvas.width, compositeCanvas.height)

        const patchCanvas = document.createElement("canvas")
        patchCanvas.width = patchBounds.width
        patchCanvas.height = patchBounds.height
        const patchCtx = patchCanvas.getContext("2d")
        if (!patchCtx) {
          return attachmentSrc
        }

        drawPatchResultToCanvas({
          patchCtx,
          patchImage,
          baseWidth,
          baseHeight,
          patchWidth,
          patchHeight,
          targetWidth: patchCanvas.width,
          targetHeight: patchCanvas.height,
          patchBounds,
        })
        if (maskAsset?.url) {
          const maskImage = await loadImageForCanvas(maskAsset.url)
          patchCtx.globalCompositeOperation = "destination-in"
          drawImageCover(
            patchCtx,
            maskImage,
            maskImage.naturalWidth || maskImage.width,
            maskImage.naturalHeight || maskImage.height,
            patchCanvas.width,
            patchCanvas.height,
          )
          patchCtx.globalCompositeOperation = "source-over"
        }

        compositeCtx.drawImage(
          patchCanvas,
          patchBounds.x,
          patchBounds.y,
          patchBounds.width,
          patchBounds.height,
        )

        return compositeCanvas.toDataURL("image/png")
      })().catch((error) => {
        messageAttachmentPreviewComposeCacheRef.current.delete(cacheKey)
        throw error
      })

      touchMessageAttachmentPreviewComposeCache(cacheKey, nextPreviewPromise)
      return nextPreviewPromise
    },
    [detail?.assets, touchMessageAttachmentPreviewComposeCache],
  )

  const getPersistedMessageAttachments = useCallback(
    (message: ImageAssistantMessage): PersistedMessageAttachment[] => {
      const requestPayload =
        message.request_payload && typeof message.request_payload === "object"
          ? (message.request_payload as Record<string, unknown>)
          : null
      if (!requestPayload || !detail?.assets?.length) {
        return []
      }

      const referenceAssetIds = Array.isArray(requestPayload.referenceAssetIds)
        ? requestPayload.referenceAssetIds.filter((value): value is string => typeof value === "string")
        : []
      if (!referenceAssetIds.length) {
        return []
      }

      const patchEdit =
        requestPayload.versionMeta &&
          typeof requestPayload.versionMeta === "object" &&
          (requestPayload.versionMeta as Record<string, unknown>).patch_edit &&
          isCanvasPatchEditMeta((requestPayload.versionMeta as Record<string, unknown>).patch_edit)
          ? ((requestPayload.versionMeta as Record<string, unknown>).patch_edit as CanvasPatchEditMeta)
          : null
      const snapshotAssetId = typeof requestPayload.snapshotAssetId === "string" ? requestPayload.snapshotAssetId : null
      const maskAssetId = typeof requestPayload.maskAssetId === "string" ? requestPayload.maskAssetId : null

      return referenceAssetIds
        .map((assetId) => detail.assets.find((asset) => asset.id === assetId) || null)
        .filter((asset): asset is ImageAssistantAsset => Boolean(asset && asset.url && asset.asset_type !== "mask"))
        .map((asset) => {
          const isMaskEditSnapshot = Boolean(
            message.task_type === "mask_edit" && patchEdit && snapshotAssetId && asset.id === snapshotAssetId,
          )

          return {
            id: `${message.id}:${asset.id}`,
            assetId: asset.id,
            src: asset.url,
            width: isMaskEditSnapshot ? detail.assets.find((item) => item.id === patchEdit?.baseAssetId)?.width || asset.width : asset.width,
            height: isMaskEditSnapshot ? detail.assets.find((item) => item.id === patchEdit?.baseAssetId)?.height || asset.height : asset.height,
            baseAssetId: isMaskEditSnapshot ? patchEdit?.baseAssetId || null : null,
            maskAssetId: isMaskEditSnapshot ? maskAssetId : null,
            patchBounds: isMaskEditSnapshot ? patchEdit?.patchBounds || null : null,
          } satisfies PersistedMessageAttachment
        })
    },
    [detail?.assets],
  )

  const hasComposerInput = Boolean(prompt.trim() || pendingAttachments.length)
  const isPendingTurnRunning = pendingTurn?.status === "running"
  const canSubmit = hasComposerInput && !isBusy && !isUploading && !isPendingTurnRunning
  const displayMessages = useMemo(() => {
    const currentMessages = detail?.messages || []
    if (!pendingTurn) return currentMessages

    const optimisticUser = {
      id: `${pendingTurn.id}:user`,
      role: "user" as const,
      message_type: "prompt" as const,
      task_type: pendingTurn.kind,
      content: pendingTurn.prompt,
      created_version_id: null,
      request_payload: null,
      response_payload: null,
      session_id: sessionId || "",
      created_at: Math.floor(Date.now() / 1000),
    }

    const optimisticAssistant = {
      id: `${pendingTurn.id}:assistant`,
      role: "assistant" as const,
      message_type: pendingTurn.status === "cancelled" ? ("note" as const) : ("result_summary" as const),
      task_type: pendingTurn.kind,
      content: pendingTurn.status === "cancelled" ? extraCopy.cancelledReply : extraCopy.waitingReply,
      created_version_id: null,
      request_payload: null,
      response_payload: null,
      session_id: sessionId || "",
      created_at: Math.floor(Date.now() / 1000),
    }

    return [...currentMessages, optimisticUser, optimisticAssistant]
  }, [detail?.messages, extraCopy.cancelledReply, extraCopy.waitingReply, pendingTurn, sessionId])

  useEffect(() => {
    const viewport = messageViewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (!viewport) return

    if (messageHistoryRestoreRef.current) {
      const { height, top } = messageHistoryRestoreRef.current
      viewport.scrollTop = viewport.scrollHeight - height + top
      messageHistoryRestoreRef.current = null
      previousDisplayMessageCountRef.current = displayMessages.length
      return
    }

    if (
      shouldScrollMessagesToBottomRef.current ||
      displayMessages.length > previousDisplayMessageCountRef.current
    ) {
      viewport.scrollTop = viewport.scrollHeight
      shouldScrollMessagesToBottomRef.current = false
    }

    previousDisplayMessageCountRef.current = displayMessages.length
  }, [displayMessages.length, sessionId])

  useEffect(() => {
    void requestJson("/api/image-assistant/availability").then((json) => setAvailability(json.data))
  }, [])

  useEffect(() => {
    modeRef.current = mode
    detailRef.current = detail
    canvasRef.current = canvas
  }, [canvas, detail, mode])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    messageLimitRef.current = messageLimit
    versionLimitRef.current = versionLimit
  }, [messageLimit, versionLimit])

  useEffect(() => {
    setCandidatePreviewUrls({})
    candidatePreviewComposeCacheRef.current.clear()
    setMessageAttachmentPreviewUrls({})
    messageAttachmentPreviewComposeCacheRef.current.clear()
  }, [sessionId])

  useEffect(() => {
    const previewUrls = attachmentPreviewUrlsRef.current
    return () => {
      activeJobAbortRef.current?.abort()
      if (pointerMoveRafRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveRafRef.current)
        pointerMoveRafRef.current = null
      }
      if (paintPreviewRafRef.current !== null) {
        window.cancelAnimationFrame(paintPreviewRafRef.current)
        paintPreviewRafRef.current = null
      }
      previewUrls.forEach((url) => URL.revokeObjectURL(url))
      previewUrls.clear()
    }
  }, [])

  useEffect(() => {
    const node = canvasViewportRef.current
    if (!node) return

    const updateViewport = () => {
      const nextWidth = node.clientWidth
      const nextHeight = node.clientHeight
      setViewportSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current
        }
        return { width: nextWidth, height: nextHeight }
      })
    }

    updateViewport()
    const observer = new ResizeObserver(updateViewport)
    observer.observe(node)
    return () => observer.disconnect()
  }, [mode])

  useEffect(() => {
    if (!selectedLayer) return
    const nextColor = selectedLayer.style?.color || selectedLayer.style?.stroke || selectedLayer.style?.fill
    if (
      typeof nextColor === "string" &&
      nextColor !== brushColor &&
      /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(nextColor)
    ) {
      setBrushColor(nextColor)
    }
  }, [brushColor, selectedLayer])

  useEffect(() => {
    if (!initialSessionId || initialSessionId === sessionId) return
    setSessionId(initialSessionId)
  }, [initialSessionId, sessionId])

  useEffect(() => {
    if (sessionId) {
      const cachedDetail = getImageAssistantSessionContentCache(sessionId)
      const nextMessageLimit = Math.max(INITIAL_MESSAGE_LIMIT, cachedDetail?.detail.meta.messages_loaded || 0)
      const nextVersionLimit = Math.max(INITIAL_VERSION_LIMIT, cachedDetail?.detail.meta.versions_loaded || 0)
      const shouldRefreshFromRoute = initialSessionId === sessionId

      setMessageLimit(nextMessageLimit)
      setVersionLimit(nextVersionLimit)
      shouldScrollMessagesToBottomRef.current = true

      if (cachedDetail) {
        setDetail(cachedDetail.detail)
        setSelectedVersionId(
          cachedDetail.detail.session.current_version_id || cachedDetail.detail.versions[0]?.id || null,
        )
      } else {
        setDetail(null)
        setSelectedVersionId(null)
        previousDisplayMessageCountRef.current = 0
      }

      if (!cachedDetail || !isImageAssistantSessionContentCacheFresh(cachedDetail) || shouldRefreshFromRoute) {
        void refreshDetail(sessionId, {
          mode: "content",
          background: Boolean(cachedDetail),
          messageLimit: nextMessageLimit,
          versionLimit: nextVersionLimit,
        }).catch((error) => {
          console.error("image-assistant.session-summary-load-failed", error)
        })
      }
    } else {
      activeJobAbortRef.current?.abort()
      activeJobAbortRef.current = null
      setPendingTurn(null)
      detailRequestIdRef.current += 1
      messageHistoryRestoreRef.current = null
      shouldScrollMessagesToBottomRef.current = false
      previousDisplayMessageCountRef.current = 0
      resetCanvasHistory()
      setDetail(null)
      canvasRef.current = null
      setCanvas(null)
      setSelectedVersionId(null)
      setSelectedLayerId(null)
      setEditingTextLayerId(null)
      setIsLoadingSession(false)
      setIsHydratingSession(false)
      setMessageLimit(INITIAL_MESSAGE_LIMIT)
      setVersionLimit(INITIAL_VERSION_LIMIT)
    }
  }, [initialSessionId, refreshDetail, resetCanvasHistory, sessionId])

  useEffect(() => {
    if (!sessionId || !detail) return
    saveImageAssistantSessionContentCache(sessionId, detail)
  }, [detail, sessionId])

  useEffect(() => {
    const pendingTask = findImagePendingTask(sessionId) || (!sessionId ? findLatestImagePendingTask() : null)
    const targetSessionId = sessionId || pendingTask?.sessionId || null
    if (!pendingTask || !targetSessionId) return

    if (pendingTask.sessionId && pendingTask.sessionId !== sessionId) {
      setSessionId(pendingTask.sessionId)
      syncSessionRoute(pendingTask.sessionId)
    }

    let cancelled = false
    const pollStartedAt = Date.now()
    let consecutivePollFailures = 0
    setIsBusy(true)
    setPendingTurn((current) =>
      current || {
        id: `pending-turn-${pendingTask.taskId}`,
        kind: pendingTask.taskType === "edit" ? "edit" : "generate",
        prompt: pendingTask.prompt || "",
        attachments: [],
        status: "running",
      },
    )

    const poll = async () => {
      while (!cancelled) {
        if (Date.now() - pollStartedAt > IMAGE_ASSISTANT_TASK_POLL_MAX_DURATION_MS) {
          if (deferredRouteSessionIdRef.current === targetSessionId) {
            syncSessionRoute(targetSessionId)
            deferredRouteSessionIdRef.current = null
          }
          removePendingAssistantTask(pendingTask.taskId)
          if (!cancelled) {
            setJobError(formatImageAssistantErrorMessage("image_assistant_task_poll_timeout", imageCopy))
            setPendingTurn(null)
            setIsBusy(false)
          }
          return
        }

        try {
          const response = await fetch(`/api/tasks/${pendingTask.taskId}`)
          if (!response.ok) {
            throw new Error(`task_status_http_${response.status}`)
          }
          const payload = (await response.json().catch(() => null)) as {
            data?: { status?: string; result?: { error?: string; outcome?: string } | null }
          } | null
          const status = payload?.data?.status
          const outcome = payload?.data?.result?.outcome
          consecutivePollFailures = 0

          if (status === "success" || status === "approved") {
            shouldScrollMessagesToBottomRef.current = true
            if (outcome !== "needs_clarification") {
              await invalidateImageAssistantSessionQueries(queryClient, targetSessionId)
            }
            const refreshedDetail = await refreshDetail(targetSessionId, {
              mode: outcome === "needs_clarification" ? "summary" : "content",
              force: true,
            }).catch((error) => {
              console.error("image-assistant.pending-task.refresh-failed", error)
              return null
            })
            if (refreshedDetail) {
              saveImageAssistantSessionContentCache(targetSessionId, refreshedDetail)
            }
            if (deferredRouteSessionIdRef.current === targetSessionId) {
              syncSessionRoute(targetSessionId)
              deferredRouteSessionIdRef.current = null
            }
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              setPendingTurn(null)
              setIsBusy(false)
            }
            return
          }

          if (status === "failed" || status === "cancelled" || status === "rejected") {
            if (deferredRouteSessionIdRef.current === targetSessionId) {
              syncSessionRoute(targetSessionId)
              deferredRouteSessionIdRef.current = null
            }
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              setJobError(formatImageAssistantErrorMessage(payload?.data?.result?.error || status || "image_generation_failed", imageCopy))
              setPendingTurn(null)
              setIsBusy(false)
            }
            return
          }
        } catch (error) {
          console.error("image-assistant.pending-task.poll-failed", error)
          consecutivePollFailures += 1
          if (consecutivePollFailures >= IMAGE_ASSISTANT_TASK_POLL_MAX_FAILURES) {
            if (deferredRouteSessionIdRef.current === targetSessionId) {
              syncSessionRoute(targetSessionId)
              deferredRouteSessionIdRef.current = null
            }
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              setJobError(formatImageAssistantErrorMessage("image_assistant_task_status_unavailable", imageCopy))
              setPendingTurn(null)
              setIsBusy(false)
            }
            return
          }
        }

        await wait(IMAGE_ASSISTANT_TASK_POLL_INTERVAL_MS)
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [imageCopy, pendingTaskRefreshKey, queryClient, refreshDetail, sessionId, syncSessionRoute])

  useEffect(() => {
    if (typeof window === "undefined") return

    const sessionKey = sessionId ? getImageAssistantSessionResolutionKey(sessionId) : null
    const storedSessionValue = sessionKey ? window.localStorage.getItem(sessionKey) : null
    const storedGlobalValue = window.localStorage.getItem(IMAGE_ASSISTANT_GLOBAL_RESOLUTION_KEY)
    const nextResolution = isImageAssistantResolution(storedSessionValue)
      ? storedSessionValue
      : isImageAssistantResolution(storedGlobalValue)
        ? storedGlobalValue
        : DEFAULT_IMAGE_RESOLUTION

    const restoreKey = sessionId || "__global__"
    if (restoredResolutionSessionRef.current === restoreKey) {
      return
    }

    restoredResolutionSessionRef.current = restoreKey
    setResolution((current) => (current === nextResolution ? current : nextResolution))
  }, [sessionId])

  useEffect(() => {
    if (typeof window === "undefined" || !isImageAssistantResolution(resolution)) return
    window.localStorage.setItem(IMAGE_ASSISTANT_GLOBAL_RESOLUTION_KEY, resolution)
    if (sessionId) {
      window.localStorage.setItem(getImageAssistantSessionResolutionKey(sessionId), resolution)
    }
  }, [resolution, sessionId])

  useEffect(() => {
    if (!latestOrchestration?.brief) return

    if (latestOrchestration.brief.size_preset) {
      const nextSizePreset = latestOrchestration.brief.size_preset
      setSizePreset((current) => (current === nextSizePreset ? current : nextSizePreset))
    }
    if (latestOrchestration.brief.resolution) {
      const nextResolution = latestOrchestration.brief.resolution
      setResolution((current) => (current === nextResolution ? current : nextResolution))
    }
  }, [latestOrchestration])

  const createSession = async (title?: string, options?: { navigate?: boolean; activate?: boolean }) => {
    const json = await requestJson("/api/image-assistant/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || prompt || imageCopy.createSessionFallback }),
    })
    const nextSession = json.data as ImageAssistantConversationSummary
    if (options?.activate !== false) {
      setSessionId(nextSession.id)
    }
    if (options?.navigate !== false) {
      deferredRouteSessionIdRef.current = null
      syncSessionRoute(nextSession.id)
    } else {
      deferredRouteSessionIdRef.current = nextSession.id
    }
    return nextSession.id
  }

  const ensureSession = async (options?: { navigate?: boolean; activate?: boolean }) => {
    if (sessionId) return sessionId
    if (!creatingSessionRef.current) {
      creatingSessionRef.current = createSession(undefined, options).finally(() => {
        creatingSessionRef.current = null
      })
    }
    return creatingSessionRef.current
  }
  const buildTurnPreviewContent = useCallback((options?: {
    prompt?: string
    briefPatch?: Partial<ImageAssistantBrief> | null
    sizePreset?: ImageAssistantSizePreset | null
    resolution?: ImageAssistantResolution | null
  }) => {
    const effectiveBrief = {
      ...(latestOrchestration?.brief || {}),
      ...(options?.briefPatch || {}),
    } as Partial<ImageAssistantBrief>
    const effectivePrompt = options?.prompt ?? prompt.trim()
    const effectiveSizePreset = options?.sizePreset || effectiveBrief.size_preset || sizePreset
    const effectiveResolution = options?.resolution || effectiveBrief.resolution || resolution
    const effectiveResolutionLabel = isImageAssistantResolution(effectiveResolution)
      ? (isEnglish ? RESOLUTION_DISPLAY[effectiveResolution].en : RESOLUTION_DISPLAY[effectiveResolution].zh)
      : effectiveResolution
    const sections = [
      effectivePrompt || (composerAttachmentCount ? chatComposerCopy.imageOnlyPromptFallback : null),
      `Requested mode: ${composerModeLabel}`,
      effectiveBrief.usage_label ? `Usage: ${effectiveBrief.usage_label}` : null,
      effectiveBrief.orientation
        ? `Orientation: ${effectiveBrief.orientation === "landscape" ? "Landscape" : "Portrait"}`
        : null,
      effectiveBrief.size_preset
        ? `Ratio: ${effectiveBrief.usage_label ? `${effectiveBrief.usage_label}` : effectiveBrief.size_preset}`
        : null,
      `Output spec: ${(effectiveBrief.usage_label && effectiveBrief.size_preset) ? effectiveBrief.usage_label : effectiveSizePreset} / ${effectiveResolutionLabel}`,
    ]

    return sections.filter(Boolean).join("\n")
  }, [
    chatComposerCopy.imageOnlyPromptFallback,
    composerAttachmentCount,
    composerModeLabel,
    isEnglish,
    latestOrchestration?.brief,
    prompt,
    resolution,
    sizePreset,
  ])

  const enqueuePendingFiles = useCallback(async (files: File[]) => {
    if (!files.length) return

    const nextAttachments = await Promise.all(
      files.slice(0, IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS).map(
        async (file) => {
          const optimized = await losslessOptimizeUploadFile(file)
          const previewUrl = URL.createObjectURL(optimized.file)
          attachmentPreviewUrlsRef.current.add(previewUrl)
          return {
            id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file: optimized.file,
            previewUrl,
            previewWidth: optimized.width,
            previewHeight: optimized.height,
            width: optimized.width,
            height: optimized.height,
            originalFileSize: optimized.originalFileSize,
            uploadFileSize: optimized.uploadFileSize,
            transportOptimized: optimized.transportOptimized,
            source: "upload",
            referenceRole: "subject",
            assetType: "reference",
          } satisfies PendingAttachment
        },
      ),
    )

    setPendingAttachments((current) => [...current, ...nextAttachments].slice(0, IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS))
  }, [])

  const removePendingAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((current) => {
      const target = current.find((attachment) => attachment.id === attachmentId)
      if (target) {
        releaseAttachmentPreviewUrl(target.previewUrl)
        attachmentPreviewUrlsRef.current.delete(target.previewUrl)
      }
      attachmentUploadPromisesRef.current.delete(attachmentId)
      return current.filter((attachment) => attachment.id !== attachmentId)
    })
  }, [])

  const _clearPendingAttachments = useCallback(() => {
    setPendingAttachments((current) => {
      current.forEach((attachment) => {
        releaseAttachmentPreviewUrl(attachment.previewUrl)
        attachmentPreviewUrlsRef.current.delete(attachment.previewUrl)
        attachmentUploadPromisesRef.current.delete(attachment.id)
      })
      return []
    })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const detachPendingAttachments = useCallback(() => {
    setPendingAttachments([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const restorePendingAttachments = useCallback((attachments: PendingAttachment[]) => {
    setPendingAttachments(attachments)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const releasePendingAttachmentPreviews = useCallback((attachments: PendingAttachment[]) => {
    attachments.forEach((attachment) => {
      releaseAttachmentPreviewUrl(attachment.previewUrl)
      attachmentPreviewUrlsRef.current.delete(attachment.previewUrl)
      attachmentUploadPromisesRef.current.delete(attachment.id)
    })
  }, [])

  useEffect(() => {
    const previousPendingTurnId = previousPendingTurnIdRef.current
    const nextPendingTurnId = pendingTurn?.id || null
    if (previousPendingTurnId && previousPendingTurnId !== nextPendingTurnId) {
      const activeAttachmentIds = new Set(pendingAttachments.map((attachment) => attachment.id))
      const releasableAttachments = previousPendingTurnAttachmentsRef.current.filter(
        (attachment) => !activeAttachmentIds.has(attachment.id),
      )
      if (releasableAttachments.length) {
        releasePendingAttachmentPreviews(releasableAttachments)
      }
    }

    previousPendingTurnIdRef.current = nextPendingTurnId
    previousPendingTurnAttachmentsRef.current = pendingTurn?.attachments || []
  }, [pendingAttachments, pendingTurn?.attachments, pendingTurn?.id, releasePendingAttachmentPreviews])

  const replaceCanvasAttachment = useCallback((attachment: PendingAttachment) => {
    setPendingAttachments((current) => {
      current
        .filter((item) => item.source === "canvas")
        .forEach((item) => {
          releaseAttachmentPreviewUrl(item.previewUrl)
          attachmentPreviewUrlsRef.current.delete(item.previewUrl)
          attachmentUploadPromisesRef.current.delete(item.id)
        })

      return [...current.filter((item) => item.source !== "canvas"), attachment].slice(0, IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS)
    })
  }, [])

  const getCanvasSnapshot = useCallback(
    async (sourceCanvas: ImageAssistantCanvasDocument, patchBounds?: CanvasSelectionBounds | null) => {
      const renderableLayers = sourceCanvas.layers.filter(
        (layer) => layer.visible && (layer.layer_type === "background" || layer.layer_type === "image"),
      )
      const signature = JSON.stringify({
        base: getCanvasSnapshotSignature({
          ...sourceCanvas,
          layers: renderableLayers,
        }),
        patchBounds,
      })
      const cached = canvasSnapshotCacheRef.current
      if (cached?.signature === signature) {
        return cached
      }

      const baseCanvas = await renderImageAssistantLayersToCanvas({
        width: sourceCanvas.width,
        height: sourceCanvas.height,
        layers: renderableLayers,
      })
      const exportBounds = patchBounds || {
        x: 0,
        y: 0,
        width: sourceCanvas.width,
        height: sourceCanvas.height,
      }
      const outputCanvas = document.createElement("canvas")
      outputCanvas.width = exportBounds.width
      outputCanvas.height = exportBounds.height
      const outputCtx = outputCanvas.getContext("2d")
      if (!outputCtx) {
        throw new Error("canvas_context_missing")
      }
      outputCtx.drawImage(
        baseCanvas,
        exportBounds.x,
        exportBounds.y,
        exportBounds.width,
        exportBounds.height,
        0,
        0,
        exportBounds.width,
        exportBounds.height,
      )

      const dataUrl = outputCanvas.toDataURL("image/png")
      const nextSnapshot = {
        signature,
        dataUrl,
        assetId: null,
        width: outputCanvas.width,
        height: outputCanvas.height,
      }
      canvasSnapshotCacheRef.current = nextSnapshot
      return nextSnapshot
    },
    [],
  )

  const createCanvasPendingAttachment = useCallback(
    async (sourceCanvas: ImageAssistantCanvasDocument) => {
      const rawAnnotationMetadata = await deriveCanvasAnnotationMetadata(sourceCanvas)
      const annotationMetadata = rawAnnotationMetadata
        ? {
          selectionBounds: rawAnnotationMetadata.selectionBounds,
          annotationNotes: rawAnnotationMetadata.annotationNotes,
          patchBounds: null,
          baseAssetId: rawAnnotationMetadata.baseAssetId,
        }
        : null
      const snapshot = await getCanvasSnapshot(sourceCanvas)
      const maskDataUrl = annotationMetadata ? await createCanvasMaskDataUrl(sourceCanvas) : null
      const file = dataUrlToFile(snapshot.dataUrl, `image-design-edit-${Date.now()}.png`)
      const maskFile = maskDataUrl ? dataUrlToFile(maskDataUrl, `image-design-mask-${Date.now()}.png`) : null
      const previewSnapshot = snapshot
      const previewFile = file
      const previewUrl = URL.createObjectURL(previewFile)
      attachmentPreviewUrlsRef.current.add(previewUrl)
      return {
        id: `pending-canvas-${Date.now()}`,
        file,
        previewUrl,
        previewWidth: previewSnapshot.width,
        previewHeight: previewSnapshot.height,
        width: snapshot.width,
        height: snapshot.height,
        originalFileSize: file.size,
        uploadFileSize: file.size,
        transportOptimized: false,
        source: "canvas" as const,
        referenceRole: "subject" as const,
        assetId: snapshot.assetId,
        assetType: "canvas_snapshot" as const,
        uploading: false,
        snapshotSignature: snapshot.signature,
        annotationMetadata,
        maskFile,
        maskAssetId: null,
      }
    },
    [getCanvasSnapshot],
  )

  const uploadPendingAttachment = useCallback(async (targetSessionId: string, attachment: PendingAttachment, signal?: AbortSignal) => {
    if (attachment.assetId) {
      return {
        assetId: attachment.assetId,
        maskAssetId: attachment.maskAssetId || null,
      }
    }

    const existingPromise = attachmentUploadPromisesRef.current.get(attachment.id)
    if (existingPromise) {
      return existingPromise
    }

    setPendingAttachments((current) =>
      current.map((item) => (item.id === attachment.id ? { ...item, uploading: true } : item)),
    )

    const nextPromise = (async () => {
      const uploadAsset = async (file: File, assetType: "reference" | "canvas_snapshot" | "mask") => {
        const presign = await requestJson("/api/image-assistant/assets/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: targetSessionId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            assetType,
          }),
          signal,
        })

        const uploadResponse = await fetch(String(presign.data.uploadUrl), {
          method: String(presign.data.method || "PUT"),
          headers: (presign.data.headers as Record<string, string> | undefined) || { "Content-Type": file.type },
          body: file,
          signal,
        })

        if (!uploadResponse.ok) {
          throw new Error(`direct_upload_failed:${uploadResponse.status}`)
        }

        const completed = await requestJson("/api/image-assistant/assets/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: targetSessionId,
            storageKey: presign.data.storageKey,
            referenceRole: attachment.referenceRole,
            assetType,
            width: attachment.width,
            height: attachment.height,
          }),
          signal,
        })

        return String(completed.data.id)
      }

      const assetId = await uploadAsset(attachment.file, attachment.assetType || "reference")
      let maskAssetId = attachment.maskAssetId || null

      if (attachment.maskFile && !maskAssetId) {
        maskAssetId = await uploadAsset(attachment.maskFile, "mask")
      }

      setPendingAttachments((current) =>
        current.map((item) =>
          item.id === attachment.id ? { ...item, assetId, maskAssetId, uploading: false } : item,
        ),
      )

      if (attachment.snapshotSignature && canvasSnapshotCacheRef.current?.signature === attachment.snapshotSignature) {
        canvasSnapshotCacheRef.current = { ...canvasSnapshotCacheRef.current, assetId }
      }

      return { assetId, maskAssetId }
    })()
      .catch((error) => {
        setPendingAttachments((current) =>
          current.map((item) => (item.id === attachment.id ? { ...item, uploading: false } : item)),
        )
        throw error
      })
      .finally(() => {
        attachmentUploadPromisesRef.current.delete(attachment.id)
      })

    attachmentUploadPromisesRef.current.set(attachment.id, nextPromise)
    return nextPromise
  }, [])

  const runJob = async (
    kind: "generate" | "edit",
    options?: {
      prompt?: string
      briefPatch?: Partial<ImageAssistantBrief> | null
      sizePreset?: ImageAssistantSizePreset | null
      resolution?: ImageAssistantResolution | null
      guidedSelection?: ImageAssistantGuidedSelection | null
      preservePrompt?: boolean
    },
  ) => {
    if (isBusy || activeJobAbortRef.current || isPendingTurnRunning) {
      return
    }

    const submissionPrompt = typeof options?.prompt === "string" ? options.prompt : prompt.trim()
    const submissionBrief = options?.briefPatch || null
    const submissionSizePreset = options?.sizePreset || latestOrchestration?.brief.size_preset || sizePreset
    const submissionResolution = options?.resolution || latestOrchestration?.brief.resolution || resolution
    const submissionGuidedSelection = options?.guidedSelection || null
    const hasTurnInput = Boolean(submissionPrompt || pendingAttachments.length || hasBriefPatchInput(submissionBrief))

    if (!hasTurnInput) {
      setJobError(extraCopy.additionalNotesPlaceholder)
      return
    }

    const optimisticPrompt = buildTurnPreviewContent({
      prompt: submissionPrompt,
      briefPatch: submissionBrief,
      sizePreset: submissionSizePreset,
      resolution: submissionResolution,
    })
    if (!optimisticPrompt) return
    const currentAttachments = [...pendingAttachments]
    const disableReferenceCarryover = kind === "edit" || currentAttachments.length > 0
    const fallbackReferenceAssetIds = disableReferenceCarryover ? [] : resolveCarryoverReferenceAssetIds(sessionId)
    const shouldPromoteToEdit = shouldUseImplicitEditMode({
      requestedKind: kind,
      prompt: submissionPrompt,
      guidedSelection: submissionGuidedSelection,
      explicitReferenceCount: currentAttachments.length,
      fallbackReferenceCount: fallbackReferenceAssetIds.length,
    })
    const effectiveKind: ImageAssistantRunKind = shouldPromoteToEdit ? "edit" : kind

    const abortController = new AbortController()
    activeJobAbortRef.current = abortController
    setIsBusy(true)
    setJobError(null)
    const optimisticTurnId = `pending-turn-${Date.now()}`
    shouldScrollMessagesToBottomRef.current = true
    setPendingTurn({
      id: optimisticTurnId,
      kind: effectiveKind,
      prompt: optimisticPrompt,
      attachments: currentAttachments,
      status: "running",
    })
    detachPendingAttachments()
    try {
      const nextSessionId = await ensureSession({ navigate: false, activate: false })
      if (abortController.signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
      setSessionId(nextSessionId)
      syncSessionRoute(nextSessionId)
      const uploadedAssets = currentAttachments.length
        ? await Promise.all(
          currentAttachments.map((attachment) => uploadPendingAttachment(nextSessionId, attachment, abortController.signal)),
        )
        : []
      const uploadedAssetIds = uploadedAssets.map((item) => item.assetId)
      const runtimeFallbackReferenceAssetIds = disableReferenceCarryover ? [] : resolveCarryoverReferenceAssetIds(nextSessionId)
      const nextReferenceAssetIds = (currentAttachments.length ? uploadedAssetIds : runtimeFallbackReferenceAssetIds).slice(
        -IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS,
      )
      const canvasAttachmentIndex = currentAttachments.findIndex((attachment) => attachment.source === "canvas")
      const canvasAttachment = canvasAttachmentIndex >= 0 ? currentAttachments[canvasAttachmentIndex] : null
      const canvasSnapshotAssetId =
        canvasAttachmentIndex >= 0 ? nextReferenceAssetIds[canvasAttachmentIndex] || canvasAttachment?.assetId || null : null
      const canvasMaskAssetId =
        canvasAttachmentIndex >= 0 ? uploadedAssets[canvasAttachmentIndex]?.maskAssetId || canvasAttachment?.maskAssetId || null : null
      const canvasAnnotationMetadata = canvasAttachment?.annotationMetadata || null
      const shouldUseCanvasSnapshotEdit =
        effectiveKind === "edit" &&
        Boolean(
          canvasAttachment &&
          canvasSnapshotAssetId &&
          (canvasAnnotationMetadata?.selectionBounds || canvasAnnotationMetadata?.annotationNotes),
        )
      const canvasPatchSizePreset = shouldUseCanvasSnapshotEdit
        ? getNearestSizePresetForDimensions(
          canvasAttachment?.previewWidth || canvasAttachment?.width || null,
          canvasAttachment?.previewHeight || canvasAttachment?.height || null,
        )
        : submissionSizePreset
      const response = await requestJson(
        shouldUseCanvasSnapshotEdit ? "/api/image-assistant/canvas-snapshot-edit" : `/api/image-assistant/${effectiveKind}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            sessionId: nextSessionId,
            prompt: submissionPrompt,
            brief: submissionBrief,
            referenceAssetIds: nextReferenceAssetIds,
            disableReferenceCarryover,
            snapshotAssetId: shouldUseCanvasSnapshotEdit ? canvasSnapshotAssetId : null,
            maskAssetId: shouldUseCanvasSnapshotEdit ? canvasMaskAssetId : null,
            baseAssetId: null,
            annotationNotes: shouldUseCanvasSnapshotEdit ? canvasAnnotationMetadata?.annotationNotes || null : null,
            selectionBounds: shouldUseCanvasSnapshotEdit ? canvasAnnotationMetadata?.selectionBounds || null : null,
            patchBounds: null,
            canvasWidth: shouldUseCanvasSnapshotEdit ? canvasAttachment?.width || null : null,
            canvasHeight: shouldUseCanvasSnapshotEdit ? canvasAttachment?.height || null : null,
            candidateCount: 1,
            sizePreset: canvasPatchSizePreset,
            resolution: submissionResolution,
            parentVersionId: detail?.session.current_version_id || null,
            guidedSelection: submissionGuidedSelection,
          }),
        })
      const taskData = response.data as {
        accepted?: boolean
        direct?: boolean
        outcome?: string
        version_id?: string | null
        follow_up_message_id?: string | null
        detail_mode?: "summary" | "content"
        detail_snapshot?: ImageAssistantSessionDetail | null
        task_id?: string
        session_id?: string
      }
      if (taskData?.direct && taskData?.session_id) {
        const directSessionId = taskData.session_id
        const directMode: SessionLoadMode =
          taskData.detail_mode || (taskData.outcome === "needs_clarification" ? "summary" : "content")
        setSessionId(directSessionId)
        syncSessionRoute(directSessionId)
        shouldScrollMessagesToBottomRef.current = true

        let mergedDirectDetail: ImageAssistantSessionDetail | null = null
        if (taskData.detail_snapshot) {
          mergedDirectDetail = mergeSessionDetail(detailRef.current, taskData.detail_snapshot, directMode)
          setDetail(mergedDirectDetail)
          if (directMode !== "summary") {
            setSelectedVersionId((current) => {
              if (current && mergedDirectDetail?.versions.some((version) => version.id === current)) {
                return current
              }
              return mergedDirectDetail?.session.current_version_id || mergedDirectDetail?.versions[0]?.id || null
            })
          }
          saveImageAssistantSessionContentCache(directSessionId, mergedDirectDetail)
        }

        setPendingTurn(null)
        if (!options?.preservePrompt) {
          setPrompt("")
        }

        const shouldSyncDirectTurn = !hasDirectTurnMaterialized({
          detail: mergedDirectDetail,
          outcome: taskData.outcome,
          followUpMessageId: taskData.follow_up_message_id || null,
          versionId: taskData.version_id || null,
        })
        if (shouldSyncDirectTurn) {
          void (async () => {
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const refreshedDetail = await refreshDetail(directSessionId, {
                mode: directMode,
                force: true,
                background: true,
              }).catch((error) => {
                console.error("image-assistant.direct-turn.refresh-failed", error)
                return null
              })
              if (refreshedDetail) {
                saveImageAssistantSessionContentCache(directSessionId, refreshedDetail)
              }
              if (
                hasDirectTurnMaterialized({
                  detail: refreshedDetail,
                  outcome: taskData.outcome,
                  followUpMessageId: taskData.follow_up_message_id || null,
                  versionId: taskData.version_id || null,
                })
              ) {
                break
              }
              await wait(200 + attempt * 180)
            }
          })()
        }

        if (deferredRouteSessionIdRef.current === directSessionId) {
          syncSessionRoute(directSessionId)
          deferredRouteSessionIdRef.current = null
        }
        return
      }
      if (!taskData?.task_id || !taskData?.session_id) {
        throw new Error("image_assistant_async_task_missing")
      }

      savePendingAssistantTask({
        taskId: taskData.task_id,
        scope: "image",
        sessionId: taskData.session_id,
        prompt: optimisticPrompt,
        taskType: effectiveKind,
        createdAt: Date.now(),
      })
      setSessionId(taskData.session_id)
      syncSessionRoute(taskData.session_id)
      setPendingTaskRefreshKey(Date.now())
      if (!options?.preservePrompt) {
        setPrompt("")
      }
    } catch (error) {
      if (isAbortError(error)) {
        restorePendingAttachments(currentAttachments)
        setPendingTurn((current) => (current?.id === optimisticTurnId ? { ...current, status: "cancelled" } : current))
        return
      }
      const nextMessage = error instanceof Error ? error.message : ""
      restorePendingAttachments(currentAttachments)
      setJobError(formatImageAssistantErrorMessage(nextMessage, imageCopy))
      setPendingTurn(null)
    } finally {
      if (activeJobAbortRef.current === abortController) {
        activeJobAbortRef.current = null
      }
      setIsBusy(false)
    }
  }

  const submitPromptQuestionOption = async (
    option: ImageAssistantPromptOption,
    context: PromptQuestionSelectionContext,
  ) => {
    if (
      !latestPromptQuestionMessageId ||
      context.sourceMessageId !== latestPromptQuestionMessageId ||
      !latestAssistantPromptQuestionId ||
      context.questionId !== latestAssistantPromptQuestionId
    ) {
      return
    }

    if (option.size_preset) {
      setSizePreset(option.size_preset)
    }
    if (option.resolution) {
      setResolution(option.resolution)
    }

    await runJob(primaryRunKind, {
      prompt: option.prompt_value || option.label,
      briefPatch: option.brief_patch || null,
      sizePreset: option.size_preset || null,
      resolution: option.resolution || null,
      guidedSelection: {
        source_message_id: context.sourceMessageId,
        question_id: context.questionId,
        option_id: option.id,
      },
      preservePrompt: true,
    })
  }

  const uploadFiles = useCallback(async (files: FileList | File[] | null) => {
    const selectedFiles = files ? Array.from(files) : []
    if (!selectedFiles.length) return

    const imageFiles = selectedFiles.filter(isAcceptedUploadFile)
    if (!imageFiles.length) {
      setJobError(formatImageAssistantErrorMessage("unsupported_file_type", imageCopy))
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setIsUploading(true)
    setJobError(null)
    try {
      const remainingSlots = Math.max(0, IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS - pendingAttachments.length)
      if (!remainingSlots) {
        setJobError(extraCopy.attachmentLimitReached)
        return
      }
      await enqueuePendingFiles(imageFiles.slice(0, remainingSlots))
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : ""
      setJobError(formatImageAssistantErrorMessage(nextMessage || "upload_failed", imageCopy))
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }, [enqueuePendingFiles, extraCopy.attachmentLimitReached, imageCopy, pendingAttachments.length])

  const resetComposerDragState = useCallback(() => {
    composerDragDepthRef.current = 0
    setIsComposerDragActive(false)
  }, [])

  const handleComposerDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasFileDragData(event.dataTransfer)) return
    event.preventDefault()
    composerDragDepthRef.current += 1
    setIsComposerDragActive(true)
  }, [])

  const handleComposerDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasFileDragData(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const handleComposerDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasFileDragData(event.dataTransfer)) return
    event.preventDefault()
    composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1)
    if (composerDragDepthRef.current === 0) {
      setIsComposerDragActive(false)
    }
  }, [])

  const handleComposerDrop = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasFileDragData(event.dataTransfer)) return
    event.preventDefault()
    resetComposerDragState()
    if (isBusy || isUploading) return
    void uploadFiles(event.dataTransfer.files)
  }, [isBusy, isUploading, resetComposerDragState, uploadFiles])

  const openCanvasFromCandidate = async (version: ImageAssistantVersionSummary, candidateId: string) => {
    if (!sessionId) return
    setSelectedVersionId(version.id)

    const localCandidate = version.candidates.find((candidate) => candidate.id === candidateId) || null
    const patchEdit = getCanvasPatchEditMeta(version)
    const previewUrl =
      candidatePreviewUrls[candidateId] || (localCandidate ? await composeCandidatePreview(version, candidateId) : null)
    if (previewUrl && previewUrl !== localCandidate?.url && !candidatePreviewUrls[candidateId]) {
      setCandidatePreviewUrls((current) => (current[candidateId] ? current : { ...current, [candidateId]: previewUrl }))
    }
    const baseAsset = patchEdit ? detail?.assets.find((asset) => asset.id === patchEdit.baseAssetId) || null : null
    const localAsset =
      (localCandidate ? detail?.assets.find((item) => item.id === localCandidate.asset_id) : null) ||
      (localCandidate
        ? {
          id: localCandidate.asset_id,
          session_id: sessionId,
          asset_type: "generated" as const,
          reference_role: null,
          url: previewUrl || localCandidate.url,
          mime_type: "image/png",
          file_size: 0,
          width: baseAsset?.width || null,
          height: baseAsset?.height || null,
          status: "ready" as const,
          meta: null,
          created_at: Math.floor(Date.now() / 1000),
        }
        : null)

    if (localAsset) {
      const resolvedAsset = await ensureAssetDimensions(
        previewUrl
          ? {
            ...localAsset,
            url: previewUrl,
            width: baseAsset?.width || localAsset.width,
            height: baseAsset?.height || localAsset.height,
          }
          : localAsset,
      )
      const nextCanvas = createCanvasFromAsset(resolvedAsset, imageCopy)
      resetCanvasHistory()
      canvasRef.current = nextCanvas
      setCanvas(nextCanvas)
      setSelectedLayerId(null)
      setEditingTextLayerId(null)
      setPaintPreview(null)
      setCanvasTool("select")
      setZoomLevel("fit")
      setDirtyCanvas(true)
      setMode("canvas")
    }
  }

  const loadMoreMessages = async () => {
    if (!sessionId || isLoadingMoreMessages || (!hasMoreMessages && !hasMoreVersions)) return
    const viewport = messageViewportRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (viewport) {
      messageHistoryRestoreRef.current = {
        height: viewport.scrollHeight,
        top: viewport.scrollTop,
      }
    }
    setIsLoadingMoreMessages(true)
    try {
      const [messagePage, versionPage] = await Promise.all([
        hasMoreMessages && detail?.meta.messages_next_cursor
          ? fetchWorkspaceQueryData(queryClient, {
            queryKey: getImageAssistantMessagesQueryKey(sessionId, MESSAGE_PAGE_SIZE, detail.meta.messages_next_cursor),
            queryFn: () => getImageAssistantMessagesPage(sessionId, MESSAGE_PAGE_SIZE, detail.meta.messages_next_cursor),
          })
          : Promise.resolve(null),
        hasMoreVersions && detail?.meta.versions_next_cursor
          ? fetchWorkspaceQueryData(queryClient, {
            queryKey: getImageAssistantVersionsQueryKey(sessionId, VERSION_PAGE_SIZE, detail.meta.versions_next_cursor),
            queryFn: () => getImageAssistantVersionsPage(sessionId, VERSION_PAGE_SIZE, detail.meta.versions_next_cursor),
          })
          : Promise.resolve(null),
      ])

      setDetail((current) => {
        if (!current) return current
        const nextMessages = messagePage ? [...messagePage.data, ...current.messages] : current.messages
        const nextVersions = versionPage ? [...current.versions, ...versionPage.data] : current.versions
        return {
          ...current,
          messages: nextMessages,
          versions: nextVersions,
          meta: {
            ...current.meta,
            messages_loaded: nextMessages.length,
            messages_has_more: messagePage ? messagePage.has_more : current.meta.messages_has_more,
            messages_next_cursor: messagePage ? messagePage.next_cursor : current.meta.messages_next_cursor,
            versions_loaded: nextVersions.length,
            versions_has_more: versionPage ? versionPage.has_more : current.meta.versions_has_more,
            versions_next_cursor: versionPage ? versionPage.next_cursor : current.meta.versions_next_cursor,
          },
        }
      })

      if (messagePage) {
        setMessageLimit((current) => current + messagePage.data.length)
      }
      if (versionPage) {
        setVersionLimit((current) => current + versionPage.data.length)
      }
    } catch (error) {
      console.error("image-assistant.messages.load-more-failed", error)
      messageHistoryRestoreRef.current = null
      const nextMessage = error instanceof Error ? error.message : ""
      setJobError(formatImageAssistantErrorMessage(nextMessage, imageCopy))
    } finally {
      setIsLoadingMoreMessages(false)
    }
  }

  const persistCurrentCanvas = useCallback(async (sourceCanvas?: ImageAssistantCanvasDocument | null) => {
    const activeCanvas = sourceCanvas || canvasRef.current || canvas
    if (!sessionId || !activeCanvas) return

    setIsSavingCanvas(true)
    try {
      const json = await persistCanvasDocument({
        sessionId,
        canvasDocumentId: activeCanvas.id || null,
        baseVersionId: currentVersion?.id || null,
        width: activeCanvas.width,
        height: activeCanvas.height,
        backgroundAssetId: activeCanvas.background_asset_id,
        revision: activeCanvas.revision,
        layers: activeCanvas.layers,
      })

      const nextCanvas = { ...activeCanvas, id: json.data.canvasDocumentId, revision: json.data.revision }
      canvasRef.current = nextCanvas
      setCanvas(nextCanvas)
      setDirtyCanvas(false)
      return json
    } finally {
      setIsSavingCanvas(false)
    }
  }, [canvas, currentVersion?.id, sessionId])

  const attachCanvasToComposer = useCallback(
    async (sourceCanvas?: ImageAssistantCanvasDocument) => {
      const nextCanvas = sourceCanvas || canvasRef.current
      if (!nextCanvas) return

      const attachment = await createCanvasPendingAttachment(nextCanvas)
      replaceCanvasAttachment(attachment)

      if (sessionId) {
        void uploadPendingAttachment(sessionId, attachment).catch((error) => {
          console.error("image-assistant.canvas-attachment-upload-failed", error)
        })
      }
    },
    [createCanvasPendingAttachment, replaceCanvasAttachment, sessionId, uploadPendingAttachment],
  )

  const resolveCandidateDisplaySource = useCallback(
    async (version: ImageAssistantVersionSummary, candidate: ImageAssistantVersionSummary["candidates"][number]) => {
      const cachedPreview = candidatePreviewUrls[candidate.id]
      if (cachedPreview) return cachedPreview

      const composedPreview = await composeCandidatePreview(version, candidate.id)
      if (composedPreview) {
        setCandidatePreviewUrls((current) => (current[candidate.id] ? current : { ...current, [candidate.id]: composedPreview }))
        return composedPreview
      }

      return candidate.url || null
    },
    [candidatePreviewUrls, composeCandidatePreview],
  )

  const openPreviewImage = useCallback((src: string, label: string) => {
    setPreviewImage({ src, label, aspectRatio: 1 })
    void (async () => {
      try {
        const image = await loadImageForCanvas(src)
        const width = image.naturalWidth || image.width || 0
        const height = image.naturalHeight || image.height || 0
        if (width <= 0 || height <= 0) return
        const nextAspectRatio = clamp(width / height, 0.25, 4)
        setPreviewImage((current) => (current && current.src === src ? { ...current, aspectRatio: nextAspectRatio } : current))
      } catch (error) {
        console.warn("image-assistant.preview-image.load-failed", error)
      }
    })()
  }, [])

  const previewDialogStyle = useMemo<CSSProperties | undefined>(() => {
    if (!previewImage) return undefined
    return {
      width: `min(98vw, calc((98dvh - 88px) * ${clamp(previewImage.aspectRatio, 0.25, 4)}))`,
    }
  }, [previewImage])

  const exportImageSource = useCallback(
    async (src: string, fileStem: string, mimeType?: string | null) => {
      const response = await fetch(resolveImageAssistantFetchUrl(src), {
        credentials: "include",
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`asset_download_failed:${response.status}`)
      }

      const blob = await response.blob()
      const extension = guessImageFileExtension(blob.type || mimeType, src)
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = blobUrl
      link.download = `${fileStem}-${Date.now()}.${extension}`
      link.click()
      URL.revokeObjectURL(blobUrl)
    },
    [],
  )

  const addImageSourceToComposer = useCallback(
    async (
      src: string,
      fileStem: string,
      mimeType?: string | null,
      options?: {
        existingAssetId?: string | null
        width?: number | null
        height?: number | null
        fileSize?: number | null
      },
    ) => {
      if (pendingAttachments.length >= IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS) {
        setJobError(extraCopy.attachmentLimitReached)
        return
      }

      const extension = guessImageFileExtension(mimeType, src)
      const timestamp = Date.now()
      if (options?.existingAssetId) {
        const previewImageAsset = await loadImageForCanvas(src).catch(() => null)
        const width = options.width || previewImageAsset?.naturalWidth || previewImageAsset?.width || 0
        const height = options.height || previewImageAsset?.naturalHeight || previewImageAsset?.height || 0
        const knownFileSize = Math.max(0, Number(options.fileSize || 0))
        const referenceStub = new File([], `${fileStem}-${timestamp}.${extension}`, {
          type: mimeType || "image/png",
        })

        setPendingAttachments((current) => [
          ...current,
          {
            id: `pending-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            file: referenceStub,
            previewUrl: src,
            previewWidth: width || undefined,
            previewHeight: height || undefined,
            width: width || 0,
            height: height || 0,
            originalFileSize: knownFileSize,
            uploadFileSize: knownFileSize,
            transportOptimized: false,
            source: "generated",
            referenceRole: "subject",
            assetId: options.existingAssetId,
            assetType: "reference",
          } satisfies PendingAttachment,
        ].slice(0, IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS))
        setJobError(null)
        return
      }

      const response = await fetch(resolveImageAssistantFetchUrl(src), {
        credentials: "include",
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`asset_attachment_failed:${response.status}`)
      }

      const blob = await response.blob()
      const nextFile = new File([blob], `${fileStem}-${timestamp}.${extension}`, {
        type: blob.type || mimeType || "image/png",
      })
      const optimized = await losslessOptimizeUploadFile(nextFile)
      const previewUrl = URL.createObjectURL(optimized.file)
      attachmentPreviewUrlsRef.current.add(previewUrl)

      const previewImageAsset = await loadImageForCanvas(previewUrl).catch(() => null)
      const width = previewImageAsset?.naturalWidth || previewImageAsset?.width || 0
      const height = previewImageAsset?.naturalHeight || previewImageAsset?.height || 0

      setPendingAttachments((current) => [
        ...current,
        {
          id: `pending-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          file: optimized.file,
          previewUrl,
          previewWidth: width || undefined,
          previewHeight: height || undefined,
          width: width || 0,
          height: height || 0,
          originalFileSize: optimized.originalFileSize,
          uploadFileSize: optimized.uploadFileSize,
          transportOptimized: optimized.transportOptimized,
          source: "upload",
          referenceRole: "subject",
          assetType: "reference",
        } satisfies PendingAttachment,
      ].slice(0, IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS))
      setJobError(null)
    },
    [extraCopy.attachmentLimitReached, pendingAttachments.length],
  )

  const handleAttachCurrentCanvas = async () => {
    try {
      const hasExistingCanvasAttachment = pendingAttachments.some((attachment) => attachment.source === "canvas")
      if (!hasExistingCanvasAttachment && pendingAttachments.length >= IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS) {
        setJobError(extraCopy.attachmentLimitReached)
        return
      }

      const hadPendingPaintStroke = Boolean(paintStrokeRef.current)
      if (paintStrokeRef.current) {
        await finishPaintStroke()
      }

      const latestCanvas = canvasRef.current
      if (!latestCanvas) return

      await attachCanvasToComposer(latestCanvas)
      if (dirtyCanvas || hadPendingPaintStroke) {
        await persistCurrentCanvas(latestCanvas)
      }
      setMode("chat")
    } catch (error) {
      console.error("image-assistant.canvas-attach-failed", error)
      const nextMessage = error instanceof Error ? error.message : ""
      setJobError(formatImageAssistantErrorMessage(nextMessage, imageCopy))
    }
  }

  useEffect(() => {
    if (!dirtyCanvas || mode !== "canvas" || !sessionId || !canvas) return

    const timer = window.setTimeout(() => {
      void (async () => {
        await persistCurrentCanvas()
      })().catch((error) => {
        console.error("image-assistant.canvas-autosave-failed", error)
      })
    }, 10_000)

    return () => window.clearTimeout(timer)
  }, [canvas, currentVersion?.id, dirtyCanvas, mode, persistCurrentCanvas, sessionId])

  const exportCurrent = async (format: "png" | "jpg" | "webp") => {
    if (!canvas || !sessionId) return

    const dataUrl = await exportImageAssistantDataUrl({
      width: canvas.width,
      height: canvas.height,
      layers: canvas.layers,
      format,
    })

    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `image-design-${Date.now()}.${format === "jpg" ? "jpg" : format}`
    a.click()

    await requestJson("/api/image-assistant/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        canvasDocumentId: canvas.id || null,
        versionId: currentVersion?.id || null,
        dataUrl,
        format,
        sizePreset,
      }),
    })
  }

  const undoCanvasChange = useCallback(() => {
    setUndoStack((current) => {
      if (!current.length || !canvasRef.current) return current
      const previous = current[current.length - 1]
      setRedoStack((redoCurrent) => [...redoCurrent.slice(-39), cloneCanvasDocument(canvasRef.current!)])
      canvasRef.current = previous
      setCanvas(previous)
      setDirtyCanvas(true)
      setPaintPreview(null)
      return current.slice(0, -1)
    })
  }, [])

  const redoCanvasChange = useCallback(() => {
    setRedoStack((current) => {
      if (!current.length || !canvasRef.current) return current
      const next = current[current.length - 1]
      setUndoStack((undoCurrent) => [...undoCurrent.slice(-39), cloneCanvasDocument(canvasRef.current!)])
      canvasRef.current = next
      setCanvas(next)
      setDirtyCanvas(true)
      setPaintPreview(null)
      return current.slice(0, -1)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (modeRef.current !== "canvas") return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) {
        return
      }

      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return

      const key = event.key.toLowerCase()
      if (key === "z" && event.shiftKey) {
        event.preventDefault()
        redoCanvasChange()
        return
      }
      if (key === "z") {
        event.preventDefault()
        undoCanvasChange()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [redoCanvasChange, undoCanvasChange])

  const ensurePaintLayer = useCallback(() => {
    const workingCanvas = canvasRef.current || canvas
    if (!workingCanvas) return null
    const existing =
      [...workingCanvas.layers].sort((a, b) => b.z_index - a.z_index).find((layer) => layer.layer_type === "paint") || null
    if (existing) return existing
    return createPaintLayer(workingCanvas.width, workingCanvas.height, imageCopy)
  }, [canvas, imageCopy])

  const getCanvasPoint = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
      const activeCanvas = canvasRef.current
      if (!activeCanvas) return null
      const activeScale = scaleRef.current || 1
      const rect = event.currentTarget.getBoundingClientRect()
      return {
        x: clamp((event.clientX - rect.left) / activeScale, 0, activeCanvas.width),
        y: clamp((event.clientY - rect.top) / activeScale, 0, activeCanvas.height),
      }
    },
    [],
  )

  const getCanvasPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const activeCanvas = canvasRef.current
      if (!activeCanvas || !canvasStageRef.current) return null
      const activeScale = scaleRef.current || 1
      const rect = canvasStageRef.current.getBoundingClientRect()
      return {
        x: clamp((clientX - rect.left) / activeScale, 0, activeCanvas.width),
        y: clamp((clientY - rect.top) / activeScale, 0, activeCanvas.height),
      }
    },
    [],
  )

  useEffect(() => {
    const applyPointerMove = (clientX: number, clientY: number) => {
      const activeResize = layerResizeRef.current
      if (activeResize && canvasRef.current) {
        const point = getCanvasPointFromClient(clientX, clientY)
        if (!point) return

        const deltaX = point.x - activeResize.startPoint.x
        const deltaY = point.y - activeResize.startPoint.y

        setCanvas((current) => {
          if (!current) return current
          let changed = false
          const nextLayers = current.layers.map((layer) => {
              if (layer.id !== activeResize.layerId) return layer

              const minHeight =
                layer.layer_type === "shape" && layer.content?.shapeType === "line"
                  ? MIN_LINE_LAYER_HEIGHT
                  : MIN_LAYER_SIZE
              const maxWidth = Math.max(MIN_LAYER_SIZE, current.width - activeResize.startTransform.x)
              const maxHeight = Math.max(minHeight, current.height - activeResize.startTransform.y)
              const nextWidth = clamp(activeResize.startTransform.width + deltaX, MIN_LAYER_SIZE, maxWidth)
              const nextHeight = clamp(activeResize.startTransform.height + deltaY, minHeight, maxHeight)

              if (nextWidth === layer.transform.width && nextHeight === layer.transform.height) {
                return layer
              }

              changed = true
              activeResize.changed = true
              return {
                ...layer,
                transform: {
                  ...layer.transform,
                  width: nextWidth,
                  height: nextHeight,
                },
              }
            })
          if (!changed) {
            return current
          }
          const nextCanvas = { ...current, layers: nextLayers }
          canvasRef.current = nextCanvas
          return nextCanvas
        })

        setDirtyCanvas(true)
        return
      }

      const activeDrag = layerDragRef.current
      if (!activeDrag || !canvasRef.current) return

      const point = getCanvasPointFromClient(clientX, clientY)
      if (!point) return

      const deltaX = point.x - activeDrag.startPoint.x
      const deltaY = point.y - activeDrag.startPoint.y

      setCanvas((current) => {
        if (!current) return current
        let changed = false
        const nextLayers = current.layers.map((layer) => {
            if (layer.id !== activeDrag.layerId) return layer

            const maxX = Math.max(0, current.width - layer.transform.width)
            const maxY = Math.max(0, current.height - layer.transform.height)
            const nextX = clamp(activeDrag.startTransform.x + deltaX, 0, maxX)
            const nextY = clamp(activeDrag.startTransform.y + deltaY, 0, maxY)

            if (nextX === layer.transform.x && nextY === layer.transform.y) {
              return layer
            }

            changed = true
            activeDrag.changed = true
            return {
              ...layer,
              transform: {
                ...layer.transform,
                x: nextX,
                y: nextY,
              },
            }
          })
        if (!changed) {
          return current
        }
        const nextCanvas = { ...current, layers: nextLayers }
        canvasRef.current = nextCanvas
        return nextCanvas
      })

      setDirtyCanvas(true)
    }

    const flushPointerMove = () => {
      pointerMoveRafRef.current = null
      const pendingPoint = pendingPointerClientRef.current
      if (!pendingPoint) return
      pendingPointerClientRef.current = null
      applyPointerMove(pendingPoint.x, pendingPoint.y)
    }

    const handlePointerMove = (event: MouseEvent) => {
      if (!layerResizeRef.current && !layerDragRef.current) return
      pendingPointerClientRef.current = { x: event.clientX, y: event.clientY }
      if (pointerMoveRafRef.current !== null) return
      pointerMoveRafRef.current = window.requestAnimationFrame(flushPointerMove)
    }

    const finishLayerManipulation = () => {
      if (pointerMoveRafRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveRafRef.current)
        pointerMoveRafRef.current = null
      }
      const pendingPoint = pendingPointerClientRef.current
      pendingPointerClientRef.current = null
      if (pendingPoint) {
        applyPointerMove(pendingPoint.x, pendingPoint.y)
      }

      const activeResize = layerResizeRef.current
      if (activeResize) {
        if (activeResize.changed) {
          setUndoStack((current) => [...current.slice(-39), activeResize.beforeResize])
          setRedoStack([])
        }
        layerResizeRef.current = null
      }

      const activeDrag = layerDragRef.current
      if (!activeDrag) return

      if (activeDrag.changed) {
        setUndoStack((current) => [...current.slice(-39), activeDrag.beforeDrag])
        setRedoStack([])
      }

      layerDragRef.current = null
    }

    window.addEventListener("mousemove", handlePointerMove)
    window.addEventListener("mouseup", finishLayerManipulation)
    return () => {
      if (pointerMoveRafRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveRafRef.current)
        pointerMoveRafRef.current = null
      }
      pendingPointerClientRef.current = null
      window.removeEventListener("mousemove", handlePointerMove)
      window.removeEventListener("mouseup", finishLayerManipulation)
    }
  }, [getCanvasPointFromClient])

  const schedulePaintPreviewUpdate = useCallback(() => {
    if (paintPreviewRafRef.current !== null) return
    paintPreviewRafRef.current = window.requestAnimationFrame(() => {
      paintPreviewRafRef.current = null
      const activeStroke = paintStrokeRef.current
      if (!activeStroke) return
      setPaintPreview({
        ...activeStroke,
        points: [...activeStroke.points],
      })
    })
  }, [])

  const startPaintStroke = (event: ReactMouseEvent<HTMLDivElement>, tool: PaintTool) => {
    const point = getCanvasPoint(event)
    const layer = ensurePaintLayer()
    if (!point || !layer) return

    event.preventDefault()
    const stroke: PaintPreview = {
      layerId: layer.id,
      tool,
      points: [point, point],
      strokeWidth: layer.style?.strokeWidth || 18,
      color: brushColor,
    }
    paintStrokeRef.current = stroke
    setPaintPreview(stroke)
  }

  const updatePaintStroke = (event: ReactMouseEvent<HTMLDivElement>) => {
    const activeStroke = paintStrokeRef.current
    if (!activeStroke) return

    const point = getCanvasPoint(event)
    if (!point) return
    const lastPoint = activeStroke.points[activeStroke.points.length - 1]
    if (lastPoint && Math.abs(lastPoint.x - point.x) < 0.7 && Math.abs(lastPoint.y - point.y) < 0.7) {
      return
    }
    activeStroke.points.push(point)
    schedulePaintPreviewUpdate()
  }

  const finishPaintStroke = async () => {
    if (paintPreviewRafRef.current !== null) {
      window.cancelAnimationFrame(paintPreviewRafRef.current)
      paintPreviewRafRef.current = null
    }
    const activeStroke = paintStrokeRef.current
    paintStrokeRef.current = null

    if (!canvas || !activeStroke || activeStroke.points.length < 2) {
      setPaintPreview(null)
      return
    }

    const currentCanvas = canvasRef.current || canvas
    const latestPaintLayer =
      [...currentCanvas.layers].sort((a, b) => b.z_index - a.z_index).find((layer) => layer.layer_type === "paint") || null
    const targetLayer = currentCanvas.layers.find((layer) => layer.id === activeStroke.layerId) || latestPaintLayer
    if (!targetLayer && activeStroke.tool === "eraser") {
      setPaintPreview(null)
      return
    }
    const targetLayerId = targetLayer?.id || activeStroke.layerId
    const bitmap = document.createElement("canvas")
    bitmap.width = canvas.width
    bitmap.height = canvas.height
    const ctx = bitmap.getContext("2d")
    if (!ctx) {
      setPaintPreview(null)
      return
    }

    if (targetLayer?.asset_url) {
      try {
        const image = await loadImageForCanvas(targetLayer.asset_url)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      } catch (error) {
        console.warn("image-assistant.paint-layer.load-failed", error)
      }
    }

    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = activeStroke.strokeWidth
    if (activeStroke.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = activeStroke.color
    }

    ctx.beginPath()
    activeStroke.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.stroke()

    const nextDataUrl = bitmap.toDataURL("image/png")
    applyCanvasChange((current) => {
      const ordered = [...current.layers].sort((a, b) => a.z_index - b.z_index)
      const existingIndex = ordered.findIndex((layer) => layer.id === targetLayerId)
      if (existingIndex >= 0) {
        const existing = ordered[existingIndex]
        ordered[existingIndex] = {
          ...existing,
          asset_url: nextDataUrl,
          style: {
            ...(existing.style || {}),
            strokeWidth: activeStroke.strokeWidth,
            stroke: activeStroke.color,
            opacity: 1,
          },
        }
      } else if (activeStroke.tool !== "eraser") {
        ordered.push({
          ...createPaintLayer(current.width, current.height, imageCopy),
          id: targetLayerId,
          z_index: ordered.reduce((max, layer) => Math.max(max, layer.z_index), 0) + 1,
          asset_url: nextDataUrl,
          style: { opacity: 1, strokeWidth: activeStroke.strokeWidth, stroke: activeStroke.color },
        })
      }

      return {
        ...current,
        layers: ordered.map((layer, index) => ({ ...layer, z_index: index })),
      }
    })
    setPaintPreview(null)
  }

  const startShapeDraft = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!canvas || canvasTool !== "shape") return
    const point = getCanvasPoint(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    stopTextLayerEditing()
    const draft: ShapeDraft = { start: point, current: point }
    shapeDraftRef.current = draft
    setShapeDraft(draft)
  }

  const updateShapeDraft = (event: ReactMouseEvent<HTMLDivElement>) => {
    const activeDraft = shapeDraftRef.current
    if (!activeDraft) return
    const point = getCanvasPoint(event)
    if (!point) return
    const nextDraft: ShapeDraft = { ...activeDraft, current: point }
    shapeDraftRef.current = nextDraft
    setShapeDraft(nextDraft)
  }

  const finishShapeDraft = () => {
    const activeDraft = shapeDraftRef.current
    shapeDraftRef.current = null
    setShapeDraft(null)
    if (!canvas || !activeDraft) return

    const minX = Math.min(activeDraft.start.x, activeDraft.current.x)
    const minY = Math.min(activeDraft.start.y, activeDraft.current.y)
    const maxX = Math.max(activeDraft.start.x, activeDraft.current.x)
    const maxY = Math.max(activeDraft.start.y, activeDraft.current.y)
    const rawWidth = maxX - minX
    const rawHeight = maxY - minY
    if (rawWidth < 2 || rawHeight < 2) {
      return
    }

    const clampedX = clamp(minX, 0, Math.max(0, canvas.width - MIN_LAYER_SIZE))
    const clampedY = clamp(minY, 0, Math.max(0, canvas.height - MIN_LAYER_SIZE))
    const maxWidth = Math.max(MIN_LAYER_SIZE, canvas.width - clampedX)
    const maxHeight = Math.max(MIN_LAYER_SIZE, canvas.height - clampedY)
    const width = clamp(rawWidth, MIN_LAYER_SIZE, maxWidth)
    const height = clamp(rawHeight, MIN_LAYER_SIZE, maxHeight)
    const nextLayer = createShapeLayer(canvas, brushColor, "rect", imageCopy)
    nextLayer.transform = {
      ...nextLayer.transform,
      x: clampedX,
      y: clampedY,
      width,
      height,
    }

    applyCanvasChange((current) => ({
      ...current,
      layers: [...current.layers, { ...nextLayer, z_index: getNextLayerZIndex(current.layers) }],
    }))
    setSelectedLayerId(nextLayer.id)
    setCanvasTool("select")
  }

  const startLayerDrag = (event: ReactMouseEvent<HTMLElement>, layer: ImageAssistantLayer) => {
    if (!canvas || canvasTool !== "select" || !isEditableLayer(layer)) return
    if (editingTextLayerId && editingTextLayerId === layer.id) return
    const point = getCanvasPointFromClient(event.clientX, event.clientY)
    if (!point) return

    event.preventDefault()
    event.stopPropagation()
    setSelectedLayerId(layer.id)
    layerDragRef.current = {
      layerId: layer.id,
      startPoint: point,
      startTransform: { ...layer.transform },
      beforeDrag: cloneCanvasDocument(canvas),
      changed: false,
    }
  }

  const startLayerResize = (event: ReactMouseEvent<HTMLElement>, layer: ImageAssistantLayer) => {
    if (!canvas || canvasTool !== "select" || !isEditableLayer(layer)) return
    const point = getCanvasPointFromClient(event.clientX, event.clientY)
    if (!point) return

    event.preventDefault()
    event.stopPropagation()
    setSelectedLayerId(layer.id)
    if (layer.layer_type !== "text") {
      setEditingTextLayerId(null)
    }
    layerResizeRef.current = {
      layerId: layer.id,
      startPoint: point,
      startTransform: { ...layer.transform },
      beforeResize: cloneCanvasDocument(canvas),
      changed: false,
    }
  }

  const toggleShapeTool = () => {
    stopTextLayerEditing()
    setShapeDraft(null)
    shapeDraftRef.current = null
    setCanvasTool((current) => (current === "shape" ? "select" : "shape"))
  }

  const addTextToCanvas = () => {
    if (!canvas) return
    const nextLayer = createTextLayer(canvas, brushColor, imageCopy)
    applyCanvasChange((current) => ({
      ...current,
      layers: [...current.layers, { ...nextLayer, z_index: getNextLayerZIndex(current.layers) }],
    }))
    setSelectedLayerId(nextLayer.id)
    setShapeDraft(null)
    shapeDraftRef.current = null
    setCanvasTool("select")
    setEditingTextLayerId(nextLayer.id)
  }

  const removeSelectedLayer = () => {
    if (!selectedLayerId || !canvas) return
    applyCanvasChange((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== selectedLayerId),
    }))
    setSelectedLayerId(null)
    if (editingTextLayerId === selectedLayerId) {
      setEditingTextLayerId(null)
    }
  }

  const updateSelectedLayerColor = (color: string) => {
    if (!selectedLayerId || !canvas || !canAdjustSelectedLayerColor) return
    setBrushColor(color)

    applyCanvasChange(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) => {
          if (layer.id !== selectedLayerId) return layer
          const style = { ...(layer.style || {}) }
          if (layer.layer_type === "text") {
            style.color = color
            style.fill = color
          } else {
            style.stroke = color
            if (layer.layer_type === "shape" && layer.content?.shapeType !== "line") {
              style.fill = `${color}20`
            }
          }
          return { ...layer, style }
        }),
      }),
      { recordHistory: false },
    )
  }

  const updateTextLayer = (layerId: string, value: string) => {
    if (!canvas) return
    applyCanvasChange((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === layerId && layer.layer_type === "text"
          ? { ...layer, content: { ...(layer.content || {}), text: value } }
          : layer,
      ),
    }))
  }

  const beginTextLayerEditing = (layer: ImageAssistantLayer) => {
    if (layer.layer_type !== "text") return
    setSelectedLayerId(layer.id)
    setCanvasTool("select")
    setEditingTextLayerId(layer.id)
  }

  const stopTextLayerEditing = () => {
    setEditingTextLayerId(null)
    pendingTextCaretClientRef.current = null
  }

  const handleCloseEditor = () => {
    if (isClosingEditorRef.current) return
    isClosingEditorRef.current = true
    paintStrokeRef.current = null
    setPaintPreview(null)
    setShapeDraft(null)
    shapeDraftRef.current = null
    setSelectedLayerId(null)
    stopTextLayerEditing()
    setCanvasTool("select")
    setMode("chat")
    window.setTimeout(() => {
      isClosingEditorRef.current = false
    }, 0)
  }

  const renderCanvasLayer = (layer: ImageAssistantLayer) => {
    if (!layer.visible) return null

    const left = layer.transform.x * scale
    const top = layer.transform.y * scale
    const width = layer.transform.width * scale
    const height = layer.transform.height * scale
    const isSelected = selectedLayerId === layer.id
    const isEditingText = layer.layer_type === "text" && editingTextLayerId === layer.id
    const canSelect = layer.layer_type === "text" || layer.layer_type === "shape" || layer.layer_type === "image"
    const commonStyle = {
      left,
      top,
      width,
      height,
      zIndex: layer.z_index,
      opacity: layer.style?.opacity ?? 1,
      borderRadius: (layer.style?.borderRadius || 0) * scale,
      transform: `rotate(${layer.transform.rotation || 0}deg)`,
    }
    const selectionStyle = isSelected
      ? { boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.95), 0 0 0 8px rgba(59, 130, 246, 0.2)" }
      : undefined
    const handleSelect = (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!canSelect) return
      event.stopPropagation()
      setSelectedLayerId(layer.id)
      setCanvasTool("select")
      if (layer.layer_type !== "text") {
        stopTextLayerEditing()
      }
    }
    const handlePointerDown = (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!canSelect) {
        return
      }
      if (isEditingText) {
        event.stopPropagation()
        return
      }
      handleSelect(event)
      startLayerDrag(event, layer)
    }
    const resizeHandle =
      isSelected && canSelect && canvasTool === "select" ? (
        <button
          type="button"
          data-testid={`image-layer-resize-${layer.id}`}
          onMouseDown={(event) => startLayerResize(event, layer)}
          className="absolute bottom-0 right-0 z-30 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-full border-2 border-primary bg-background shadow"
          aria-label="Resize layer"
        />
      ) : null

    if (layer.layer_type === "background" || layer.layer_type === "image" || layer.layer_type === "paint") {
      return (
        <div
          key={layer.id}
          className="absolute overflow-hidden"
          style={{ ...commonStyle, ...selectionStyle, pointerEvents: canSelect ? "auto" : "none" }}
          onMouseDown={handlePointerDown}
        >
          {layer.asset_url ? <img src={layer.asset_url} alt="" className="h-full w-full object-cover" /> : null}
          {resizeHandle}
        </div>
      )
    }

    if (layer.layer_type === "text") {
      const textBoundsStyle = isEditingText
        ? {
          border: "2px dashed rgba(59, 130, 246, 0.95)",
          backgroundColor: "rgba(59, 130, 246, 0.12)",
        }
        : isSelected
          ? {
            border: "2px solid rgba(59, 130, 246, 0.72)",
            backgroundColor: "rgba(59, 130, 246, 0.08)",
          }
          : undefined

      return (
        <div
          key={layer.id}
          className={cn(
            "absolute flex min-h-[1.5rem] items-start whitespace-pre-wrap rounded-2xl px-2 py-1 font-black outline-none",
            isEditingText ? "cursor-text" : canvasTool === "select" ? "cursor-move" : "cursor-pointer",
          )}
          onMouseDown={(event) => {
            if (isEditingText) {
              event.stopPropagation()
              return
            }
            handlePointerDown(event)
          }}
          onDoubleClick={(event) => {
            if (canvasTool !== "select") return
            event.preventDefault()
            event.stopPropagation()
            pendingTextCaretClientRef.current = { x: event.clientX, y: event.clientY }
            beginTextLayerEditing(layer)
          }}
          data-testid={`image-text-layer-${layer.id}`}
          data-text-layer-editor={isEditingText ? layer.id : undefined}
          contentEditable={isEditingText}
          suppressContentEditableWarning
          onBlur={(event) => {
            if (!isEditingText) return
            updateTextLayer(layer.id, event.currentTarget.textContent || "")
            stopTextLayerEditing()
          }}
          onKeyDown={(event) => {
            if (!isEditingText) return
            if (event.key === "Escape") {
              event.preventDefault()
              stopTextLayerEditing()
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
                ; (event.currentTarget as HTMLDivElement).blur()
            }
          }}
          style={{
            ...commonStyle,
            ...selectionStyle,
            ...textBoundsStyle,
            color: layer.style?.color || layer.style?.fill || "#111827",
            fontSize: (layer.style?.fontSize || 42) * scale,
          }}
        >
          {layer.content?.text || (isEditingText ? "" : imageCopy.textFallback)}
          {resizeHandle}
        </div>
      )
    }

    const shapeType = layer.content?.shapeType || "rect"
    if (shapeType === "circle") {
      return (
        <div
          key={layer.id}
          className={cn("absolute", canvasTool === "select" ? "cursor-move" : "cursor-pointer")}
          onMouseDown={handlePointerDown}
          style={{
            ...commonStyle,
            ...selectionStyle,
            background: layer.style?.fill || "#f97316",
            border: `${(layer.style?.strokeWidth || 2) * scale}px solid ${layer.style?.stroke || "#111827"}`,
            borderRadius: "9999px",
          }}
        >
          {resizeHandle}
        </div>
      )
    }

    if (shapeType === "line" || shapeType === "arrow") {
      return (
        <div
          key={layer.id}
          className={cn("absolute overflow-visible", canvasTool === "select" ? "cursor-move" : "cursor-pointer")}
          style={{ ...commonStyle, ...selectionStyle }}
          onMouseDown={handlePointerDown}
        >
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ backgroundColor: layer.style?.stroke || "#2563eb" }} />
          {shapeType === "arrow" ? (
            <div className="absolute right-0 top-1/2 h-0 w-0 -translate-y-1/2 border-b-[8px] border-l-[14px] border-t-[8px] border-b-transparent border-t-transparent" style={{ borderLeftColor: layer.style?.stroke || "#2563eb" }} />
          ) : null}
          {resizeHandle}
        </div>
      )
    }

    return (
      <div
        key={layer.id}
        className={cn("absolute", canvasTool === "select" ? "cursor-move" : "cursor-pointer")}
        onMouseDown={handlePointerDown}
        style={{
          ...commonStyle,
          ...selectionStyle,
          background: layer.style?.fill || "#f97316",
          border: `${(layer.style?.strokeWidth || 2) * scale}px solid ${layer.style?.stroke || "#111827"}`,
        }}
      >
        {resizeHandle}
      </div>
    )
  }

  if (!availability) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="min-h-0 flex-1 overflow-hidden bg-muted/30">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-2 pb-2 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[28px] rounded-t-none border-x border-b border-t-0 border-border/70 bg-[#f7f7f7] shadow-none">
              <div className="min-h-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <WorkspaceConversationSkeleton rows={3} loadingLabel={imageCopy.loadingApp} />
                </ScrollArea>
              </div>
              <div className="border-t border-border/70 bg-[#f7f7f7] px-3 py-2.5 lg:px-4 lg:py-3">
                <div className="mx-auto w-full max-w-5xl rounded-[24px] border-2 border-border bg-card p-2.5">
                  <div className="h-11 rounded-[18px] border-2 border-border bg-background/70" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!availability.enabled) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-3xl border border-border bg-card p-8 shadow-sm">
          <p className="font-sans text-2xl font-semibold text-foreground">{imageCopy.unavailableTitle}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {imageCopy.unavailableReasonPrefix}
            {availability.reason || imageCopy.unavailableReasonFallback}
            . {imageCopy.unavailableHint}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden bg-muted/30">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-2 pb-2 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[28px] rounded-t-none border-x border-b border-t-0 border-border/70 bg-[#f7f7f7] shadow-none">
              <div className="flex min-h-0 flex-1 bg-[#f7f7f7] px-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ScrollArea className="h-full" ref={messageViewportRef}>
                      <div className="space-y-0">
                        {mode !== "canvas" ? (
                          <>
                            {displayMessages.length ? (
                              <>
                                {hasMoreMessages ? (
                                  <div className="flex justify-center px-3 py-3">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 rounded-full px-3 text-[11px]"
                                      onClick={() => void loadMoreMessages()}
                                      disabled={isLoadingMoreMessages}
                                    >
                                      {isLoadingMoreMessages ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                      {imageCopy.loadOlderMessages}
                                    </Button>
                                  </div>
                                ) : null}
                                {displayMessages.map((message, index) => {
                              const optimisticUserMessageId = pendingTurn ? `${pendingTurn.id}:user` : null
                              const optimisticAssistantMessageId = pendingTurn ? `${pendingTurn.id}:assistant` : null
                              const optimisticAttachments =
                                optimisticUserMessageId && message.id === optimisticUserMessageId ? pendingTurn?.attachments || [] : []
                              const persistedAttachments =
                                message.role === "user" && (!optimisticUserMessageId || message.id !== optimisticUserMessageId)
                                  ? getPersistedMessageAttachments(message)
                                  : []
                              const messageOrchestration = getMessageOrchestration(message)
                              const promptQuestions =
                                message.role === "assistant" ? messageOrchestration?.prompt_questions || [] : []
                              const isPromptQuestionMessageInteractive =
                                message.role === "assistant" &&
                                Boolean(promptQuestions.length) &&
                                latestPromptQuestionMessageId === message.id
                              const parsedContent = parseMessageBubbleContent(message.content)
                              const hasBubbleMeta = parsedContent.meta.length > 0
                              const bubbleAttachmentCount = optimisticAttachments.length || persistedAttachments.length
                              return (
                                <WorkspaceMessageFrame
                                  key={message.id}
                                  role={message.role === "user" ? "user" : "assistant"}
                                  className={cn(index === 0 && "border-b border-border/40 bg-transparent pt-5 lg:pt-6")}
                                  label={formatMessageRoleLabel(message.role, imageCopy)}
                                  icon={message.role !== "user" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                                  action={
                                    optimisticAssistantMessageId && message.id === optimisticAssistantMessageId && pendingTurn?.status === "running" ? (
                                      <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px]">
                                        {getRunKindLabel(pendingTurn.kind, extraCopy)}
                                      </Badge>
                                    ) : null
                                  }
                                  bodyClassName="space-y-3"
                                >
                                  <div
                                    className={cn(
                                      "rounded-[24px] border-2 p-4 selection:bg-[#E8E8E8]",
                                      message.role === "user" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                                    )}
                                  >
                                    {hasBubbleMeta ? (
                                      <div className="flex flex-col gap-2.5">
                                        {parsedContent.body ? (
                                          <p className="whitespace-pre-wrap text-[14px] leading-6">{parsedContent.body}</p>
                                        ) : null}
                                        <div className="flex flex-wrap gap-1.5">
                                          {parsedContent.meta.map((item) => (
                                            <span
                                              key={`${message.id}:${item.label}`}
                                              className={cn(
                                                "inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[10px] font-medium",
                                                message.role === "user"
                                                  ? "border-white/20 bg-primary text-primary-foreground"
                                                  : "border-border bg-card text-muted-foreground",
                                              )}
                                            >
                                              <span className="opacity-70">{item.label}</span>
                                              <span>{item.value}</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="whitespace-pre-wrap text-[14px] leading-6">{message.content}</p>
                                    )}
                                    {bubbleAttachmentCount ? (
                                      <div className="mt-3 space-y-2.5">
                                        <div className="flex items-center gap-2 text-[10px] font-medium opacity-80">
                                          <span>{extraCopy.pendingImagesLabel}</span>
                                          <span
                                            className={cn(
                                              "rounded-full border-2 px-2 py-0.5 text-[9px]",
                                              message.role === "user" ? "border-white/20 bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                                            )}
                                          >
                                            {bubbleAttachmentCount}
                                          </span>
                                        </div>
                                        <div className={cn("grid gap-2", getBubbleAttachmentGridClass(bubbleAttachmentCount))}>
                                          {optimisticAttachments.length
                                            ? optimisticAttachments.map((attachment) => {
                                              const previewWidth = attachment.previewWidth ?? attachment.width
                                              const previewHeight = attachment.previewHeight ?? attachment.height
                                              const aspectRatio =
                                                previewWidth > 0 && previewHeight > 0
                                                  ? `${previewWidth} / ${previewHeight}`
                                                  : bubbleAttachmentCount <= 2
                                                    ? "4 / 5"
                                                    : "1 / 1"

                                              return (
                                                <div
                                                  key={attachment.id}
                                                  className={cn(
                                                    "group overflow-hidden rounded-[20px] border-2",
                                                    message.role === "user"
                                                      ? "border-white/20 bg-primary"
                                                      : "border-border bg-card",
                                                  )}
                                                >
                                                  <div
                                                    className={cn(
                                                      "relative overflow-hidden",
                                                      getBubbleAttachmentFigureClass(bubbleAttachmentCount),
                                                    )}
                                                    style={{ aspectRatio }}
                                                  >
                                                    <img
                                                      src={attachment.previewUrl}
                                                      alt=""
                                                      loading="lazy"
                                                      decoding="async"
                                                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                    />
                                                  </div>
                                                </div>
                                              )
                                            })
                                            : persistedAttachments.map((attachment) => {
                                              const previewWidth = attachment.width || 0
                                              const previewHeight = attachment.height || 0
                                              const aspectRatio =
                                                previewWidth > 0 && previewHeight > 0
                                                  ? `${previewWidth} / ${previewHeight}`
                                                  : bubbleAttachmentCount <= 2
                                                    ? "4 / 5"
                                                    : "1 / 1"

                                              return (
                                                <div
                                                  key={attachment.id}
                                                  className={cn(
                                                    "group overflow-hidden rounded-[20px] border-2",
                                                    message.role === "user"
                                                      ? "border-white/20 bg-primary"
                                                      : "border-border bg-card",
                                                  )}
                                                >
                                                  <div
                                                    className={cn(
                                                      "relative overflow-hidden",
                                                      getBubbleAttachmentFigureClass(bubbleAttachmentCount),
                                                    )}
                                                    style={{ aspectRatio }}
                                                  >
                                                    <CandidatePreviewImage
                                                      candidateId={attachment.id}
                                                      fallbackSrc={attachment.src}
                                                      resolvedSrc={messageAttachmentPreviewUrls[attachment.id] || null}
                                                      loadPreview={() => composeMessageAttachmentPreview(message.id, attachment)}
                                                      onResolved={(nextSrc) =>
                                                        nextSrc !== attachment.src
                                                          ? setMessageAttachmentPreviewUrls((current) =>
                                                            current[attachment.id] ? current : { ...current, [attachment.id]: nextSrc },
                                                          )
                                                          : undefined
                                                      }
                                                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                    />
                                                  </div>
                                                </div>
                                              )
                                            })}
                                        </div>
                                      </div>
                                    ) : null}
                                    {optimisticAssistantMessageId && message.id === optimisticAssistantMessageId && pendingTurn?.status === "running" ? (
                                      <WorkspaceLoadingMessage
                                        className="rounded-[20px] border-2 border-border bg-card px-3 py-3"
                                        label={
                                          <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            {extraCopy.waitingReply}
                                          </>
                                        }
                                      />
                                    ) : null}
                                    {message.role === "assistant" && promptQuestions.length && isPromptQuestionMessageInteractive ? (
                                      <div className="mt-3 space-y-3">
                                        {promptQuestions.map((question) => (
                                          <div
                                            key={`${message.id}:${question.id}`}
                                            data-testid={`image-prompt-question-${question.id}`}
                                            className="rounded-[20px] border-2 border-border bg-card p-3"
                                          >
                                            <div className="mb-3">
                                              <p className="text-[12px] font-semibold text-foreground">{question.title}</p>
                                              {question.description ? (
                                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{question.description}</p>
                                              ) : null}
                                            </div>
                                            <div
                                              className={cn(
                                                "gap-2",
                                                question.display === "cards" ? "grid sm:grid-cols-2" : "flex flex-wrap",
                                              )}
                                            >
                                              {question.options.map((option) => (
                                                <button
                                                  key={`${question.id}:${option.id}`}
                                                  type="button"
                                                  data-testid={`image-prompt-option-${question.id}-${option.id}`}
                                                  onClick={() =>
                                                    void submitPromptQuestionOption(option, {
                                                      sourceMessageId: message.id,
                                                      questionId: question.id,
                                                    })
                                                  }
                                                  disabled={isBusy || isPendingTurnRunning || !isPromptQuestionMessageInteractive}
                                                  className={cn(
                                                    "rounded-[18px] border-2 border-border text-left transition",
                                                    isPromptQuestionMessageInteractive
                                                      ? "hover:border-primary"
                                                      : "cursor-not-allowed opacity-55",
                                                    question.display === "cards"
                                                      ? "bg-background px-4 py-3"
                                                      : "bg-background px-3 py-2 text-[11px]",
                                                  )}
                                                >
                                                  <div className="font-medium text-foreground">{option.label}</div>
                                                  {option.description && question.display === "cards" ? (
                                                    <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{option.description}</div>
                                                  ) : null}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                    {message.role === "assistant" && message.created_version_id
                                      ? (() => {
                                        const messageVersion = versionById.get(message.created_version_id)
                                        if (!messageVersion?.candidates.length) return null

                                        return (
                                          <WorkspaceSectionCard title="Candidate results" description={extraCopy.candidateActionsHint}>
                                            <div className={cn("grid gap-3", messageVersion.candidates.length > 1 ? "sm:grid-cols-2" : "max-w-md")}>
                                              {messageVersion.candidates.map((candidate) => (
                                                <div
                                                  key={candidate.id}
                                                  className="overflow-hidden rounded-[20px] border-2 border-border bg-card"
                                                >
                                                  <button
                                                    type="button"
                                                    className="block w-full text-left transition hover:bg-muted/20"
                                                    title={extraCopy.previewImage}
                                                    aria-label={extraCopy.previewImage}
                                                    onClick={() => {
                                                      void (async () => {
                                                        const previewSrc = await resolveCandidateDisplaySource(messageVersion, candidate)
                                                        if (!previewSrc) return
                                                        openPreviewImage(previewSrc, extraCopy.previewImage)
                                                      })().catch((error) => {
                                                        console.error("image-assistant.candidate-preview-open-failed", error)
                                                      })
                                                    }}
                                                  >
                                                    <div className="aspect-[4/5] bg-muted/30">
                                                      <CandidatePreviewImage
                                                        candidateId={candidate.id}
                                                        fallbackSrc={candidate.url}
                                                        resolvedSrc={candidatePreviewUrls[candidate.id] || null}
                                                        loadPreview={() => composeCandidatePreview(messageVersion, candidate.id)}
                                                        onResolved={(nextSrc) =>
                                                          nextSrc !== candidate.url
                                                            ? setCandidatePreviewUrls((current) =>
                                                              current[candidate.id] ? current : { ...current, [candidate.id]: nextSrc },
                                                            )
                                                            : undefined
                                                        }
                                                        className="h-full w-full object-cover"
                                                      />
                                                    </div>
                                                  </button>
                                                  <div className="space-y-2 px-3 py-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{extraCopy.clickImageToPreview}</p>
                                                      <div className="ml-auto flex items-center gap-1.5">
                                                        <Button
                                                          size="sm"
                                                          type="button"
                                                          variant="outline"
                                                          data-testid={`image-export-candidate-${candidate.id}`}
                                                          className="h-8 rounded-full px-2.5"
                                                          title={extraCopy.exportImage}
                                                          aria-label={extraCopy.exportImage}
                                                          onClick={() => {
                                                            void (async () => {
                                                              const previewSrc = await resolveCandidateDisplaySource(messageVersion, candidate)
                                                              if (!previewSrc) return
                                                              await exportImageSource(previewSrc, "image-design-candidate")
                                                            })().catch((error) => {
                                                              console.error("image-assistant.candidate-export-failed", error)
                                                              const nextMessage = error instanceof Error ? error.message : ""
                                                              setJobError(formatImageAssistantErrorMessage(nextMessage, imageCopy))
                                                            })
                                                          }}
                                                        >
                                                          <Download className="mr-1 h-3.5 w-3.5" />
                                                          <span className="text-[11px]">{extraCopy.exportAction}</span>
                                                        </Button>
                                                        <Button
                                                          size="sm"
                                                          type="button"
                                                          variant="outline"
                                                          data-testid={`image-open-canvas-${candidate.id}`}
                                                          className="h-8 rounded-full px-2.5"
                                                          title={extraCopy.editImage}
                                                          aria-label={extraCopy.editImage}
                                                          onClick={() => void openCanvasFromCandidate(messageVersion, candidate.id)}
                                                        >
                                                          <Pencil className="mr-1 h-3.5 w-3.5" />
                                                          <span className="text-[11px]">{extraCopy.editAction}</span>
                                                        </Button>
                                                        <Button
                                                          size="sm"
                                                          type="button"
                                                          variant="outline"
                                                          data-testid={`image-attach-candidate-${candidate.id}`}
                                                          className="h-8 rounded-full px-2.5"
                                                          title={extraCopy.addAsAttachment}
                                                          aria-label={extraCopy.addAsAttachment}
                                                          onClick={() => {
                                                            void (async () => {
                                                              const previewSrc = await resolveCandidateDisplaySource(messageVersion, candidate)
                                                              if (!previewSrc) return
                                                              const candidateAsset =
                                                                detail?.assets.find((asset) => asset.id === candidate.asset_id) || null
                                                              await addImageSourceToComposer(previewSrc, "image-design-attachment", candidateAsset?.mime_type || null, {
                                                                existingAssetId: candidate.asset_id,
                                                                width: candidateAsset?.width || null,
                                                                height: candidateAsset?.height || null,
                                                                fileSize: candidateAsset?.file_size || null,
                                                              })
                                                            })().catch((error) => {
                                                              console.error("image-assistant.candidate-attach-failed", error)
                                                              const nextMessage = error instanceof Error ? error.message : ""
                                                              setJobError(formatImageAssistantErrorMessage(nextMessage, imageCopy))
                                                            })
                                                          }}
                                                        >
                                                          <Link2 className="mr-1 h-3.5 w-3.5" />
                                                          <span className="text-[11px]">{extraCopy.addAsAttachment}</span>
                                                        </Button>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </WorkspaceSectionCard>
                                        )
                                      })()
                                      : null}
                                  </div>
                                </WorkspaceMessageFrame>
                              )
                                })}
                              </>
                            ) : (
                              <div className="px-3 py-3">
                                <WorkspacePromptGrid
                                  eyebrow={imageCopy.quickStart}
                                  prompts={imageCopy.starterPrompts}
                                  onSelect={(item) => setPrompt(item)}
                                  gridClassName="lg:grid-cols-3"
                                />
                              </div>
                            )}

                            {isBusy && !pendingTurn ? (
                              <WorkspaceMessageFrame role="assistant" label={imageCopy.assistantName} icon={<Sparkles className="h-3.5 w-3.5" />}>
                                <WorkspaceLoadingMessage label={<span className="animate-pulse">{imageCopy.generatingCandidates}</span>} />
                              </WorkspaceMessageFrame>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </ScrollArea>
                  </div>
                  {mode !== "canvas" ? (
                  <div className="border-t border-border/70 bg-[#f7f7f7] px-3 py-2.5 lg:px-4 lg:py-3">
                    <WorkspaceComposerPanel
                      data-testid="image-composer-dropzone"
                      className={cn(
                        "relative border-none bg-transparent p-0 transition-colors",
                        isComposerDragActive && "rounded-[24px] bg-primary/10",
                      )}
                      toolbarClassName="items-center"
                      toolbar={
                        <>
                          <WorkspacePromptChips
                            prompts={(promptPresets.length ? promptPresets : PROMPT_PRESETS).map((item) => item.label)}
                            onSelect={(label) => {
                              const matchedPreset = (promptPresets.length ? promptPresets : PROMPT_PRESETS).find((item) => item.label === label)
                              if (matchedPreset) setPrompt(matchedPreset.prompt)
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-9 rounded-full"
                            data-testid="image-reference-upload-button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                          >
                            {isUploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1.5 h-3.5 w-3.5" />}
                            {imageCopy.addImage}
                          </Button>
                          <input
                            ref={fileInputRef}
                            data-testid="image-reference-file-input"
                            className="hidden"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            onChange={(event) => void uploadFiles(event.target.files)}
                          />
                        </>
                      }
                      bodyClassName="px-0"
                      footer={
                        <>
                          <p className="text-[11px] leading-5 text-muted-foreground">
                            {composerAttachmentCount
                              ? imageCopy.imagesAttached.replace("{count}", String(composerAttachmentCount))
                              : imageCopy.noImageAttached}
                            {" / "}
                            {currentUsageDisplay}
                            {" / "}
                            {currentResolutionDisplay}
                            {" / "}
                            {extraCopy.uploadLimit}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground">Ctrl/Cmd + Enter</span>
                            {isBusy ? (
                              <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-[11px]" disabled>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                {imageCopy.statusGenerating}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full px-3 text-[11px]"
                              data-testid="image-edit-button"
                              onClick={() => void runJob("edit")}
                              disabled={!canSubmit || !composerAttachmentCount}
                            >
                              {imageCopy.editWithImage}
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 rounded-full px-3 text-[11px]"
                              data-testid="image-generate-button"
                              onClick={() => void runJob(primaryRunKind)}
                              disabled={!canSubmit}
                            >
                              {isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                              {imageCopy.send}
                            </Button>
                          </div>
                        </>
                      }
                      onDragEnter={handleComposerDragEnter}
                      onDragOver={handleComposerDragOver}
                      onDragLeave={handleComposerDragLeave}
                      onDrop={handleComposerDrop}
                    >
                      {isComposerDragActive ? (
                        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[20px] border-2 border-dashed border-primary bg-background px-4 text-center">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{extraCopy.dragDropActiveHint}</p>
                            <p className="text-xs text-muted-foreground">{extraCopy.dragDropHint}</p>
                          </div>
                        </div>
                      ) : null}
                      {pendingAttachments.length ? (
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-[20px] border-2 border-border bg-background px-3 py-2.5">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {pendingAttachments.length}/{IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {pendingAttachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="group flex items-center gap-2 rounded-[18px] border-2 border-border bg-card px-2 py-2"
                                data-testid={`image-pending-attachment-${attachment.id}`}
                              >
                                <div className="h-12 w-12 overflow-hidden rounded-xl bg-muted">
                                  <img src={attachment.previewUrl} alt="" className="h-full w-full object-cover" />
                                </div>
                                <div className="max-w-[120px]">
                                  <p className="truncate text-[11px] font-medium text-foreground">{formatPendingAttachmentLabel(attachment, imageCopy)}</p>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    {attachment.uploading ? imageCopy.preparingAttachment : attachment.file.name}
                                  </p>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    {formatBytes(attachment.uploadFileSize)}
                                    {attachment.transportOptimized && attachment.uploadFileSize < attachment.originalFileSize
                                      ? ` / ${extraCopy.optimizedBadge} ${formatBytes(attachment.originalFileSize)} -> ${formatBytes(attachment.uploadFileSize)}`
                                      : ""}
                                  </p>
                                </div>
                                <Button
                                  size="icon"
                                  type="button"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                                  onClick={() => removePendingAttachment(attachment.id)}
                                  aria-label={imageCopy.removePendingImage}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-2">
                        <Textarea
                          data-testid="image-prompt-input"
                          value={prompt}
                          onChange={(event) => {
                            setPrompt(event.target.value)
                            if (jobError) setJobError(null)
                          }}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              event.preventDefault()
                              if (canSubmit) {
                                void runJob(primaryRunKind)
                              }
                            }
                          }}
                          placeholder={extraCopy.additionalNotesPlaceholder}
                          className="min-h-12 resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] leading-6 shadow-none focus-visible:ring-0"
                          disabled={isBusy || isPendingTurnRunning}
                        />
                        {jobError ? (
                          <div className="px-3.5 pb-1 text-[12px] text-destructive">{jobError}</div>
                        ) : null}
                      </div>
                    </WorkspaceComposerPanel>
                  </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={mode === "canvas"}
        modal
        onOpenChange={(open) => {
          if (!open) handleCloseEditor()
        }}
      >
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="h-[min(92vh,1040px)] w-[min(96vw,1680px)] max-w-[min(96vw,1680px)] border-0 bg-transparent p-0 shadow-none sm:max-w-[min(96vw,1680px)]"
        >
          <DialogTitle className="sr-only">{imageCopy.editorTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {`${imageCopy.editorTitle}. ${imageCopy.autoSaveHint}`}
          </DialogDescription>
          <div className="relative grid h-full w-full grid-cols-[minmax(0,1fr)_104px] items-stretch gap-4 overflow-hidden rounded-[32px] border-2 border-border bg-muted/30 p-4 md:gap-5 md:p-5 lg:gap-6 lg:p-6">

            <div className="relative z-10 col-start-1 row-start-1 min-w-0 overflow-hidden rounded-[28px] border-2 border-border bg-card">

              <div
                ref={canvasViewportRef}
                className="relative flex h-full w-full min-w-0 items-center justify-center overflow-auto px-4 py-4 pb-28 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:px-6 md:py-6 md:pb-32"
              >
                {canvas ? (
                  <div
                    ref={canvasStageRef}
                    data-testid="image-canvas-stage"
                    className="relative overflow-hidden rounded-[32px] border-2 border-border bg-background"
                    style={{ width: canvas.width * scale, height: canvas.height * scale, flex: "0 0 auto" }}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setSelectedLayerId(null)
                        stopTextLayerEditing()
                      }
                    }}
                  >
                    {sortedCanvasLayers.map(renderCanvasLayer)}
                    {canvasTool === "shape" && shapeDraft ? (
                      <div
                        className="pointer-events-none absolute rounded-lg border-2 border-primary/85 bg-primary/12"
                        style={{
                          left: Math.min(shapeDraft.start.x, shapeDraft.current.x) * scale,
                          top: Math.min(shapeDraft.start.y, shapeDraft.current.y) * scale,
                          width: Math.abs(shapeDraft.current.x - shapeDraft.start.x) * scale,
                          height: Math.abs(shapeDraft.current.y - shapeDraft.start.y) * scale,
                        }}
                      />
                    ) : null}
                    {canvasTool === "brush" || canvasTool === "eraser" ? (
                      <div
                        data-testid="image-paint-overlay"
                        className="absolute inset-0 cursor-crosshair"
                        onMouseDown={(event) => startPaintStroke(event, canvasTool)}
                        onMouseMove={updatePaintStroke}
                        onMouseUp={() => void finishPaintStroke()}
                        onMouseLeave={() => void finishPaintStroke()}
                      >
                        {paintPreview ? (
                          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvas.width} ${canvas.height}`} preserveAspectRatio="none">
                            <polyline
                              fill="none"
                              points={paintPreviewPoints}
                              stroke={paintPreview.tool === "eraser" ? "rgba(148,163,184,0.9)" : paintPreview.color}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={paintPreview.strokeWidth}
                              strokeDasharray={paintPreview.tool === "eraser" ? "10 8" : undefined}
                              opacity={paintPreview.tool === "eraser" ? 0.7 : 0.95}
                            />
                          </svg>
                        ) : null}
                      </div>
                    ) : null}
                    {canvasTool === "shape" ? (
                      <div
                        data-testid="image-shape-overlay"
                        className="absolute inset-0 cursor-crosshair"
                        onMouseDown={startShapeDraft}
                        onMouseMove={updateShapeDraft}
                        onMouseUp={finishShapeDraft}
                        onMouseLeave={finishShapeDraft}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-border bg-white/80 p-8 text-sm text-muted-foreground">{imageCopy.openImageToEdit}</div>
                )}
              </div>

              <div className="absolute bottom-4 left-[calc(50%-46px)] z-20 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-[20px] border-2 border-border bg-card p-2">
                <Button variant="outline" className="h-8 rounded-full px-3 text-[11px]" onClick={() => setZoomLevel("fit")}>
                  {imageCopy.fit}
                </Button>
                <Button variant="outline" className="h-8 rounded-full px-3 text-[11px]" onClick={() => setZoomLevel(1)}>
                  100%
                </Button>
                <Button
                  variant="outline"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => setZoomLevel((current) => clamp((current === "fit" ? fitScale : current) - 0.2, 0.2, 4))}
                >
                  - {imageCopy.zoomOut}
                </Button>
                <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px]">
                  {zoomLabel}
                </Badge>
                <Button
                  variant="outline"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => setZoomLevel((current) => clamp((current === "fit" ? fitScale : current) + 0.2, 0.2, 4))}
                >
                  + {imageCopy.zoomIn}
                </Button>
              </div>
            </div>

            <div className="relative z-20 col-start-2 row-start-1 flex h-full items-center justify-center">
              <div className="pointer-events-auto flex h-full max-h-full w-[104px] flex-col rounded-[24px] border-2 border-border bg-card px-2 py-2.5">
                <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <Badge variant="outline" className="rounded-full px-2 py-1 text-[10px]">
                    {dirtyCanvas ? imageCopy.unsaved : imageCopy.synced}
                  </Badge>
                  <div className="flex w-full flex-col items-center gap-1.5">
                    <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {imageCopy.toolGroupLabel}
                    </p>
                    <Button data-testid="image-select-tool" size="icon" variant={canvasTool === "select" ? "default" : "outline"} onClick={() => { setCanvasTool("select"); setPaintPreview(null); setShapeDraft(null); shapeDraftRef.current = null }} title={imageCopy.selectTool} className="h-10 w-10 rounded-full">
                      <MousePointer2 className="h-4.5 w-4.5" />
                    </Button>
                    <Button data-testid="image-brush-tool" size="icon" variant={canvasTool === "brush" ? "default" : "outline"} onClick={() => { stopTextLayerEditing(); setShapeDraft(null); shapeDraftRef.current = null; setCanvasTool((current) => (current === "brush" ? "select" : "brush")) }} title={imageCopy.brushTool} className="h-10 w-10 rounded-full">
                      <Pencil className="h-4.5 w-4.5" />
                    </Button>
                    <Button data-testid="image-eraser-tool" size="icon" variant={canvasTool === "eraser" ? "default" : "outline"} onClick={() => { stopTextLayerEditing(); setShapeDraft(null); shapeDraftRef.current = null; setCanvasTool((current) => (current === "eraser" ? "select" : "eraser")) }} title={imageCopy.eraserTool} className="h-10 w-10 rounded-full">
                      <Eraser className="h-4.5 w-4.5" />
                    </Button>
                    <Button data-testid="image-shape-tool" size="icon" variant={canvasTool === "shape" ? "default" : "outline"} onClick={toggleShapeTool} title={imageCopy.shapeTool} className="h-10 w-10 rounded-full">
                      <Square className="h-4.5 w-4.5" />
                    </Button>
                    <Button data-testid="image-text-tool" size="icon" variant="outline" onClick={addTextToCanvas} title={imageCopy.textTool} className="h-10 w-10 rounded-full">
                      <Type className="h-4.5 w-4.5" />
                    </Button>
                    <div className="flex flex-col items-center gap-1.5 rounded-[18px] border-2 border-border bg-background px-1.5 py-1.5">
                      <Palette className="h-3.5 w-3.5 text-primary" />
                      <input
                        aria-label={imageCopy.brushColor}
                        type="color"
                        value={brushColor}
                        onChange={(event) => updateSelectedLayerColor(event.target.value)}
                        disabled={!canAdjustSelectedLayerColor}
                        className={cn(
                          "h-8 w-8 rounded-full border border-border bg-transparent p-0.5",
                          canAdjustSelectedLayerColor ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                        )}
                      />
                    </div>
                  </div>
                  <div className="h-px w-9 bg-border" />
                  <div className="flex w-full flex-col items-center gap-1.5">
                    <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {imageCopy.historyGroupLabel}
                    </p>
                    <Button variant="outline" size="icon" data-testid="image-canvas-undo-button" onClick={undoCanvasChange} disabled={!undoStack.length} title={imageCopy.undo} className="h-10 w-10 rounded-full">
                      <Undo2 className="h-4.5 w-4.5" />
                    </Button>
                    <Button variant="outline" size="icon" data-testid="image-canvas-redo-button" onClick={redoCanvasChange} disabled={!redoStack.length} title={imageCopy.redo} className="h-10 w-10 rounded-full">
                      <Redo2 className="h-4.5 w-4.5" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={removeSelectedLayer} disabled={!selectedLayerId || !selectedLayer || !isEditableLayer(selectedLayer)} title={imageCopy.delete} className="h-10 w-10 rounded-full">
                      <Trash2 className="h-4.5 w-4.5" />
                    </Button>
                  </div>
                  <div className="h-px w-9 bg-border" />
                  <div className="flex w-full flex-col items-center gap-1.5 pb-0.5">
                    <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {imageCopy.outputGroupLabel}
                    </p>
                    <Button
                      variant="outline"
                      size="icon"
                      data-testid="image-canvas-attach-button"
                      className="h-10 w-10 rounded-full"
                      disabled={!canvas}
                      onClick={() => void handleAttachCurrentCanvas()}
                      title={extraCopy.addCurrentCanvas}
                      aria-label={extraCopy.addCurrentCanvas}
                    >
                      <Plus className="h-4.5 w-4.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      data-testid="image-canvas-export-button"
                      className="h-10 w-10 rounded-full"
                      onClick={() => void exportCurrent("png")}
                      title={imageCopy.export}
                    >
                      <Download className="h-4.5 w-4.5" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid="image-canvas-close-button" onClick={handleCloseEditor} title={imageCopy.close} className="h-10 w-10 rounded-full">
                      <X className="h-4.5 w-4.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => { if (!open) setPreviewImage(null) }}>
        <DialogContent
          style={previewDialogStyle}
          className="max-h-[98dvh] w-auto min-w-[280px] max-w-[98vw] border-2 border-border bg-card p-1 selection:bg-[#E8E8E8] sm:max-h-[96dvh] sm:max-w-[96vw] sm:p-3 lg:p-4"
        >
          <DialogTitle className="sr-only">{previewImage?.label || extraCopy.previewImage}</DialogTitle>
          <DialogDescription className="sr-only">{extraCopy.clickImageToPreview}</DialogDescription>
          {previewImage ? (
            <div className="flex max-h-[calc(98dvh-52px)] items-center justify-center overflow-hidden rounded-[20px] border-2 border-border bg-muted/30 sm:max-h-[calc(96dvh-72px)] sm:rounded-[24px]">
              <img
                src={previewImage.src}
                alt={previewImage.label}
                className="block h-auto w-auto max-h-[calc(98dvh-64px)] max-w-full object-contain sm:max-h-[calc(96dvh-88px)]"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

