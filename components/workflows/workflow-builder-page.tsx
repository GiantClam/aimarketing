"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas"
import { WorkflowNodeConfigPanel } from "@/components/workflows/workflow-node-config-panel"
import { WorkflowNodePalette } from "@/components/workflows/workflow-node-palette"
import { type WorkflowRunResultsDetail } from "@/components/workflows/workflow-run-results-page"
import { buildGovernedImageAssistantModelOptionId } from "@/lib/platform/governed-image-model-option-id"
import {
  canWorkflowNodeConnectValueKind,
  getDefaultWorkflowNodeTitle,
  resolveWorkflowNodeTitle,
  type WorkflowDefinitionEdge,
  type WorkflowDefinitionNode,
  type WorkflowLocale,
  type WorkflowNodeType,
} from "@/lib/workflows/schema"
import {
  collectWorkflowImagePromptAliasReplacements,
  reconcileWorkflowImagePromptReferences,
  replaceWorkflowImagePromptAliasTokensBatch,
} from "@/lib/workflows/image-prompt-references"
import { resolveWorkflowResumeNodeExecution } from "@/lib/workflows/manual-resume"
import { isWorkflowResumeCompatible } from "@/lib/workflows/resume-compatibility"
import { buildWorkflowRunStatusPath } from "@/lib/workflows/run-status-path"
import { isWorkflowRunActiveStatus, isWorkflowRunResumableStatus } from "@/lib/workflows/run-status"
import type { WorkflowDefinition } from "@/lib/workflows/store"

type SerializedWorkflowEdge = Omit<WorkflowDefinitionEdge, "inputName"> & {
  inputName: string | null
}

type SerializedWorkflowDefinition = {
  id: number
  enterpriseId: number
  ownerUserId: number
  title: string
  slug: string
  status: WorkflowDefinition["status"]
  triggerType: WorkflowDefinition["triggerType"]
  description: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  nodes: WorkflowDefinitionNode[]
  edges: SerializedWorkflowEdge[]
}

type WorkflowAssetCandidate = {
  id: number
  title: string
  kind: string
  mimeType: string | null
  previewKind: "image" | "video" | "audio" | "file"
  sourceUrl: string | null
  previewUrl: string
  downloadUrl: string
}

type UploadedWorkflowFile = {
  fileName: string
  mimeType: string
  storageKey?: string
  url?: string | null
  artifactId?: number
}

type WorkflowLlmModelCatalog = {
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

type WorkflowImageProviderOption = {
  providerId: string
  label: string
  models: Array<{
    modelId: string
    label: string
    optionId?: string | null
  }>
}

type WorkflowVoiceOption = {
  voiceId: string
  voiceName: string
  category: "system" | "voice_cloning" | "voice_generation"
  description: string[]
}

type WorkflowRunStatusSnapshot = {
  run: WorkflowRunResultsDetail["run"]
  nodeExecutions: WorkflowRunResultsDetail["nodeExecutions"]
  detailPath: string
  statusPath?: string
}

type WorkflowRunStartResponse = WorkflowRunResultsDetail & {
  executionMode?: "fresh" | "resume"
  resumedFrom?: {
    mode: "node" | "branch"
    nodeKey: string
    runId: number
  }
}

type FloatingControlKey = "library" | "settings"
type FloatingControlDock = "left" | "right"

type FloatingControlPosition = {
  x: number
  y: number
}

type FloatingControlDragState = {
  control: FloatingControlKey
  offsetX: number
  offsetY: number
}

const FLOATING_CONTROL_PADDING = 12
const LIBRARY_COLLAPSED_SIZE = { width: 128, height: 40 }
const LIBRARY_EXPANDED_SIZE = { width: 224, height: 420 }
const SETTINGS_COLLAPSED_SIZE = { width: 156, height: 40 }
const SETTINGS_EXPANDED_SIZE = { width: 384, height: 420 }

function getFloatingControlSize(control: FloatingControlKey, collapsed: boolean) {
  if (control === "library") return collapsed ? LIBRARY_COLLAPSED_SIZE : LIBRARY_EXPANDED_SIZE
  return collapsed ? SETTINGS_COLLAPSED_SIZE : SETTINGS_EXPANDED_SIZE
}

function getDefaultFloatingControlPosition(control: FloatingControlKey, dock: FloatingControlDock) {
  if (control === "library") {
    return {
      x: FLOATING_CONTROL_PADDING,
      y: FLOATING_CONTROL_PADDING,
    }
  }

  return {
    x: dock === "right" ? 0 : FLOATING_CONTROL_PADDING,
    y: 64,
  }
}

function normalizeNodeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildNodeKey(type: WorkflowNodeType, nodes: WorkflowDefinitionNode[]) {
  const prefix = type.replace(/_generate$/, "").replace(/_/g, "-")
  const existing = new Set(nodes.map((node) => node.nodeKey))
  for (let index = 1; index < 200; index += 1) {
    const candidate = normalizeNodeKey(`${prefix}-${index}`) || `${prefix}-${index}`
    if (!existing.has(candidate)) return candidate
  }
  return `${prefix}-${Date.now()}`
}

function buildSnapshot(workflow: SerializedWorkflowDefinition) {
  return JSON.stringify({
    title: workflow.title,
    description: workflow.description,
    status: workflow.status,
    nodes: workflow.nodes,
    edges: workflow.edges,
  })
}

function serializeWorkflowDefinition(
  workflow:
    | WorkflowDefinition
    | (Omit<WorkflowRunResultsDetail["workflow"], "createdAt" | "updatedAt" | "edges"> & {
        createdAt: string | null
        updatedAt: string | null
        edges: Array<WorkflowRunResultsDetail["workflow"]["edges"][number]>
      }),
) {
  return {
    ...workflow,
    status: workflow.status as WorkflowDefinition["status"],
    triggerType: workflow.triggerType as WorkflowDefinition["triggerType"],
    createdAt:
      workflow.createdAt instanceof Date
        ? workflow.createdAt.toISOString()
        : workflow.createdAt || new Date().toISOString(),
    updatedAt:
      workflow.updatedAt instanceof Date
        ? workflow.updatedAt.toISOString()
        : workflow.updatedAt || new Date().toISOString(),
    nodes: workflow.nodes as WorkflowDefinitionNode[],
    edges: workflow.edges.map((edge) => ({
      ...edge,
      inputName: edge.inputName ?? null,
    })),
  } satisfies SerializedWorkflowDefinition
}

function resolveLatestExecutionTimestamp(execution: WorkflowRunResultsDetail["nodeExecutions"][number]) {
  return (
    execution.updatedAt ??
    execution.finishedAt ??
    execution.startedAt ??
    execution.createdAt ??
    ""
  )
}

function collapseNodeExecutionsToLatest(detail: WorkflowRunResultsDetail | null) {
  if (!detail) return [] as WorkflowRunResultsDetail["nodeExecutions"]

  const latestByNodeKey = new Map<string, WorkflowRunResultsDetail["nodeExecutions"][number]>()
  for (const execution of detail.nodeExecutions) {
    const current = latestByNodeKey.get(execution.nodeKey)
    if (!current) {
      latestByNodeKey.set(execution.nodeKey, execution)
      continue
    }

    const executionTimestamp = resolveLatestExecutionTimestamp(execution)
    const currentTimestamp = resolveLatestExecutionTimestamp(current)
    if (
      execution.id > current.id ||
      (execution.id === current.id && executionTimestamp >= currentTimestamp)
    ) {
      latestByNodeKey.set(execution.nodeKey, execution)
    }
  }

  return [...latestByNodeKey.values()]
}

function collectWorkflowBranchNodeKeysFromDefinition(input: {
  nodeKey: string
  nodes: WorkflowDefinitionNode[]
  edges: SerializedWorkflowEdge[]
}) {
  const childMap = new Map<string, string[]>()
  for (const node of input.nodes) {
    childMap.set(node.nodeKey, [])
  }

  for (const edge of input.edges) {
    const current = childMap.get(edge.sourceNodeKey) ?? []
    current.push(edge.targetNodeKey)
    childMap.set(edge.sourceNodeKey, current)
  }

  const collected = new Set<string>([input.nodeKey])
  const queue = [input.nodeKey]

  while (queue.length > 0) {
    const next = queue.shift()!
    for (const childNodeKey of childMap.get(next) ?? []) {
      if (collected.has(childNodeKey)) continue
      collected.add(childNodeKey)
      queue.push(childNodeKey)
    }
  }

  return [...collected]
}

function buildOptimisticResumeDetail(detail: WorkflowRunResultsDetail) {
  const resumeNodeKey = resolveWorkflowResumeNodeExecution(detail)?.nodeKey ?? null
  if (!resumeNodeKey) return null

  const rerunNodeKeys = new Set(
    collectWorkflowBranchNodeKeysFromDefinition({
      nodeKey: resumeNodeKey,
      nodes: detail.workflow.nodes as WorkflowDefinitionNode[],
      edges: detail.workflow.edges as SerializedWorkflowEdge[],
    }),
  )
  const nowIso = new Date().toISOString()

  return {
    ...detail,
    run: {
      ...detail.run,
      status: "running",
      startedAt: detail.run.startedAt ?? nowIso,
      finishedAt: null,
      updatedAt: nowIso,
    },
    nodeExecutions: detail.nodeExecutions.map((execution) => {
      if (!rerunNodeKeys.has(execution.nodeKey)) return execution

      return {
        ...execution,
        status: execution.nodeKey === resumeNodeKey ? "running" : "queued",
        providerId: null,
        modelId: null,
        taskRunId: null,
        errorMessage: null,
        creditsConsumed: 0,
        startedAt: execution.nodeKey === resumeNodeKey ? nowIso : null,
        finishedAt: null,
        updatedAt: nowIso,
      }
    }),
  } satisfies WorkflowRunResultsDetail
}

function buildNode(
  type: WorkflowNodeType,
  nodes: WorkflowDefinitionNode[],
  locale: WorkflowLocale,
  llmModelCatalog: WorkflowLlmModelCatalog,
  workflowImageProviderOptions: WorkflowImageProviderOption[],
  voiceOptions: WorkflowVoiceOption[],
  position?: { x: number; y: number },
) {
  const index = nodes.length
  const column = index % 3
  const row = Math.floor(index / 3)

  return {
    nodeKey: buildNodeKey(type, nodes),
    type,
    title: getDefaultWorkflowNodeTitle(type, locale),
    positionX: position?.x ?? 96 + column * 320,
    positionY: position?.y ?? 96 + row * 420,
    config:
      type === "text_input"
        ? { text: "" }
        : type === "upload"
          ? { uploadedFiles: [], referencedArtifactIds: [] }
          : type === "writer"
            ? {
                platform: locale === "zh" ? "wechat" : "generic",
                mode: "article",
                language: "auto",
              }
          : type === "llm_generate"
            ? {
                selectedProviderId: llmModelCatalog.defaultProviderId,
                selectedModelId: llmModelCatalog.defaultModelId,
              }
            : type === "image_generate"
              ? {
                  selectedProviderId: workflowImageProviderOptions[0]?.providerId || "pptoken",
                  selectedModelId: workflowImageProviderOptions[0]?.models[0]?.modelId || "gpt-image-2",
                  selectedModelOptionId:
                    workflowImageProviderOptions[0]?.models[0]?.optionId ||
                    buildGovernedImageAssistantModelOptionId({
                      providerId: workflowImageProviderOptions[0]?.providerId || "pptoken",
                      modelId: workflowImageProviderOptions[0]?.models[0]?.modelId || "gpt-image-2",
                    }),
                  candidateCount: 1,
                  imageSize: "1024x1024",
                  imageQuality: "auto",
                  imageBackground: "auto",
                  imageOutputFormat: "png",
                  imageModeration: "auto",
                  imageResponseFormat: "url",
                }
              : type === "video_generate"
                ? {
                    featureId: "text-to-video",
                    resolution: "720p",
                    duration: "5",
                    ratio: "adaptive",
                    generateAudio: "true",
                  }
                : type === "music_generate"
                  ? {
                      genre: "electronic-pop",
                      mood: "uplifting",
                      vocals: "instrumental",
                      lyricsSource: "ai_generate",
                    }
                  : type === "voice_synthesis"
                    ? {
                        voiceId: voiceOptions[0]?.voiceId || "",
                        model: "speech-2.8-hd",
                        languageBoost: "auto",
                        speed: "1",
                        volume: "1",
                        pitch: "1",
                      }
                : type === "audio_generate"
                  ? {
                      genre: "electronic-pop",
                      mood: "uplifting",
                      vocals: "instrumental",
                      lyricsSource: "ai_generate",
                    }
                  : type === "ppt_generate"
                    ? {
                        pageCount: 8,
                        slideCount: 8,
                        language: locale === "zh" ? "zh-CN" : "en-US",
                        scenario: "marketing-campaign",
                        templateMode: "auto-4",
                      }
                    : type === "product_store"
                      ? {
                          libraryTarget: "work_library",
                        }
          : {},
  } satisfies WorkflowDefinitionNode
}

function edgesEqual(left: WorkflowDefinitionEdge, right: WorkflowDefinitionEdge) {
  return (
    left.sourceNodeKey === right.sourceNodeKey &&
    left.targetNodeKey === right.targetNodeKey &&
    (left.inputName || null) === (right.inputName || null)
  )
}

function inputNameToWorkflowValueKind(inputName: string | null | undefined) {
  if (inputName === "text") return "text" as const
  if (inputName === "assets") return "asset" as const
  if (inputName === "images") return "image" as const
  if (inputName === "videos") return "video" as const
  if (inputName === "audios") return "audio" as const
  if (inputName === "presentations") return "ppt" as const
  return null
}

function wouldCreateCycle(
  sourceNodeKey: string,
  targetNodeKey: string,
  edges: WorkflowDefinitionEdge[],
) {
  const childMap = new Map<string, string[]>()
  for (const edge of edges) {
    const list = childMap.get(edge.sourceNodeKey) ?? []
    list.push(edge.targetNodeKey)
    childMap.set(edge.sourceNodeKey, list)
  }

  const queue = [targetNodeKey]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const next = queue.shift()!
    if (next === sourceNodeKey) return true
    if (visited.has(next)) continue
    visited.add(next)
    for (const child of childMap.get(next) ?? []) {
      queue.push(child)
    }
  }

  return false
}

export function WorkflowBuilderPage({
  locale,
  initialWorkflow,
  assets,
  llmModelCatalog,
  workflowImageProviderOptions,
  voiceOptions,
  initialLatestRunDetail = null,
  initialLatestRunId = null,
}: {
  locale: "zh" | "en"
  initialWorkflow: SerializedWorkflowDefinition
  assets: WorkflowAssetCandidate[]
  llmModelCatalog: WorkflowLlmModelCatalog
  workflowImageProviderOptions: WorkflowImageProviderOption[]
  voiceOptions: WorkflowVoiceOption[]
  initialLatestRunDetail?: WorkflowRunResultsDetail | null
  initialLatestRunId?: number | null
}) {
  const canvasShellRef = useRef<HTMLDivElement | null>(null)
  const dragMovedRef = useRef<Record<FloatingControlKey, boolean>>({
    library: false,
    settings: false,
  })
  const [workflow, setWorkflow] = useState(initialWorkflow)
  const [assetCandidates, setAssetCandidates] = useState(assets)
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(initialWorkflow.nodes[0]?.nodeKey ?? null)
  const [pendingConnectionSourceKey, setPendingConnectionSourceKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [runActionPending, setRunActionPending] = useState(false)
  const [uploadPending, setUploadPending] = useState(false)
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const [settingsCollapsed, setSettingsCollapsed] = useState(false)
  const [libraryDock, setLibraryDock] = useState<FloatingControlDock>("left")
  const [settingsDock, setSettingsDock] = useState<FloatingControlDock>("right")
  const [libraryControlPosition, setLibraryControlPosition] = useState<FloatingControlPosition | null>(null)
  const [settingsControlPosition, setSettingsControlPosition] = useState<FloatingControlPosition | null>(null)
  const [controlDragState, setControlDragState] = useState<FloatingControlDragState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [latestRunDetail, setLatestRunDetail] = useState<WorkflowRunResultsDetail | null>(initialLatestRunDetail)
  const [savedSnapshot, setSavedSnapshot] = useState(() => buildSnapshot(initialWorkflow))
  const latestRunRequestInFlightRef = useRef(false)
  const assetCandidatesRequestedRef = useRef(false)
  const latestRunInitialFetchRequestedRef = useRef(false)

  const dirty = useMemo(() => buildSnapshot(workflow) !== savedSnapshot, [savedSnapshot, workflow])
  const latestRunMatchesWorkflow = useMemo(
    () => (latestRunDetail ? isWorkflowResumeCompatible(workflow, latestRunDetail.workflow) : true),
    [latestRunDetail, workflow],
  )
  const effectiveLatestRunDetail = latestRunMatchesWorkflow ? latestRunDetail : null
  const latestNodeExecutions = useMemo(() => collapseNodeExecutionsToLatest(effectiveLatestRunDetail), [effectiveLatestRunDetail])
  const resumeTargetExecution = useMemo(
    () => (effectiveLatestRunDetail ? resolveWorkflowResumeNodeExecution(effectiveLatestRunDetail) : null),
    [effectiveLatestRunDetail],
  )
  const resumeTargetNodeKey = resumeTargetExecution?.nodeKey ?? null
  const latestRunStatus = effectiveLatestRunDetail?.run.status ?? null
  const hasActiveRun = isWorkflowRunActiveStatus(latestRunStatus)
  const canResumeRun = isWorkflowRunResumableStatus(latestRunStatus) && Boolean(resumeTargetNodeKey)
  const hasOutdatedFailedRun =
    Boolean(latestRunDetail) &&
    !latestRunMatchesWorkflow &&
    isWorkflowRunResumableStatus(latestRunDetail?.run.status)
  const controlsLocked = saving || runActionPending || hasActiveRun
  const selectedNode = useMemo(
    () => workflow.nodes.find((node) => node.nodeKey === selectedNodeKey) ?? null,
    [selectedNodeKey, workflow.nodes],
  )
  const resumeTargetTitle = useMemo(() => {
    if (!resumeTargetNodeKey) return null
    const resumeNode = workflow.nodes.find((node) => node.nodeKey === resumeTargetNodeKey)
    if (!resumeNode) return resumeTargetNodeKey
    return resolveWorkflowNodeTitle(resumeNode.type, resumeNode.title, locale)
  }, [locale, resumeTargetNodeKey, workflow.nodes])

  useEffect(() => {
    if (assetCandidates.length > 0) return
    if (selectedNode?.type !== "upload") return
    if (assetCandidatesRequestedRef.current) return

    assetCandidatesRequestedRef.current = true
    let cancelled = false

    void fetch("/api/platform/assets/candidates", {
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { data?: WorkflowAssetCandidate[]; error?: string } | null
        if (!response.ok || !Array.isArray(payload?.data)) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "workflow_asset_candidates_failed")
        }
        if (!cancelled) {
          setAssetCandidates(payload.data)
        }
      })
      .catch((error) => {
        console.error("workflow.asset-candidates.fetch.failed", {
          message: error instanceof Error ? error.message : String(error),
        })
        assetCandidatesRequestedRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [assetCandidates.length, selectedNode?.type])

  useEffect(() => {
    if (latestRunDetail) return
    if (!initialLatestRunId) return
    if (latestRunInitialFetchRequestedRef.current) return

    latestRunInitialFetchRequestedRef.current = true
    let cancelled = false

    void fetch(`/api/workflows/runs/${initialLatestRunId}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { data?: WorkflowRunResultsDetail; error?: string } | null
        if (!response.ok || !payload?.data?.run) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "workflow_latest_run_fetch_failed")
        }
        if (!cancelled) {
          setLatestRunDetail(payload.data)
        }
      })
      .catch((error) => {
        console.error("workflow.latest-run.fetch.failed", {
          runId: initialLatestRunId,
          message: error instanceof Error ? error.message : String(error),
        })
        latestRunInitialFetchRequestedRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [initialLatestRunId, latestRunDetail])

  const getDockedFloatingControlX = useCallback(
    (control: FloatingControlKey, collapsed: boolean, dock: FloatingControlDock, containerWidth: number) => {
      if (dock === "left") return FLOATING_CONTROL_PADDING
      const size = getFloatingControlSize(control, collapsed)
      return Math.max(FLOATING_CONTROL_PADDING, containerWidth - size.width - FLOATING_CONTROL_PADDING)
    },
    [],
  )

  const clampFloatingControlPosition = useCallback((control: FloatingControlKey, next: FloatingControlPosition, collapsed: boolean) => {
    const container = canvasShellRef.current
    if (!container) return next

    const rect = container.getBoundingClientRect()
    const size = getFloatingControlSize(control, collapsed)
    const maxX = Math.max(FLOATING_CONTROL_PADDING, rect.width - size.width - FLOATING_CONTROL_PADDING)
    const maxY = Math.max(FLOATING_CONTROL_PADDING, rect.height - size.height - FLOATING_CONTROL_PADDING)

    return {
      x: Math.min(Math.max(FLOATING_CONTROL_PADDING, next.x), maxX),
      y: Math.min(Math.max(FLOATING_CONTROL_PADDING, next.y), maxY),
    }
  }, [])

  const alignFloatingControlToDock = useCallback(
    (
      control: FloatingControlKey,
      next: FloatingControlPosition,
      collapsed: boolean,
      dock: FloatingControlDock,
    ) => {
      const container = canvasShellRef.current
      if (!container) return next

      const rect = container.getBoundingClientRect()
      const size = getFloatingControlSize(control, collapsed)
      const maxY = Math.max(FLOATING_CONTROL_PADDING, rect.height - size.height - FLOATING_CONTROL_PADDING)

      return {
        x: getDockedFloatingControlX(control, collapsed, dock, rect.width),
        y: Math.min(Math.max(FLOATING_CONTROL_PADDING, next.y), maxY),
      }
    },
    [getDockedFloatingControlX],
  )

  const libraryPosition =
    libraryControlPosition ??
    alignFloatingControlToDock("library", getDefaultFloatingControlPosition("library", libraryDock), libraryCollapsed, libraryDock)
  const settingsPosition =
    settingsControlPosition ??
    alignFloatingControlToDock("settings", getDefaultFloatingControlPosition("settings", settingsDock), settingsCollapsed, settingsDock)

  useEffect(() => {
    setWorkflow((current) => {
      let changed = false
      const nodeMap = new Map(current.nodes.map((node) => [node.nodeKey, node] as const))
      const aliasReplacementsByImageNodeKey = new Map<
        string,
        ReturnType<typeof collectWorkflowImagePromptAliasReplacements>
      >()

      const nextNodes = current.nodes.map((node) => {
        if (node.type !== "image_generate") return node

        const imageReferenceSources = current.edges
          .filter((edge) => edge.targetNodeKey === node.nodeKey && edge.inputName === "images")
          .map((edge) => {
            const sourceNode = nodeMap.get(edge.sourceNodeKey)
            return {
              sourceNodeKey: edge.sourceNodeKey,
              sourceTitle: sourceNode ? resolveWorkflowNodeTitle(sourceNode.type, sourceNode.title, locale) : edge.sourceNodeKey,
            }
          })

        const nextReferences = reconcileWorkflowImagePromptReferences({
          current: node.config.imagePromptReferences,
          sources: imageReferenceSources,
          locale,
        })
        const previousSerialized = JSON.stringify(node.config.imagePromptReferences ?? [])
        const nextSerialized = JSON.stringify(nextReferences)
        if (previousSerialized === nextSerialized) return node

        const replacements = collectWorkflowImagePromptAliasReplacements({
          previous: node.config.imagePromptReferences,
          next: nextReferences,
        })
        if (replacements.length > 0) {
          aliasReplacementsByImageNodeKey.set(node.nodeKey, replacements)
        }

        changed = true
        return {
          ...node,
          config: {
            ...node.config,
            imagePromptReferences: nextReferences,
          },
        }
      })

      if (!changed) return current

      const nextTextNodes = nextNodes.map((node) => {
        if (node.type !== "text_input") return node

        const downstreamImageNodeKeys = current.edges
          .filter((edge) => edge.sourceNodeKey === node.nodeKey && edge.inputName === "text")
          .map((edge) => edge.targetNodeKey)
          .filter((targetNodeKey) => nodeMap.get(targetNodeKey)?.type === "image_generate")

        if (downstreamImageNodeKeys.length === 0) return node

        const replacements = downstreamImageNodeKeys.flatMap(
          (targetNodeKey) => aliasReplacementsByImageNodeKey.get(targetNodeKey) ?? [],
        )

        if (replacements.length === 0) return node

        const currentText = typeof node.config.text === "string" ? node.config.text : ""
        const nextText = replaceWorkflowImagePromptAliasTokensBatch({
          prompt: currentText,
          replacements,
        })
        if (nextText === currentText) return node

        return {
          ...node,
          config: {
            ...node.config,
            text: nextText,
          },
        }
      })

      return { ...current, nodes: nextTextNodes }
    })
  }, [locale, workflow.edges, workflow.nodes])

  useEffect(() => {
    const container = canvasShellRef.current
    if (!container) return

    setLibraryControlPosition((current) =>
      alignFloatingControlToDock(
        "library",
        current ?? getDefaultFloatingControlPosition("library", libraryDock),
        libraryCollapsed,
        libraryDock,
      ),
    )
    setSettingsControlPosition((current) =>
      alignFloatingControlToDock(
        "settings",
        current ?? getDefaultFloatingControlPosition("settings", settingsDock),
        settingsCollapsed,
        settingsDock,
      ),
    )
  }, [alignFloatingControlToDock, libraryCollapsed, libraryDock, settingsCollapsed, settingsDock])

  useEffect(() => {
    if (!controlDragState) return

    const handlePointerMove = (event: PointerEvent) => {
      const container = canvasShellRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const rawX = event.clientX - rect.left - controlDragState.offsetX
      const rawY = event.clientY - rect.top - controlDragState.offsetY
      dragMovedRef.current[controlDragState.control] = true

      if (controlDragState.control === "library") {
        setLibraryControlPosition(
          clampFloatingControlPosition("library", { x: rawX, y: rawY }, libraryCollapsed),
        )
        return
      }

      setSettingsControlPosition(
        clampFloatingControlPosition("settings", { x: rawX, y: rawY }, settingsCollapsed),
      )
    }

    const handlePointerUp = () => {
      if (controlDragState.control === "library") {
        const nextDock: FloatingControlDock =
          libraryPosition.x + getFloatingControlSize("library", libraryCollapsed).width / 2 <
          (canvasShellRef.current?.getBoundingClientRect().width ?? 0) / 2
            ? "left"
            : "right"
        setLibraryDock(nextDock)
        setLibraryControlPosition((current) =>
          alignFloatingControlToDock(
            "library",
            current ?? libraryPosition,
            libraryCollapsed,
            nextDock,
          ),
        )
      } else {
        const nextDock: FloatingControlDock =
          settingsPosition.x + getFloatingControlSize("settings", settingsCollapsed).width / 2 <
          (canvasShellRef.current?.getBoundingClientRect().width ?? 0) / 2
            ? "left"
            : "right"
        setSettingsDock(nextDock)
        setSettingsControlPosition((current) =>
          alignFloatingControlToDock(
            "settings",
            current ?? settingsPosition,
            settingsCollapsed,
            nextDock,
          ),
        )
      }

      setControlDragState(null)
      window.setTimeout(() => {
        dragMovedRef.current.library = false
        dragMovedRef.current.settings = false
      }, 0)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [alignFloatingControlToDock, clampFloatingControlPosition, controlDragState, libraryCollapsed, libraryPosition, settingsCollapsed, settingsPosition])

  const copy =
    locale === "zh"
      ? {
          title: "工作流编排",
          save: "保存工作流",
          savePending: "保存中...",
          run: "运行工作流",
          resume: "继续运行",
          runPending: "运行中...",
          list: "返回列表",
          dirty: "未保存",
          saved: "已保存",
          createNodeFirst: "请先添加至少一个节点。",
          connectToSelf: "不能把节点连接到自己。",
          duplicateEdge: "这条连线已经存在。",
          invalidInputType: "源节点输出与目标输入端点类型不兼容。",
          cycle: "这条连线会形成循环，V1 不允许条件或循环。",
          savedMessage: "工作流定义已保存。",
          uploadedMessage: "上传节点素材已加入配置。",
          libraryPanel: "节点库",
          settingsPanel: "工作流设置",
          collapseLibrary: "折叠节点库",
          expandLibrary: "展开节点库",
          collapseSettings: "折叠工作流设置",
          expandSettings: "展开工作流设置",
          duplicateSuffix: "副本",
          runStarted: "工作流已开始运行，节点状态会在画布中实时刷新。",
          resumeStarted: "工作流已从失败节点继续运行，节点状态会在画布中实时刷新。",
          activeRunAttached: "已连接到当前运行中的工作流，节点状态会在画布中实时刷新。",
          latestRunReady: "运行结果已在当前编排页更新。",
          resumeOutdated: "上一轮失败运行对应的是旧版工作流，当前画布已变更，请重新运行。",
          resumeTargetHint: "继续运行会从上次失败的节点分支开始。",
          resumeTargetHintWithNode: "继续运行会从上次失败的“{node}”节点分支开始，其他失败节点保留上次结果，直到该分支重新触达。",
        }
      : {
          title: "Workflow builder",
          save: "Save workflow",
          savePending: "Saving...",
          run: "Run workflow",
          resume: "Resume run",
          runPending: "Running...",
          list: "Back to list",
          dirty: "Unsaved",
          saved: "Saved",
          createNodeFirst: "Add at least one node first.",
          connectToSelf: "A node cannot connect to itself.",
          duplicateEdge: "That edge already exists.",
          invalidInputType: "The source output is not compatible with the target input port.",
          cycle: "That connection would create a cycle. V1 does not support loops or conditions.",
          savedMessage: "Workflow definition saved.",
          uploadedMessage: "Uploaded files were attached to the workflow node.",
          libraryPanel: "Node library",
          settingsPanel: "Workflow settings",
          collapseLibrary: "Collapse node library",
          expandLibrary: "Expand node library",
          collapseSettings: "Collapse workflow settings",
          expandSettings: "Expand workflow settings",
          duplicateSuffix: "Copy",
          runStarted: "Workflow run started. Node states will refresh directly on the canvas.",
          resumeStarted: "Workflow resumed from the failed node. Node states will refresh directly on the canvas.",
          activeRunAttached: "Attached to the current active run. Node states will refresh directly on the canvas.",
          latestRunReady: "Run results were updated in the current builder.",
          resumeOutdated: "The last failed run belongs to an older workflow version. The current canvas has changed, so start a fresh run.",
          resumeTargetHint: "Resume will continue from the last failed branch.",
          resumeTargetHintWithNode:
            "Resume will continue from the last failed “{node}” branch. Other failed nodes keep their previous result until that branch reaches them again.",
        }

  useEffect(() => {
    if (!isWorkflowRunActiveStatus(effectiveLatestRunDetail?.run.status)) return

    let cancelled = false
    latestRunRequestInFlightRef.current = false

    const refreshLatestRunDetail = async () => {
      if (latestRunRequestInFlightRef.current) return
      latestRunRequestInFlightRef.current = true
      try {
        const response = await fetch(buildWorkflowRunStatusPath(effectiveLatestRunDetail.detailPath), {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null)

        if (!response?.ok) return

        const payload = (await response.json().catch(() => null)) as { data?: WorkflowRunStatusSnapshot } | null
        if (!payload?.data?.run || cancelled) return

        const nextStatus = payload.data.run.status
        setLatestRunDetail((current) =>
          current
            ? {
                ...current,
                run: {
                  ...current.run,
                  ...payload.data!.run,
                },
                nodeExecutions: payload.data!.nodeExecutions,
              }
            : current,
        )

        if (!isWorkflowRunActiveStatus(nextStatus)) {
          const fullResponse = await fetch(effectiveLatestRunDetail.detailPath, {
            credentials: "same-origin",
            cache: "no-store",
          }).catch(() => null)
          const fullPayload = fullResponse?.ok
            ? ((await fullResponse.json().catch(() => null)) as { data?: WorkflowRunResultsDetail } | null)
            : null
          if (cancelled || !fullPayload?.data?.run) return

          setLatestRunDetail(fullPayload.data)
          if (!dirty) {
            const serialized = serializeWorkflowDefinition(fullPayload.data.workflow)
            setWorkflow(serialized)
            setSavedSnapshot(buildSnapshot(serialized))
          }
          setMessage(copy.latestRunReady)
        }
      } finally {
        latestRunRequestInFlightRef.current = false
      }
    }

    void refreshLatestRunDetail()
    const timer = window.setInterval(() => {
      void refreshLatestRunDetail()
    }, 1800)

    return () => {
      cancelled = true
      latestRunRequestInFlightRef.current = false
      window.clearInterval(timer)
    }
  }, [copy.latestRunReady, dirty, effectiveLatestRunDetail?.detailPath, effectiveLatestRunDetail?.run.status])

  const updateWorkflow = (patch: Partial<SerializedWorkflowDefinition>) => {
    setWorkflow((current) => ({
      ...current,
      ...patch,
    }))
  }

  const startFloatingControlDrag = (control: FloatingControlKey, event: React.PointerEvent<HTMLButtonElement>) => {
    const buttonRect = event.currentTarget.getBoundingClientRect()
    dragMovedRef.current[control] = false
    setControlDragState({
      control,
      offsetX: event.clientX - buttonRect.left,
      offsetY: event.clientY - buttonRect.top,
    })
    event.preventDefault()
    event.stopPropagation()
  }

  const handleFloatingControlToggle = (control: FloatingControlKey, toggle: () => void) => {
    if (dragMovedRef.current[control]) return
    toggle()
  }

  const updateNode = (nodeKey: string, patch: Partial<WorkflowDefinitionNode>) => {
    setWorkflow((current) => {
      const targetNode = current.nodes.find((node) => node.nodeKey === nodeKey)
      if (!targetNode) return current

      const nextTargetNode = {
        ...targetNode,
        ...patch,
      }

      const aliasReplacements =
        targetNode.type === "image_generate" && patch.config
          ? collectWorkflowImagePromptAliasReplacements({
              previous: targetNode.config.imagePromptReferences,
              next: nextTargetNode.config.imagePromptReferences,
            })
          : []

      const upstreamTextNodeKeys =
        aliasReplacements.length > 0
          ? current.edges
              .filter((edge) => edge.targetNodeKey === nodeKey && edge.inputName === "text")
              .map((edge) => edge.sourceNodeKey)
          : []

      return {
        ...current,
        nodes: current.nodes.map((node) => {
          if (node.nodeKey === nodeKey) return nextTargetNode
          if (aliasReplacements.length === 0 || node.type !== "text_input" || !upstreamTextNodeKeys.includes(node.nodeKey)) {
            return node
          }

          const currentText = typeof node.config.text === "string" ? node.config.text : ""
          const nextText = replaceWorkflowImagePromptAliasTokensBatch({
            prompt: currentText,
            replacements: aliasReplacements,
          })
          if (nextText === currentText) return node

          return {
            ...node,
            config: {
              ...node.config,
              text: nextText,
            },
          }
        }),
      }
    })
  }

  const addNode = (type: WorkflowNodeType, position?: { x: number; y: number }) => {
    setWorkflow((current) => {
      const nextNode = buildNode(
        type,
        current.nodes,
        locale,
        llmModelCatalog,
        workflowImageProviderOptions,
        voiceOptions,
        position,
      )
      return {
        ...current,
        nodes: [...current.nodes, nextNode],
      }
    })
    setMessage(null)
    setErrorMessage(null)
  }

  const deleteNode = (nodeKey: string) => {
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.nodeKey !== nodeKey),
      edges: current.edges.filter((edge) => edge.sourceNodeKey !== nodeKey && edge.targetNodeKey !== nodeKey),
    }))
    setPendingConnectionSourceKey((current) => (current === nodeKey ? null : current))
    setSelectedNodeKey((current) => (current === nodeKey ? null : current))
  }

  const deleteEdge = (sourceNodeKey: string, targetNodeKey: string, inputName: string) => {
    setWorkflow((current) => ({
      ...current,
      edges: current.edges.filter(
        (edge) =>
          !(
            edge.sourceNodeKey === sourceNodeKey &&
            edge.targetNodeKey === targetNodeKey &&
            (edge.inputName || "input") === inputName
          ),
      ),
    }))
    setErrorMessage(null)
  }

  const duplicateNode = (nodeKey: string) => {
    setWorkflow((current) => {
      const source = current.nodes.find((node) => node.nodeKey === nodeKey)
      if (!source) return current

      const duplicate: WorkflowDefinitionNode = {
        ...source,
        nodeKey: buildNodeKey(source.type, current.nodes),
        title: `${resolveWorkflowNodeTitle(source.type, source.title, locale)} ${copy.duplicateSuffix}`,
        positionX: source.positionX + 36,
        positionY: source.positionY + 36,
        config: { ...source.config },
      }

      return {
        ...current,
        nodes: [...current.nodes, duplicate],
      }
    })
  }

  const connectNodes = (sourceNodeKey: string, targetNodeKey: string, inputName: string) => {
    if (sourceNodeKey === targetNodeKey) {
      setErrorMessage(copy.connectToSelf)
      return
    }

    const sourceNode = workflow.nodes.find((node) => node.nodeKey === sourceNodeKey)
    const targetNode = workflow.nodes.find((node) => node.nodeKey === targetNodeKey)
    const inputKind = inputNameToWorkflowValueKind(inputName)
    if (!sourceNode || !targetNode || !inputKind || !canWorkflowNodeConnectValueKind(targetNode.type, inputKind)) {
      setErrorMessage(copy.invalidInputType)
      return
    }

    const nextEdge = { sourceNodeKey, targetNodeKey, inputName }
    if (workflow.edges.some((edge) => edgesEqual(edge, nextEdge))) {
      setErrorMessage(copy.duplicateEdge)
      return
    }

    if (wouldCreateCycle(sourceNodeKey, targetNodeKey, workflow.edges)) {
      setErrorMessage(copy.cycle)
      return
    }

    setWorkflow((current) => ({
      ...current,
      edges: [...current.edges, nextEdge],
    }))
    setPendingConnectionSourceKey(null)
    setErrorMessage(null)
  }

  async function saveWorkflow(currentWorkflow: SerializedWorkflowDefinition) {
    if (buildSnapshot(currentWorkflow) === savedSnapshot) {
      return currentWorkflow
    }

    const response = await fetch(`/api/workflows/${currentWorkflow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        title: currentWorkflow.title,
        description: currentWorkflow.description,
        status: currentWorkflow.status,
        nodes: currentWorkflow.nodes,
        edges: currentWorkflow.edges,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.data) {
      throw new Error(typeof payload?.error === "string" ? payload.error : "workflow_save_failed")
    }

    const saved = payload.data as WorkflowDefinition
    const serialized = serializeWorkflowDefinition(saved)
    setWorkflow(serialized)
    setSavedSnapshot(buildSnapshot(serialized))
    return serialized
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    setErrorMessage(null)

    try {
      await saveWorkflow(workflow)
      setMessage(copy.savedMessage)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_save_failed")
    } finally {
      setSaving(false)
    }
  }

  const handleRun = async () => {
    if (workflow.nodes.length === 0) {
      setErrorMessage(copy.createNodeFirst)
      return
    }

    setRunActionPending(true)
    setMessage(null)
    setErrorMessage(null)

    try {
      const optimisticResumeDetail =
        canResumeRun && latestRunDetail ? buildOptimisticResumeDetail(latestRunDetail) : null
      if (optimisticResumeDetail) {
        setLatestRunDetail(optimisticResumeDetail)
      }

      const activeWorkflow = await saveWorkflow(workflow)
      const response = await fetch(`/api/workflows/${activeWorkflow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      })
      const payload = (await response.json().catch(() => null)) as { data?: WorkflowRunStartResponse; error?: string } | null
      if (!response.ok || !payload?.data?.run?.id) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "workflow_run_failed")
      }
      setLatestRunDetail(payload.data as WorkflowRunResultsDetail)
      setMessage(
        payload.data.executionMode === "resume"
          ? payload.data.resumedFrom
            ? copy.resumeStarted
            : copy.activeRunAttached
          : copy.runStarted,
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_run_failed")
    } finally {
      setRunActionPending(false)
    }
  }

  const handleUploadFiles = async (nodeKey: string, files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploadPending(true)
    setMessage(null)
    setErrorMessage(null)

    try {
      const uploadedFiles = await Promise.all(
        [...files].map(async (file) => {
          const presignResponse = await fetch("/api/workflows/uploads/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type || "application/octet-stream",
            }),
          })
          const presignPayload = await presignResponse.json().catch(() => null)
          if (!presignResponse.ok || !presignPayload?.data?.uploadUrl || !presignPayload?.data?.storageKey) {
            throw new Error(typeof presignPayload?.error === "string" ? presignPayload.error : "workflow_upload_presign_failed")
          }

          const uploadResponse = await fetch(String(presignPayload.data.uploadUrl), {
            method: String(presignPayload.data.method || "PUT"),
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          })
          if (!uploadResponse.ok) {
            throw new Error(`workflow_upload_failed:${uploadResponse.status}`)
          }

          const artifactPersistResponse = await fetch("/api/workflows/uploads/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              storageKey: String(presignPayload.data.storageKey),
              publicUrl: typeof presignPayload.data.publicUrl === "string" ? presignPayload.data.publicUrl : null,
            }),
          })
          const artifactPersistPayload = await artifactPersistResponse.json().catch(() => null)
          if (!artifactPersistResponse.ok || !artifactPersistPayload?.data?.artifact?.id) {
            throw new Error(
              typeof artifactPersistPayload?.error === "string"
                ? artifactPersistPayload.error
                : "workflow_upload_register_failed",
            )
          }

          return {
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            storageKey: String(presignPayload.data.storageKey),
            url: typeof presignPayload.data.publicUrl === "string" ? presignPayload.data.publicUrl : null,
            artifactId: Number(artifactPersistPayload.data.artifact.id),
          }
        }),
      )

      const targetNode = workflow.nodes.find((node) => node.nodeKey === nodeKey)
      if (!targetNode) return
      const existingUploads = Array.isArray(targetNode.config.uploadedFiles)
        ? targetNode.config.uploadedFiles.filter((item): item is UploadedWorkflowFile => Boolean(item && typeof item === "object"))
        : []

      updateNode(nodeKey, {
        config: {
          ...targetNode.config,
          uploadedFiles: [...existingUploads, ...uploadedFiles],
        },
      })
      setMessage(copy.uploadedMessage)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_upload_failed")
    } finally {
      setUploadPending(false)
    }
  }

  return (
    <div className="h-full overflow-hidden bg-transparent">
      <section className="public-grid-bg workspace-page-shell-tight flex h-full w-full flex-col">
        <div className="workspace-stack flex h-full min-h-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-0.5 lg:flex-nowrap">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-[2.7rem]">
                {copy.title}
              </h1>
              <Badge variant="outline" className="rounded-[4px] border-border bg-background/80 font-display text-[11px] uppercase tracking-[0.08em]">
                {workflow.status}
              </Badge>
              <Badge variant="outline" className="rounded-[4px] border-primary/30 bg-background/80 font-display text-[11px] uppercase tracking-[0.08em]">
                {dirty ? copy.dirty : copy.saved}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button type="button" variant="outline" className="h-9 rounded-[8px]" asChild>
                <Link href="/dashboard/workflows">{copy.list}</Link>
              </Button>
              <Button type="button" variant="outline" className="h-9 rounded-[8px]" onClick={() => void handleSave()} disabled={controlsLocked}>
                {saving ? copy.savePending : copy.save}
              </Button>
              <Button type="button" className="public-button-primary h-9 px-4" onClick={() => void handleRun()} disabled={controlsLocked}>
                {hasActiveRun || runActionPending ? copy.runPending : canResumeRun ? copy.resume : copy.run}
              </Button>
            </div>
          </div>

          {message ? (
            <div className="rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}
          {hasOutdatedFailedRun ? (
            <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {copy.resumeOutdated}
            </div>
          ) : null}
          {canResumeRun && !hasActiveRun ? (
            <div className="rounded-[10px] border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              {(resumeTargetTitle ? copy.resumeTargetHintWithNode.replace("{node}", resumeTargetTitle) : copy.resumeTargetHint)}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div ref={canvasShellRef} className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] border border-border/70 bg-background/35">
              <WorkflowCanvas
                className="h-full rounded-[18px] border-0 bg-card/72 shadow-none"
                locale={locale}
                nodes={workflow.nodes}
                edges={workflow.edges}
                assets={assetCandidates}
                llmModelCatalog={llmModelCatalog}
                workflowImageProviderOptions={workflowImageProviderOptions}
                voiceOptions={voiceOptions}
                selectedNodeKey={selectedNodeKey}
                pendingConnectionSourceKey={pendingConnectionSourceKey}
                uploadPending={uploadPending}
                nodeExecutionSnapshots={latestNodeExecutions.map((execution) => ({
                  nodeKey: execution.nodeKey,
                  status: execution.status,
                  outputPayload: execution.outputPayload,
                  errorMessage: execution.errorMessage ?? null,
                }))}
                onSelectNode={setSelectedNodeKey}
                onMoveNode={(nodeKey, position) => updateNode(nodeKey, { positionX: position.x, positionY: position.y })}
                onDeleteNode={deleteNode}
                onDeleteEdge={deleteEdge}
                onDuplicateNode={duplicateNode}
                onStartConnection={setPendingConnectionSourceKey}
                onConnect={connectNodes}
                onCancelConnection={() => setPendingConnectionSourceKey(null)}
                onAddNodeAtPoint={(type, position) => addNode(type, position)}
                onUpdateNode={updateNode}
                onUploadFiles={handleUploadFiles}
              />

              {libraryCollapsed ? (
                <button
                  type="button"
                  className="absolute z-20 inline-flex h-10 cursor-grab items-center gap-2 rounded-[12px] border border-primary/70 bg-primary px-3 text-primary-foreground shadow-[0_14px_34px_rgba(252,211,77,0.42)] ring-1 ring-primary/35 transition hover:border-primary hover:bg-[#ffe95c] hover:text-primary-foreground active:cursor-grabbing"
                  style={{ left: libraryPosition.x, top: libraryPosition.y }}
                  onPointerDown={(event) => startFloatingControlDrag("library", event)}
                  onClick={() => handleFloatingControlToggle("library", () => setLibraryCollapsed(false))}
                  aria-label={copy.expandLibrary}
                  title={copy.expandLibrary}
                >
                  <PanelLeftOpen className="size-4 shrink-0" />
                  <span className="font-display text-[11px] font-extrabold uppercase tracking-[0.08em]">
                    {copy.libraryPanel}
                  </span>
                </button>
              ) : (
                <aside className="absolute z-20 w-[min(14rem,calc(100vw-2.75rem))]" style={{ left: libraryPosition.x, top: libraryPosition.y }}>
                  <div className="relative flex max-h-[min(75vh,calc(100vh-9rem))] overflow-hidden rounded-[18px] border border-border/80 bg-card/86 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-sm">
                    <WorkflowNodePalette
                      className="flex-1 overflow-y-auto rounded-none border-0 bg-transparent shadow-none"
                      locale={locale}
                      onAddNode={(type) => addNode(type)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-[10px] border border-border/80 bg-background/88 text-foreground shadow-sm transition hover:border-primary/50 hover:bg-primary hover:text-primary-foreground active:cursor-grabbing"
                      onPointerDown={(event) => startFloatingControlDrag("library", event)}
                      onClick={() => handleFloatingControlToggle("library", () => setLibraryCollapsed(true))}
                      aria-label={copy.collapseLibrary}
                      title={copy.collapseLibrary}
                    >
                      <PanelLeftClose className="size-4" />
                      <span className="sr-only">{copy.libraryPanel}</span>
                    </button>
                  </div>
                </aside>
              )}

              {settingsCollapsed ? (
                <button
                  type="button"
                  className="absolute z-20 inline-flex h-10 cursor-grab items-center gap-2 rounded-[12px] border border-primary/70 bg-primary px-3 text-primary-foreground shadow-[0_14px_34px_rgba(252,211,77,0.42)] ring-1 ring-primary/35 transition hover:border-primary hover:bg-[#ffe95c] hover:text-primary-foreground active:cursor-grabbing"
                  style={{ left: settingsPosition.x, top: settingsPosition.y }}
                  onPointerDown={(event) => startFloatingControlDrag("settings", event)}
                  onClick={() => handleFloatingControlToggle("settings", () => setSettingsCollapsed(false))}
                  aria-label={copy.expandSettings}
                  title={copy.expandSettings}
                >
                  <PanelRightOpen className="size-4 shrink-0" />
                  <span className="font-display text-[11px] font-extrabold uppercase tracking-[0.08em]">
                    {copy.settingsPanel}
                  </span>
                </button>
              ) : (
                <aside className="absolute z-20 w-[min(24rem,calc(100vw-2.75rem))]" style={{ left: settingsPosition.x, top: settingsPosition.y }}>
                  <div className="relative flex max-h-[min(80vh,calc(100vh-9rem))] overflow-hidden rounded-[18px] border border-border/80 bg-card/88 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-sm">
                    <button
                      type="button"
                      className="absolute left-2 top-2 z-10 inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-[10px] border border-border/80 bg-background/88 text-foreground shadow-sm transition hover:border-primary/50 hover:bg-primary hover:text-primary-foreground active:cursor-grabbing"
                      onPointerDown={(event) => startFloatingControlDrag("settings", event)}
                      onClick={() => handleFloatingControlToggle("settings", () => setSettingsCollapsed(true))}
                      aria-label={copy.collapseSettings}
                      title={copy.collapseSettings}
                    >
                      <PanelRightClose className="size-4" />
                      <span className="sr-only">{copy.settingsPanel}</span>
                    </button>
                    <WorkflowNodeConfigPanel
                      className="flex-1 overflow-y-auto rounded-none border-0 bg-transparent shadow-none"
                      locale={locale}
                      workflowTitle={workflow.title}
                      workflowDescription={workflow.description}
                      workflowStatus={workflow.status}
                      onWorkflowMetaChange={(patch) =>
                        updateWorkflow({
                          ...("title" in patch ? { title: patch.title ?? workflow.title } : {}),
                          ...("description" in patch ? { description: patch.description ?? null } : {}),
                          ...("status" in patch ? { status: patch.status ?? workflow.status } : {}),
                        })
                      }
                    />
                  </div>
                </aside>
              )}
            </div>

          </div>
        </div>
      </section>
    </div>
  )
}
