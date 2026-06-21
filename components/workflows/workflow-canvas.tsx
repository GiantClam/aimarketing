"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AudioLines,
  Archive,
  ArrowDownToLine,
  Copy,
  FileUp,
  Film,
  ImageIcon,
  Mic,
  Minus,
  Music,
  PanelsTopLeft,
  PenSquare,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { WorkflowNodeEditorFields } from "@/components/workflows/workflow-node-editor-fields"
import { WorkflowNodeOutputPreview } from "@/components/workflows/workflow-node-output-preview"
import { cn } from "@/lib/utils"
import { buildWorkflowImagePromptReferenceEntries, buildWorkflowImagePromptReferenceTokens } from "@/lib/workflows/image-prompt-references"
import {
  canWorkflowNodeConnectValueKind,
  getAllowedWorkflowTargetInputKinds,
  getDefaultWorkflowNodeTitle,
  getWorkflowNodeOutputKinds,
  resolveWorkflowNodeTitle,
  type WorkflowDefinitionEdge,
  type WorkflowDefinitionNode,
  type WorkflowNodeType,
  type WorkflowValueKind,
} from "@/lib/workflows/schema"

const NODE_WIDTH = 336
const PORT_PANEL_TOP = 52
const PORT_ITEM_START_Y = 30
const PORT_ITEM_GAP = 36
const PORT_PANEL_BOTTOM_PADDING = 28
const NODE_INSERT_HEIGHT_ESTIMATE = 360
const INPUT_PORT_CENTER_X = 22
const OUTPUT_PORT_CENTER_X = NODE_WIDTH - 22
const ZOOM_STEP = 0.12
const CONNECTION_SNAP_RADIUS = 44

const NODE_VISUALS: Record<
  WorkflowNodeType,
  {
    icon: typeof FileUp
    accentClassName: string
    glowClassName: string
  }
> = {
  upload: {
    icon: FileUp,
    accentClassName: "border-amber-300/80 bg-amber-100 text-amber-800",
    glowClassName: "from-amber-200/80 via-amber-100/20 to-transparent",
  },
  text_input: {
    icon: Type,
    accentClassName: "border-sky-300/80 bg-sky-100 text-sky-800",
    glowClassName: "from-sky-200/80 via-sky-100/20 to-transparent",
  },
  writer: {
    icon: PenSquare,
    accentClassName: "border-indigo-300/80 bg-indigo-100 text-indigo-800",
    glowClassName: "from-indigo-200/80 via-indigo-100/20 to-transparent",
  },
  llm_generate: {
    icon: Sparkles,
    accentClassName: "border-fuchsia-300/80 bg-fuchsia-100 text-fuchsia-800",
    glowClassName: "from-fuchsia-200/80 via-fuchsia-100/20 to-transparent",
  },
  image_generate: {
    icon: ImageIcon,
    accentClassName: "border-emerald-300/80 bg-emerald-100 text-emerald-800",
    glowClassName: "from-emerald-200/80 via-emerald-100/20 to-transparent",
  },
  video_generate: {
    icon: Film,
    accentClassName: "border-rose-300/80 bg-rose-100 text-rose-800",
    glowClassName: "from-rose-200/80 via-rose-100/20 to-transparent",
  },
  music_generate: {
    icon: Music,
    accentClassName: "border-cyan-300/80 bg-cyan-100 text-cyan-800",
    glowClassName: "from-cyan-200/80 via-cyan-100/20 to-transparent",
  },
  voice_synthesis: {
    icon: Mic,
    accentClassName: "border-teal-300/80 bg-teal-100 text-teal-800",
    glowClassName: "from-teal-200/80 via-teal-100/20 to-transparent",
  },
  audio_generate: {
    icon: AudioLines,
    accentClassName: "border-cyan-300/80 bg-cyan-100 text-cyan-800",
    glowClassName: "from-cyan-200/80 via-cyan-100/20 to-transparent",
  },
  ppt_generate: {
    icon: PanelsTopLeft,
    accentClassName: "border-violet-300/80 bg-violet-100 text-violet-800",
    glowClassName: "from-violet-200/80 via-violet-100/20 to-transparent",
  },
  product_store: {
    icon: Archive,
    accentClassName: "border-slate-300/80 bg-slate-100 text-slate-800",
    glowClassName: "from-slate-200/80 via-slate-100/20 to-transparent",
  },
}

type WorkflowCanvasProps = {
  className?: string
  locale: "zh" | "en"
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
  assets: {
    id: number
    title: string
    kind: string
    mimeType: string | null
    previewKind: "image" | "video" | "audio" | "file"
    sourceUrl: string | null
    previewUrl: string
    downloadUrl: string
  }[]
  llmModelCatalog: {
    defaultProviderId: string | null
    defaultModelId: string | null
    providers: Array<{
      providerId: string
      label: string
      models: Array<{
        modelId: string
        label: string
      }>
    }>
  }
  workflowImageProviderOptions: Array<{
    providerId: string
    label: string
    models: Array<{
      modelId: string
      label: string
      optionId?: string | null
    }>
  }>
  voiceOptions: Array<{
    voiceId: string
    voiceName: string
    category: "system" | "voice_cloning" | "voice_generation"
    description: string[]
  }>
  selectedNodeKey: string | null
  pendingConnectionSourceKey: string | null
  uploadPending: boolean
  nodeExecutionSnapshots?: Array<{
    nodeKey: string
    status: string
    outputPayload: Record<string, unknown> | null
    errorMessage?: string | null
  }>
  onSelectNode: (nodeKey: string | null) => void
  onMoveNode: (nodeKey: string, position: { x: number; y: number }) => void
  onDeleteNode: (nodeKey: string) => void
  onDeleteEdge: (sourceNodeKey: string, targetNodeKey: string, inputName: string) => void
  onDuplicateNode: (nodeKey: string) => void
  onStartConnection: (nodeKey: string) => void
  onConnect: (sourceNodeKey: string, targetNodeKey: string, inputName: string) => void
  onCancelConnection: () => void
  onAddNodeAtPoint: (type: WorkflowNodeType, position: { x: number; y: number }) => void
  onUpdateNode: (nodeKey: string, patch: Partial<WorkflowDefinitionNode>) => void
  onUploadFiles: (nodeKey: string, files: FileList | null) => Promise<void>
}

type ViewportState = {
  x: number
  y: number
  scale: number
}

type DragState =
  | {
      kind: "node"
      nodeKey: string
      startClientX: number
      startClientY: number
      startX: number
      startY: number
    }
  | {
      kind: "pan"
      startClientX: number
      startClientY: number
      startX: number
      startY: number
    }
  | null

type ConnectionDragState = {
  sourceNodeKey: string
  startX: number
  startY: number
  currentX: number
  currentY: number
}

type ConnectionTargetState = {
  targetNodeKey: string
  kind: WorkflowValueKind
}

type EdgeInteractionState = {
  sourceNodeKey: string
  targetNodeKey: string
  inputName: string
}

type CanvasPoint = {
  x: number
  y: number
}

function buildEdgeKey(edge: WorkflowDefinitionEdge) {
  return `${edge.sourceNodeKey}:${edge.targetNodeKey}:${normalizeEdgeInputName(edge)}`
}

function normalizeEdgeInputName(edge: Pick<WorkflowDefinitionEdge, "inputName">) {
  return edge.inputName || "input"
}

function kindToInputName(kind: WorkflowValueKind) {
  if (kind === "text") return "text"
  if (kind === "asset") return "assets"
  if (kind === "image") return "images"
  if (kind === "video") return "videos"
  if (kind === "audio") return "audios"
  return "presentations"
}

function inputNameToKind(inputName: string): WorkflowValueKind {
  if (inputName === "text") return "text"
  if (inputName === "assets") return "asset"
  if (inputName === "images") return "image"
  if (inputName === "videos") return "video"
  if (inputName === "audios") return "audio"
  return "ppt"
}

function getPortKindLabel(locale: "zh" | "en", kind: WorkflowValueKind) {
  if (locale === "zh") {
    if (kind === "text") return "文本"
    if (kind === "asset") return "文件"
    if (kind === "image") return "图片"
    if (kind === "video") return "视频"
    if (kind === "audio") return "音频"
    return "PPT"
  }

  if (kind === "text") return "Text"
  if (kind === "asset") return "File"
  if (kind === "image") return "Image"
  if (kind === "video") return "Video"
  if (kind === "audio") return "Audio"
  return "PPT"
}

function getUnifiedInputPortLabel(locale: "zh" | "en") {
  return locale === "zh" ? "多类型输入" : "Multi-type input"
}

function getExecutionStatusLabel(locale: "zh" | "en", status: string) {
  if (locale === "zh") {
    if (status === "queued") return "排队中"
    if (status === "running") return "运行中"
    if (status === "succeeded") return "已成功"
    if (status === "failed") return "失败"
    if (status === "cancelled") return "已取消"
  } else {
    if (status === "queued") return "Queued"
    if (status === "running") return "Running"
    if (status === "succeeded") return "Succeeded"
    if (status === "failed") return "Failed"
    if (status === "cancelled") return "Cancelled"
  }

  return status
}

function getExecutionTone(status: string | null) {
  if (status === "running") {
    return {
      container: "border-sky-400/80 ring-2 ring-sky-300/25 shadow-[0_26px_80px_rgba(59,130,246,0.18)]",
      badge: "border-sky-200 bg-sky-50 text-sky-700",
      dot: "bg-sky-500 animate-pulse",
    }
  }
  if (status === "succeeded") {
    return {
      container: "border-emerald-300/80",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-500",
    }
  }
  if (status === "failed") {
    return {
      container: "border-red-300/80 ring-1 ring-red-200/60",
      badge: "border-red-200 bg-red-50 text-red-700",
      dot: "bg-red-500",
    }
  }
  if (status === "queued") {
    return {
      container: "border-amber-300/80",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
    }
  }

  return {
    container: "",
    badge: "border-border/70 bg-background/80 text-muted-foreground",
    dot: "bg-background",
  }
}

function clampScale(value: number) {
  return Math.min(1.6, Math.max(0.75, value))
}

function getPortPanelHeight(inputCount: number, outputCount: number) {
  const rowCount = Math.max(inputCount, outputCount, 1)
  return PORT_ITEM_START_Y + (rowCount - 1) * PORT_ITEM_GAP + PORT_PANEL_BOTTOM_PADDING
}

function hasUnifiedInputPort(nodeType: WorkflowNodeType) {
  return nodeType === "product_store"
}

function shouldIgnoreNodeDragTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'button, input, textarea, select, option, label, a, audio, video, summary, [role="button"], [data-node-no-drag="true"]',
    ),
  )
}

function shouldIgnoreCanvasPanTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'article, button, input, textarea, select, option, label, a, audio, video, summary, [role="button"], [data-node-no-drag="true"]',
    ),
  )
}

export function WorkflowCanvas({
  className,
  locale,
  nodes,
  edges,
  assets,
  llmModelCatalog,
  workflowImageProviderOptions,
  voiceOptions,
  selectedNodeKey,
  pendingConnectionSourceKey,
  uploadPending,
  nodeExecutionSnapshots = [],
  onSelectNode,
  onMoveNode,
  onDeleteNode,
  onDeleteEdge,
  onDuplicateNode,
  onStartConnection,
  onConnect,
  onCancelConnection,
  onAddNodeAtPoint,
  onUpdateNode,
  onUploadFiles,
}: WorkflowCanvasProps) {
  const copy =
    locale === "zh"
      ? {
          empty: "空白画布",
          addFirst: "先放入第一个节点",
          addFirstBody: "从左侧节点库拖入固定节点，或直接点击添加。节点会保持确定性连线，并可直接在卡片内编辑。",
          cancelLink: "取消连线",
          dragOutput: "从此节点拖出连接",
        }
      : {
          empty: "Empty canvas",
          addFirst: "Add the first node",
          addFirstBody: "Drag a fixed node from the library or click add. Nodes stay deterministic and editable directly in each card.",
          cancelLink: "Cancel link",
          dragOutput: "Drag a connection from this node",
        }

  const rootRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [viewport, setViewport] = useState<ViewportState>({ x: 80, y: 40, scale: 1 })
  const [dragState, setDragState] = useState<DragState>(null)
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(null)
  const [hoveredConnectionTarget, setHoveredConnectionTarget] = useState<ConnectionTargetState | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<EdgeInteractionState | null>(null)
  const [editingTitleNodeKey, setEditingTitleNodeKey] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState("")

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.nodeKey, node])), [nodes])
  const nodeExecutionMap = useMemo(
    () => new Map(nodeExecutionSnapshots.map((execution) => [execution.nodeKey, execution] as const)),
    [nodeExecutionSnapshots],
  )
  const nodeConnections = useMemo(() => {
    const incoming = new Map<string, WorkflowDefinitionEdge[]>()
    for (const edge of edges) {
      const list = incoming.get(edge.targetNodeKey) ?? []
      list.push(edge)
      incoming.set(edge.targetNodeKey, list)
    }
    return incoming
  }, [edges])

  useEffect(() => {
    if (!selectedEdge) return

    const edgeExists = edges.some(
      (edge) =>
        edge.sourceNodeKey === selectedEdge.sourceNodeKey &&
        edge.targetNodeKey === selectedEdge.targetNodeKey &&
        normalizeEdgeInputName(edge) === selectedEdge.inputName,
    )

    if (!edgeExists) {
      setSelectedEdge(null)
    }
  }, [edges, selectedEdge])

  const connectionSourceNode = pendingConnectionSourceKey ? nodeMap.get(pendingConnectionSourceKey) ?? null : null
  const connectionOutputKinds = connectionSourceNode ? getWorkflowNodeOutputKinds(connectionSourceNode.type) : []

  useEffect(() => {
    if (!editingTitleNodeKey) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [editingTitleNodeKey])

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      if (dragState.kind === "node") {
        const deltaX = (event.clientX - dragState.startClientX) / viewport.scale
        const deltaY = (event.clientY - dragState.startClientY) / viewport.scale
        onMoveNode(dragState.nodeKey, {
          x: Math.round(dragState.startX + deltaX),
          y: Math.round(dragState.startY + deltaY),
        })
        return
      }

      const deltaX = event.clientX - dragState.startClientX
      const deltaY = event.clientY - dragState.startClientY
      setViewport({
        x: dragState.startX + deltaX,
        y: dragState.startY + deltaY,
        scale: viewport.scale,
      })
    }

    const handlePointerUp = () => setDragState(null)

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [dragState, onMoveNode, viewport.scale])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelConnection()
        setDragState(null)
        setConnectionDrag(null)
        setHoveredConnectionTarget(null)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "=") {
        event.preventDefault()
        setViewport((current) => ({ ...current, scale: clampScale(current.scale + ZOOM_STEP) }))
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault()
        setViewport((current) => ({ ...current, scale: clampScale(current.scale - ZOOM_STEP) }))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onCancelConnection])

  const zoomBy = (amount: number) => {
    setViewport((current) => ({ ...current, scale: clampScale(current.scale + amount) }))
  }

  const resetViewport = () => {
    setViewport({ x: 80, y: 40, scale: 1 })
  }

  const startNodeDrag = (event: React.PointerEvent<HTMLElement>, node: WorkflowDefinitionNode) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedEdge(null)
    onSelectNode(node.nodeKey)
    setDragState({
      kind: "node",
      nodeKey: node.nodeKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.positionX,
      startY: node.positionY,
    })
  }

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || shouldIgnoreCanvasPanTarget(event.target)) return
    event.preventDefault()
    setSelectedEdge(null)
    onSelectNode(null)
    onCancelConnection()
    setDragState({
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewport.x,
      startY: viewport.y,
    })
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nodeType = event.dataTransfer.getData("application/x-workflow-node-type")
    if (!nodeType) return

    const rect = rootRef.current?.getBoundingClientRect()
    const position = rect
      ? {
          x: Math.round((event.clientX - rect.left - viewport.x) / viewport.scale),
          y: Math.round((event.clientY - rect.top - viewport.y) / viewport.scale),
        }
      : { x: 0, y: 0 }
    onAddNodeAtPoint(nodeType as WorkflowNodeType, {
      x: Math.max(0, position.x - NODE_WIDTH / 2),
      y: Math.max(0, position.y - NODE_INSERT_HEIGHT_ESTIMATE / 2),
    })
  }

  const getInputPortCenter = (node: WorkflowDefinitionNode, kind: WorkflowValueKind) => {
    if (hasUnifiedInputPort(node.type)) {
      return {
        x: node.positionX + INPUT_PORT_CENTER_X,
        y: node.positionY + PORT_PANEL_TOP + PORT_ITEM_START_Y,
      }
    }

    const acceptedKinds = getAllowedWorkflowTargetInputKinds(node.type)
    const index = Math.max(acceptedKinds.indexOf(kind), 0)
    return {
      x: node.positionX + INPUT_PORT_CENTER_X,
      y: node.positionY + PORT_PANEL_TOP + PORT_ITEM_START_Y + index * PORT_ITEM_GAP,
    }
  }

  const getOutputPortCenter = (node: WorkflowDefinitionNode) => {
    return {
      x: node.positionX + OUTPUT_PORT_CENTER_X,
      y: node.positionY + PORT_PANEL_TOP + PORT_ITEM_START_Y,
    }
  }

  const getCanvasPointFromClient = useCallback((clientX: number, clientY: number): CanvasPoint => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }

    return {
      x: Math.round((clientX - rect.left - viewport.x) / viewport.scale),
      y: Math.round((clientY - rect.top - viewport.y) / viewport.scale),
    }
  }, [viewport.scale, viewport.x, viewport.y])

  const resolveConnectionTargetAtPoint = useCallback((
    sourceNodeKey: string,
    point: CanvasPoint,
  ): ConnectionTargetState | null => {
    const sourceNode = nodeMap.get(sourceNodeKey)
    if (!sourceNode) return null

    const outputKinds = getWorkflowNodeOutputKinds(sourceNode.type)
    if (outputKinds.length === 0) return null

    const snapRadiusSquared = CONNECTION_SNAP_RADIUS * CONNECTION_SNAP_RADIUS
    let nearestTarget: ConnectionTargetState | null = null
    let nearestDistanceSquared = snapRadiusSquared

    for (const node of nodes) {
      if (node.nodeKey === sourceNodeKey) continue

      for (const kind of getAllowedWorkflowTargetInputKinds(node.type)) {
        if (!outputKinds.some((outputKind) => canWorkflowNodeConnectValueKind(node.type, outputKind) && (outputKind === kind || outputKind === "asset"))) {
          continue
        }

        const portCenter = getInputPortCenter(node, kind)
        const deltaX = point.x - portCenter.x
        const deltaY = point.y - portCenter.y
        const distanceSquared = deltaX * deltaX + deltaY * deltaY

        if (distanceSquared > nearestDistanceSquared) continue

        nearestDistanceSquared = distanceSquared
        nearestTarget = {
          targetNodeKey: node.nodeKey,
          kind,
        }
      }
    }

    return nearestTarget
  }, [nodeMap, nodes])

  const buildConnectionPath = (startX: number, startY: number, endX: number, endY: number) => {
    const curve = Math.max(72, Math.abs(endX - startX) * 0.45)
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`
  }

  const startConnectionDrag = (event: React.PointerEvent<HTMLButtonElement>, node: WorkflowDefinitionNode) => {
    event.preventDefault()
    event.stopPropagation()
    const start = getOutputPortCenter(node)
    setSelectedEdge(null)
    onSelectNode(node.nodeKey)
    onStartConnection(node.nodeKey)
    setHoveredConnectionTarget(null)
    setConnectionDrag({
      sourceNodeKey: node.nodeKey,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    })
  }

  useEffect(() => {
    if (!connectionDrag) return

    const handlePointerMove = (event: PointerEvent) => {
      const point = getCanvasPointFromClient(event.clientX, event.clientY)
      const nextTarget = resolveConnectionTargetAtPoint(connectionDrag.sourceNodeKey, point)
      setConnectionDrag((current) => (current ? { ...current, currentX: point.x, currentY: point.y } : current))
      setHoveredConnectionTarget(nextTarget)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const point = getCanvasPointFromClient(event.clientX, event.clientY)
      const dropTarget =
        resolveConnectionTargetAtPoint(connectionDrag.sourceNodeKey, point) ?? hoveredConnectionTarget

      if (dropTarget) {
        onConnect(
          connectionDrag.sourceNodeKey,
          dropTarget.targetNodeKey,
          kindToInputName(dropTarget.kind),
        )
      } else {
        onCancelConnection()
      }
      setConnectionDrag(null)
      setHoveredConnectionTarget(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [connectionDrag, getCanvasPointFromClient, hoveredConnectionTarget, onCancelConnection, onConnect, resolveConnectionTargetAtPoint])

  const startTitleEdit = (node: WorkflowDefinitionNode) => {
    onSelectNode(node.nodeKey)
    setEditingTitleNodeKey(node.nodeKey)
    setTitleDraft(resolveWorkflowNodeTitle(node.type, node.title, locale))
  }

  const commitTitleEdit = (node: WorkflowDefinitionNode) => {
    const nextTitle = titleDraft.trim() || getDefaultWorkflowNodeTitle(node.type, locale)
    onUpdateNode(node.nodeKey, { title: nextTitle })
    setEditingTitleNodeKey((current) => (current === node.nodeKey ? null : current))
    setTitleDraft("")
  }

  const cancelTitleEdit = () => {
    setEditingTitleNodeKey(null)
    setTitleDraft("")
  }

  const canZoomOut = viewport.scale > 0.8
  const canZoomIn = viewport.scale < 1.55
  const activeConnectionDrag = connectionDrag
  const activeConnectionSourceKey = activeConnectionDrag?.sourceNodeKey ?? null

  const handleEdgeSelect = (edge: WorkflowDefinitionEdge) => {
    setSelectedEdge({
      sourceNodeKey: edge.sourceNodeKey,
      targetNodeKey: edge.targetNodeKey,
      inputName: normalizeEdgeInputName(edge),
    })
    onSelectNode(null)
  }

  const handleEdgeDelete = (edge: EdgeInteractionState) => {
    onDeleteEdge(edge.sourceNodeKey, edge.targetNodeKey, edge.inputName)
    setSelectedEdge((current) =>
      current &&
      current.sourceNodeKey === edge.sourceNodeKey &&
      current.targetNodeKey === edge.targetNodeKey &&
      current.inputName === edge.inputName
        ? null
        : current,
    )
  }

  return (
    <section className={cn("dashboard-panel flex h-full min-h-0 flex-col rounded-[12px] border border-border bg-card/85 p-2.5", className)}>
      <div
        ref={rootRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden rounded-[12px] border border-border/70 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.22)_1px,transparent_0)] bg-[length:22px_22px] bg-background/90",
          dragState?.kind === "pan" ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={startPan}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-[10px] border border-border/80 bg-background/88 p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur-sm">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {Math.round(viewport.scale * 100)}%
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-[8px] border-border bg-background/80 px-2.5 text-xs uppercase tracking-[0.08em]" onClick={() => zoomBy(ZOOM_STEP / 2)} disabled={!canZoomIn}>
            <Plus className="size-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-[8px] border-border bg-background/80 px-2.5 text-xs uppercase tracking-[0.08em]" onClick={() => zoomBy(-ZOOM_STEP / 2)} disabled={!canZoomOut}>
            <Minus className="size-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-[8px] border-border bg-background/80 px-2.5 text-xs uppercase tracking-[0.08em]" onClick={resetViewport}>
            <RotateCcw className="size-3.5" />
          </Button>
        </div>

        <div
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            {edges.map((edge) => {
              const source = nodeMap.get(edge.sourceNodeKey)
              const target = nodeMap.get(edge.targetNodeKey)
              if (!source || !target) return null

              const inputName = normalizeEdgeInputName(edge)
              const sourcePort = getOutputPortCenter(source)
              const targetPort = getInputPortCenter(target, inputNameToKind(inputName))
              const path = buildConnectionPath(sourcePort.x, sourcePort.y, targetPort.x, targetPort.y)
              const isHighlighted =
                pendingConnectionSourceKey === edge.sourceNodeKey || pendingConnectionSourceKey === edge.targetNodeKey
              const edgeKey = buildEdgeKey(edge)
              const isSelected =
                selectedEdge?.sourceNodeKey === edge.sourceNodeKey &&
                selectedEdge?.targetNodeKey === edge.targetNodeKey &&
                selectedEdge?.inputName === inputName

              return (
                <g key={edgeKey}>
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    strokeLinecap="round"
                    className="cursor-pointer"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      handleEdgeSelect(edge)
                    }}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={
                      isSelected
                        ? "rgba(37, 99, 235, 1)"
                        : isHighlighted
                          ? "rgba(37, 99, 235, 0.95)"
                          : "rgba(71, 85, 105, 0.9)"
                    }
                    strokeWidth={isSelected ? 3.6 : isHighlighted ? 3.2 : 2.6}
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                  <circle
                    cx={targetPort.x}
                    cy={targetPort.y}
                    r="4"
                    fill={
                      isSelected
                        ? "rgba(37, 99, 235, 1)"
                        : isHighlighted
                          ? "rgba(37, 99, 235, 1)"
                          : "rgba(100, 116, 139, 0.95)"
                    }
                    pointerEvents="none"
                  />
                </g>
              )
            })}

            {connectionDrag ? (
              <g>
                <path
                  d={buildConnectionPath(
                    connectionDrag.startX,
                    connectionDrag.startY,
                    hoveredConnectionTarget && nodeMap.has(hoveredConnectionTarget.targetNodeKey)
                      ? getInputPortCenter(
                          nodeMap.get(hoveredConnectionTarget.targetNodeKey)!,
                          hoveredConnectionTarget.kind,
                        ).x
                      : connectionDrag.currentX,
                    hoveredConnectionTarget && nodeMap.has(hoveredConnectionTarget.targetNodeKey)
                      ? getInputPortCenter(
                          nodeMap.get(hoveredConnectionTarget.targetNodeKey)!,
                          hoveredConnectionTarget.kind,
                        ).y
                      : connectionDrag.currentY,
                  )}
                  fill="none"
                  stroke="rgba(37, 99, 235, 0.95)"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <circle cx={connectionDrag.startX} cy={connectionDrag.startY} r="5" fill="rgba(37, 99, 235, 1)" />
                <circle
                  cx={
                    hoveredConnectionTarget && nodeMap.has(hoveredConnectionTarget.targetNodeKey)
                      ? getInputPortCenter(nodeMap.get(hoveredConnectionTarget.targetNodeKey)!, hoveredConnectionTarget.kind).x
                      : connectionDrag.currentX
                  }
                  cy={
                    hoveredConnectionTarget && nodeMap.has(hoveredConnectionTarget.targetNodeKey)
                      ? getInputPortCenter(nodeMap.get(hoveredConnectionTarget.targetNodeKey)!, hoveredConnectionTarget.kind).y
                      : connectionDrag.currentY
                  }
                  r="5"
                  fill="rgba(244, 255, 89, 1)"
                  stroke="rgba(37, 99, 235, 1)"
                  strokeWidth="2"
                />
              </g>
            ) : null}
          </svg>

          {selectedEdge ? (() => {
            const source = nodeMap.get(selectedEdge.sourceNodeKey)
            const target = nodeMap.get(selectedEdge.targetNodeKey)
            if (!source || !target) return null

            const sourcePort = getOutputPortCenter(source)
            const targetPort = getInputPortCenter(target, inputNameToKind(selectedEdge.inputName))
            const midX = (sourcePort.x + targetPort.x) / 2
            const midY = (sourcePort.y + targetPort.y) / 2

            return (
              <div
                className="absolute z-30"
                style={{
                  left: midX,
                  top: midY,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-full border-border bg-background/95 shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleEdgeDelete(selectedEdge)
                  }}
                  aria-label={locale === "zh" ? "删除连线" : "Delete connection"}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })() : null}

          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                <div className="max-w-lg rounded-[16px] border border-dashed border-border/80 bg-card/90 p-3 shadow-sm">
                <div className="flex items-center justify-center gap-2 text-sm uppercase tracking-[0.08em] text-muted-foreground">
                  <ArrowDownToLine className="size-4" />
                  {copy.empty}
                </div>
                <h3 className="mt-3 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {copy.addFirst}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {copy.addFirstBody}
                </p>
              </div>
            </div>
          ) : null}

          {nodes.map((node) => {
            const acceptedKinds = getAllowedWorkflowTargetInputKinds(node.type)
            const rendersUnifiedInputPort = hasUnifiedInputPort(node.type)
            const displayInputKinds = rendersUnifiedInputPort ? acceptedKinds.slice(0, 1) : acceptedKinds
            const outputKinds = getWorkflowNodeOutputKinds(node.type)
            const portPanelHeight = getPortPanelHeight(displayInputKinds.length, outputKinds.length)
            const incomingEdges = nodeConnections.get(node.nodeKey) ?? []
            const selected = selectedNodeKey === node.nodeKey
            const isConnectionSource = pendingConnectionSourceKey === node.nodeKey
            const visual = NODE_VISUALS[node.type]
            const displayTitle = resolveWorkflowNodeTitle(node.type, node.title, locale)
            const NodeIcon = visual.icon
            const executionSnapshot = nodeExecutionMap.get(node.nodeKey) ?? null
            const executionTone = getExecutionTone(executionSnapshot?.status ?? null)
            const textPromptSuggestions =
              node.type === "text_input"
                ? edges
                    .filter((edge) => edge.sourceNodeKey === node.nodeKey && edge.inputName === "text")
                    .map((edge) => {
                      const targetNode = nodeMap.get(edge.targetNodeKey)
                      if (!targetNode || targetNode.type !== "image_generate") return []

                      const targetIncomingImageSources = edges
                        .filter((candidate) => candidate.targetNodeKey === targetNode.nodeKey && candidate.inputName === "images")
                        .map((candidate) => {
                          const sourceNode = nodeMap.get(candidate.sourceNodeKey)
                          return {
                            sourceNodeKey: candidate.sourceNodeKey,
                            sourceTitle: sourceNode
                              ? resolveWorkflowNodeTitle(sourceNode.type, sourceNode.title, locale)
                              : candidate.sourceNodeKey,
                          }
                        })

                      return buildWorkflowImagePromptReferenceEntries({
                        current: targetNode.config.imagePromptReferences,
                        sources: targetIncomingImageSources,
                        locale,
                      }).map((entry) => ({
                        sourceNodeKey: entry.sourceNodeKey,
                        sourceTitle: entry.sourceTitle,
                        alias: entry.alias,
                        token: buildWorkflowImagePromptReferenceTokens({
                          sourceNodeKey: entry.sourceNodeKey,
                          alias: entry.alias,
                        })[0] || `{{${entry.alias}}}`,
                        targetNodeKey: targetNode.nodeKey,
                        targetNodeTitle: resolveWorkflowNodeTitle(targetNode.type, targetNode.title, locale),
                      }))
                    })
                    .flat()
                    .filter(
                      (entry, index, collection) =>
                        collection.findIndex(
                          (candidate) =>
                            candidate.token === entry.token &&
                            candidate.targetNodeKey === entry.targetNodeKey &&
                            candidate.sourceNodeKey === entry.sourceNodeKey,
                        ) === index,
                    )
                : []

            return (
              <article
                key={node.nodeKey}
                className={cn(
                  "absolute rounded-[16px] border bg-card/95 shadow-[0_24px_60px_rgba(15,23,42,0.14)] transition",
                  dragState?.kind === "node" && dragState.nodeKey === node.nodeKey ? "cursor-grabbing" : "cursor-grab",
                  selected ? "border-primary/70 ring-2 ring-primary/20" : "border-border/80",
                  executionTone.container,
                  isConnectionSource ? "border-blue-500 ring-2 ring-blue-300/30" : "",
                )}
                style={{ left: node.positionX, top: node.positionY, width: NODE_WIDTH }}
                onPointerDown={(event) => {
                  if (editingTitleNodeKey === node.nodeKey) return
                  if (shouldIgnoreNodeDragTarget(event.target)) {
                    onSelectNode(node.nodeKey)
                    return
                  }
                  startNodeDrag(event, node)
                }}
              >
                {displayInputKinds.map((kind, index) => {
                  const active =
                  Boolean(activeConnectionDrag) &&
                  activeConnectionSourceKey !== node.nodeKey &&
                  (rendersUnifiedInputPort
                      ? connectionOutputKinds.some((outputKind) => canWorkflowNodeConnectValueKind(node.type, outputKind))
                      : connectionOutputKinds.some((outputKind) => canWorkflowNodeConnectValueKind(node.type, outputKind) && (outputKind === kind || outputKind === "asset")))
                  const hovered =
                    hoveredConnectionTarget?.targetNodeKey === node.nodeKey &&
                    (rendersUnifiedInputPort || hoveredConnectionTarget.kind === kind)

                  return (
                    <div
                      key={`${node.nodeKey}-${kind}-port`}
                      data-node-no-drag="true"
                      className={cn(
                        "absolute z-20 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background shadow-sm transition",
                        active ? "border-primary bg-primary/95" : "border-border/90",
                        hovered ? "scale-110 border-primary bg-[rgb(244,255,89)]" : "",
                  )}
                      style={{
                        left: INPUT_PORT_CENTER_X,
                        top: PORT_PANEL_TOP + PORT_ITEM_START_Y + index * PORT_ITEM_GAP,
                      }}
                      onPointerEnter={() => {
                        if (!active) return
                        setHoveredConnectionTarget({
                          targetNodeKey: node.nodeKey,
                          kind: rendersUnifiedInputPort ? connectionOutputKinds[0] ?? kind : kind,
                        })
                      }}
                      onPointerLeave={() => {
                        setHoveredConnectionTarget((current) => {
                          if (!current) return current
                          return current.targetNodeKey === node.nodeKey ? null : current
                        })
                      }}
                    />
                  )
                })}

                {outputKinds.length > 0 ? (
                  <button
                    type="button"
                    className={cn(
                      "absolute z-20 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition",
                      isConnectionSource || activeConnectionSourceKey === node.nodeKey
                        ? "border-primary bg-primary"
                        : "border-primary/70 bg-background hover:scale-110 hover:bg-primary/15",
                    )}
                    style={{ left: OUTPUT_PORT_CENTER_X, top: PORT_PANEL_TOP + PORT_ITEM_START_Y }}
                    onPointerDown={(event) => startConnectionDrag(event, node)}
                    aria-label={`${copy.dragOutput}: ${displayTitle}`}
                  />
                ) : null}

                <div className="rounded-t-[16px] border-b border-border/70 bg-background/75 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <div className="relative shrink-0">
                        <div className={cn("absolute inset-0 rounded-[10px] bg-gradient-to-br blur-md", visual.glowClassName)} />
                        <div
                          className={cn(
                            "relative inline-flex size-8 items-center justify-center rounded-[10px] border",
                            visual.accentClassName,
                          )}
                        >
                          <NodeIcon className="size-4" />
                        </div>
                      </div>
                      <div
                        className="min-w-0 flex-1"
                        onDoubleClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          startTitleEdit(node)
                        }}
                      >
                        {editingTitleNodeKey === node.nodeKey ? (
                          <input
                            ref={titleInputRef}
                            value={titleDraft}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onBlur={() => commitTitleEdit(node)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                commitTitleEdit(node)
                              }
                              if (event.key === "Escape") {
                                event.preventDefault()
                                cancelTitleEdit()
                              }
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            className="h-8 w-full rounded-[8px] border border-primary/40 bg-background px-2 text-sm font-black uppercase tracking-[0.05em] text-foreground outline-none ring-0"
                          />
                        ) : (
                          <div className="min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-start gap-2">
                              <div className="min-w-0 flex-1 line-clamp-2 break-words font-display text-sm font-black uppercase leading-5 tracking-[0.06em] text-foreground">
                                {displayTitle}
                              </div>
                              {executionSnapshot ? (
                                <span
                                  className={cn(
                                    "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                    executionTone.badge,
                                  )}
                                >
                                  <span className={cn("size-1.5 shrink-0 rounded-full", executionTone.dot)} />
                                  <span className="min-w-0 whitespace-normal break-words leading-4">
                                    {getExecutionStatusLabel(locale, executionSnapshot.status)}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {node.nodeKey}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 rounded-[8px] border-border bg-background/80 p-0 text-[11px] uppercase tracking-[0.08em]"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDuplicateNode(node.nodeKey)
                        }}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 rounded-[8px] border-border bg-background/80 p-0 text-[11px] uppercase tracking-[0.08em]"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDeleteNode(node.nodeKey)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                      <span
                        className={cn(
                          "mt-2 size-2.5 shrink-0 rounded-full border border-border/70 bg-background",
                          isConnectionSource ? "border-primary bg-primary" : "",
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="relative border-b border-border/70 bg-background/68 px-3" style={{ height: portPanelHeight }}>
                  {displayInputKinds.map((kind, index) => (
                    <div
                      key={`${node.nodeKey}-${kind}-input-label`}
                      className="pointer-events-none absolute left-8 text-[10px] font-medium text-muted-foreground"
                      style={{ top: PORT_ITEM_START_Y - 7 + index * PORT_ITEM_GAP }}
                    >
                      {rendersUnifiedInputPort ? getUnifiedInputPortLabel(locale) : getPortKindLabel(locale, kind)}
                    </div>
                  ))}
                  {outputKinds.map((kind, index) => (
                    <div
                      key={`${node.nodeKey}-${kind}-output-label`}
                      className="pointer-events-none absolute right-8 text-right text-[10px] font-medium text-muted-foreground"
                      style={{ top: PORT_ITEM_START_Y - 7 + index * PORT_ITEM_GAP }}
                    >
                      {getPortKindLabel(locale, kind)}
                    </div>
                  ))}
                </div>

                <div className="space-y-3 px-3 py-3">
                  <div className="rounded-[12px] border border-border/70 bg-background/60 p-3">
                    <WorkflowNodeEditorFields
                      locale={locale}
                      node={node}
                      assets={assets}
                      llmModelCatalog={llmModelCatalog}
                      workflowImageProviderOptions={workflowImageProviderOptions}
                      voiceOptions={voiceOptions}
                      textPromptSuggestions={textPromptSuggestions}
                      uploadPending={uploadPending}
                      showPersistedPreview={!executionSnapshot}
                      onUpdateNode={onUpdateNode}
                      onUploadFiles={onUploadFiles}
                    />
                  </div>

                  {executionSnapshot && node.type !== "text_input" ? (
                    <div className="rounded-[12px] border border-border/70 bg-background/60 p-3">
                      <WorkflowNodeOutputPreview
                        locale={locale}
                        status={executionSnapshot.status}
                        outputPayload={executionSnapshot.outputPayload}
                        errorMessage={executionSnapshot.errorMessage}
                      />
                    </div>
                  ) : null}

                  {activeConnectionDrag ? (
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-[4px] px-2 text-[11px] uppercase tracking-[0.08em]"
                        onClick={(event) => {
                          event.stopPropagation()
                          setConnectionDrag(null)
                          setHoveredConnectionTarget(null)
                          onCancelConnection()
                        }}
                      >
                        <X className="size-3.5" />
                        {copy.cancelLink}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-1.5 border-t border-border/70 bg-background/70 px-3 py-2">
                  {Array.from({ length: incomingEdges.length }).map((_, index) => (
                    <span key={`incoming-${node.nodeKey}-${index}`} className="size-2 rounded-full border border-border bg-background" />
                  ))}
                  {incomingEdges.length > 0 && outputKinds.length > 0 ? <span className="mx-1 h-3 w-px bg-border/80" /> : null}
                  {outputKinds.map((kind) => (
                    <span
                      key={`${node.nodeKey}-output-${kind}`}
                      className={cn(
                        "size-2 rounded-full",
                        isConnectionSource || activeConnectionSourceKey === node.nodeKey
                          ? "bg-primary"
                          : "bg-primary/65",
                      )}
                    />
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
