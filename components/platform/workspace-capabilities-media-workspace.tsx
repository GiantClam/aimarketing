"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AudioLines,
  ChevronRight,
  Download,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Square,
  Upload,
  Video,
  X,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  CapabilityMediaWorkspaceFeature,
  CapabilityMediaWorkspaceFeatureId,
  CapabilityMediaWorkspaceFieldView,
  CapabilityMediaWorkspaceGroup,
} from "@/lib/platform/capabilities-media-workspace"
import { cn } from "@/lib/utils"

type WorkspaceCapabilityState = {
  runtimeStatus: "ready" | "deferred" | "runtime_disabled"
  accessState:
    | "public"
    | "public_then_login"
    | "login_required"
    | "authorized"
    | "permission_required"
    | "admin_required"
  title: string
  summary: string
}

type WorkspaceAssetOption = {
  id: number
  title: string
  previewKind: "image" | "video" | "audio" | "file"
  sourceUrl: string | null
}

type MediaTaskSubmission = {
  runId?: number
  capabilitySlug?: string
  featureId?: string
  provider: string
  mediaTarget: string
  requestedTarget?: string
  endpoint?: string | null
  taskId: string
  status: string
  detailPath?: string | null
  results?: MediaTaskResult[] | null
  extra?: Record<string, unknown> | null
  raw?: Record<string, unknown> | null
}

type MediaTaskResult = {
  url?: string | null
  outputType?: string | null
  text?: string | null
  title?: string | null
}

type MediaTaskQuery = {
  runId?: number
  capabilitySlug?: string
  featureId?: string
  taskId: string
  mediaTarget: string
  requestedTarget?: string
  provider: string
  status: string
  detailPath?: string | null
  results?: MediaTaskResult[] | null
  extra?: Record<string, unknown> | null
  raw?: Record<string, unknown> | null
}

type WorkspaceVoiceOption = {
  voiceId: string
  voiceName: string
  category: "system" | "voice_cloning" | "voice_generation"
  description: string[]
  createdTime: string | null
}

type WorkspaceTabState = {
  id: CapabilityMediaWorkspaceFeatureId
  featureId: CapabilityMediaWorkspaceFeatureId
  values: Record<string, string>
  isSubmitting: boolean
  isRefreshing: boolean
  error: string | null
  message: string | null
  submission: MediaTaskSubmission | null
  task: MediaTaskQuery | null
  sourceFileId: string | null
  sourceFileName: string | null
  sourcePreviewUrl: string | null
  sourceUploading: boolean
  promptAudioFileId: string | null
  promptAudioFileName: string | null
  promptAudioPreviewUrl: string | null
  promptAudioUploading: boolean
  isRecording: boolean
  fieldUploads: Record<
    string,
    {
      fileName: string | null
      previewUrl: string | null
      uploading: boolean
    }
  >
}

type Copy = {
  eyebrow: string
  title: string
  description: string
  launchers: string
  workspace: string
  config: string
  result: string
  allTasks: string
  status: string
  provider: string
  runtime: string
  access: string
  latest: string
  history: string
  latestEmpty: string
  openFeature: string
  openFirst: string
  runtimeDeferred: string
  runtimeDisabled: string
  permissionRequired: string
  loginRequired: string
  taskQueued: string
  taskFailed: string
  refresh: string
  download: string
  generating: string
  queued: string
  ready: string
  unsupported: string
  tabsOpen: string
  voiceLibrary: string
  reloadVoices: string
  loadingVoices: string
  noVoices: string
  uploadReference: string
  uploadPromptAudio: string
  uploadOptionalHint: string
  recordReference: string
  stopRecording: string
  recording: string
  requestingPermission: string
  microphoneDenied: string
  uploading: string
  referenceReady: string
  promptReady: string
  resultDetails: string
  lyrics: string
  uploadMedia: string
  assetLibrary: string
  selectAsset: string
  noMatchingAssets: string
}

function buildDefaultValues(feature: CapabilityMediaWorkspaceFeature) {
  return Object.fromEntries(feature.fields.map((field) => [field.id, field.defaultValue || ""]))
}

function createTabState(feature: CapabilityMediaWorkspaceFeature): WorkspaceTabState {
  return {
    id: feature.id,
    featureId: feature.id,
    values: buildDefaultValues(feature),
    isSubmitting: false,
    isRefreshing: false,
    error: null,
    message: null,
    submission: null,
    task: null,
    sourceFileId: null,
    sourceFileName: null,
    sourcePreviewUrl: null,
    sourceUploading: false,
    promptAudioFileId: null,
    promptAudioFileName: null,
    promptAudioPreviewUrl: null,
    promptAudioUploading: false,
    isRecording: false,
    fieldUploads: {},
  }
}

function isTerminalStatus(status: string | null | undefined) {
  const normalized = String(status || "").toUpperCase()
  return normalized === "SUCCESS" || normalized === "FAILED" || normalized === "SUCCEEDED"
}

function isVideoLikeResult(url: string | null | undefined, outputType: string | null | undefined) {
  if (String(outputType || "").toLowerCase().includes("video")) return true
  return /\.(mp4|webm|mov)(\?|$)/i.test(url || "")
}

function isAudioLikeResult(url: string | null | undefined, outputType: string | null | undefined) {
  if (String(outputType || "").toLowerCase().includes("audio")) return true
  return /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url || "")
}

function getFeatureIconTone(opened: boolean) {
  return opened
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-border/70 bg-muted/40 text-foreground/80"
}

function isFeatureAvailable(state: WorkspaceCapabilityState | null | undefined) {
  if (!state) return false
  if (state.runtimeStatus !== "ready") return false
  if (state.accessState === "permission_required" || state.accessState === "admin_required") return false
  return true
}

function getGroupFeatureGridClass(groupId: CapabilityMediaWorkspaceGroup["id"]) {
  if (groupId === "video-processing") {
    return "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4"
  }

  return "grid-cols-1 sm:grid-cols-2"
}

function getCopy(locale: "zh" | "en"): Copy {
  if (locale === "zh") {
    return {
      eyebrow: "Media Workspace",
      title: "能力中心",
      description: "按子能力打开独立 tab：左侧填写结构化信息板，右侧查看真实任务状态、产物预览和下载。",
      launchers: "能力入口",
      workspace: "多 tab 工作区",
      config: "任务配置",
      result: "结果",
      allTasks: "全部任务",
      status: "任务状态",
      provider: "Provider",
      runtime: "运行时",
      access: "访问门槛",
      latest: "最新产物",
      history: "结果列表",
      latestEmpty: "当前还没有可预览的真实结果。",
      openFeature: "打开能力",
      openFirst: "先从上方选择一个音频或视频子能力。",
      runtimeDeferred: "当前运行时还未开放，暂时不能提交真实任务。",
      runtimeDisabled: "当前运行时已禁用，暂时不能提交真实任务。",
      permissionRequired: "当前账号缺少能力权限。",
      loginRequired: "登录后才可以提交真实任务。",
      taskQueued: "任务已提交，右侧会继续轮询真实状态。",
      taskFailed: "媒体任务执行失败。",
      refresh: "刷新结果",
      download: "下载",
      generating: "提交中",
      queued: "排队中",
      ready: "就绪",
      unsupported: "当前能力暂不支持这个动作。",
      tabsOpen: "个已打开标签",
      voiceLibrary: "可用音色",
      reloadVoices: "刷新音色",
      loadingVoices: "正在查询可用音色…",
      noVoices: "当前账号下还没有可用音色。",
      uploadReference: "上传参考音频",
      uploadPromptAudio: "上传示例音频",
      uploadOptionalHint: "示例音频可选，用于增强复刻相似度；提供时需要同时填写文字转写。",
      recordReference: "录音采集",
      stopRecording: "停止录音",
      recording: "录音中…",
      requestingPermission: "正在向浏览器申请麦克风权限，请在弹框中点击允许。",
      microphoneDenied: "当前浏览器未授予麦克风权限。请点击地址栏的网站权限设置，将麦克风改为允许后重试。",
      uploading: "上传中…",
      referenceReady: "参考音频已就绪",
      promptReady: "示例音频已就绪",
      resultDetails: "结果细节",
      lyrics: "最终歌词",
      uploadMedia: "上传素材",
      assetLibrary: "素材库",
      selectAsset: "从素材库选择",
      noMatchingAssets: "当前素材库里没有匹配的素材。",
    }
  }

  return {
    eyebrow: "Media Workspace",
    title: "Capabilities",
    description: "Open one tab per sub-capability. Fill the structured brief on the left and review real task output, preview, and download on the right.",
    launchers: "Launchers",
    workspace: "Workspace",
    config: "Configuration",
    result: "Result",
    allTasks: "All tasks",
    status: "Status",
    provider: "Provider",
    runtime: "Runtime",
    access: "Access",
    latest: "Latest output",
    history: "Results",
    latestEmpty: "No real previewable result is available yet.",
    openFeature: "Open feature",
    openFirst: "Choose an audio or video feature above to begin.",
    runtimeDeferred: "This runtime is not available yet, so real task submission is blocked.",
    runtimeDisabled: "This runtime is currently disabled, so real task submission is blocked.",
    permissionRequired: "Your account does not have access to this capability.",
    loginRequired: "Sign in before submitting a real task.",
    taskQueued: "Task submitted. The panel will continue polling real task state.",
    taskFailed: "The media task failed.",
    refresh: "Refresh",
    download: "Download",
    generating: "Submitting",
    queued: "Queued",
    ready: "Ready",
    unsupported: "This capability does not support the requested action.",
    tabsOpen: "open tabs",
    voiceLibrary: "Voice library",
    reloadVoices: "Reload voices",
    loadingVoices: "Loading available voices…",
    noVoices: "No voices are available for this account yet.",
    uploadReference: "Upload reference audio",
    uploadPromptAudio: "Upload prompt audio",
    uploadOptionalHint: "Prompt audio is optional and helps stabilize similarity. If provided, add the matching transcript text too.",
    recordReference: "Record reference",
    stopRecording: "Stop recording",
    recording: "Recording…",
    requestingPermission: "Requesting microphone access. Please allow it in the browser prompt.",
    microphoneDenied: "Microphone access is currently blocked for this site. Re-enable it from the browser site-permission control and try again.",
    uploading: "Uploading…",
    referenceReady: "Reference audio ready",
    promptReady: "Prompt audio ready",
    resultDetails: "Details",
    lyrics: "Final lyrics",
    uploadMedia: "Upload media",
    assetLibrary: "Asset library",
    selectAsset: "Select from assets",
    noMatchingAssets: "No matching assets are available yet.",
  }
}

function buildRunningHubFileNameFieldId(fieldId: string) {
  return `${fieldId}RunningHubFileName`
}

function getAssetPreviewKindForField(fieldId: string): WorkspaceAssetOption["previewKind"] | null {
  if (fieldId === "firstFrameUrl" || fieldId === "lastFrameUrl" || fieldId === "avatarImageUrl") return "image"
  if (fieldId === "audioUrl") return "audio"
  if (fieldId === "sourceVideoUrl") return "video"
  return null
}

function getUploadAcceptForField(fieldId: string) {
  if (fieldId === "firstFrameUrl" || fieldId === "lastFrameUrl" || fieldId === "avatarImageUrl") return "image/*"
  if (fieldId === "audioUrl") return "audio/*,.mp3,.wav,.m4a,.ogg"
  if (fieldId === "sourceVideoUrl") return "video/*,.mp4,.mov,.webm"
  return "*/*"
}

function getVoiceCategoryLabel(locale: "zh" | "en", category: WorkspaceVoiceOption["category"]) {
  if (locale === "zh") {
    if (category === "system") return "系统音色"
    if (category === "voice_cloning") return "复刻音色"
    return "生成音色"
  }

  if (category === "system") return "System"
  if (category === "voice_cloning") return "Cloned"
  return "Generated"
}

function coerceExtraText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

async function getMicrophonePermissionState() {
  if (!("permissions" in navigator) || !navigator.permissions?.query) {
    return null
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    })
    return status.state
  } catch {
    return null
  }
}

function renderField(
  inputId: string,
  field: CapabilityMediaWorkspaceFieldView,
  value: string,
  onChange: (nextValue: string) => void,
) {
  if (field.type === "textarea") {
    return (
      <Textarea
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className="min-h-28 resize-y"
      />
    )
  }

  if (field.type === "select") {
    return (
      <Select value={value || field.defaultValue || field.options[0]?.value} onValueChange={onChange}>
        <SelectTrigger id={inputId} className="w-full">
          <SelectValue placeholder={field.placeholder || field.label} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <Input
      id={inputId}
      type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      step={field.type === "number" ? "0.1" : undefined}
    />
  )
}

function encodeWav(chunks: Float32Array[], sampleRate: number) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const pcm = new Int16Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index] || 0))
      pcm[offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      offset += 1
    }
  }

  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(buffer)
  const writeString = (position: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(position + index, value.charCodeAt(index))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + pcm.length * 2, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, pcm.length * 2, true)

  for (let index = 0; index < pcm.length; index += 1) {
    view.setInt16(44 + index * 2, pcm[index], true)
  }

  return new Blob([buffer], { type: "audio/wav" })
}

export function WorkspaceCapabilitiesMediaWorkspace({
  locale,
  groups,
  features,
  capabilityStates,
  assetOptions,
  initialFeatureId,
  showHero = true,
}: {
  locale: "zh" | "en"
  groups: CapabilityMediaWorkspaceGroup[]
  features: CapabilityMediaWorkspaceFeature[]
  capabilityStates: Record<"ai-video" | "ai-music", WorkspaceCapabilityState | null>
  assetOptions: WorkspaceAssetOption[]
  initialFeatureId?: CapabilityMediaWorkspaceFeatureId | null
  showHero?: boolean
}) {
  const copy = useMemo(() => getCopy(locale), [locale])
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tabs, setTabs] = useState<WorkspaceTabState[]>([])
  const [activeTabId, setActiveTabId] = useState<CapabilityMediaWorkspaceFeatureId | null>(null)
  const [voiceOptions, setVoiceOptions] = useState<WorkspaceVoiceOption[]>([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)
  const [voicesError, setVoicesError] = useState<string | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)
  const activeTabRef = useRef<HTMLButtonElement | null>(null)
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null)
  const promptAudioFileInputRef = useRef<HTMLInputElement | null>(null)
  const assetFileInputRef = useRef<HTMLInputElement | null>(null)
  const assetUploadTabIdRef = useRef<CapabilityMediaWorkspaceFeatureId | null>(null)
  const assetUploadFieldIdRef = useRef<string | null>(null)
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingContextRef = useRef<AudioContext | null>(null)
  const recordingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const recordingProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const recordingBuffersRef = useRef<Float32Array[]>([])
  const recordingSampleRateRef = useRef<number>(44100)
  const recordingTabIdRef = useRef<CapabilityMediaWorkspaceFeatureId | null>(null)

  const featureMap = useMemo(
    () =>
      Object.fromEntries(features.map((feature) => [feature.id, feature])) as Record<
        CapabilityMediaWorkspaceFeatureId,
        CapabilityMediaWorkspaceFeature
      >,
    [features],
  )

  const focusWorkspace = useCallback(() => {
    const element = workspaceRef.current
    if (!element) return
    window.requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })
  }, [])

  const syncFeatureQuery = useCallback(
    (featureId: CapabilityMediaWorkspaceFeatureId | null) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("workspace", "media")
      if (featureId) {
        params.set("feature", featureId)
      } else {
        params.delete("feature")
      }
      const nextQuery = params.toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const patchTab = useCallback((featureId: CapabilityMediaWorkspaceFeatureId, patch: Partial<WorkspaceTabState>) => {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === featureId
          ? {
              ...tab,
              ...patch,
            }
          : tab,
      ),
    )
  }, [])

  const updateTabValue = useCallback(
    (featureId: CapabilityMediaWorkspaceFeatureId, fieldId: string, nextValue: string) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === featureId
            ? {
                ...tab,
                values: {
                  ...tab.values,
                  [fieldId]: nextValue,
                },
              }
            : tab,
        ),
      )
    },
    [],
  )

  const getMatchingAssetOptions = useCallback(
    (fieldId: string) => {
      const previewKind = getAssetPreviewKindForField(fieldId)
      if (!previewKind) return []
      return assetOptions.filter((asset) => asset.previewKind === previewKind && asset.sourceUrl)
    },
    [assetOptions],
  )

  const uploadRunningHubFieldFile = useCallback(
    async (featureId: CapabilityMediaWorkspaceFeatureId, fieldId: string, file: File) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === featureId
            ? {
                ...tab,
                error: null,
                fieldUploads: {
                  ...tab.fieldUploads,
                  [fieldId]: {
                    fileName: file.name,
                    previewUrl: tab.fieldUploads[fieldId]?.previewUrl || null,
                    uploading: true,
                  },
                },
              }
            : tab,
        ),
      )

      try {
        const formData = new FormData()
        formData.set("file", file)

        const response = await fetch("/api/platform/runninghub/files/upload", {
          method: "POST",
          body: formData,
        })
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string
              data?: {
                fileName: string
                downloadUrl: string
              }
            }
          | null

        if (!response.ok || !payload?.data?.downloadUrl) {
          throw new Error(payload?.error || copy.taskFailed)
        }

        const previewUrl = URL.createObjectURL(file)
        previewUrlsRef.current.add(previewUrl)

        setTabs((current) =>
          current.map((tab) =>
            tab.id === featureId
              ? {
                  ...tab,
                  values: {
                    ...tab.values,
                    [fieldId]: payload.data?.downloadUrl || "",
                    [buildRunningHubFileNameFieldId(fieldId)]: payload.data?.fileName || "",
                  },
                  fieldUploads: {
                    ...tab.fieldUploads,
                    [fieldId]: {
                      fileName: payload.data?.fileName || file.name,
                      previewUrl,
                      uploading: false,
                    },
                  },
                }
              : tab,
          ),
        )
      } catch (error) {
        patchTab(featureId, {
          error: error instanceof Error ? error.message : copy.taskFailed,
        })
        setTabs((current) =>
          current.map((tab) =>
            tab.id === featureId
              ? {
                  ...tab,
                  fieldUploads: {
                    ...tab.fieldUploads,
                    [fieldId]: {
                      fileName: file.name,
                      previewUrl: tab.fieldUploads[fieldId]?.previewUrl || null,
                      uploading: false,
                    },
                  },
                }
              : tab,
          ),
        )
      }
    },
    [copy.taskFailed, patchTab],
  )

  const stopWaveRecording = useCallback(async () => {
    recordingProcessorRef.current?.disconnect()
    recordingSourceRef.current?.disconnect()
    recordingContextRef.current?.close().catch(() => undefined)
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingProcessorRef.current = null
    recordingSourceRef.current = null
    recordingContextRef.current = null
    recordingStreamRef.current = null
  }, [])

  useEffect(() => {
    const previewUrls = previewUrlsRef.current
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url))
      previewUrls.clear()
      void stopWaveRecording()
    }
  }, [stopWaveRecording])

  useEffect(() => {
    if (!initialFeatureId || !featureMap[initialFeatureId]) return

    setTabs((current) => {
      if (current.some((tab) => tab.id === initialFeatureId)) return current
      return [...current, createTabState(featureMap[initialFeatureId])]
    })
    setActiveTabId(initialFeatureId)
  }, [featureMap, initialFeatureId])

  useEffect(() => {
    if (!activeTabRef.current) return
    activeTabRef.current.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    })
  }, [activeTabId, tabs.length])

  const groupedFeatures = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        features: features.filter((feature) => feature.groupId === group.id),
      })),
    [features, groups],
  )

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const activeFeature = activeTab ? featureMap[activeTab.featureId] : null

  const ensureVoicesLoaded = useCallback(
    async (force = false) => {
      if (isLoadingVoices) return
      if (!force && voiceOptions.length > 0) return

      setIsLoadingVoices(true)
      setVoicesError(null)

      try {
        const response = await fetch("/api/platform/minimax/voices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ voiceType: "all" }),
        })
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; data?: { voices?: WorkspaceVoiceOption[] | null } }
          | null

        if (!response.ok) {
          throw new Error(payload?.error || copy.taskFailed)
        }

        setVoiceOptions(payload?.data?.voices || [])
      } catch (error) {
        setVoicesError(error instanceof Error ? error.message : copy.taskFailed)
      } finally {
        setIsLoadingVoices(false)
      }
    },
    [copy.taskFailed, isLoadingVoices, voiceOptions.length],
  )

  useEffect(() => {
    if (!activeFeature) return
    if (activeFeature.id !== "voice-synthesis") return
    void ensureVoicesLoaded(false)
  }, [activeFeature, ensureVoicesLoaded])

  function openFeatureTab(featureId: CapabilityMediaWorkspaceFeatureId) {
    const feature = featureMap[featureId]
    if (!feature) return

    setTabs((current) => {
      if (current.some((tab) => tab.id === featureId)) return current
      return [...current, createTabState(feature)]
    })
    setActiveTabId(featureId)
    syncFeatureQuery(featureId)
    focusWorkspace()
  }

  function closeFeatureTab(featureId: CapabilityMediaWorkspaceFeatureId) {
    setTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== featureId)
      if (activeTabId === featureId) {
        const fallbackId = nextTabs[nextTabs.length - 1]?.id ?? null
        setActiveTabId(fallbackId)
        syncFeatureQuery(fallbackId)
      }
      return nextTabs
    })
  }

  const refreshTask = useCallback(
    async (
      featureId: CapabilityMediaWorkspaceFeatureId,
      capabilitySlug: "ai-image" | "ai-video" | "ai-music",
      taskId: string,
      detailPath?: string | null,
    ) => {
      patchTab(featureId, { isRefreshing: true })

      try {
        const response = await fetch(
          detailPath || `/api/platform/media/tasks/${encodeURIComponent(taskId)}?target=${encodeURIComponent(capabilitySlug)}`,
          {
            cache: "no-store",
          },
        )
        const payload = (await response.json().catch(() => null)) as { error?: string; data?: MediaTaskQuery } | null
        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error || copy.taskFailed)
        }

        patchTab(featureId, {
          task: payload.data,
          error: null,
          isRefreshing: false,
        })
      } catch (error) {
        patchTab(featureId, {
          error: error instanceof Error ? error.message : copy.taskFailed,
          isRefreshing: false,
        })
      }
    },
    [copy.taskFailed, patchTab],
  )

  useEffect(() => {
    const pendingTabs = tabs.filter((tab) => tab.task?.taskId && tab.task?.status && !isTerminalStatus(tab.task.status))
    if (pendingTabs.length === 0) return

    const timer = window.setTimeout(() => {
      pendingTabs.forEach((tab) => {
        const feature = featureMap[tab.featureId]
        if (!tab.task?.taskId || !feature) return
        void refreshTask(tab.featureId, feature.capabilitySlug, tab.task.taskId, tab.task.detailPath)
      })
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [featureMap, refreshTask, tabs])

  const uploadAudioFile = useCallback(
    async (featureId: CapabilityMediaWorkspaceFeatureId, purpose: "voice_clone" | "prompt_audio", file: File) => {
      patchTab(featureId, {
        error: null,
        sourceUploading: purpose === "voice_clone",
        promptAudioUploading: purpose === "prompt_audio",
      })

      try {
        const formData = new FormData()
        formData.set("purpose", purpose)
        formData.set("file", file)

        const response = await fetch("/api/platform/minimax/files/upload", {
          method: "POST",
          body: formData,
        })
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string
              data?: {
                fileId: string
                fileName: string
              }
            }
          | null

        if (!response.ok || !payload?.data?.fileId) {
          throw new Error(payload?.error || copy.taskFailed)
        }

        const previewUrl = URL.createObjectURL(file)
        previewUrlsRef.current.add(previewUrl)

        if (purpose === "voice_clone") {
          setTabs((current) =>
            current.map((tab) =>
              tab.id === featureId
                ? {
                    ...tab,
                    sourceUploading: false,
                    sourceFileId: payload.data?.fileId || null,
                    sourceFileName: payload.data?.fileName || file.name,
                    sourcePreviewUrl: previewUrl,
                    values: {
                      ...tab.values,
                      sourceFileId: payload.data?.fileId || "",
                    },
                  }
                : tab,
            ),
          )
        } else {
          setTabs((current) =>
            current.map((tab) =>
              tab.id === featureId
                ? {
                    ...tab,
                    promptAudioUploading: false,
                    promptAudioFileId: payload.data?.fileId || null,
                    promptAudioFileName: payload.data?.fileName || file.name,
                    promptAudioPreviewUrl: previewUrl,
                    values: {
                      ...tab.values,
                      promptAudioFileId: payload.data?.fileId || "",
                    },
                  }
                : tab,
            ),
          )
        }
      } catch (error) {
        patchTab(featureId, {
          error: error instanceof Error ? error.message : copy.taskFailed,
          sourceUploading: false,
          promptAudioUploading: false,
        })
      }
    },
    [copy.taskFailed, patchTab],
  )

  const startReferenceRecording = useCallback(async () => {
    if (!activeTab) return
    if (activeTab.featureId !== "voice-clone") return
    if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === "undefined") {
      patchTab(activeTab.id, { error: "Browser audio recording is not supported here." })
      return
    }

    try {
      const permissionState = await getMicrophonePermissionState()
      if (permissionState === "denied") {
        patchTab(activeTab.id, {
          error: copy.microphoneDenied,
          isRecording: false,
        })
        return
      }

      patchTab(activeTab.id, {
        error: permissionState === "prompt" || permissionState === null ? copy.requestingPermission : null,
        isRecording: false,
      })

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new window.AudioContext()
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)

      recordingBuffersRef.current = []
      recordingSampleRateRef.current = context.sampleRate
      processor.onaudioprocess = (event) => {
        recordingBuffersRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)))
      }

      source.connect(processor)
      processor.connect(context.destination)

      recordingStreamRef.current = stream
      recordingContextRef.current = context
      recordingSourceRef.current = source
      recordingProcessorRef.current = processor
      recordingTabIdRef.current = activeTab.id

      patchTab(activeTab.id, {
        error: null,
        isRecording: true,
      })
    } catch (error) {
      const permissionState = await getMicrophonePermissionState()
      patchTab(activeTab.id, {
        error:
          permissionState === "denied" ||
          (error instanceof DOMException && error.name === "NotAllowedError")
            ? copy.microphoneDenied
            : error instanceof Error
              ? error.message
              : "Failed to start recording.",
        isRecording: false,
      })
    }
  }, [activeTab, copy.microphoneDenied, copy.requestingPermission, patchTab])

  const stopReferenceRecording = useCallback(async () => {
    const featureId = recordingTabIdRef.current
    if (!featureId) return

    const chunks = recordingBuffersRef.current.slice()
    const sampleRate = recordingSampleRateRef.current
    await stopWaveRecording()
    recordingTabIdRef.current = null
    recordingBuffersRef.current = []
    patchTab(featureId, { isRecording: false })

    if (chunks.length === 0) {
      patchTab(featureId, { error: "No audio was captured during recording." })
      return
    }

    const wavBlob = encodeWav(chunks, sampleRate)
    const file = new File([wavBlob], `voice-recording-${Date.now()}.wav`, { type: "audio/wav" })
    await uploadAudioFile(featureId, "voice_clone", file)
  }, [patchTab, stopWaveRecording, uploadAudioFile])

  async function submitActiveTab() {
    if (!activeTab || !activeFeature) return

    const capabilityState = capabilityStates[activeFeature.capabilitySlug]
    if (!capabilityState) {
      patchTab(activeTab.id, { error: copy.unsupported })
      return
    }
    if (capabilityState.runtimeStatus === "deferred") {
      patchTab(activeTab.id, { error: copy.runtimeDeferred })
      return
    }
    if (capabilityState.runtimeStatus === "runtime_disabled") {
      patchTab(activeTab.id, { error: copy.runtimeDisabled })
      return
    }
    if (capabilityState.accessState === "permission_required" || capabilityState.accessState === "admin_required") {
      patchTab(activeTab.id, { error: copy.permissionRequired })
      return
    }
    if (capabilityState.accessState === "login_required" || capabilityState.accessState === "public_then_login") {
      patchTab(activeTab.id, { error: copy.loginRequired })
      return
    }
    if (activeFeature.id === "voice-clone" && !activeTab.sourceFileId) {
      patchTab(activeTab.id, { error: locale === "zh" ? "请先上传或录制参考音频。" : "Upload or record the reference audio first." })
      return
    }

    patchTab(activeTab.id, {
      isSubmitting: true,
      error: null,
      message: null,
    })

    const payload = {
      featureId: activeFeature.id,
      mode: "capabilities-media-workspace",
      prompt: activeTab.values.prompt || activeTab.values.previewText || activeTab.values.stylePrompt || "",
      params: activeTab.values,
    }

    try {
      const response = await fetch(
        `/api/platform/capabilities/${encodeURIComponent(activeFeature.capabilitySlug)}/execute?action=${encodeURIComponent(activeFeature.action)}&locale=${encodeURIComponent(locale)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      )

      const data = (await response.json().catch(() => null)) as { error?: string; data?: MediaTaskSubmission } | null
      if (!response.ok || !data?.data) {
        throw new Error(data?.error || copy.taskFailed)
      }

      patchTab(activeTab.id, {
        submission: data.data,
        task: {
          taskId: data.data.taskId,
          runId: data.data.runId,
          capabilitySlug: data.data.capabilitySlug || activeFeature.capabilitySlug,
          featureId: data.data.featureId || activeFeature.id,
          mediaTarget: data.data.mediaTarget || activeFeature.capabilitySlug,
          requestedTarget: data.data.requestedTarget || data.data.featureId || activeFeature.id,
          provider: data.data.provider,
          status: data.data.status,
          detailPath: data.data.detailPath || null,
          results: data.data.results || null,
          extra: data.data.extra || null,
          raw: data.data.raw || null,
        },
        message: copy.taskQueued,
        isSubmitting: false,
      })
      await refreshTask(activeTab.id, activeFeature.capabilitySlug, data.data.taskId, data.data.detailPath)
    } catch (error) {
      patchTab(activeTab.id, {
        isSubmitting: false,
        error: error instanceof Error ? error.message : copy.taskFailed,
      })
    }
  }

  const latestResult = activeTab?.task?.results?.find((result) => result.url) ?? null
  const latestResultUrl = latestResult?.url || null
  const latestIsVideo = activeFeature?.previewKind === "video" || isVideoLikeResult(latestResultUrl, latestResult?.outputType)
  const latestIsAudio = activeFeature?.previewKind === "audio" || isAudioLikeResult(latestResultUrl, latestResult?.outputType)
  const activeExtra = activeTab?.task?.extra || activeTab?.submission?.extra || null
  const activeLyrics = coerceExtraText(activeExtra?.lyrics)
  const activeVoiceId = coerceExtraText(activeExtra?.voiceId)

  const renderVoiceSelect = (tab: WorkspaceTabState, field: CapabilityMediaWorkspaceFieldView) => {
    const value = tab.values[field.id] || ""
    return (
      <div className="space-y-2">
        <Select value={value} onValueChange={(nextValue) => updateTabValue(tab.id, field.id, nextValue)}>
          <SelectTrigger id={`${tab.id}-${field.id}`} className="w-full">
            <SelectValue placeholder={field.placeholder || field.label} />
          </SelectTrigger>
          <SelectContent>
            {voiceOptions.map((voice) => (
              <SelectItem key={`${voice.category}-${voice.voiceId}`} value={voice.voiceId}>
                {voice.voiceName} · {getVoiceCategoryLabel(locale, voice.category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value ? (
          <div className="text-xs text-muted-foreground">
            {voiceOptions.find((voice) => voice.voiceId === value)?.description?.[0] || value}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section className="public-grid-bg w-full px-2 py-3 lg:px-3 lg:py-4">
      <input
        ref={sourceFileInputRef}
        type="file"
        accept=".mp3,.m4a,.wav,audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const featureId = activeTab?.id
          event.currentTarget.value = ""
          if (!file || !featureId) return
          void uploadAudioFile(featureId, "voice_clone", file)
        }}
      />
      <input
        ref={promptAudioFileInputRef}
        type="file"
        accept=".mp3,.m4a,.wav,audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const featureId = activeTab?.id
          event.currentTarget.value = ""
          if (!file || !featureId) return
          void uploadAudioFile(featureId, "prompt_audio", file)
        }}
      />
      <input
        ref={assetFileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const featureId = assetUploadTabIdRef.current
          const fieldId = assetUploadFieldIdRef.current
          event.currentTarget.value = ""
          if (!file || !featureId || !fieldId) return
          void uploadRunningHubFieldFile(featureId, fieldId, file)
        }}
      />

      <div className="space-y-3">
        {showHero ? (
          <div className="rounded-[18px] border border-border/60 bg-background/90 p-3 shadow-sm lg:p-4">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[0.01em] text-foreground lg:text-4xl">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
          </div>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-2">
          {groupedFeatures.map((group) => (
            <article key={group.id} className="rounded-[18px] border border-border/60 bg-background/90 p-3 shadow-sm lg:p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {group.id === "audio-processing" ? <AudioLines className="size-4" /> : <Video className="size-4" />}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-xl font-extrabold tracking-[0.01em] text-foreground">{group.title}</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{group.description}</p>
                </div>
              </div>
              <div className={cn("mt-3 grid gap-3", getGroupFeatureGridClass(group.id))}>
                {group.features.map((feature) => {
                  const opened = tabs.some((tab) => tab.id === feature.id)
                  const state = capabilityStates[feature.capabilitySlug]
                  const available = isFeatureAvailable(state)
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      onClick={() => openFeatureTab(feature.id)}
                      className={cn(
                        "flex min-h-[84px] w-full items-center gap-3 rounded-[14px] border px-4 py-4 text-left transition",
                        getFeatureIconTone(opened),
                        !available && "opacity-70",
                      )}
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background/80">
                        {feature.previewKind === "audio" ? <AudioLines className="size-4" /> : <Video className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{feature.title}</div>
                        <div className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{feature.summary}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </div>

        <article ref={workspaceRef} className="rounded-[18px] border border-border/60 bg-background/90 shadow-sm">
          <div className="border-b border-border/60 px-3 py-3 lg:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="public-kicker text-muted-foreground">{copy.workspace}</div>
                <div className="font-display text-2xl font-extrabold tracking-[0.01em] text-foreground">{copy.launchers}</div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
                <div className="flex min-w-0 items-center gap-2">
                  {tabs.map((tab) => {
                    const feature = featureMap[tab.featureId]
                    const active = tab.id === activeTabId
                    return (
                      <div
                        key={tab.id}
                        className={cn(
                          "flex items-center rounded-[12px] border transition",
                          active
                            ? "border-primary/35 bg-background text-primary shadow-sm"
                            : "border-border/70 bg-card text-foreground hover:border-primary/20 hover:bg-accent/20",
                        )}
                      >
                        <button
                          ref={active ? activeTabRef : null}
                          type="button"
                          onClick={() => {
                            setActiveTabId(tab.id)
                            syncFeatureQuery(tab.id)
                          }}
                          className="flex min-w-0 items-center gap-3 px-4 py-3 text-left"
                        >
                          {feature.previewKind === "audio" ? <AudioLines className="size-4" /> : <Video className="size-4" />}
                          <span className="whitespace-nowrap font-medium">{feature.title}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            closeFeatureTab(tab.id)
                          }}
                          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`close-${tab.id}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="hidden shrink-0 items-center gap-2 lg:flex">
                <div className="text-sm text-muted-foreground">{tabs.length === 0 ? copy.openFirst : `${tabs.length} ${copy.tabsOpen}`}</div>
                <Button type="button" variant="outline" className="rounded-[10px] bg-background">
                  {copy.allTasks}
                  <ChevronRight className="ml-2 size-4" />
                </Button>
              </div>
            </div>
          </div>

          {activeTab && activeFeature ? (
            <div className="grid gap-4 p-3 xl:grid-cols-[420px_minmax(0,1fr)] 2xl:grid-cols-[460px_minmax(0,1fr)] lg:p-5">
              <Card className="border-border/70 bg-card shadow-none">
                <CardHeader className="space-y-3">
                  <CardTitle className="text-xl">{copy.config}</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">{activeFeature.summary}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeFeature.id === "voice-synthesis" ? (
                    <div className="space-y-3 rounded-[12px] border border-border/70 bg-background/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="dashboard-kicker text-muted-foreground">{copy.voiceLibrary}</div>
                        <Button type="button" size="sm" variant="outline" className="rounded-[8px]" onClick={() => void ensureVoicesLoaded(true)} disabled={isLoadingVoices}>
                          {isLoadingVoices ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                          {copy.reloadVoices}
                        </Button>
                      </div>
                      {isLoadingVoices ? <div className="text-sm text-muted-foreground">{copy.loadingVoices}</div> : null}
                      {voicesError ? <div className="text-sm text-destructive">{voicesError}</div> : null}
                      {!isLoadingVoices && !voicesError && voiceOptions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{copy.noVoices}</div>
                      ) : null}
                      {voiceOptions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {voiceOptions.slice(0, 6).map((voice) => (
                            <Badge key={`${voice.category}-${voice.voiceId}`} variant="outline" className="rounded-[4px]">
                              {voice.voiceName} · {getVoiceCategoryLabel(locale, voice.category)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {activeFeature.id === "voice-clone" ? (
                    <div className="space-y-3 rounded-[12px] border border-border/70 bg-background/70 p-3">
                      <div className="dashboard-kicker text-muted-foreground">{copy.uploadReference}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="rounded-[8px]" onClick={() => sourceFileInputRef.current?.click()} disabled={activeTab.sourceUploading || activeTab.isRecording}>
                          {activeTab.sourceUploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                          {activeTab.sourceUploading ? copy.uploading : copy.uploadReference}
                        </Button>
                        <Button type="button" variant="outline" className="rounded-[8px]" onClick={() => void (activeTab.isRecording ? stopReferenceRecording() : startReferenceRecording())}>
                          {activeTab.isRecording ? <Square className="mr-2 size-4" /> : <Mic className="mr-2 size-4" />}
                          {activeTab.isRecording ? copy.stopRecording : copy.recordReference}
                        </Button>
                      </div>
                      {activeTab.isRecording ? <div className="text-sm text-primary">{copy.recording}</div> : null}
                      {activeTab.sourceFileName ? (
                        <div className="space-y-2 rounded-[8px] border border-border/60 bg-muted/20 p-3">
                          <div className="text-sm text-foreground/85">
                            {copy.referenceReady}: {activeTab.sourceFileName}
                          </div>
                          {activeTab.sourcePreviewUrl ? <audio src={activeTab.sourcePreviewUrl} controls className="w-full" /> : null}
                        </div>
                      ) : null}

                      <div className="dashboard-kicker text-muted-foreground">{copy.uploadPromptAudio}</div>
                      <Button type="button" variant="outline" className="rounded-[8px]" onClick={() => promptAudioFileInputRef.current?.click()} disabled={activeTab.promptAudioUploading}>
                        {activeTab.promptAudioUploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                        {activeTab.promptAudioUploading ? copy.uploading : copy.uploadPromptAudio}
                      </Button>
                      <div className="text-sm leading-6 text-muted-foreground">{copy.uploadOptionalHint}</div>
                      {activeTab.promptAudioFileName ? (
                        <div className="space-y-2 rounded-[8px] border border-border/60 bg-muted/20 p-3">
                          <div className="text-sm text-foreground/85">
                            {copy.promptReady}: {activeTab.promptAudioFileName}
                          </div>
                          {activeTab.promptAudioPreviewUrl ? <audio src={activeTab.promptAudioPreviewUrl} controls className="w-full" /> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {activeFeature.fields.map((field) => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={`${activeTab.id}-${field.id}`}>{field.label}</Label>
                      {activeFeature.id === "voice-synthesis" && field.id === "voiceId"
                        ? renderVoiceSelect(activeTab, field)
                        : renderField(`${activeTab.id}-${field.id}`, field, activeTab.values[field.id] || "", (nextValue) =>
                            updateTabValue(activeTab.id, field.id, nextValue),
                          )}
                      {field.type === "url" && activeFeature.capabilitySlug === "ai-video" && getAssetPreviewKindForField(field.id) ? (
                        <div className="space-y-2 rounded-[10px] border border-border/60 bg-background/70 p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-[8px]"
                              onClick={() => {
                                assetUploadTabIdRef.current = activeTab.id
                                assetUploadFieldIdRef.current = field.id
                                if (assetFileInputRef.current) {
                                  assetFileInputRef.current.accept = getUploadAcceptForField(field.id)
                                  assetFileInputRef.current.click()
                                }
                              }}
                              disabled={Boolean(activeTab.fieldUploads[field.id]?.uploading)}
                            >
                              {activeTab.fieldUploads[field.id]?.uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                              {copy.uploadMedia}
                            </Button>
                          </div>

                          {getMatchingAssetOptions(field.id).length > 0 ? (
                            <div className="space-y-2">
                              <div className="dashboard-kicker text-muted-foreground">{copy.assetLibrary}</div>
                              <Select
                                value=""
                                onValueChange={(nextValue) => {
                                  updateTabValue(activeTab.id, field.id, nextValue)
                                  updateTabValue(activeTab.id, buildRunningHubFileNameFieldId(field.id), "")
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder={copy.selectAsset} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getMatchingAssetOptions(field.id).map((asset) => (
                                    <SelectItem key={`${field.id}-asset-${asset.id}`} value={asset.sourceUrl || ""}>
                                      #{asset.id} {asset.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">{copy.noMatchingAssets}</div>
                          )}

                          {activeTab.fieldUploads[field.id]?.fileName ? (
                            <div className="text-xs text-foreground/80">{activeTab.fieldUploads[field.id]?.fileName}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}

                  <div className="pt-2">
                    <Button type="button" className="w-full rounded-[8px]" onClick={() => void submitActiveTab()} disabled={activeTab.isSubmitting}>
                      {activeTab.isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                      {activeTab.isSubmitting ? copy.generating : activeFeature.submitLabel}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0 border-border/70 bg-card shadow-none">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">{copy.result}</CardTitle>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeFeature.summary}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="rounded-[4px]">
                        {copy.status}: {activeTab.task?.status || activeTab.submission?.status || copy.ready}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeTab.message ? (
                    <div className="rounded-[8px] border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/85">
                      {activeTab.message}
                    </div>
                  ) : null}
                  {activeTab.error ? (
                    <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {activeTab.error}
                    </div>
                  ) : null}

                  <div className="rounded-[12px] border border-border/70 bg-card/70 p-3">
                    {latestResultUrl && latestIsVideo ? (
                      <video src={latestResultUrl} controls className="aspect-video w-full rounded-[8px] bg-black/85" />
                    ) : null}
                    {latestResultUrl && !latestIsVideo && latestIsAudio ? (
                      <div className="space-y-3 rounded-[8px] border border-border/60 bg-muted/20 p-4">
                        <audio src={latestResultUrl} controls className="w-full" />
                      </div>
                    ) : null}
                    {!latestResultUrl ? (
                      <div className="flex min-h-56 items-center justify-center rounded-[8px] border border-dashed border-border/70 bg-muted/10 px-6 text-center text-sm leading-6 text-muted-foreground">
                        {copy.latestEmpty}
                      </div>
                    ) : null}
                  </div>

                  {activeVoiceId || activeLyrics ? (
                    <div className="space-y-3 rounded-[12px] border border-border/70 bg-background/70 p-3">
                      <div className="dashboard-kicker text-muted-foreground">{copy.resultDetails}</div>
                      {activeVoiceId ? (
                        <div className="text-sm text-foreground/85">
                          <span className="font-medium">voice_id:</span> {activeVoiceId}
                        </div>
                      ) : null}
                      {activeLyrics ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">{copy.lyrics}</div>
                          <pre className="whitespace-pre-wrap rounded-[8px] border border-border/60 bg-muted/20 p-3 text-sm leading-6 text-foreground/85">
                            {activeLyrics}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-[8px]"
                      onClick={() => {
                        if (!activeFeature || !activeTab.task?.taskId) return
                        void refreshTask(
                          activeTab.id,
                          activeFeature.capabilitySlug,
                          activeTab.task.taskId,
                          activeTab.task.detailPath,
                        )
                      }}
                      disabled={!activeTab.task?.taskId || activeTab.isRefreshing}
                    >
                      {activeTab.isRefreshing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      {copy.refresh}
                    </Button>

                    {latestResultUrl ? (
                      <Button asChild type="button" className="rounded-[8px]">
                        <a href={latestResultUrl} target="_blank" rel="noreferrer">
                          <Download className="mr-2 size-4" />
                          {copy.download}
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  <div className="space-y-3 rounded-[12px] border border-border/70 bg-background/70 p-3">
                    <div className="dashboard-kicker text-muted-foreground">{copy.history}</div>
                    {activeTab.task?.results?.length ? (
                      <div className="space-y-2">
                        {activeTab.task.results.map((result, index) => (
                          <div
                            key={`${activeTab.id}-result-${index}`}
                            className="dashboard-chip flex items-center justify-between gap-3 rounded-[4px] px-3 py-3 text-sm text-foreground/85"
                          >
                            <span className="truncate">
                              {result.title || result.outputType || (result.url ? "file" : "text")} · {result.text || result.url || "—"}
                            </span>
                            {result.url ? (
                              <a href={result.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                {copy.download}
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">{copy.latestEmpty}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="mt-5 flex min-h-72 items-center justify-center rounded-[12px] border border-dashed border-border/70 bg-muted/10 px-6 text-center text-sm leading-7 text-muted-foreground">
              {copy.openFirst}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
