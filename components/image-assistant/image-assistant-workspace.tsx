"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from "react"
import { useRouter } from "next/navigation"
import {
  Download,
  Eraser,
  ImageIcon,
  Loader2,
  MousePointer2,
  Palette,
  Pencil,
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  findImagePendingTask,
  removePendingAssistantTask,
  savePendingAssistantTask,
} from "@/lib/assistant-task-store"
import type { AppMessages } from "@/lib/i18n/messages"
import { exportImageAssistantDataUrl, loadImageForCanvas, renderImageAssistantLayersToCanvas } from "@/lib/image-assistant/export"
import { IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS } from "@/lib/image-assistant/skills"
import type {
  ImageAssistantAsset,
  ImageAssistantCanvasDocument,
  ImageAssistantConversationSummary,
  ImageAssistantLayer,
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

type CanvasTool = "select" | "brush" | "eraser"
type PaintTool = "brush" | "eraser"

type PaintPreview = {
  layerId: string
  tool: PaintTool
  points: Array<{ x: number; y: number }>
  strokeWidth: number
  color: string
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
  source: "upload" | "canvas"
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

type MessageMetaPill = {
  label: string
  value: string
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

function getImageAssistantSessionResolutionKey(sessionId: string) {
  return `image-assistant:${sessionId}:resolution`
}

function isImageAssistantResolution(value: unknown): value is ImageAssistantResolution {
  return value === "512" || value === "1K" || value === "2K" || value === "4K"
}

function getSessionLoadSections(mode: SessionLoadMode) {
  if (mode === "summary") {
    return { messages: true, versions: true, assets: true, canvas: false }
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
      versions_total: sections.versions ? next.meta.versions_total : current?.meta.versions_total || 0,
      versions_loaded: sections.versions ? next.meta.versions_loaded : current?.meta.versions_loaded || 0,
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

function getCanvasSelectionAspectRatio(bounds: CanvasSelectionBounds | null) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  return bounds.width / bounds.height
}

function getNearestSizePresetForCanvasBounds(bounds: CanvasSelectionBounds | null): ImageAssistantSizePreset {
  const aspectRatio = getCanvasSelectionAspectRatio(bounds)
  if (!aspectRatio) return "1:1"

  const presets: Array<{ preset: ImageAssistantSizePreset; ratio: number }> = [
    { preset: "1:1", ratio: 1 },
    { preset: "4:5", ratio: 4 / 5 },
    { preset: "3:4", ratio: 3 / 4 },
    { preset: "16:9", ratio: 16 / 9 },
    { preset: "9:16", ratio: 9 / 16 },
  ]

  return presets.reduce((closest, current) => {
    const currentDelta = Math.abs(current.ratio - aspectRatio)
    const closestDelta = Math.abs(closest.ratio - aspectRatio)
    return currentDelta < closestDelta ? current : closest
  }).preset
}

function isPatchCompositeCompatible(params: {
  baseWidth: number
  baseHeight: number
  patchWidth: number
  patchHeight: number
  patchBounds: CanvasSelectionBounds
}) {
  const patchAspectRatio = getCanvasSelectionAspectRatio(params.patchBounds)
  const generatedAspectRatio =
    params.patchWidth > 0 && params.patchHeight > 0 ? params.patchWidth / params.patchHeight : null
  const baseAspectRatio = params.baseWidth > 0 && params.baseHeight > 0 ? params.baseWidth / params.baseHeight : null

  if (!patchAspectRatio || !generatedAspectRatio || !baseAspectRatio) {
    return false
  }

  const aspectDelta = Math.abs(generatedAspectRatio - patchAspectRatio) / patchAspectRatio
  const looksLikeFullFrameResult =
    Math.abs(params.patchWidth - params.baseWidth) <= Math.max(8, params.baseWidth * 0.12) &&
    Math.abs(params.patchHeight - params.baseHeight) <= Math.max(8, params.baseHeight * 0.12)
  const looksLikeBaseAspect = Math.abs(generatedAspectRatio - baseAspectRatio) / baseAspectRatio <= 0.08

  return aspectDelta <= 0.12 && !looksLikeFullFrameResult && !looksLikeBaseAspect
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
    const match = /^(Requested mode|Output spec)\s*:\s*(.+)$/i.exec(line)
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

function inflateCanvasSelectionBounds(
  bounds: CanvasSelectionBounds | null,
  padding: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (!bounds) return null
  return normalizeCanvasSelectionBounds(
    {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
    },
    canvasWidth,
    canvasHeight,
  )
}

function shiftCanvasSelectionBounds(bounds: CanvasSelectionBounds | null, offsetX: number, offsetY: number) {
  if (!bounds) return null
  return {
    x: Math.max(0, bounds.x - offsetX),
    y: Math.max(0, bounds.y - offsetY),
    width: bounds.width,
    height: bounds.height,
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
  return <img src={src} alt="" className={className} />
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
    label: "电商主图",
    prompt:
      "基于我上传的产品图，生成一张适合电商投放的 4:5 主图。产品保持真实比例，主体居中偏下，画面干净高级，背景做柔和渐变和轻微景深，预留顶部标题区与右下角价格角标区，不要自动生成中文文案。",
  },
  {
    label: "活动 KV",
    prompt:
      "把当前素材做成活动 KV 主视觉，要求品牌感强、构图集中、适合首页首屏横幅。请保留主体识别度，强化光影层次和空间感，画面留出中心标题区与底部 CTA 区，不直接生成文字。",
  },
  {
    label: "社媒封面",
    prompt:
      "生成一张适合社媒封面的视觉图，风格简洁但有传播感，主体突出，背景不过度复杂，适合后续叠加标题。整体色调统一，边缘避免过满，保留安全留白。",
  },
  {
    label: "夏季促销",
    prompt:
      "将这张图改成夏季促销海报风格，氛围轻快明亮，加入夏日色彩与促销节奏感，但保持商品本身真实。请强化视觉焦点，并留出左上标题区、右下按钮区，不自动生成中文文案。",
  },
  {
    label: "高级极简",
    prompt:
      "把当前图片改成高级极简品牌风，减少杂乱元素，统一材质与色彩，提升留白与质感。保留核心主体和识别特征，让整体更像成熟品牌宣传视觉，而不是普通海报。",
  },
]

export function ImageAssistantWorkspace({ initialSessionId }: { initialSessionId: string | null }) {
  const router = useRouter()
  const { messages: i18n } = useI18n()
  const imageCopy = i18n.imageAssistant
  const isEnglish = imageCopy.assistantName === "Image design assistant"
  const extraCopy = useMemo(
    () => ({
      uploadLimit: isEnglish
        ? `Up to ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} reference images can be attached in one request.`
        : `单次最多上传 ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} 张参考图，可用于文生图、图生图和二次编辑。`,
      uploadOptimization: isEnglish
        ? "Large PNG/WEBP files are transport-optimized losslessly on-device before upload."
        : "较大的 PNG/WEBP 图片会在端侧先做无损传输优化，再上传。",
      optimizedBadge: isEnglish ? "Lossless optimized" : "已无损压缩",
      generateMode: isEnglish ? "Text-to-image" : "文生图",
      editMode: isEnglish ? "Image-guided edit" : "带图编辑",
      waitingReply: isEnglish ? "Waiting for image response..." : "正在等待图片设计结果...",
      cancelledReply: isEnglish ? "This request was cancelled before completion." : "这次发送已取消，未继续等待结果。",
      cancelWaiting: isEnglish ? "Cancel wait" : "取消等待",
      skillBadge: isEnglish ? "Skill" : "Skill",
      toolsBadge: isEnglish ? "Tools" : "Tools",
      turnBadge: isEnglish ? "Turn" : "轮次",
      additionalNotes: isEnglish ? "Additional notes" : "补充说明",
      additionalNotesPlaceholder: isEnglish
        ? "Optional details: brand keywords, must-keep elements, text-safe areas, material cues..."
        : "补充品牌词、必须保留元素、留白区域、材质感、光影要求等，可选。",
      missingBriefPrefix: isEnglish ? "Still need: " : "仍缺少：",
      pendingImagesLabel: isEnglish ? "Attached references" : "附加参考图",
      attachmentLimitReached: isEnglish
        ? `You can attach up to ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} images in one request.`
        : `单次最多可添加 ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} 张图片。`,
      dragDropHint: isEnglish
        ? "Drop images here to attach them to the conversation."
        : "将图片拖放到这里，添加为对话附件。",
      dragDropActiveHint: isEnglish
        ? `Release to attach up to ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} images.`
        : `松开即可添加，单次最多 ${IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS} 张。`,
    }),
    [isEnglish],
  )
  const chatComposerCopy = useMemo(
    () => ({
      dialogueGuidance: isEnglish
        ? "Describe what you want in chat. The assistant will collect the remaining design requirements through follow-up questions before generating."
        : "直接通过对话描述你的设计目标即可，助手会通过追问补齐需求，再开始生图或改图。",
      imageOnlyPromptFallback: isEnglish
        ? "Use the uploaded reference images and ask the next design question."
        : "请基于已上传的参考图继续，并追问下一步设计需求。",
    }),
    [isEnglish],
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
  const [pendingTurn, setPendingTurn] = useState<PendingConversationTurn | null>(null)
  const [pendingTaskRefreshKey, setPendingTaskRefreshKey] = useState(0)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [zoomLevel, setZoomLevel] = useState<"fit" | number>("fit")
  const [isComposerDragActive, setIsComposerDragActive] = useState(false)
  const [candidatePreviewUrls, setCandidatePreviewUrls] = useState<Record<string, string>>({})

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasStageRef = useRef<HTMLDivElement | null>(null)
  const paintStrokeRef = useRef<PaintPreview | null>(null)
  const layerDragRef = useRef<LayerDragState | null>(null)
  const creatingSessionRef = useRef<Promise<string> | null>(null)
  const detailRequestIdRef = useRef(0)
  const modeRef = useRef(mode)
  const detailRef = useRef(detail)
  const isClosingEditorRef = useRef(false)
  const canvasRef = useRef(canvas)
  const attachmentPreviewUrlsRef = useRef<Set<string>>(new Set())
  const attachmentUploadPromisesRef = useRef<Map<string, Promise<{ assetId: string; maskAssetId: string | null }>>>(new Map())
  const composerDragDepthRef = useRef(0)
  const candidatePreviewComposeCacheRef = useRef<Map<string, Promise<string | null>>>(new Map())
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
        messageLimit?: number
        versionLimit?: number
      },
    ) => {
      const loadMode = options?.mode || "full"
      const sections = getSessionLoadSections(loadMode)
      const effectiveMessageLimit = options?.messageLimit ?? messageLimit
      const effectiveVersionLimit = options?.versionLimit ?? versionLimit
      if (options?.background) {
        setIsHydratingSession(true)
      } else if (loadMode !== "canvas") {
        setIsLoadingSession(true)
      }

      const requestId = ++detailRequestIdRef.current
      try {
        const params = new URLSearchParams({ mode: loadMode })
        if (sections.messages && loadMode !== "full") {
          params.set("messageLimit", String(effectiveMessageLimit))
        }
        if (sections.versions && loadMode !== "full") {
          params.set("versionLimit", String(effectiveVersionLimit))
        }
        const json = await requestJson(`/api/image-assistant/sessions/${targetSessionId}?${params.toString()}`)
        const nextDetail = json.data as ImageAssistantSessionDetail
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
    [messageLimit, resetCanvasHistory, versionLimit],
  )

  const syncSessionRoute = (targetSessionId: string) => {
    router.replace(`/dashboard/image-assistant/${targetSessionId}`)
  }

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

  const composerAttachmentCount = pendingAttachments.length
  const hasCanvasEditAttachment = pendingAttachments.some((attachment) => attachment.source === "canvas")
  const primaryRunKind: ImageAssistantRunKind = hasCanvasEditAttachment ? "edit" : "generate"
  const composerModeLabel = primaryRunKind === "edit" ? extraCopy.editMode : extraCopy.generateMode
  const versionById = useMemo(
    () => new Map((detail?.versions || []).map((version) => [version.id, version])),
    [detail?.versions],
  )

  const currentVersion = useMemo(
    () => detail?.versions.find((item) => item.id === selectedVersionId) || detail?.versions[0] || null,
    [detail?.versions, selectedVersionId],
  )

  const hasMoreMessages = (detail?.meta.messages_loaded || 0) < (detail?.meta.messages_total || 0)

  const selectedLayer = useMemo(
    () => canvas?.layers.find((layer) => layer.id === selectedLayerId) || null,
    [canvas?.layers, selectedLayerId],
  )

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
        patchCtx.drawImage(patchImage, 0, 0, patchCanvas.width, patchCanvas.height)

        if (maskAsset?.url) {
          const maskImage = await loadImageForCanvas(maskAsset.url)
          patchCtx.globalCompositeOperation = "destination-in"
          patchCtx.drawImage(maskImage, 0, 0, patchCanvas.width, patchCanvas.height)
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

  const hasComposerInput = Boolean(prompt.trim() || pendingAttachments.length)
  const canSubmit = hasComposerInput && !isBusy && !isUploading
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
    void requestJson("/api/image-assistant/availability").then((json) => setAvailability(json.data))
  }, [])

  useEffect(() => {
    modeRef.current = mode
    detailRef.current = detail
    canvasRef.current = canvas
  }, [canvas, detail, mode])

  useEffect(() => {
    setCandidatePreviewUrls({})
    candidatePreviewComposeCacheRef.current.clear()
  }, [sessionId])

  useEffect(() => {
    const previewUrls = attachmentPreviewUrlsRef.current
    return () => {
      activeJobAbortRef.current?.abort()
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
    if (sessionId) {
      setMessageLimit(INITIAL_MESSAGE_LIMIT)
      setVersionLimit(INITIAL_VERSION_LIMIT)
      void refreshDetail(sessionId, {
        mode: "content",
        messageLimit: INITIAL_MESSAGE_LIMIT,
        versionLimit: INITIAL_VERSION_LIMIT,
      })
        .catch((error) => {
          console.error("image-assistant.session-summary-load-failed", error)
        })
    } else {
      activeJobAbortRef.current?.abort()
      activeJobAbortRef.current = null
      setPendingTurn(null)
      detailRequestIdRef.current += 1
      resetCanvasHistory()
      setDetail(null)
      canvasRef.current = null
      setCanvas(null)
      setSelectedVersionId(null)
      setSelectedLayerId(null)
      setIsLoadingSession(false)
      setIsHydratingSession(false)
      setMessageLimit(INITIAL_MESSAGE_LIMIT)
      setVersionLimit(INITIAL_VERSION_LIMIT)
    }
  }, [refreshDetail, resetCanvasHistory, sessionId])

  useEffect(() => {
    const pendingTask = findImagePendingTask(sessionId)
    if (!sessionId || !pendingTask) return

    let cancelled = false
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
        try {
          const response = await fetch(`/api/tasks/${pendingTask.taskId}`)
          const payload = (await response.json().catch(() => null)) as {
            data?: { status?: string; result?: { error?: string } | null }
          } | null
          const status = payload?.data?.status

          if (status === "success") {
            await refreshDetail(sessionId, { mode: "content" }).catch((error) => {
              console.error("image-assistant.pending-task.refresh-failed", error)
            })
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              setPendingTurn(null)
              setIsBusy(false)
            }
            return
          }

          if (status === "failed") {
            removePendingAssistantTask(pendingTask.taskId)
            if (!cancelled) {
              setJobError(formatImageAssistantErrorMessage(payload?.data?.result?.error || "image_generation_failed", imageCopy))
              setPendingTurn(null)
              setIsBusy(false)
            }
            return
          }
        } catch (error) {
          console.error("image-assistant.pending-task.poll-failed", error)
        }

        await wait(1200)
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [imageCopy, pendingTaskRefreshKey, refreshDetail, sessionId])

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

  const createSession = async (title?: string, options?: { navigate?: boolean }) => {
    const json = await requestJson("/api/image-assistant/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || prompt || imageCopy.createSessionFallback }),
    })
    const nextSession = json.data as ImageAssistantConversationSummary
    setSessionId(nextSession.id)
    if (options?.navigate !== false) {
      deferredRouteSessionIdRef.current = null
      syncSessionRoute(nextSession.id)
    } else {
      deferredRouteSessionIdRef.current = nextSession.id
    }
    return nextSession.id
  }

  const ensureSession = async (options?: { navigate?: boolean }) => {
    if (sessionId) return sessionId
    if (!creatingSessionRef.current) {
      creatingSessionRef.current = createSession(undefined, options).finally(() => {
        creatingSessionRef.current = null
      })
    }
    return creatingSessionRef.current
  }
  const buildTurnPreviewContent = useCallback(() => {
    const sections = [
      prompt.trim() || (composerAttachmentCount ? chatComposerCopy.imageOnlyPromptFallback : null),
      `Requested mode: ${composerModeLabel}`,
      `Output spec: ${sizePreset} / ${resolution}`,
    ]

    return sections.filter(Boolean).join("\n")
  }, [
    chatComposerCopy.imageOnlyPromptFallback,
    composerAttachmentCount,
    composerModeLabel,
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
        URL.revokeObjectURL(target.previewUrl)
        attachmentPreviewUrlsRef.current.delete(target.previewUrl)
      }
      attachmentUploadPromisesRef.current.delete(attachmentId)
      return current.filter((attachment) => attachment.id !== attachmentId)
    })
  }, [])

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments((current) => {
      current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl)
        attachmentPreviewUrlsRef.current.delete(attachment.previewUrl)
        attachmentUploadPromisesRef.current.delete(attachment.id)
      })
      return []
    })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const replaceCanvasAttachment = useCallback((attachment: PendingAttachment) => {
    setPendingAttachments((current) => {
      current
        .filter((item) => item.source === "canvas")
        .forEach((item) => {
          URL.revokeObjectURL(item.previewUrl)
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
      const patchBounds = rawAnnotationMetadata?.selectionBounds
        ? inflateCanvasSelectionBounds(rawAnnotationMetadata.selectionBounds, 18, sourceCanvas.width, sourceCanvas.height)
        : null
      const annotationMetadata = rawAnnotationMetadata
        ? {
            selectionBounds: shiftCanvasSelectionBounds(rawAnnotationMetadata.selectionBounds, patchBounds?.x || 0, patchBounds?.y || 0),
            annotationNotes: rawAnnotationMetadata.annotationNotes,
            patchBounds,
            baseAssetId: rawAnnotationMetadata.baseAssetId,
          }
        : null
      const snapshot = await getCanvasSnapshot(sourceCanvas, patchBounds)
      const maskDataUrl = annotationMetadata ? await createCanvasMaskDataUrl(sourceCanvas, patchBounds) : null
      const file = dataUrlToFile(snapshot.dataUrl, `image-design-edit-${Date.now()}.png`)
      const maskFile = maskDataUrl ? dataUrlToFile(maskDataUrl, `image-design-mask-${Date.now()}.png`) : null
      const previewSnapshot = patchBounds ? await getCanvasSnapshot(sourceCanvas) : snapshot
      const previewFile =
        previewSnapshot.signature === snapshot.signature
          ? file
          : dataUrlToFile(previewSnapshot.dataUrl, `image-design-preview-${Date.now()}.png`)
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

  const runJob = async (kind: "generate" | "edit") => {
    if (!hasComposerInput) {
      setJobError(extraCopy.additionalNotesPlaceholder)
      return
    }

    const optimisticPrompt = buildTurnPreviewContent()
    if (!optimisticPrompt) return
    const currentAttachments = [...pendingAttachments]

    const abortController = new AbortController()
    activeJobAbortRef.current = abortController
    setIsBusy(true)
    setJobError(null)
    const optimisticTurnId = `pending-turn-${Date.now()}`
    setPendingTurn({
      id: optimisticTurnId,
      kind,
      prompt: optimisticPrompt,
      attachments: currentAttachments,
      status: "running",
    })
    try {
      const nextSessionId = await ensureSession({ navigate: false })
      if (abortController.signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
      const uploadedAssets = currentAttachments.length
        ? await Promise.all(
          currentAttachments.map((attachment) => uploadPendingAttachment(nextSessionId, attachment, abortController.signal)),
        )
        : []
      const uploadedAssetIds = uploadedAssets.map((item) => item.assetId)
      const nextReferenceAssetIds = uploadedAssetIds.slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS)
      const canvasAttachmentIndex = currentAttachments.findIndex((attachment) => attachment.source === "canvas")
      const canvasAttachment = canvasAttachmentIndex >= 0 ? currentAttachments[canvasAttachmentIndex] : null
      const canvasSnapshotAssetId =
        canvasAttachmentIndex >= 0 ? nextReferenceAssetIds[canvasAttachmentIndex] || canvasAttachment?.assetId || null : null
      const canvasMaskAssetId =
        canvasAttachmentIndex >= 0 ? uploadedAssets[canvasAttachmentIndex]?.maskAssetId || canvasAttachment?.maskAssetId || null : null
      const canvasAnnotationMetadata = canvasAttachment?.annotationMetadata || null
      const shouldUseCanvasSnapshotEdit =
        kind === "edit" &&
        Boolean(
          canvasAttachment &&
          canvasSnapshotAssetId &&
          (canvasAnnotationMetadata?.selectionBounds || canvasAnnotationMetadata?.annotationNotes),
        )
      const canvasPatchSizePreset = shouldUseCanvasSnapshotEdit
        ? getNearestSizePresetForCanvasBounds(canvasAnnotationMetadata?.patchBounds || null)
        : sizePreset
      const response = await requestJson(
        shouldUseCanvasSnapshotEdit ? "/api/image-assistant/canvas-snapshot-edit" : `/api/image-assistant/${kind}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            sessionId: nextSessionId,
            prompt: prompt.trim(),
            referenceAssetIds: shouldUseCanvasSnapshotEdit
              ? nextReferenceAssetIds.filter((_, index) => index !== canvasAttachmentIndex)
              : nextReferenceAssetIds,
            snapshotAssetId: shouldUseCanvasSnapshotEdit ? canvasSnapshotAssetId : null,
            maskAssetId: shouldUseCanvasSnapshotEdit ? canvasMaskAssetId : null,
            baseAssetId: shouldUseCanvasSnapshotEdit ? canvasAnnotationMetadata?.baseAssetId || null : null,
            annotationNotes: shouldUseCanvasSnapshotEdit ? canvasAnnotationMetadata?.annotationNotes || null : null,
            selectionBounds: shouldUseCanvasSnapshotEdit ? canvasAnnotationMetadata?.selectionBounds || null : null,
            patchBounds: shouldUseCanvasSnapshotEdit ? canvasAnnotationMetadata?.patchBounds || null : null,
            canvasWidth: shouldUseCanvasSnapshotEdit ? canvasAttachment?.width || null : null,
            canvasHeight: shouldUseCanvasSnapshotEdit ? canvasAttachment?.height || null : null,
            candidateCount: 1,
            sizePreset: canvasPatchSizePreset,
            resolution,
            parentVersionId: detail?.session.current_version_id || null,
          }),
        })
      const taskData = response.data as {
        accepted?: boolean
        task_id?: string
        session_id?: string
      }
      if (!taskData?.task_id || !taskData?.session_id) {
        throw new Error("image_assistant_async_task_missing")
      }

      savePendingAssistantTask({
        taskId: taskData.task_id,
        scope: "image",
        sessionId: taskData.session_id,
        prompt: optimisticPrompt,
        taskType: kind,
        createdAt: Date.now(),
      })
      setPendingTaskRefreshKey(Date.now())
      setPrompt("")
      if (deferredRouteSessionIdRef.current === nextSessionId) {
        syncSessionRoute(nextSessionId)
        deferredRouteSessionIdRef.current = null
      }
    } catch (error) {
      if (isAbortError(error)) {
        setPendingTurn((current) => (current?.id === optimisticTurnId ? { ...current, status: "cancelled" } : current))
        return
      }
      const nextMessage = error instanceof Error ? error.message : ""
      setJobError(formatImageAssistantErrorMessage(nextMessage, imageCopy))
      setPendingTurn(null)
    } finally {
      if (activeJobAbortRef.current === abortController) {
        activeJobAbortRef.current = null
      }
      setIsBusy(false)
    }
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
      setPaintPreview(null)
      setCanvasTool("select")
      setZoomLevel("fit")
      setDirtyCanvas(true)
      setMode("canvas")
    }
  }

  const loadMoreMessages = async () => {
    if (!sessionId || isLoadingMoreMessages || !hasMoreMessages) return
    setIsLoadingMoreMessages(true)
    try {
      const nextLimit = messageLimit + MESSAGE_PAGE_SIZE
      const nextVersionLimit = versionLimit + VERSION_PAGE_SIZE
      setMessageLimit(nextLimit)
      setVersionLimit(nextVersionLimit)
      await refreshDetail(sessionId, {
        mode: "content",
        background: true,
        messageLimit: nextLimit,
        versionLimit: nextVersionLimit,
      })
    } catch (error) {
      console.error("image-assistant.messages.load-more-failed", error)
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
    if (!canvas) return null
    const existing = [...canvas.layers].sort((a, b) => b.z_index - a.z_index).find((layer) => layer.layer_type === "paint") || null
    if (existing) return existing
    return createPaintLayer(canvas.width, canvas.height, imageCopy)
  }, [canvas, imageCopy])

  const getCanvasPoint = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!canvas) return null
      const rect = event.currentTarget.getBoundingClientRect()
      return {
        x: clamp((event.clientX - rect.left) / scale, 0, canvas.width),
        y: clamp((event.clientY - rect.top) / scale, 0, canvas.height),
      }
    },
    [canvas, scale],
  )

  const getCanvasPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvas || !canvasStageRef.current) return null
      const rect = canvasStageRef.current.getBoundingClientRect()
      return {
        x: clamp((clientX - rect.left) / scale, 0, canvas.width),
        y: clamp((clientY - rect.top) / scale, 0, canvas.height),
      }
    },
    [canvas, scale],
  )

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const activeDrag = layerDragRef.current
      if (!activeDrag || !canvasRef.current) return

      const point = getCanvasPointFromClient(event.clientX, event.clientY)
      if (!point) return

      const deltaX = point.x - activeDrag.startPoint.x
      const deltaY = point.y - activeDrag.startPoint.y

      setCanvas((current) => {
        if (!current) return current
        const nextCanvas = {
          ...current,
          layers: current.layers.map((layer) => {
            if (layer.id !== activeDrag.layerId) return layer

            const maxX = Math.max(0, current.width - layer.transform.width)
            const maxY = Math.max(0, current.height - layer.transform.height)
            const nextX = clamp(activeDrag.startTransform.x + deltaX, 0, maxX)
            const nextY = clamp(activeDrag.startTransform.y + deltaY, 0, maxY)

            if (nextX === layer.transform.x && nextY === layer.transform.y) {
              return layer
            }

            activeDrag.changed = true
            return {
              ...layer,
              transform: {
                ...layer.transform,
                x: nextX,
                y: nextY,
              },
            }
          }),
        }
        canvasRef.current = nextCanvas
        return nextCanvas
      })

      setDirtyCanvas(true)
    }

    const finishLayerDrag = () => {
      const activeDrag = layerDragRef.current
      if (!activeDrag) return

      if (activeDrag.changed) {
        setUndoStack((current) => [...current.slice(-39), activeDrag.beforeDrag])
        setRedoStack([])
      }

      layerDragRef.current = null
    }

    window.addEventListener("mousemove", handlePointerMove)
    window.addEventListener("mouseup", finishLayerDrag)
    return () => {
      window.removeEventListener("mousemove", handlePointerMove)
      window.removeEventListener("mouseup", finishLayerDrag)
    }
  }, [getCanvasPointFromClient])

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

    const nextStroke = { ...activeStroke, points: [...activeStroke.points, point] }
    paintStrokeRef.current = nextStroke
    setPaintPreview(nextStroke)
  }

  const finishPaintStroke = async () => {
    const activeStroke = paintStrokeRef.current
    paintStrokeRef.current = null

    if (!canvas || !activeStroke || activeStroke.points.length < 2) {
      setPaintPreview(null)
      return
    }

    const currentCanvas = canvasRef.current || canvas
    const targetLayer = currentCanvas.layers.find((layer) => layer.id === activeStroke.layerId) || activeStroke
    const bitmap = document.createElement("canvas")
    bitmap.width = canvas.width
    bitmap.height = canvas.height
    const ctx = bitmap.getContext("2d")
    if (!ctx) {
      setPaintPreview(null)
      return
    }

    if ("asset_url" in targetLayer && targetLayer.asset_url) {
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
      const existingIndex = ordered.findIndex((layer) => layer.id === activeStroke.layerId)
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
      } else {
        ordered.push({
          ...createPaintLayer(current.width, current.height, imageCopy),
          id: activeStroke.layerId,
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

  const startLayerDrag = (event: ReactMouseEvent<HTMLDivElement>, layer: ImageAssistantLayer) => {
    if (!canvas || canvasTool !== "select" || !isEditableLayer(layer)) return
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

  const addShapeToCanvas = (shapeType: "rect" | "line") => {
    if (!canvas) return
    const nextLayer = createShapeLayer(canvas, brushColor, shapeType, imageCopy)
    applyCanvasChange((current) => ({
      ...current,
      layers: [...current.layers, { ...nextLayer, z_index: getNextLayerZIndex(current.layers) }],
    }))
    setSelectedLayerId(nextLayer.id)
  }

  const addTextToCanvas = () => {
    if (!canvas) return
    const nextLayer = createTextLayer(canvas, brushColor, imageCopy)
    applyCanvasChange((current) => ({
      ...current,
      layers: [...current.layers, { ...nextLayer, z_index: getNextLayerZIndex(current.layers) }],
    }))
    setSelectedLayerId(nextLayer.id)
  }

  const removeSelectedLayer = () => {
    if (!selectedLayerId || !canvas) return
    applyCanvasChange((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== selectedLayerId),
    }))
    setSelectedLayerId(null)
  }

  const updateSelectedLayerColor = (color: string) => {
    setBrushColor(color)
    if (!selectedLayerId || !canvas) return

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

  const updateSelectedText = (value: string) => {
    if (!selectedLayerId || !canvas) return
    applyCanvasChange(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === selectedLayerId && layer.layer_type === "text"
            ? { ...layer, content: { ...(layer.content || {}), text: value } }
            : layer,
        ),
      }),
      { recordHistory: false },
    )
  }

  const handleCreateSession = () => {
    activeJobAbortRef.current?.abort()
    activeJobAbortRef.current = null
    void createSession(imageCopy.newDesign).then(() => {
      resetCanvasHistory()
      setDetail(null)
      setCanvas(null)
      setSelectedLayerId(null)
      setPrompt("")
      setPendingTurn(null)
      setPaintPreview(null)
      setSelectedVersionId(null)
      clearPendingAttachments()
      setMode("chat")
    })
  }

  const handleCloseEditor = () => {
    if (isClosingEditorRef.current) return
    isClosingEditorRef.current = true
    void (async () => {
      try {
        if (paintStrokeRef.current) {
          await finishPaintStroke()
        }

        const latestCanvas = canvasRef.current
        if (latestCanvas) {
          await attachCanvasToComposer(latestCanvas)
        }
      } catch (error) {
        console.error("image-assistant.close-editor-attach-failed", error)
      } finally {
        setMode("chat")
        isClosingEditorRef.current = false
      }

      const latestCanvas = canvasRef.current
      if (dirtyCanvas && latestCanvas) {
        await persistCurrentCanvas(latestCanvas)
      }
    })().catch((error) => {
      console.error("image-assistant.close-editor-failed", error)
    })
  }

  const renderCanvasLayer = (layer: ImageAssistantLayer) => {
    if (!layer.visible) return null

    const left = layer.transform.x * scale
    const top = layer.transform.y * scale
    const width = layer.transform.width * scale
    const height = layer.transform.height * scale
    const isSelected = selectedLayerId === layer.id
    const canSelect = layer.layer_type === "text" || layer.layer_type === "shape" || layer.layer_type === "image"
    const commonStyle = {
      left,
      top,
      width,
      height,
      opacity: layer.style?.opacity ?? 1,
      borderRadius: (layer.style?.borderRadius || 0) * scale,
      transform: `rotate(${layer.transform.rotation || 0}deg)`,
    }
    const selectionStyle = isSelected
      ? { boxShadow: "0 0 0 2px hsl(var(--primary)), 0 0 0 8px hsl(var(--primary) / 0.16)" }
      : undefined
    const handleSelect = (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!canSelect) return
      event.stopPropagation()
      setSelectedLayerId(layer.id)
      setCanvasTool("select")
    }
    const handlePointerDown = (event: ReactMouseEvent<HTMLDivElement>) => {
      handleSelect(event)
      startLayerDrag(event, layer)
    }

    if (layer.layer_type === "background" || layer.layer_type === "image" || layer.layer_type === "paint") {
      return (
        <div key={layer.id} className="absolute overflow-hidden" style={{ ...commonStyle, ...selectionStyle }} onMouseDown={handlePointerDown}>
          {layer.asset_url ? <img src={layer.asset_url} alt="" className="h-full w-full object-cover" /> : null}
        </div>
      )
    }

    if (layer.layer_type === "text") {
      return (
        <div
          key={layer.id}
          className={cn(
            "absolute flex items-start whitespace-pre-wrap rounded-2xl px-2 py-1 font-black",
            canvasTool === "select" ? "cursor-move" : "cursor-pointer",
          )}
          onMouseDown={handlePointerDown}
          style={{
            ...commonStyle,
            ...selectionStyle,
            color: layer.style?.color || layer.style?.fill || "#111827",
            fontSize: (layer.style?.fontSize || 42) * scale,
          }}
        >
          {layer.content?.text || imageCopy.textFallback}
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
        />
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
      />
    )
  }

  if (!availability) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {imageCopy.loadingApp}
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
            。{imageCopy.unavailableHint}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <header className="border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur-sm lg:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="mt-3 text-xl font-semibold text-foreground">{detail?.session.name || imageCopy.assistantName}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-[11px]" onClick={handleCreateSession}>
                {imageCopy.newDesign}
              </Button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-muted/10">
          <div className="mx-auto flex h-full w-full max-w-7xl px-3 py-3 lg:px-5">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-hidden rounded-[26px] border bg-card shadow-sm">
                <ScrollArea className="h-full">
                  <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-4 lg:px-5">
                    {displayMessages.length ? (
                      <>
                        {hasMoreMessages ? (
                          <div className="flex justify-center pb-1">
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
                        {displayMessages.map((message) => {
                          const optimisticUserMessageId = pendingTurn ? `${pendingTurn.id}:user` : null
                          const optimisticAssistantMessageId = pendingTurn ? `${pendingTurn.id}:assistant` : null
                          const optimisticAttachments =
                            optimisticUserMessageId && message.id === optimisticUserMessageId ? pendingTurn?.attachments || [] : []
                          const parsedContent = parseMessageBubbleContent(message.content)
                          const hasBubbleMeta = parsedContent.meta.length > 0
                          const bubbleAttachmentCount = optimisticAttachments.length
                          return (
                            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                              <div
                                className={cn(
                                  "w-fit max-w-[92%] overflow-hidden rounded-[24px] px-3.5 py-3 shadow-sm transition-all lg:max-w-[78%]",
                                  message.role === "user"
                                    ? "rounded-br-md bg-primary text-primary-foreground"
                                    : "rounded-bl-md border border-border bg-card text-foreground shadow-sm",
                                  message.role === "user" && bubbleAttachmentCount === 1 ? "max-w-[min(92%,27rem)]" : null,
                                  message.role === "user" && bubbleAttachmentCount > 1 ? "max-w-[min(92%,32rem)]" : null,
                                )}
                              >
                                <div
                                  className={cn(
                                    "mb-2 flex items-center gap-1.5 text-[10px] font-medium",
                                    message.role === "user" ? "opacity-80" : "text-muted-foreground",
                                  )}
                                >
                                  {message.role !== "user" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                                  {formatMessageRoleLabel(message.role, imageCopy)}
                                  {optimisticAssistantMessageId && message.id === optimisticAssistantMessageId && pendingTurn?.status === "running" ? (
                                    <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px]">
                                      {composerModeLabel}
                                    </Badge>
                                  ) : null}
                                </div>
                                {hasBubbleMeta ? (
                                  <div className="flex flex-col gap-2.5">
                                    {parsedContent.body ? (
                                      <p className="max-w-[30rem] whitespace-pre-wrap text-[14px] leading-6">{parsedContent.body}</p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-1.5">
                                      {parsedContent.meta.map((item) => (
                                        <span
                                          key={`${message.id}:${item.label}`}
                                          className={cn(
                                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm",
                                            message.role === "user"
                                              ? "bg-white/14 text-primary-foreground/92 ring-1 ring-white/12"
                                              : "bg-muted/70 text-muted-foreground ring-1 ring-border/70",
                                          )}
                                        >
                                          <span className="opacity-70">{item.label}</span>
                                          <span>{item.value}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="max-w-[32rem] whitespace-pre-wrap text-[14px] leading-6">{message.content}</p>
                                )}
                                {optimisticAttachments.length ? (
                                  <div className="mt-3 space-y-2.5">
                                    <div className="flex items-center gap-2 text-[10px] font-medium opacity-80">
                                      <span>{extraCopy.pendingImagesLabel}</span>
                                      <span
                                        className={cn(
                                          "rounded-full px-2 py-0.5 text-[9px]",
                                          message.role === "user" ? "bg-white/14 ring-1 ring-white/14" : "bg-muted/70 ring-1 ring-border/60",
                                        )}
                                      >
                                        {bubbleAttachmentCount}
                                      </span>
                                    </div>
                                    <div className={cn("grid gap-2", getBubbleAttachmentGridClass(bubbleAttachmentCount))}>
                                      {optimisticAttachments.map((attachment) => {
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
                                              "group overflow-hidden rounded-[20px] border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)]",
                                              message.role === "user"
                                                ? "border-white/14 bg-white/8"
                                                : "border-border/70 bg-background/70",
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
                                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2">
                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      {extraCopy.waitingReply}
                                    </div>
                                  </div>
                                ) : null}
                                {message.role === "assistant" && message.created_version_id
                                  ? (() => {
                                    const messageVersion = versionById.get(message.created_version_id)
                                    if (!messageVersion?.candidates.length) return null

                                    return (
                                      <div className={cn("mt-3 grid gap-3", messageVersion.candidates.length > 1 ? "sm:grid-cols-2" : "max-w-md")}>
                                        {messageVersion.candidates.map((candidate) => (
                                          <button
                                            key={candidate.id}
                                            type="button"
                                            data-testid={`image-open-canvas-${candidate.id}`}
                                            onClick={() => void openCanvasFromCandidate(messageVersion, candidate.id)}
                                            className="overflow-hidden rounded-[20px] border border-border/70 bg-background text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
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
                                            <div className="px-3 py-2 text-[11px] text-muted-foreground">{imageCopy.clickToRefine}</div>
                                          </button>
                                        ))}
                                      </div>
                                    )
                                  })()
                                  : null}
                              </div>
                            </div>
                          )
                        })}
                      </>
                    ) : (
                      <div className="space-y-3 rounded-[24px] border border-dashed bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Sparkles className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-[0.18em]">{imageCopy.quickStart}</span>
                        </div>
                        <div className="grid gap-2.5 lg:grid-cols-3">
                          {imageCopy.starterPrompts.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setPrompt(item)}
                              className="rounded-2xl border bg-background px-3.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                              <p className="text-[12px] leading-5 text-muted-foreground">{item}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {isBusy && !pendingTurn ? (
                      <div className="flex justify-start">
                        <div className="rounded-[24px] rounded-bl-md border border-border bg-card px-3.5 py-3 text-xs text-muted-foreground shadow-sm">
                          <span className="animate-pulse">{imageCopy.generatingCandidates}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              </div>
              <section
                data-testid="image-composer-dropzone"
                className={cn(
                  "relative rounded-[24px] border bg-background/96 p-2.5 shadow-lg backdrop-blur transition-colors",
                  isComposerDragActive && "border-primary bg-primary/5",
                )}
                onDragEnter={handleComposerDragEnter}
                onDragOver={handleComposerDragOver}
                onDragLeave={handleComposerDragLeave}
                onDrop={handleComposerDrop}
              >
                {isComposerDragActive ? (
                  <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[20px] border border-dashed border-primary/60 bg-background/92 px-4 text-center shadow-sm">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{extraCopy.dragDropActiveHint}</p>
                      <p className="text-xs text-muted-foreground">{extraCopy.dragDropHint}</p>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={sizePreset}
                    onChange={(event) => setSizePreset(event.target.value as ImageAssistantSizePreset)}
                    className="h-9 rounded-2xl border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
                    disabled={isBusy || isUploading}
                  >
                    <option value="1:1">1:1</option>
                    <option value="4:5">4:5</option>
                    <option value="3:4">3:4</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                  <select
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value as ImageAssistantResolution)}
                    className="h-9 rounded-2xl border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
                    disabled={isBusy || isUploading}
                  >
                    <option value="512">512 (0.5K)</option>
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-full"
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
                  <div className="ml-auto flex flex-wrap gap-2">
                    {(promptPresets.length ? promptPresets : PROMPT_PRESETS).map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setPrompt(item.prompt)}
                        className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {pendingAttachments.length ? (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-[20px] border border-border/70 bg-muted/30 px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {pendingAttachments.length}/{IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {pendingAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="group flex items-center gap-2 rounded-2xl border border-border bg-background px-2 py-2 shadow-sm"
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

                <div className="mt-2 rounded-[22px] border border-border/70 bg-card">
                  <Textarea
                    data-testid="image-prompt-input"
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value)
                      if (jobError) setJobError(null)
                    }}
                    placeholder={extraCopy.additionalNotesPlaceholder}
                    className="min-h-14 resize-none border-0 bg-transparent px-3.5 py-3 text-[13px] leading-6 shadow-none focus-visible:ring-0"
                    disabled={isBusy}
                  />
                  {jobError ? (
                    <div className="px-3.5 pb-1 text-[12px] text-destructive">{jobError}</div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3.5 py-2.5">
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      {composerAttachmentCount
                        ? imageCopy.imagesAttached.replace("{count}", String(composerAttachmentCount))
                        : imageCopy.noImageAttached}
                      {" / "}
                      {sizePreset}
                      {" / "}
                      {resolution}
                      {" / "}
                      {extraCopy.uploadLimit}
                    </p>
                    <div className="flex items-center gap-2">
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
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={mode === "canvas"} onOpenChange={(open) => { if (!open) handleCloseEditor() }}>
        <DialogContent showCloseButton={false} className="h-[min(92vh,1040px)] w-[min(96vw,1680px)] max-w-[min(96vw,1680px)] border-0 bg-transparent p-0 shadow-none sm:max-w-[min(96vw,1680px)]">
          <DialogTitle className="sr-only">{imageCopy.editorTitle}</DialogTitle>
          <div className="relative grid h-full w-full grid-cols-[minmax(0,1fr)_92px] items-stretch gap-4 overflow-hidden rounded-[32px] border border-border/70 bg-background/45 p-4 shadow-[0_40px_120px_-45px_rgba(15,23,42,0.45)] backdrop-blur-md md:gap-5 md:p-5 lg:gap-6 lg:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.5),rgba(255,255,255,0.2)_38%,rgba(15,23,42,0.12)_100%)]" />

            <div className="relative z-10 col-start-1 row-start-1 min-w-0 overflow-hidden rounded-[28px] border border-border/60 bg-background/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              {selectedLayer?.layer_type === "text" ? (
                <div className="absolute right-4 bottom-24 z-20 w-[min(560px,calc(100%-32px))] rounded-[18px] border border-border bg-background/94 p-3 shadow-lg backdrop-blur">
                  <p className="mb-2 text-[11px] font-medium text-foreground">{imageCopy.textLabel}</p>
                  <Input
                    value={selectedLayer.content?.text || ""}
                    onChange={(event) => updateSelectedText(event.target.value)}
                    className="h-10 rounded-xl border-border bg-background"
                    placeholder={imageCopy.editTextPlaceholder}
                  />
                </div>
              ) : null}

              <div
                ref={canvasViewportRef}
                className="relative flex h-full w-full min-w-0 items-center justify-center overflow-auto px-4 py-4 pb-28 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:px-6 md:py-6 md:pb-32"
              >
                {canvas ? (
                  <div
                    ref={canvasStageRef}
                    data-testid="image-canvas-stage"
                    className="relative overflow-hidden rounded-[32px] border border-border/80 bg-background shadow-[0_40px_120px_-55px_rgba(15,23,42,0.42)]"
                    style={{ width: canvas.width * scale, height: canvas.height * scale, flex: "0 0 auto" }}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setSelectedLayerId(null)
                      }
                    }}
                  >
                    {[...canvas.layers].sort((a, b) => a.z_index - b.z_index).map(renderCanvasLayer)}
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
                              points={paintPreview.points.map((point) => `${point.x},${point.y}`).join(" ")}
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
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-border bg-white/80 p-8 text-sm text-muted-foreground">{imageCopy.openImageToEdit}</div>
                )}
              </div>

              <div className="absolute bottom-4 left-[calc(50%-46px)] z-20 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-[20px] border border-border bg-background/92 p-2 shadow-lg backdrop-blur">
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

              <div className="absolute bottom-16 left-[calc(50%-46px)] z-20 flex max-w-[min(680px,calc(100%-140px))] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/88 px-3 py-2 shadow-lg backdrop-blur">
                <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
                  {imageCopy.attachOnClose}
                </Badge>
                <p className="text-[11px] text-muted-foreground">{imageCopy.autoSaveHint}</p>
              </div>
            </div>

            <div className="relative z-20 col-start-2 row-start-1 flex h-full items-center justify-center">
              <div className="pointer-events-auto flex h-fit w-[92px] flex-col items-center gap-2 rounded-[28px] border border-border/70 bg-background/94 px-2 py-3 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px]">
                  {dirtyCanvas ? imageCopy.unsaved : imageCopy.synced}
                </Badge>
                <Button data-testid="image-select-tool" size="icon" variant={canvasTool === "select" ? "default" : "outline"} onClick={() => { setCanvasTool("select"); setPaintPreview(null) }} title={imageCopy.selectTool} className="h-11 w-11 rounded-full">
                  <MousePointer2 className="h-4.5 w-4.5" />
                </Button>
                <Button data-testid="image-brush-tool" size="icon" variant={canvasTool === "brush" ? "default" : "outline"} onClick={() => setCanvasTool((current) => (current === "brush" ? "select" : "brush"))} title={imageCopy.brushTool} className="h-11 w-11 rounded-full">
                  <Pencil className="h-4.5 w-4.5" />
                </Button>
                <Button data-testid="image-eraser-tool" size="icon" variant={canvasTool === "eraser" ? "default" : "outline"} onClick={() => setCanvasTool((current) => (current === "eraser" ? "select" : "eraser"))} title={imageCopy.eraserTool} className="h-11 w-11 rounded-full">
                  <Eraser className="h-4.5 w-4.5" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => addShapeToCanvas("rect")} title={imageCopy.shapeTool} className="h-11 w-11 rounded-full">
                  <Square className="h-4.5 w-4.5" />
                </Button>
                <Button size="icon" variant="outline" onClick={addTextToCanvas} title={imageCopy.textTool} className="h-11 w-11 rounded-full">
                  <Type className="h-4.5 w-4.5" />
                </Button>
                <div className="my-1 h-px w-8 bg-border" />
                <div className="flex flex-col items-center gap-2 rounded-[22px] border border-border/80 bg-muted/20 px-2 py-2">
                  <Palette className="h-3.5 w-3.5 text-primary" />
                  <input
                    aria-label={imageCopy.brushColor}
                    type="color"
                    value={brushColor}
                    onChange={(event) => updateSelectedLayerColor(event.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-full border border-border bg-transparent p-1"
                  />
                </div>
                <div className="my-1 h-px w-8 bg-border" />
                <Button variant="outline" size="icon" data-testid="image-canvas-undo-button" onClick={undoCanvasChange} disabled={!undoStack.length} title={imageCopy.undo} className="h-11 w-11 rounded-full">
                  <Undo2 className="h-4.5 w-4.5" />
                </Button>
                <Button variant="outline" size="icon" data-testid="image-canvas-redo-button" onClick={redoCanvasChange} disabled={!redoStack.length} title={imageCopy.redo} className="h-11 w-11 rounded-full">
                  <Redo2 className="h-4.5 w-4.5" />
                </Button>
                <Button variant="outline" size="icon" onClick={removeSelectedLayer} disabled={!selectedLayerId || !selectedLayer || !isEditableLayer(selectedLayer)} title={imageCopy.delete} className="h-11 w-11 rounded-full">
                  <Trash2 className="h-4.5 w-4.5" />
                </Button>
                <div className="my-1 h-px w-8 bg-border" />
                <Button
                  variant="outline"
                  size="icon"
                  data-testid="image-canvas-export-button"
                  className="h-11 w-11 rounded-full"
                  onClick={() => void exportCurrent("png")}
                  title={imageCopy.export}
                >
                  <Download className="h-4.5 w-4.5" />
                </Button>
                <Button variant="ghost" size="icon" data-testid="image-canvas-close-button" onClick={handleCloseEditor} title={imageCopy.close} className="h-11 w-11 rounded-full">
                  <X className="h-4.5 w-4.5" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
