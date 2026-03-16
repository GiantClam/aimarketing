"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Circle,
  Crop,
  Download,
  Eraser,
  Eye,
  EyeOff,
  ImageIcon,
  Lock,
  Loader2,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RectangleHorizontal,
  Save,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { exportImageAssistantDataUrl } from "@/lib/image-assistant/export"
import type {
  ImageAssistantAsset,
  ImageAssistantCanvasDocument,
  ImageAssistantConversationSummary,
  ImageAssistantLayer,
  ImageAssistantShapeType,
  ImageAssistantSessionDetail,
  ImageAssistantSizePreset,
  ImageAssistantVersionSummary,
} from "@/lib/image-assistant/types"

type Availability = {
  enabled: boolean
  reason: string | null
  provider: string
}

type CanvasTool = "select" | "mask" | "brush" | "eraser"
type PaintTool = "brush" | "eraser"

type MaskSelection = {
  x: number
  y: number
  width: number
  height: number
}

type PaintPreview = {
  layerId: string
  tool: PaintTool
  points: Array<{ x: number; y: number }>
  strokeWidth: number
  color: string
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

function normalizeMaskSelection(
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
  height: number,
): MaskSelection {
  const left = clamp(Math.min(start.x, end.x), 0, width)
  const top = clamp(Math.min(start.y, end.y), 0, height)
  const right = clamp(Math.max(start.x, end.x), 0, width)
  const bottom = clamp(Math.max(start.y, end.y), 0, height)

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("image_load_failed"))
    img.src = url
  })
}

function createTextLayer(): ImageAssistantLayer {
  return {
    id: `local-${Date.now()}`,
    layer_type: "text",
    name: "文本",
    z_index: Date.now(),
    visible: true,
    locked: false,
    transform: { x: 120, y: 120, width: 320, height: 80, rotation: 0 },
    style: { color: "#111827", fontSize: 56, fontWeight: 800, opacity: 1 },
    content: { text: "新品发布" },
    asset_id: null,
  }
}

function createShapeLayer(shapeType: ImageAssistantShapeType): ImageAssistantLayer {
  return {
    id: `local-${Date.now()}`,
    layer_type: "shape",
    name: shapeType,
    z_index: Date.now(),
    visible: true,
    locked: false,
    transform: { x: 180, y: 180, width: 260, height: shapeType === "line" || shapeType === "arrow" ? 24 : 180, rotation: 0 },
    style: { fill: shapeType === "rect" || shapeType === "circle" ? "#f97316" : "#0f172a", stroke: "#0f172a", strokeWidth: 3, opacity: 0.9, borderRadius: 18 },
    content: { shapeType },
    asset_id: null,
  }
}

function createImageLayer(asset: ImageAssistantAsset): ImageAssistantLayer {
  return {
    id: `local-${Date.now()}`,
    layer_type: "image",
    name: "贴图",
    z_index: Date.now(),
    visible: true,
    locked: false,
    transform: { x: 160, y: 160, width: 260, height: 260, rotation: 0 },
    style: { opacity: 1, borderRadius: 24 },
    content: null,
    asset_id: asset.id,
    asset_url: asset.url,
  }
}

function createPaintLayer(width: number, height: number): ImageAssistantLayer {
  return {
    id: `local-paint-${Date.now()}`,
    layer_type: "paint",
    name: "画笔层",
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

function createCanvasFromAsset(asset: ImageAssistantAsset): ImageAssistantCanvasDocument {
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
        name: "底图",
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

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(json?.error || `http_${response.status}`)
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

export function ImageAssistantWorkspace({ initialSessionId }: { initialSessionId: string | null }) {
  const router = useRouter()
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [sessions, setSessions] = useState<ImageAssistantConversationSummary[]>([])
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId)
  const [detail, setDetail] = useState<ImageAssistantSessionDetail | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [mode, setMode] = useState<"chat" | "canvas">("chat")
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select")
  const [maskSelection, setMaskSelection] = useState<MaskSelection | null>(null)
  const [paintPreview, setPaintPreview] = useState<PaintPreview | null>(null)
  const [prompt, setPrompt] = useState("")
  const [editingPrompt, setEditingPrompt] = useState("")
  const [sizePreset, setSizePreset] = useState<ImageAssistantSizePreset>("4:5")
  const [qualityMode, setQualityMode] = useState<"high" | "low_cost">("high")
  const [isBusy, setIsBusy] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [canvas, setCanvas] = useState<ImageAssistantCanvasDocument | null>(null)
  const [undoStack, setUndoStack] = useState<ImageAssistantCanvasDocument[]>([])
  const [redoStack, setRedoStack] = useState<ImageAssistantCanvasDocument[]>([])
  const [isSavingCanvas, setIsSavingCanvas] = useState(false)
  const [dirtyCanvas, setDirtyCanvas] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stickerInputRef = useRef<HTMLInputElement | null>(null)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; rectLeft: number; rectTop: number } | null>(null)
  const dragSnapshotRef = useRef<ImageAssistantCanvasDocument | null>(null)
  const maskDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const paintStrokeRef = useRef<PaintPreview | null>(null)
  const creatingSessionRef = useRef<Promise<string> | null>(null)
  const modeRef = useRef(mode)
  const canvasRef = useRef(canvas)

  const refreshSessions = async () => {
    const json = await requestJson("/api/image-assistant/sessions?limit=30")
    setSessions(json.data || [])
  }

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
      if (isSameCanvasDocument(previousSnapshot, nextSnapshot)) {
        return
      }

      setCanvas(nextSnapshot)
      if (options?.recordHistory !== false) {
        setUndoStack((current) => [...current.slice(-39), previousSnapshot])
        setRedoStack([])
      }
      if (options?.markDirty !== false) {
        setDirtyCanvas(true)
      }
      setSelectedLayerId((current) => (current && nextSnapshot.layers.some((layer) => layer.id === current) ? current : null))
    },
    [],
  )

  const refreshDetail = useCallback(async (targetSessionId: string, options?: { preserveCanvas?: boolean }) => {
    const json = await requestJson(`/api/image-assistant/sessions/${targetSessionId}`)
    const nextDetail = json.data as ImageAssistantSessionDetail
    const shouldPreserveCanvas = Boolean(options?.preserveCanvas && modeRef.current === "canvas" && canvasRef.current)
    setDetail(nextDetail)
    setSelectedVersionId(nextDetail.session.current_version_id || nextDetail.versions[0]?.id || null)
    if (nextDetail.canvas_document) {
      if (!shouldPreserveCanvas) {
        resetCanvasHistory()
      }
      setCanvas(nextDetail.canvas_document)
      setMode("canvas")
    } else if (!shouldPreserveCanvas) {
      resetCanvasHistory()
      setCanvas(null)
      setMode(nextDetail.session.current_mode || "chat")
    } else {
      setMode("canvas")
    }
    return nextDetail
  }, [resetCanvasHistory])

  const syncSessionRoute = (targetSessionId: string) => {
    router.replace(`/dashboard/image-assistant/${targetSessionId}`)
  }

  const scale = useMemo(() => {
    if (!canvas) return 1
    return Math.min(680 / canvas.width, 680 / canvas.height, 1)
  }, [canvas])

  useEffect(() => {
    void requestJson("/api/image-assistant/availability").then((json) => setAvailability(json.data))
    void refreshSessions()
  }, [])

  useEffect(() => {
    modeRef.current = mode
    canvasRef.current = canvas
  }, [canvas, mode])

  useEffect(() => {
    if (sessionId) {
      void refreshDetail(sessionId)
    } else {
      resetCanvasHistory()
      setDetail(null)
      setCanvas(null)
    }
  }, [refreshDetail, resetCanvasHistory, sessionId])

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!dragRef.current) return
      setCanvas((current) => {
        if (!current) return current
        return {
          ...current,
          layers: current.layers.map((layer) =>
            layer.id === dragRef.current!.id
              ? {
                  ...layer,
                  transform: {
                    ...layer.transform,
                    x: Math.max(0, (event.clientX - dragRef.current!.rectLeft) / scale - dragRef.current!.offsetX),
                    y: Math.max(0, (event.clientY - dragRef.current!.rectTop) / scale - dragRef.current!.offsetY),
                  },
                }
              : layer,
          ),
        }
      })
      setDirtyCanvas(true)
    }
    const up = () => {
      if (dragSnapshotRef.current && canvasRef.current && !isSameCanvasDocument(dragSnapshotRef.current, canvasRef.current)) {
        setUndoStack((current) => [...current.slice(-39), dragSnapshotRef.current!])
        setRedoStack([])
      }
      dragSnapshotRef.current = null
      dragRef.current = null
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
  }, [scale])

  const currentVersion = useMemo(
    () => detail?.versions.find((item) => item.id === selectedVersionId) || detail?.versions[0] || null,
    [detail?.versions, selectedVersionId],
  )
  const currentCandidate = useMemo(
    () => currentVersion?.candidates.find((candidate) => candidate.is_selected) || currentVersion?.candidates[0] || null,
    [currentVersion],
  )
  const selectedLayer = useMemo(
    () => canvas?.layers.find((layer) => layer.id === selectedLayerId) || null,
    [canvas?.layers, selectedLayerId],
  )
  const layerStack = useMemo(
    () => (canvas ? [...canvas.layers].sort((a, b) => b.z_index - a.z_index) : []),
    [canvas],
  )

  const createSession = async (title?: string) => {
    const json = await requestJson("/api/image-assistant/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /*
      body: JSON.stringify({ title: title || prompt || "鏈懡鍚嶈璁? }),
      */
      body: JSON.stringify({ title: title || prompt || "Untitled design" }),
    })
    const nextSession = json.data as ImageAssistantConversationSummary
    setSessionId(nextSession.id)
    await refreshSessions()
    return nextSession.id
  }

  const ensureSession = async () => {
    if (sessionId) return sessionId
    if (!creatingSessionRef.current) {
      creatingSessionRef.current = createSession().finally(() => {
        creatingSessionRef.current = null
      })
    }
    return creatingSessionRef.current
    /*
    const json = await requestJson("/api/image-assistant/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: prompt || "未命名设计" }),
    })
    const nextSession = json.data as ImageAssistantConversationSummary
    setSessionId(nextSession.id)
    router.replace(`/dashboard/image-assistant/${nextSession.id}`)
    await refreshSessions()
    return nextSession.id
    */
  }

  const runJob = async (kind: "generate" | "edit", overridePrompt?: string) => {
    const nextPrompt = (overridePrompt ?? prompt).trim()
    if (!nextPrompt) return
    setIsBusy(true)
    try {
      const nextSessionId = await ensureSession()
      await requestJson(`/api/image-assistant/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: nextSessionId,
          prompt: nextPrompt,
          referenceAssetIds: detail?.assets.filter((asset) => asset.asset_type === "reference").map((asset) => asset.id) || [],
          candidateCount: 4,
          sizePreset,
          qualityMode,
          parentVersionId: detail?.session.current_version_id || null,
        }),
      })
      setPrompt("")
      await refreshSessions()
      await refreshDetail(nextSessionId)
      syncSessionRoute(nextSessionId)
    } finally {
      setIsBusy(false)
    }
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setIsUploading(true)
    try {
      const nextSessionId = await ensureSession()
      for (const file of Array.from(files).slice(0, 5)) {
        const url = URL.createObjectURL(file)
        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
          img.src = url
        })
        const form = new FormData()
        form.append("sessionId", nextSessionId)
        form.append("file", file)
        form.append("referenceRole", "subject")
        form.append("width", String(dimensions.width))
        form.append("height", String(dimensions.height))
        await requestJson("/api/image-assistant/assets/upload", { method: "POST", body: form })
      }
      await refreshDetail(nextSessionId)
      await refreshSessions()
      syncSessionRoute(nextSessionId)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
      if (stickerInputRef.current) stickerInputRef.current.value = ""
    }
  }

  const openCanvasFromCandidate = async (version: ImageAssistantVersionSummary, candidateId: string) => {
    if (!sessionId) return
    const localCandidate = version.candidates.find((candidate) => candidate.id === candidateId) || null
    const localAsset =
      (localCandidate ? detail?.assets.find((item) => item.id === localCandidate.asset_id) : null) ||
      (localCandidate
        ? {
            id: localCandidate.asset_id,
            session_id: sessionId,
            asset_type: "generated" as const,
            reference_role: null,
            url: localCandidate.url,
            mime_type: "image/png",
            file_size: 0,
            width: null,
            height: null,
            status: "ready",
            meta: null,
            created_at: Math.floor(Date.now() / 1000),
          }
        : null)

    if (localAsset) {
      const nextCanvas = createCanvasFromAsset(localAsset)
      resetCanvasHistory()
      setCanvas(nextCanvas)
      setMode("canvas")
      setCanvasTool("select")
      setMaskSelection(null)
      setPaintPreview(null)
      setSelectedLayerId(nextCanvas.layers[0]?.id || null)
      setDirtyCanvas(true)
    }

    try {
      await requestJson(`/api/image-assistant/versions/${version.id}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, candidateId }),
      })
      await refreshDetail(sessionId, { preserveCanvas: true })
    } catch (error) {
      console.error("image-assistant.open-canvas-failed", {
        sessionId,
        versionId: version.id,
        candidateId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const saveCanvas = async () => {
    if (!sessionId || !canvas) return
    setIsSavingCanvas(true)
    try {
      const json = await persistCanvasDocument({
        sessionId,
        canvasDocumentId: canvas.id || null,
        baseVersionId: currentVersion?.id || null,
        width: canvas.width,
        height: canvas.height,
        backgroundAssetId: canvas.background_asset_id,
        revision: canvas.revision,
        layers: canvas.layers,
      })
      setCanvas((current) => (current ? { ...current, id: json.data.canvasDocumentId, revision: json.data.revision } : current))
      setDirtyCanvas(false)
      await refreshSessions()
      await refreshDetail(sessionId, { preserveCanvas: true })
    } finally {
      setIsSavingCanvas(false)
    }
  }

  useEffect(() => {
    if (!dirtyCanvas || mode !== "canvas" || !sessionId || !canvas) return
    const timer = window.setTimeout(() => {
      void (async () => {
        const json = await persistCanvasDocument({
          sessionId,
          canvasDocumentId: canvas.id || null,
          baseVersionId: currentVersion?.id || null,
          width: canvas.width,
          height: canvas.height,
          backgroundAssetId: canvas.background_asset_id,
          revision: canvas.revision,
          layers: canvas.layers,
        })
        setCanvas((current) => (current ? { ...current, id: json.data.canvasDocumentId, revision: json.data.revision } : current))
        setDirtyCanvas(false)
        await refreshSessions()
        await refreshDetail(sessionId, { preserveCanvas: true })
      })()
    }, 10_000)
    return () => window.clearTimeout(timer)
  }, [canvas, currentVersion?.id, dirtyCanvas, mode, refreshDetail, sessionId])

  const continueAiEditFromCanvas = async () => {
    if (!canvas || !sessionId || !editingPrompt.trim()) return
    setIsBusy(true)
    try {
      const dataUrl = await exportImageAssistantDataUrl({ width: canvas.width, height: canvas.height, layers: canvas.layers, format: "png" })
      const exported = await requestJson("/api/image-assistant/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, canvasDocumentId: canvas.id || null, versionId: currentVersion?.id || null, dataUrl, format: "png", sizePreset }),
      })
      await requestJson("/api/image-assistant/canvas-snapshot-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          snapshotAssetId: exported.data.id,
          prompt: editingPrompt,
          parentVersionId: currentVersion?.id || null,
          sizePreset,
          qualityMode,
          candidateCount: 4,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          selectionBounds: maskSelection,
        }),
      })
      setEditingPrompt("")
      setMaskSelection(null)
      setPaintPreview(null)
      setCanvasTool("select")
      setMode("chat")
      await refreshDetail(sessionId)
    } finally {
      setIsBusy(false)
    }
  }

  const exportCurrent = async (format: "png" | "jpg" | "webp") => {
    if (!canvas || !sessionId) return
    const dataUrl = await exportImageAssistantDataUrl({ width: canvas.width, height: canvas.height, layers: canvas.layers, format })
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `image-design-${Date.now()}.${format === "jpg" ? "jpg" : format}`
    a.click()
    await requestJson("/api/image-assistant/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, canvasDocumentId: canvas.id || null, versionId: currentVersion?.id || null, dataUrl, format, sizePreset }),
    })
  }

  const undoCanvasChange = useCallback(() => {
    setUndoStack((current) => {
      if (!current.length || !canvasRef.current) return current
      const previous = current[current.length - 1]
      setRedoStack((redoCurrent) => [...redoCurrent.slice(-39), cloneCanvasDocument(canvasRef.current!)])
      setCanvas(previous)
      setDirtyCanvas(true)
      setSelectedLayerId((selected) => (selected && previous.layers.some((layer) => layer.id === selected) ? selected : null))
      setPaintPreview(null)
      return current.slice(0, -1)
    })
  }, [])

  const redoCanvasChange = useCallback(() => {
    setRedoStack((current) => {
      if (!current.length || !canvasRef.current) return current
      const next = current[current.length - 1]
      setUndoStack((undoCurrent) => [...undoCurrent.slice(-39), cloneCanvasDocument(canvasRef.current!)])
      setCanvas(next)
      setDirtyCanvas(true)
      setSelectedLayerId((selected) => (selected && next.layers.some((layer) => layer.id === selected) ? selected : null))
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
      if (key === "z" && !event.shiftKey) {
        event.preventDefault()
        undoCanvasChange()
        return
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault()
        redoCanvasChange()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [redoCanvasChange, undoCanvasChange])

  const addLayer = (layer: ImageAssistantLayer) => {
    applyCanvasChange((current) => {
      if (!current) return current
      const nextZIndex = current.layers.reduce((max, item) => Math.max(max, item.z_index), -1) + 1
      return {
        ...current,
        layers: [...current.layers, { ...layer, z_index: nextZIndex }].sort((a, b) => a.z_index - b.z_index),
      }
    })
    setSelectedLayerId(layer.id)
  }

  const updateSelectedLayer = (patch: Partial<ImageAssistantLayer>) => {
    if (!selectedLayerId) return
    applyCanvasChange((current) =>
      current
        ? {
            ...current,
            layers: current.layers.map((layer) => (layer.id === selectedLayerId ? { ...layer, ...patch } : layer)),
          }
        : current,
    )
  }

  const updateSelectedTransform = (patch: Partial<ImageAssistantLayer["transform"]>) => {
    if (!selectedLayer) return
    updateSelectedLayer({ transform: { ...selectedLayer.transform, ...patch } })
  }

  const updateLayerById = (layerId: string, updater: (layer: ImageAssistantLayer) => ImageAssistantLayer) => {
    applyCanvasChange((current) =>
      current
        ? {
            ...current,
            layers: current.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
          }
        : current,
    )
  }

  const toggleLayerVisibility = (layerId: string) => {
    updateLayerById(layerId, (layer) => ({ ...layer, visible: !layer.visible }))
  }

  const toggleLayerLock = (layerId: string) => {
    updateLayerById(layerId, (layer) => ({ ...layer, locked: !layer.locked }))
  }

  const deleteLayer = (layerId: string) => {
    applyCanvasChange((current) =>
      current
        ? {
            ...current,
            layers: current.layers
              .filter((layer) => layer.id !== layerId)
              .sort((a, b) => a.z_index - b.z_index)
              .map((layer, index) => ({ ...layer, z_index: index })),
          }
        : current,
    )
    setSelectedLayerId((current) => (current === layerId ? null : current))
  }

  const reorderLayer = (layerId: string, direction: "forward" | "backward") => {
    applyCanvasChange((current) => {
      if (!current) return current
      const ordered = [...current.layers].sort((a, b) => a.z_index - b.z_index)
      const index = ordered.findIndex((layer) => layer.id === layerId)
      if (index < 0) return current
      const targetIndex = direction === "forward" ? Math.min(ordered.length - 1, index + 1) : Math.max(0, index - 1)
      if (targetIndex === index) return current
      const [moved] = ordered.splice(index, 1)
      ordered.splice(targetIndex, 0, moved)
      return {
        ...current,
        layers: ordered.map((layer, orderedIndex) => ({ ...layer, z_index: orderedIndex })),
      }
    })
  }

  const ensurePaintLayer = useCallback(() => {
    if (!canvas) return null
    const existing = [...canvas.layers].sort((a, b) => b.z_index - a.z_index).find((layer) => layer.layer_type === "paint") || null
    if (existing) return existing

    return createPaintLayer(canvas.width, canvas.height)
  }, [canvas])

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

  const startPaintStroke = (event: ReactMouseEvent<HTMLDivElement>, tool: PaintTool) => {
    const point = getCanvasPoint(event)
    const layer = ensurePaintLayer()
    if (!point || !layer) return
    event.preventDefault()
    event.stopPropagation()
    const preview = {
      layerId: layer.id,
      tool,
      points: [point],
      strokeWidth: layer.style?.strokeWidth || 18,
      color: layer.style?.stroke || layer.style?.color || "#111827",
    } satisfies PaintPreview
    paintStrokeRef.current = preview
    setPaintPreview(preview)
    setSelectedLayerId(layer.id)
    setMaskSelection(null)
  }

  const updatePaintStroke = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!paintStrokeRef.current) return
    const point = getCanvasPoint(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    const nextPreview = {
      ...paintStrokeRef.current,
      points: [...paintStrokeRef.current.points, point],
    }
    paintStrokeRef.current = nextPreview
    setPaintPreview(nextPreview)
  }

  const finishPaintStroke = async () => {
    const activeStroke = paintStrokeRef.current
    paintStrokeRef.current = null
    setPaintPreview(null)
    if (!canvas || !activeStroke || activeStroke.points.length < 2) return

    const currentCanvas = canvasRef.current || canvas
    const targetLayer = currentCanvas.layers.find((layer) => layer.id === activeStroke.layerId) || null

    const bitmap = document.createElement("canvas")
    bitmap.width = canvas.width
    bitmap.height = canvas.height
    const ctx = bitmap.getContext("2d")
    if (!ctx) return

    if (targetLayer?.asset_url) {
      try {
        const image = await loadImageElement(targetLayer.asset_url)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      } catch (error) {
        console.warn("image-assistant.paint-layer.load-failed", error)
      }
    }

    ctx.save()
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.lineWidth = activeStroke.strokeWidth
    ctx.globalCompositeOperation = activeStroke.tool === "eraser" ? "destination-out" : "source-over"
    ctx.strokeStyle = activeStroke.tool === "eraser" ? "rgba(0,0,0,1)" : activeStroke.color
    ctx.beginPath()
    ctx.moveTo(activeStroke.points[0].x, activeStroke.points[0].y)
    for (const point of activeStroke.points.slice(1)) {
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()

    const dataUrl = bitmap.toDataURL("image/png")
    applyCanvasChange((current) => {
      if (!current) return current
      const fallbackLayer = {
        ...createPaintLayer(current.width, current.height),
        id: activeStroke.layerId,
      }
      const nextLayer = {
        ...(current.layers.find((layer) => layer.id === activeStroke.layerId) || fallbackLayer),
        asset_url: dataUrl,
        transform: {
          x: 0,
          y: 0,
          width: current.width,
          height: current.height,
          rotation: 0,
        },
      }
      const hasExistingLayer = current.layers.some((layer) => layer.id === activeStroke.layerId)
      return {
        ...current,
        layers: hasExistingLayer
          ? current.layers.map((layer) => (layer.id === activeStroke.layerId ? nextLayer : layer))
          : [...current.layers, { ...nextLayer, z_index: current.layers.reduce((max, item) => Math.max(max, item.z_index), -1) + 1 }].sort((a, b) => a.z_index - b.z_index),
      }
    })
    setSelectedLayerId(activeStroke.layerId)
  }

  const startMaskSelection = (event: ReactMouseEvent<HTMLDivElement>) => {
    const point = getCanvasPoint(event)
    if (!point || !canvas) return
    event.preventDefault()
    event.stopPropagation()
    maskDragStartRef.current = point
    setSelectedLayerId(null)
    setMaskSelection({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const updateMaskSelection = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!canvas || !maskDragStartRef.current) return
    const point = getCanvasPoint(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    setMaskSelection(normalizeMaskSelection(maskDragStartRef.current, point, canvas.width, canvas.height))
  }

  const finishMaskSelection = () => {
    maskDragStartRef.current = null
    setCanvasTool("select")
    setMaskSelection((current) => {
      if (!current || current.width < 16 || current.height < 16) return null
      return current
    })
  }

  if (availability && !availability.enabled) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-3xl border border-border bg-card p-8 shadow-sm">
          <p className="font-sans text-2xl font-semibold text-foreground">图片设计助手暂不可用</p>
          <p className="mt-3 text-sm text-muted-foreground">原因：{availability.reason || "unknown"}。若本地调试，请配置 Aiberm key 或设置 `IMAGE_ASSISTANT_FIXTURES=true`。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.08),_transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))]">
      <aside className="flex w-80 min-w-80 flex-col border-r border-border bg-white/80">
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-sans text-lg font-semibold">图片设计助手</p>
              <p className="text-xs text-muted-foreground">对话生成 + 画布精修</p>
            </div>
            <Button
              size="sm"
              data-testid="image-assistant-new-session-button"
              onClick={() =>
                void createSession("Untitled design")
                  .then((id) => {
                    resetCanvasHistory()
                    setDetail(null)
                    setCanvas(null)
                    setSelectedVersionId(null)
                    setSelectedLayerId(null)
                    setPrompt("")
                    setEditingPrompt("")
                    setMode("chat")
                    syncSessionRoute(id)
                  })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> 新建设计
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-border p-4">
          <Button variant={mode === "chat" ? "default" : "outline"} onClick={() => setMode("chat")}>AI</Button>
          <Button variant={mode === "canvas" ? "default" : "outline"} onClick={() => setMode("canvas")} disabled={!canvas && !currentCandidate}>Canvas</Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-5 p-4">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">会话</p>
                <Badge variant="secondary">{sessions.length}</Badge>
              </div>
              <div className="space-y-2">
                {sessions.map((item) => (
                  <button
                    key={item.id}
                    data-testid={`image-session-${item.id}`}
                    className={cn("w-full rounded-2xl border px-3 py-3 text-left transition", sessionId === item.id ? "border-orange-300 bg-orange-50" : "border-border bg-white hover:border-orange-200")}
                    onClick={() => {
                      setSessionId(item.id)
                      router.replace(`/dashboard/image-assistant/${item.id}`)
                    }}
                  >
                    <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(item.updated_at * 1000).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">版本</p>
                <Badge variant="secondary">{detail?.versions.length || 0}</Badge>
              </div>
              <div className="space-y-2">
                {(detail?.versions || []).map((version) => (
                  <button
                    key={version.id}
                    className={cn("w-full rounded-2xl border px-3 py-3 text-left", selectedVersionId === version.id ? "border-sky-300 bg-sky-50" : "border-border bg-white")}
                    onClick={() => setSelectedVersionId(version.id)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{version.version_kind}</p>
                      <Badge variant="outline">{version.candidates.length} 张</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{version.prompt_text || "无 prompt"}</p>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">素材库</p>
                <Button size="sm" variant="outline" data-testid="image-reference-upload-button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />} 上传
                </Button>
                <input ref={fileInputRef} data-testid="image-reference-file-input" className="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void uploadFiles(event.target.files)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(detail?.assets || []).map((asset) => (
                  <button
                    key={asset.id}
                    className="overflow-hidden rounded-2xl border border-border bg-white text-left"
                    onClick={() => {
                      if (mode === "canvas") {
                        addLayer(createImageLayer(asset))
                      }
                    }}
                  >
                    <div className="aspect-square bg-slate-100">
                      {asset.url ? <img src={asset.url} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] font-medium">{asset.asset_type}</p>
                      <p className="text-[10px] text-muted-foreground">{asset.reference_role || "素材"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="font-sans text-xl font-semibold">{detail?.session.name || "开始一张新的设计稿"}</p>
            <p className="text-sm text-muted-foreground">{mode === "chat" ? "先用自然语言生成或改图，再进入画布精修。" : dirtyCanvas ? "画布有未保存修改" : "画布已同步"}</p>
          </div>
          <div className="flex items-center gap-2">
            {mode === "canvas" ? (
              <>
                <Button variant="outline" size="icon" data-testid="image-canvas-undo-button" onClick={undoCanvasChange} disabled={!undoStack.length} title="撤销">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" data-testid="image-canvas-redo-button" onClick={redoCanvasChange} disabled={!redoStack.length} title="重做">
                  <Redo2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" data-testid="image-canvas-save-button" onClick={() => void saveCanvas()} disabled={isSavingCanvas}>{isSavingCanvas ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}保存</Button>
                <Button variant="outline" data-testid="image-canvas-export-button" onClick={() => void exportCurrent("png")}><Download className="mr-1 h-4 w-4" />导出 PNG</Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            {mode === "chat" ? (
              <div className="flex h-full min-h-0 flex-col">
                <ScrollArea className="flex-1 px-6 py-5">
                  {detail?.messages?.length ? (
                    <div className="space-y-4">
                      {detail.messages.map((message) => (
                        <div key={message.id} className={cn("max-w-3xl rounded-3xl border px-4 py-4", message.role === "user" ? "ml-auto border-orange-200 bg-orange-50" : "border-border bg-white")}>
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant="secondary">{message.role}</Badge>
                            {message.task_type ? <Badge variant="outline">{message.task_type}</Badge> : null}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mx-auto mt-14 max-w-3xl rounded-[32px] border border-dashed border-orange-200 bg-white/90 p-8 text-center shadow-sm">
                      <Sparkles className="mx-auto h-10 w-10 text-orange-500" />
                      <p className="mt-4 font-sans text-2xl font-semibold">用一句话开始创作</p>
                      <p className="mt-2 text-sm text-muted-foreground">支持文生图、垫图编辑、多图融合和从当前画布继续 AI 编辑。</p>
                    </div>
                  )}

                  {currentVersion ? (
                    <div className="mt-8">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">候选图</p>
                        <Badge variant="outline">{currentVersion.candidates.length} 张</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" data-testid="image-candidate-grid">
                        {currentVersion.candidates.map((candidate) => (
                          <div key={candidate.id} data-testid={`image-candidate-${candidate.id}`} className={cn("overflow-hidden rounded-[28px] border bg-white shadow-sm", candidate.is_selected ? "border-orange-300 ring-2 ring-orange-200" : "border-border")}>
                            <div className="aspect-[4/5] bg-slate-100">{candidate.url ? <img src={candidate.url} alt="" className="h-full w-full object-cover" /> : null}</div>
                            <div className="space-y-2 p-3">
                              <Button className="w-full" size="sm" data-testid={`image-open-canvas-${candidate.id}`} onClick={() => void openCanvasFromCandidate(currentVersion, candidate.id)}>进入画布</Button>
                              <Button
                                variant="outline"
                                className="w-full"
                                size="sm"
                                data-testid={`image-select-candidate-${candidate.id}`}
                                onClick={() =>
                                  void (async () => {
                                    await requestJson(`/api/image-assistant/versions/${currentVersion.id}/select`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ sessionId, candidateId: candidate.id }),
                                    })
                                    if (sessionId) {
                                      await refreshDetail(sessionId)
                                    }
                                  })()
                                }
                              >
                                设为主稿
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </ScrollArea>

                <div className="border-t border-border bg-white/90 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <select className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={sizePreset} onChange={(event) => setSizePreset(event.target.value as ImageAssistantSizePreset)}>
                      <option value="1:1">1:1</option>
                      <option value="4:5">4:5</option>
                      <option value="3:4">3:4</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                    </select>
                    <select className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={qualityMode} onChange={(event) => setQualityMode(event.target.value as "high" | "low_cost")}>
                      <option value="high">高质量</option>
                      <option value="low_cost">低成本</option>
                    </select>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>上传参考图</Button>
                  </div>
                  <div className="flex gap-3">
                  <Textarea data-testid="image-prompt-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：把产品图做成夏季促销海报，清爽、商业感强，保留品牌主色。" className="min-h-28 flex-1 rounded-3xl" />
                  <div className="flex w-40 flex-col gap-2">
                      <Button data-testid="image-generate-button" disabled={isBusy} onClick={() => void runJob("generate")}>{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}生成</Button>
                      <Button data-testid="image-edit-button" variant="outline" disabled={isBusy || !detail?.assets.length} onClick={() => void runJob("edit")}>参考改图</Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0">
                <div className="flex w-16 flex-col items-center gap-3 border-r border-border bg-white/70 px-2 py-4">
                  <Button
                    data-testid="image-select-tool"
                    size="icon"
                    variant={canvasTool === "select" ? "default" : "outline"}
                    onClick={() => {
                      setCanvasTool("select")
                      setPaintPreview(null)
                    }}
                    title="选择图层"
                  >
                    <MousePointer2 className="h-4 w-4" />
                  </Button>
                  <Button
                    data-testid="image-mask-tool"
                    size="icon"
                    variant={canvasTool === "mask" ? "default" : "outline"}
                    onClick={() => {
                      setPaintPreview(null)
                      setCanvasTool((current) => (current === "mask" ? "select" : "mask"))
                    }}
                    title="局部选区"
                  >
                    <Crop className="h-4 w-4" />
                  </Button>
                  <Button
                    data-testid="image-brush-tool"
                    size="icon"
                    variant={canvasTool === "brush" ? "default" : "outline"}
                    onClick={() => {
                      setMaskSelection(null)
                      setCanvasTool((current) => (current === "brush" ? "select" : "brush"))
                    }}
                    title="画笔"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    data-testid="image-eraser-tool"
                    size="icon"
                    variant={canvasTool === "eraser" ? "default" : "outline"}
                    onClick={() => {
                      setMaskSelection(null)
                      setCanvasTool((current) => (current === "eraser" ? "select" : "eraser"))
                    }}
                    title="橡皮擦"
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                  <Button data-testid="image-add-text-layer" size="icon" variant="outline" onClick={() => addLayer(createTextLayer())}><Type className="h-4 w-4" /></Button>
                  <Button data-testid="image-add-rect-layer" size="icon" variant="outline" onClick={() => addLayer(createShapeLayer("rect"))}><RectangleHorizontal className="h-4 w-4" /></Button>
                  <Button data-testid="image-add-circle-layer" size="icon" variant="outline" onClick={() => addLayer(createShapeLayer("circle"))}><Circle className="h-4 w-4" /></Button>
                  <Button data-testid="image-add-line-layer" size="icon" variant="outline" onClick={() => addLayer(createShapeLayer("line"))}><Pencil className="h-4 w-4" /></Button>
                  <Button data-testid="image-add-arrow-layer" size="icon" variant="outline" onClick={() => addLayer(createShapeLayer("arrow"))}><ArrowRight className="h-4 w-4" /></Button>
                  <Button data-testid="image-add-sticker-layer" size="icon" variant="outline" onClick={() => stickerInputRef.current?.click()}><ImageIcon className="h-4 w-4" /></Button>
                  <input ref={stickerInputRef} data-testid="image-sticker-file-input" className="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void uploadFiles(event.target.files)} />
                </div>
                <div
                  ref={canvasViewportRef}
                  className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px]"
                  onMouseDown={() => {
                    if (canvasTool === "select") {
                      setSelectedLayerId(null)
                    }
                  }}
                >
                  {canvas ? (
                    <div
                      data-testid="image-canvas-stage"
                      className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-42px_rgba(15,23,42,0.35)]"
                      style={{ width: canvas.width * scale, height: canvas.height * scale }}
                    >
                      {[...canvas.layers].sort((a, b) => a.z_index - b.z_index).map((layer) => {
                        const left = layer.transform.x * scale
                        const top = layer.transform.y * scale
                        const width = layer.transform.width * scale
                        const height = layer.transform.height * scale
                        const canDrag = !layer.locked && layer.layer_type !== "background" && layer.layer_type !== "paint"
                        const commonProps = {
                          key: layer.id,
                          className: cn("absolute overflow-hidden transition", selectedLayerId === layer.id && "ring-2 ring-sky-300"),
                          style: { left, top, width, height, opacity: layer.style?.opacity ?? 1, borderRadius: (layer.style?.borderRadius || 0) * scale, transform: `rotate(${layer.transform.rotation || 0}deg)` },
                          onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => {
                            event.stopPropagation()
                            setSelectedLayerId(layer.id)
                            if (!canDrag) return
                            const rect = canvasViewportRef.current?.getBoundingClientRect()
                            if (!rect) return
                            if (!dragRef.current && canvasRef.current) {
                              dragSnapshotRef.current = cloneCanvasDocument(canvasRef.current)
                            }
                            dragRef.current = {
                              id: layer.id,
                              offsetX: (event.clientX - rect.left) / scale - layer.transform.x,
                              offsetY: (event.clientY - rect.top) / scale - layer.transform.y,
                              rectLeft: rect.left,
                              rectTop: rect.top,
                            }
                          },
                        }
                        if (!layer.visible) return null
                        if (layer.layer_type === "background" || layer.layer_type === "image" || layer.layer_type === "paint") {
                          return <div {...commonProps}>{layer.asset_url ? <img src={layer.asset_url} alt="" className="h-full w-full object-cover" /> : null}</div>
                        }
                        if (layer.layer_type === "text") {
                          return <div {...commonProps} className={cn(commonProps.className, "flex items-start whitespace-pre-wrap px-2 py-1 font-black")} style={{ ...commonProps.style, color: layer.style?.color || layer.style?.fill || "#111827", fontSize: (layer.style?.fontSize || 42) * scale }}>{layer.content?.text || "文本"}</div>
                        }
                        const shapeType = layer.content?.shapeType || "rect"
                        if (shapeType === "circle") return <div {...commonProps} style={{ ...commonProps.style, background: layer.style?.fill || "#f97316", border: `${(layer.style?.strokeWidth || 2) * scale}px solid ${layer.style?.stroke || "#111827"}`, borderRadius: "9999px" }} />
                        if (shapeType === "line" || shapeType === "arrow") return <div {...commonProps}><div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-slate-900" />{shapeType === "arrow" ? <div className="absolute right-0 top-1/2 h-0 w-0 -translate-y-1/2 border-b-[8px] border-l-[14px] border-t-[8px] border-b-transparent border-l-slate-900 border-t-transparent" /> : null}</div>
                        return <div {...commonProps} style={{ ...commonProps.style, background: layer.style?.fill || "#f97316", border: `${(layer.style?.strokeWidth || 2) * scale}px solid ${layer.style?.stroke || "#111827"}` }} />
                      })}
                      {maskSelection ? (
                        <div
                          data-testid="image-mask-selection"
                          className="pointer-events-none absolute border-2 border-dashed border-orange-500 bg-orange-400/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.18)]"
                          style={{
                            left: maskSelection.x * scale,
                            top: maskSelection.y * scale,
                            width: maskSelection.width * scale,
                            height: maskSelection.height * scale,
                          }}
                        >
                          <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                            局部编辑区域
                          </div>
                        </div>
                      ) : null}
                      {canvasTool === "mask" ? (
                        <div
                          data-testid="image-mask-overlay"
                          className="absolute inset-0 cursor-crosshair"
                          onMouseDown={startMaskSelection}
                          onMouseMove={updateMaskSelection}
                          onMouseUp={finishMaskSelection}
                          onMouseLeave={finishMaskSelection}
                        >
                          <div className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-white">
                            拖拽绘制局部 AI 编辑区域
                          </div>
                        </div>
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
                          <div className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-white">
                            {canvasTool === "brush" ? "拖拽绘制画笔笔触" : "拖拽擦除画笔层内容"}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border bg-white/80 p-8 text-sm text-muted-foreground">先从候选图进入画布。</div>
                  )}
                </div>
              </div>
            )}
          </main>

          <aside className="flex w-80 min-w-80 flex-col border-l border-border bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{mode === "chat" ? "生成参数" : "属性面板"}</p>
            {mode === "chat" ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-sm font-medium">当前主稿</p>
                  {currentCandidate?.url ? <img src={currentCandidate.url} alt="" className="mt-3 aspect-[4/5] w-full rounded-2xl object-cover" /> : <p className="mt-3 text-sm text-muted-foreground">生成后显示。</p>}
                </div>
                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-sm font-medium">快捷模板</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["电商主图", "活动 KV", "社媒封面", "海报"].map((item) => (
                      <button key={item} className="rounded-full border border-border px-3 py-1 text-xs hover:border-orange-300" onClick={() => setPrompt(item)}>{item}</button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-sm font-medium">AI 继续编辑</p>
                  <Textarea data-testid="image-canvas-edit-prompt" value={editingPrompt} onChange={(event) => setEditingPrompt(event.target.value)} placeholder="例如：把右上角改成霓虹灯字样。" className="mt-3 min-h-24 rounded-2xl" />
                  <div className="mt-3 rounded-2xl border border-dashed border-border bg-slate-50/80 p-3 text-xs text-muted-foreground">
                    {maskSelection ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">已选择局部 AI 编辑区域</span>
                          <Button size="sm" variant="ghost" onClick={() => setMaskSelection(null)}>
                            清空
                          </Button>
                        </div>
                        <p>
                          X {Math.round(maskSelection.x)} / Y {Math.round(maskSelection.y)} / W {Math.round(maskSelection.width)} / H {Math.round(maskSelection.height)}
                        </p>
                        <p>这次编辑会优先约束在选区内，选区外尽量保持不变。</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-medium text-foreground">当前将对整张画布继续 AI 编辑</p>
                        <p>如果只想改局部，先点击左侧裁切图标并在画布上拖拽框选区域。</p>
                      </div>
                    )}
                  </div>
                  <Button data-testid="image-canvas-ai-edit-button" className="mt-3 w-full" disabled={isBusy || !editingPrompt.trim()} onClick={() => void continueAiEditFromCanvas()}>继续 AI 编辑</Button>
                </div>
                <div className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">图层</p>
                    <Badge variant="secondary">{layerStack.length}</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {layerStack.map((layer, index) => {
                      const isSelected = selectedLayerId === layer.id
                      const disableForward = index === 0
                      const disableBackward = index === layerStack.length - 1
                      return (
                        <div
                          key={layer.id}
                          className={cn(
                            "rounded-2xl border px-3 py-3 transition",
                            isSelected ? "border-sky-300 bg-sky-50" : "border-border bg-white",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedLayerId(layer.id)}>
                              <p className="truncate text-sm font-medium">{layer.name}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {layer.layer_type} · z {layer.z_index}
                              </p>
                            </button>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleLayerVisibility(layer.id)} title={layer.visible ? "隐藏图层" : "显示图层"}>
                                {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleLayerLock(layer.id)} title={layer.locked ? "解锁图层" : "锁定图层"}>
                                {layer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-1">
                            <Button size="icon" variant="outline" className="h-8 w-8" disabled={disableForward} onClick={() => reorderLayer(layer.id, "forward")} title="上移图层">
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-8 w-8" disabled={disableBackward} onClick={() => reorderLayer(layer.id, "backward")} title="下移图层">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="outline" className="ml-auto h-8 w-8" disabled={layer.layer_type === "background"} onClick={() => deleteLayer(layer.id)} title="删除图层">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                    {!layerStack.length ? <p className="text-sm text-muted-foreground">当前还没有图层。</p> : null}
                  </div>
                </div>
                {selectedLayer ? (
                  <div className="rounded-2xl border border-border bg-white p-4">
                    <p className="text-sm font-medium">图层属性</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Input value={selectedLayer.name} onChange={(event) => updateSelectedLayer({ name: event.target.value })} />
                      {selectedLayer.layer_type !== "paint" ? <Input type="number" value={selectedLayer.transform.x} onChange={(event) => updateSelectedTransform({ x: Number(event.target.value) })} /> : <div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">画笔层覆盖整张画布</div>}
                      {selectedLayer.layer_type !== "paint" ? <Input type="number" value={selectedLayer.transform.y} onChange={(event) => updateSelectedTransform({ y: Number(event.target.value) })} /> : null}
                      {selectedLayer.layer_type !== "paint" ? <Input type="number" value={selectedLayer.transform.width} onChange={(event) => updateSelectedTransform({ width: Number(event.target.value) })} /> : null}
                      {selectedLayer.layer_type !== "paint" ? <Input type="number" value={selectedLayer.transform.height} onChange={(event) => updateSelectedTransform({ height: Number(event.target.value) })} /> : null}
                      {selectedLayer.layer_type !== "paint" ? <Input type="number" value={selectedLayer.transform.rotation || 0} onChange={(event) => updateSelectedTransform({ rotation: Number(event.target.value) })} /> : null}
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedLayer.style?.opacity ?? 1}
                        onChange={(event) =>
                          updateSelectedLayer({
                            style: {
                              ...(selectedLayer.style || {}),
                              opacity: Number(event.target.value),
                            },
                          })
                        }
                      />
                      {selectedLayer.layer_type === "shape" || selectedLayer.layer_type === "paint" ? (
                        <Input
                          type="number"
                          min="1"
                          max="96"
                          value={selectedLayer.style?.strokeWidth || 18}
                          onChange={(event) =>
                            updateSelectedLayer({
                              style: {
                                ...(selectedLayer.style || {}),
                                strokeWidth: Number(event.target.value),
                              },
                            })
                          }
                        />
                      ) : null}
                      {selectedLayer.layer_type === "text" ? <Textarea className="col-span-2" value={selectedLayer.content?.text || ""} onChange={(event) => updateSelectedLayer({ content: { ...(selectedLayer.content || {}), text: event.target.value } })} /> : null}
                      {selectedLayer.layer_type === "text" ? (
                        <Input
                          type="number"
                          className="col-span-2"
                          value={selectedLayer.style?.fontSize || 56}
                          onChange={(event) =>
                            updateSelectedLayer({
                              style: {
                                ...(selectedLayer.style || {}),
                                fontSize: Number(event.target.value),
                              },
                            })
                          }
                        />
                      ) : null}
                      {selectedLayer.layer_type !== "background" && selectedLayer.layer_type !== "image" ? <Input className="col-span-2" type="color" value={selectedLayer.style?.fill || selectedLayer.style?.color || selectedLayer.style?.stroke || "#111827"} onChange={(event) => updateSelectedLayer({ style: { ...(selectedLayer.style || {}), fill: event.target.value, color: event.target.value, stroke: event.target.value } })} /> : null}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-white p-4 text-sm text-muted-foreground">选中一个图层后，这里可以修改位置、大小、旋转、颜色、线宽和文本内容。</div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
