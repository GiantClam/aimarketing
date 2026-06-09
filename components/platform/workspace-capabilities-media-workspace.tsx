"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AudioLines, ChevronRight, Download, Home, Loader2, Sparkles, Video, X } from "lucide-react"
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

type MediaTaskSubmission = {
  provider: string
  mediaTarget: string
  requestedTarget?: string
  endpoint?: string | null
  taskId: string
  status: string
  raw?: Record<string, unknown> | null
}

type MediaTaskQuery = {
  taskId: string
  mediaTarget: string
  provider: string
  status: string
  results?: Array<{
    url?: string | null
    outputType?: string | null
    text?: string | null
  }> | null
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
  blocked: string
  deferred: string
  tabsOpen: string
}

function buildDefaultValues(feature: CapabilityMediaWorkspaceFeature) {
  return Object.fromEntries(feature.fields.map((field) => [field.id, field.defaultValue || ""]))
}

function isTerminalStatus(status: string | null | undefined) {
  const normalized = String(status || "").toUpperCase()
  return normalized === "SUCCESS" || normalized === "FAILED"
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
      runtimeDisabled: "当前运行时不可用，暂时不能提交真实任务。",
      permissionRequired: "当前账号缺少企业权限，暂时不能提交真实任务。",
      loginRequired: "当前需要登录后再执行。",
      taskQueued: "任务已提交，右侧会继续轮询真实状态。",
      taskFailed: "媒体任务执行失败。",
      refresh: "刷新状态",
      download: "下载",
      generating: "提交中",
      queued: "处理中",
      ready: "就绪",
      unsupported: "当前能力还没有可执行工作区。",
      blocked: "受限",
      deferred: "未开放",
      tabsOpen: "已打开 tab",
    }
  }

  return {
    eyebrow: "Media Workspace",
    title: "Capabilities",
    description: "Open one tab per sub-capability. Fill the structured brief on the left and review real task output, preview, and download on the right.",
    launchers: "Capability Launchers",
    workspace: "Multi-tab workspace",
    config: "Task configuration",
    result: "Result",
    allTasks: "All tasks",
    status: "Task status",
    provider: "Provider",
    runtime: "Runtime",
    access: "Access",
    latest: "Latest output",
    history: "Result list",
    latestEmpty: "No real previewable result is available yet.",
    openFeature: "Open capability",
    openFirst: "Start by opening an audio or video sub-capability above.",
    runtimeDeferred: "This runtime is still deferred, so real execution is not available yet.",
    runtimeDisabled: "This runtime is currently disabled, so real execution is not available yet.",
    permissionRequired: "This account does not currently have permission to run this capability.",
    loginRequired: "Login is required before execution.",
    taskQueued: "Task submitted. The panel will continue polling real task state.",
    taskFailed: "The media task failed.",
    refresh: "Refresh status",
    download: "Download",
    generating: "Submitting",
    queued: "Processing",
    ready: "Ready",
    unsupported: "This capability does not yet expose an executable workspace.",
    blocked: "Blocked",
    deferred: "Deferred",
    tabsOpen: "open tabs",
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
    />
  )
}

export function WorkspaceCapabilitiesMediaWorkspace({
  locale,
  groups,
  features,
  capabilityStates,
  initialFeatureId,
}: {
  locale: "zh" | "en"
  groups: CapabilityMediaWorkspaceGroup[]
  features: CapabilityMediaWorkspaceFeature[]
  capabilityStates: Record<"ai-video" | "ai-music", WorkspaceCapabilityState | null>
  initialFeatureId?: CapabilityMediaWorkspaceFeatureId | null
}) {
  const copy = useMemo(() => getCopy(locale), [locale])
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tabs, setTabs] = useState<WorkspaceTabState[]>([])
  const [activeTabId, setActiveTabId] = useState<CapabilityMediaWorkspaceFeatureId | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)
  const activeTabRef = useRef<HTMLButtonElement | null>(null)

  const featureMap = useMemo(
    () => Object.fromEntries(features.map((feature) => [feature.id, feature])) as Record<CapabilityMediaWorkspaceFeatureId, CapabilityMediaWorkspaceFeature>,
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

  useEffect(() => {
    if (!initialFeatureId || !featureMap[initialFeatureId]) return

    setTabs((current) => {
      if (current.some((tab) => tab.id === initialFeatureId)) return current
      const feature = featureMap[initialFeatureId]
      return [
        ...current,
        {
          id: initialFeatureId,
          featureId: initialFeatureId,
          values: buildDefaultValues(feature),
          isSubmitting: false,
          isRefreshing: false,
          error: null,
          message: null,
          submission: null,
          task: null,
        },
      ]
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
  }, [activeTabId, tabs])

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
  function openFeatureTab(featureId: CapabilityMediaWorkspaceFeatureId) {
    const feature = featureMap[featureId]
    if (!feature) return

    setTabs((current) => {
      if (current.some((tab) => tab.id === featureId)) return current
      return [
        ...current,
        {
          id: featureId,
          featureId,
          values: buildDefaultValues(feature),
          isSubmitting: false,
          isRefreshing: false,
          error: null,
          message: null,
          submission: null,
          task: null,
        },
      ]
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

  function patchTab(featureId: CapabilityMediaWorkspaceFeatureId, patch: Partial<WorkspaceTabState>) {
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
  }

  const refreshTask = useCallback(async (featureId: CapabilityMediaWorkspaceFeatureId, capabilitySlug: "ai-video" | "ai-music", taskId: string) => {
    patchTab(featureId, { isRefreshing: true })

    try {
      const response = await fetch(`/api/platform/media/tasks/${encodeURIComponent(taskId)}?target=${encodeURIComponent(capabilitySlug)}`, {
        cache: "no-store",
      })
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
  }, [copy.taskFailed])

  useEffect(() => {
    const pendingTabs = tabs.filter((tab) => tab.task?.taskId && tab.task?.status && !isTerminalStatus(tab.task.status))
    if (pendingTabs.length === 0) return

    const timer = window.setTimeout(() => {
      pendingTabs.forEach((tab) => {
        const feature = featureMap[tab.featureId]
        if (!tab.task?.taskId || !feature) return
        void refreshTask(tab.featureId, feature.capabilitySlug, tab.task.taskId)
      })
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [featureMap, refreshTask, tabs])

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

    patchTab(activeTab.id, {
      isSubmitting: true,
      error: null,
      message: null,
    })

    const payload = {
      featureId: activeFeature.id,
      mode: "capabilities-media-workspace",
      prompt: activeTab.values.prompt || "",
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
          mediaTarget: data.data.mediaTarget,
          provider: data.data.provider,
          status: data.data.status,
          results: null,
        },
        message: copy.taskQueued,
        isSubmitting: false,
      })
      await refreshTask(activeTab.id, activeFeature.capabilitySlug, data.data.taskId)
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

  return (
    <section className="public-grid-bg w-full px-2 py-3 lg:px-3 lg:py-4">
      <div className="space-y-3">
        <div className="rounded-[18px] border border-border/60 bg-background/90 p-3 shadow-sm lg:p-4">
          <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[0.01em] text-foreground lg:text-4xl">
            {copy.title}
          </h2>
        </div>

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
                        available
                          ? "border-border/70 bg-card hover:border-primary/25 hover:bg-accent/20"
                          : "border-border/60 bg-muted/35 text-muted-foreground hover:border-border/70 hover:bg-muted/45",
                        opened && available && "border-primary/35 bg-primary/5 shadow-sm",
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full border shadow-sm",
                          getFeatureIconTone(opened),
                        )}
                      >
                        {feature.previewKind === "audio" ? <AudioLines className="size-4" /> : <Video className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "text-sm font-medium leading-5 whitespace-normal break-words",
                            available ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {feature.title}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </div>

        <article ref={workspaceRef} className="overflow-hidden rounded-[20px] border border-border/60 bg-background/95 shadow-sm">
          <div className="border-b border-border/70 bg-card/50 px-3 py-3 lg:px-5">
            <div className="flex flex-wrap items-center gap-3 overflow-hidden">
              <div className="flex shrink-0 items-center justify-center rounded-[12px] border border-border/70 bg-background p-3 text-muted-foreground">
                <Home className="size-4" />
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div className="flex min-w-max items-stretch gap-2 pb-1">
                  {tabs.map((tab) => {
                    const feature = featureMap[tab.featureId]
                    const active = tab.id === activeTabId
                    return (
                      <div
                        key={tab.id}
                        className={cn(
                          "group flex shrink-0 items-center gap-2 rounded-[12px] border pr-2 transition",
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
                  {activeFeature.fields.map((field) => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={`${activeTab.id}-${field.id}`}>{field.label}</Label>
                      {renderField(`${activeTab.id}-${field.id}`, field, activeTab.values[field.id] || "", (nextValue) =>
                        patchTab(activeTab.id, {
                          values: {
                            ...activeTab.values,
                            [field.id]: nextValue,
                          },
                        }),
                      )}
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
                      <div className="space-y-3">
                        <div className="rounded-[8px] border border-border/60 bg-muted/20 p-4">
                          <audio src={latestResultUrl} controls className="w-full" />
                        </div>
                      </div>
                    ) : null}
                    {!latestResultUrl ? (
                      <div className="flex min-h-56 items-center justify-center rounded-[8px] border border-dashed border-border/70 bg-muted/10 px-6 text-center text-sm leading-6 text-muted-foreground">
                        {copy.latestEmpty}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-[8px]"
                      onClick={() => {
                        if (!activeFeature || !activeTab.task?.taskId) return
                        void refreshTask(activeTab.id, activeFeature.capabilitySlug, activeTab.task.taskId)
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
                          <div key={`${activeTab.id}-result-${index}`} className="dashboard-chip flex items-center justify-between gap-3 rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                            <span className="truncate">
                              {result.outputType || (result.url ? "file" : "text")} · {result.url || result.text || "—"}
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
