"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { AppLocale } from "@/lib/i18n/config"
import type {
  CustomerGovernanceSettings,
  CustomerGovernanceSnapshot,
} from "@/lib/platform/customer-governance"
import {
  getDefaultRunningHubImageRoute,
  getSupportedModelCards,
  isEnterpriseModelProviderBaseUrlRequired,
  listRunningHubImageRoutes,
  shouldRequireEnterpriseProviderBaseUrl,
  type EnterpriseModelCategory,
  type EnterpriseModelCategoryConfig,
  type EnterpriseModelProviderConfig,
  type EnterpriseModelProviderId,
  type EnterpriseRunningHubImageRouteMode,
} from "@/lib/platform/model-config"
import type { PlatformProviderRuntime } from "@/lib/platform/runtime"

type Copy = {
  title: string
  body: string
  ssoDomain: string
  ssoDomainPlaceholder: string
  seatRequestNote: string
  seatRequestPlaceholder: string
  runtimeIntakeMode: string
  runtimeDefault: string
  runtimeReview: string
  save: string
  saving: string
  saved: string
  saveFailed: string
  readOnly: string
  modelSectionTitle: string
  modelSectionBody: string
  modelEditorTitle: string
  modelEditorBody: string
  providerRoutingTitle: string
  providerRoutingBody: string
  providerRoutingEmpty: string
  providerRoutingAssignedAll: string
  providerRoutingAssignedCount: string
  providerRoutingSystem: string
  providerRoutingSystemHint: string
  providerRoutingManagedByEnv: string
  categoryTabs: Record<EnterpriseModelCategory, string>
  categoryDescriptions: Record<EnterpriseModelCategory, string>
  supportedModels: string
  defaultModelRoute: string
  selectedProviderHint: string
  selectedProvider: string
  selectedModel: string
  selectedModelPlaceholder: string
  providerLabel: string
  routeLabel: string
  routeType: string
  routeEndpoint: string
  txt2imgDefaultRoute: string
  img2imgDefaultRoute: string
  runningHubRouteHint: string
  runningHubRouteEndpointPlaceholder: string
  runningHubRouteModelPlaceholder: string
  baseUrl: string
  baseUrlPlaceholder: string
  baseUrlRequired: string
  apiKey: string
  apiKeyPlaceholder: string
  apiKeyConfigured: string
  providerEnabled: string
  editModel: string
  assignedMembers: string
  memberAssignmentHint: string
  enableProvider: string
  disableProvider: string
  saveModelDraft: string
  deleteModel: string
  close: string
  saveHint: string
}

function getCopy(locale: AppLocale): Copy {
  if (locale === "zh") {
    return {
      title: "治理设置",
      body: "统一维护企业治理偏好与模型编排。保存时会一起提交 SSO、席位备注、运行时接入模式，以及文本、图片、视频、音频模型配置。",
      ssoDomain: "SSO 域名",
      ssoDomainPlaceholder: "例如 corp.example.com",
      seatRequestNote: "席位申请备注",
      seatRequestPlaceholder: "例如：席位扩容需要先经过采购审批。",
      runtimeIntakeMode: "运行时接入模式",
      runtimeDefault: "工作台默认",
      runtimeReview: "管理员审核",
      save: "保存设置",
      saving: "保存中...",
      saved: "设置已保存",
      saveFailed: "保存失败",
      readOnly: "当前账号为只读，可查看但不能修改治理设置。",
      modelSectionTitle: "模型配置",
      modelSectionBody: "支持按文本生成、图片生成、视频生成、音频生成分别配置 provider、model、Base URL 和 API Key。每个分类只选择一个主 provider 作为默认路由。",
      modelEditorTitle: "添加模型",
      modelEditorBody: "在这里选择 provider、填写展示名称、默认模型与 API Key。若选择 OpenAI Compatible，还需要填写 Base URL；OpenRouter 也通过这一类兼容配置手动接入。",
      providerRoutingTitle: "Provider Routing",
      providerRoutingBody: "这里展示当前已添加的模型路由。点击后可弹框编辑模型信息、启停状态和成员分配。",
      providerRoutingEmpty: "当前分类还没有已添加模型。",
      providerRoutingAssignedAll: "未指定成员，默认全员可用",
      providerRoutingAssignedCount: "已分配成员",
      providerRoutingSystem: "系统默认",
      providerRoutingSystemHint: "该 Provider 由环境变量管理，默认启用且全员可用。这里仅允许设置成员权限。",
      providerRoutingManagedByEnv: "模型参数由环境变量管理",
      categoryTabs: {
        text_generation: "文本生成",
        image_generation: "图片生成",
        video_generation: "视频生成",
        audio_generation: "音频生成",
      },
      categoryDescriptions: {
        text_generation: "支持 OpenAI Compatible、Qwen、MiniMax、GLM、火山引擎（Doubao / DeepSeek）官方接口；其中 PPToken、硅基流动等可作为默认兼容路由，OpenRouter 需由企业在 OpenAI Compatible 中手动配置接入。",
        image_generation: "支持 Google Nanobanana2、OpenAI gpt-image-2、OpenAI Compatible 图片接口，以及 RunningHub 文生图 / 图生图工作流。",
        video_generation: "支持 MiniMax 海螺、Gemini Veo 3.1、Seedance 官方接口，以及 RunningHub API。",
        audio_generation: "支持 MiniMax 官方音频接口，用于 AI 配乐、语音合成与声音克隆。",
      },
      supportedModels: "支持模型",
      defaultModelRoute: "默认模型路由",
      selectedProviderHint: "当前表单保存的是该分类的默认模型路由，Model 选项里已经包含 Provider。",
      selectedProvider: "默认 Provider",
      selectedModel: "默认 Model",
      selectedModelPlaceholder: "例如 qwen-max、gpt-image-2、veo-3.1",
      providerLabel: "展示名称",
      routeLabel: "路由名称",
      routeType: "路由类型",
      routeEndpoint: "提交链接",
      txt2imgDefaultRoute: "默认文生图路由",
      img2imgDefaultRoute: "默认图生图路由",
      runningHubRouteHint: "RunningHub 图片配置支持分别维护文生图和图生图路由。共享 Base URL 与 API Key，每条路由单独填写提交链接和工作流 / 模型 ID。",
      runningHubRouteEndpointPlaceholder: "例如 /api/runninghub/txt2img 或完整 URL",
      runningHubRouteModelPlaceholder: "例如 rh-txt2img-workflow",
      baseUrl: "Base URL",
      baseUrlPlaceholder: "官方接口可留空，兼容接口请填写完整地址",
      baseUrlRequired: "OpenAI Compatible 接口需要填写 Base URL。",
      apiKey: "API Key",
      apiKeyPlaceholder: "留空则保持当前值或表示未配置",
      apiKeyConfigured: "已配置，留空保持不变",
      providerEnabled: "启用该 Provider",
      editModel: "编辑模型",
      assignedMembers: "分配成员",
      memberAssignmentHint: "只勾选指定企业成员；不勾选时默认全员可用。",
      enableProvider: "启用",
      disableProvider: "停用",
      saveModelDraft: "应用编辑",
      deleteModel: "删除模型",
      close: "关闭",
      saveHint: "只会保存当前可见企业的治理配置，不影响其他企业。",
    }
  }

  return {
    title: "Governance settings",
    body: "Manage enterprise governance preferences and model orchestration in one place. Saving submits SSO, seat-request notes, runtime intake mode, and text/image/video/audio model settings together.",
    ssoDomain: "SSO domain",
    ssoDomainPlaceholder: "For example: corp.example.com",
    seatRequestNote: "Seat request note",
    seatRequestPlaceholder: "For example: Seat increases require procurement review first.",
    runtimeIntakeMode: "Runtime intake mode",
    runtimeDefault: "Workspace default",
    runtimeReview: "Admin review",
    save: "Save settings",
    saving: "Saving...",
    saved: "Settings saved",
    saveFailed: "Save failed",
    readOnly: "This account is read-only and can inspect governance settings without editing them.",
    modelSectionTitle: "Model configuration",
    modelSectionBody: "Configure provider, model, base URL, and API key separately for text, image, video, and audio generation. Each category chooses one primary provider as the default route.",
    modelEditorTitle: "Add model",
    modelEditorBody: "Choose a provider here, then fill in the display label, default model, and API key. OpenAI Compatible also requires a Base URL, and OpenRouter should be added manually through this compatible route.",
    providerRoutingTitle: "Provider Routing",
    providerRoutingBody: "Current configured model routes appear here. Click one to edit model info, enabled state, and assigned members.",
    providerRoutingEmpty: "No configured model routes in this category yet.",
    providerRoutingAssignedAll: "No members selected. Available to everyone by default.",
    providerRoutingAssignedCount: "Assigned members",
    providerRoutingSystem: "System default",
    providerRoutingSystemHint: "This provider is managed by environment variables. It stays enabled and globally available by default. Only member permissions can be changed here.",
    providerRoutingManagedByEnv: "Model settings are managed by environment variables",
    categoryTabs: {
      text_generation: "Text generation",
      image_generation: "Image generation",
      video_generation: "Video generation",
      audio_generation: "Audio generation",
    },
    categoryDescriptions: {
      text_generation: "Supports OpenAI Compatible plus official Qwen, MiniMax, GLM, and Volcengine (Doubao / DeepSeek) APIs. OpenRouter is supported as a manually configured OpenAI-compatible provider rather than a platform default.",
      image_generation: "Supports Google Nanobanana2, OpenAI gpt-image-2, OpenAI Compatible image APIs, and RunningHub text-to-image / image-to-image workflows.",
      video_generation: "Supports official MiniMax Hailuo, Gemini Veo 3.1, Seedance, and RunningHub APIs.",
      audio_generation: "Supports the official MiniMax audio runtime for music generation, speech synthesis, and voice cloning.",
    },
    supportedModels: "Supported models",
    defaultModelRoute: "Default model route",
    selectedProviderHint: "This form saves the default model route for the current category. The model options already include the provider.",
    selectedProvider: "Default provider",
    selectedModel: "Default model",
    selectedModelPlaceholder: "For example: qwen-max, gpt-image-2, veo-3.1",
    providerLabel: "Display label",
    routeLabel: "Route label",
    routeType: "Route type",
    routeEndpoint: "Submit endpoint",
    txt2imgDefaultRoute: "Default txt2img route",
    img2imgDefaultRoute: "Default img2img route",
    runningHubRouteHint: "RunningHub image settings can maintain text-to-image and image-to-image routes separately. Base URL and API key stay shared while each route gets its own submit endpoint and workflow / model ID.",
    runningHubRouteEndpointPlaceholder: "For example: /api/runninghub/txt2img or a full URL",
    runningHubRouteModelPlaceholder: "For example: rh-txt2img-workflow",
    baseUrl: "Base URL",
    baseUrlPlaceholder: "Leave empty for official APIs, fill for compatible endpoints",
    baseUrlRequired: "OpenAI Compatible requires a Base URL.",
    apiKey: "API key",
    apiKeyPlaceholder: "Leave empty to keep current value or indicate not configured",
    apiKeyConfigured: "Configured. Leave blank to keep unchanged",
    providerEnabled: "Enable this provider",
    editModel: "Edit model",
    assignedMembers: "Assigned members",
    memberAssignmentHint: "Check specific company members only. Leave empty to allow everyone by default.",
    enableProvider: "Enable",
    disableProvider: "Disable",
    saveModelDraft: "Apply changes",
    deleteModel: "Delete model",
    close: "Close",
    saveHint: "This only saves governance settings for the current enterprise.",
  }
}

function updateCategoryConfig(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  updater: (config: EnterpriseModelCategoryConfig) => EnterpriseModelCategoryConfig,
) {
  return {
    ...settings,
    modelConfig: {
      ...settings.modelConfig,
      [category]: updater(settings.modelConfig[category]),
    },
  }
}

function updateProviderField(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  providerId: EnterpriseModelProviderId,
  field: "label" | "modelId" | "baseUrl" | "apiKey" | "enabled" | "assignedUserIds",
  value: string | boolean | number[],
) {
  return updateCategoryConfig(settings, category, (config) => ({
    ...config,
    providers: config.providers.map((provider) =>
      provider.providerId === providerId ? { ...provider, [field]: value } : provider,
    ),
  }))
}

function updateProviderRouteField(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  providerId: EnterpriseModelProviderId,
  routeId: string,
  field: "label" | "endpoint" | "modelId" | "enabled",
  value: string | boolean,
) {
  return updateCategoryConfig(settings, category, (config) => ({
    ...config,
    providers: config.providers.map((provider) =>
      provider.providerId === providerId
        ? {
            ...provider,
            routes: (provider.routes || []).map((route) =>
              route.routeId === routeId ? { ...route, [field]: value } : route,
            ),
          }
        : provider,
    ),
  }))
}

function updateRunningHubDefaultRoute(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  mode: EnterpriseRunningHubImageRouteMode,
  routeId: string,
) {
  return updateCategoryConfig(settings, category, (config) => ({
    ...config,
    defaultTxt2imgRouteId: mode === "txt2img" ? routeId : config.defaultTxt2imgRouteId,
    defaultImg2imgRouteId: mode === "img2img" ? routeId : config.defaultImg2imgRouteId,
  }))
}

function removeProviderRoute(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  providerId: EnterpriseModelProviderId,
) {
  return updateCategoryConfig(settings, category, (config) => {
    const cards = getSupportedModelCards(category)
    const fallbackProviderId =
      cards.find((item) => item.providerId !== providerId)?.providerId || config.selectedProviderId || providerId

    return {
      ...config,
      selectedProviderId:
        config.selectedProviderId === providerId ? fallbackProviderId : config.selectedProviderId,
      selectedModelId:
        config.selectedProviderId === providerId ? null : config.selectedModelId,
      providers: config.providers.map((provider) =>
        provider.providerId === providerId
          ? {
              ...provider,
              label: cards.find((item) => item.providerId === providerId)?.providerLabel || provider.providerId,
              modelId: null,
              baseUrl: null,
              apiKey: null,
              apiKeyConfigured: false,
              clearApiKey: true,
              enabled: false,
              assignedUserIds: [],
            }
          : provider,
      ),
    }
  })
}

function updateRouteAssignment(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  routeId: string,
  assignedUserIds: number[],
) {
  return updateCategoryConfig(settings, category, (config) => {
    const normalizedRouteId = routeId.trim()
    if (!normalizedRouteId) return config

    const nextAssignments = config.routeAssignments.filter((assignment) => assignment.routeId !== normalizedRouteId)
    if (assignedUserIds.length > 0) {
      nextAssignments.push({
        routeId: normalizedRouteId,
        assignedUserIds: [...new Set(assignedUserIds)],
      })
    }

    return {
      ...config,
      routeAssignments: nextAssignments,
    }
  })
}

type EnterpriseMemberOption = {
  id: number
  name: string
  email: string
  enterpriseRole: string | null
  enterpriseStatus: string | null
}

type EditingProviderRoute = {
  category: EnterpriseModelCategory
  routeId: string
  providerId: string
  source: "enterprise" | "system"
  title: string
  label: string
  modelId: string
  baseUrl: string
  apiKey: string
  apiKeyConfigured: boolean
  enabled: boolean
  assignedUserIds: number[]
}

type ProviderRoutingCard = {
  routeId: string
  category: EnterpriseModelCategory
  providerId: string
  source: "enterprise" | "system"
  title: string
  providerLabel: string
  modelId: string | null
  baseUrl: string | null
  enabled: boolean
  assignedUserIds: number[]
  isDefaultProvider: boolean
  supportedModels: string[]
}

type DefaultModelRouteOption = {
  value: string
  providerId: EnterpriseModelProviderId
  modelId: string | null
  label: string
}

type RunningHubRouteOption = {
  value: string
  label: string
  mode: EnterpriseRunningHubImageRouteMode
}

function getRuntimeProviderLabel(provider: PlatformProviderRuntime) {
  if (provider.id === "pptoken") return "PPToken"
  if (provider.id === "openrouter") return "OpenRouter"
  if (provider.id === "aiberm") return "AIBERM"
  if (provider.id === "crazyroute") return "Crazyroute"
  if (provider.id === "runninghub-image") return "RunningHub Image"
  if (provider.id === "runninghub-video") return "RunningHub Video"
  if (provider.id === "minimax-video") return "MiniMax Hailuo Video"
  if (provider.id === "minimax-audio") return "MiniMax Audio"
  if (provider.id === "fixture") return "Fixture"
  return provider.id
}

function getRuntimeProvidersForCategory(
  category: EnterpriseModelCategory,
  runtimeProviders: PlatformProviderRuntime[],
) {
  return runtimeProviders.filter((provider) => {
    if (!provider.configured) return false
    if (category === "text_generation") {
      return provider.scope === "text" && !provider.id.startsWith("writer:")
    }
    if (category === "image_generation") {
      return provider.scope === "image"
    }
    if (category === "video_generation") {
      return provider.scope === "video"
    }
    return provider.scope === "audio"
  })
}

function buildDefaultModelRouteValue(input: {
  providerId: EnterpriseModelProviderId
  modelId: string | null
}) {
  return `${input.providerId}::${encodeURIComponent(input.modelId || "")}`
}

function parseDefaultModelRouteValue(value: string) {
  const separatorIndex = value.indexOf("::")
  if (separatorIndex <= 0) return null
  const providerId = value.slice(0, separatorIndex).trim() as EnterpriseModelProviderId
  const modelId = decodeURIComponent(value.slice(separatorIndex + 2)).trim() || null
  if (!providerId) return null
  return {
    providerId,
    modelId,
  }
}

export function PlatformGovernanceSettingsPanel({
  locale,
  snapshot,
  runtimeProviders = [],
  initialCategory = "text_generation",
  visibleSections = ["governance", "models"],
}: {
  locale: AppLocale
  snapshot: CustomerGovernanceSnapshot
  runtimeProviders?: PlatformProviderRuntime[]
  initialCategory?: EnterpriseModelCategory
  visibleSections?: Array<"governance" | "models">
}) {
  const copy = getCopy(locale)
  const [settings, setSettings] = useState<CustomerGovernanceSettings>(snapshot.settings)
  const [activeCategory, setActiveCategory] = useState<EnterpriseModelCategory>(initialCategory)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [enterpriseMembers, setEnterpriseMembers] = useState<EnterpriseMemberOption[]>([])
  const [editingRoute, setEditingRoute] = useState<EditingProviderRoute | null>(null)
  const canManageSettings = snapshot.canManageSettings
  const showGovernanceSection = visibleSections.includes("governance")
  const showModelSection = visibleSections.includes("models")
  const panelTitle =
    showGovernanceSection && showModelSection
      ? copy.title
      : showGovernanceSection
        ? copy.title
        : copy.modelSectionTitle
  const panelBody =
    showGovernanceSection && showModelSection
      ? copy.body
      : showGovernanceSection
        ? locale === "zh"
          ? "集中维护企业级 SSO 域名、席位申请备注和运行时接入模式，避免治理偏好分散到其他后台页面。"
          : "Keep enterprise SSO domain, seat-request notes, and runtime intake mode in one place so governance preferences do not drift across separate admin screens."
        : copy.modelSectionBody
  const showModelSectionIntro = showGovernanceSection

  useEffect(() => {
    if (!canManageSettings) return

    let cancelled = false
    void fetch("/api/enterprise/members", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return
        const members = Array.isArray(payload?.data) ? (payload.data as Array<Record<string, unknown>>) : []
        setEnterpriseMembers(
          members
            .map((item) => ({
              id: Number(item?.id || 0),
              name: typeof item?.name === "string" ? item.name : "",
              email: typeof item?.email === "string" ? item.email : "",
              enterpriseRole: typeof item?.enterpriseRole === "string" ? item.enterpriseRole : null,
              enterpriseStatus: typeof item?.enterpriseStatus === "string" ? item.enterpriseStatus : null,
            }))
            .filter((item) => Number.isInteger(item.id) && item.id > 0),
        )
      })
      .catch(() => {
        if (!cancelled) setEnterpriseMembers([])
      })

    return () => {
      cancelled = true
    }
  }, [canManageSettings])

  function getCategoryProviderConfig(
    categoryConfig: EnterpriseModelCategoryConfig,
    providerId: EnterpriseModelProviderId,
  ) {
    return (
      categoryConfig.providers.find((item) => item.providerId === providerId) ||
      categoryConfig.providers[0]
    )
  }

  function getSelectedProviderValidationMessage(nextSettings: CustomerGovernanceSettings) {
    for (const category of ["text_generation", "image_generation", "video_generation", "audio_generation"] as EnterpriseModelCategory[]) {
      const categoryConfig = nextSettings.modelConfig[category]
      const selectedProviderId = categoryConfig.selectedProviderId || categoryConfig.providers[0]?.providerId
      if (!selectedProviderId || !isEnterpriseModelProviderBaseUrlRequired(selectedProviderId)) continue

      const provider = getCategoryProviderConfig(categoryConfig, selectedProviderId)
      if (shouldRequireEnterpriseProviderBaseUrl(provider) && !provider?.baseUrl?.trim()) {
        return copy.baseUrlRequired
      }
    }

    return null
  }

  function isProviderRouteConfigured(
    categoryConfig: EnterpriseModelCategoryConfig,
    providerId: EnterpriseModelProviderId,
  ) {
    const provider = getCategoryProviderConfig(categoryConfig, providerId)
    return Boolean(
      categoryConfig.selectedProviderId === providerId ||
        provider?.enabled ||
        provider?.modelId?.trim() ||
        provider?.baseUrl?.trim() ||
        provider?.apiKeyConfigured ||
        provider?.assignedUserIds.length,
    )
  }

  function openProviderRouteEditor(card: ProviderRoutingCard) {
    const categoryConfig = settings.modelConfig[card.category]
    const provider =
      card.source === "enterprise"
        ? getCategoryProviderConfig(categoryConfig, card.providerId as EnterpriseModelProviderId)
        : null
    const systemAssignment =
      card.source === "system"
        ? categoryConfig.routeAssignments.find((assignment) => assignment.routeId === card.routeId)
        : null
    setEditingRoute({
      category: card.category,
      routeId: card.routeId,
      providerId: card.providerId,
      source: card.source,
      title: card.title,
      label: provider?.label || card.title,
      modelId: provider?.modelId || card.modelId || "",
      baseUrl: provider?.baseUrl || card.baseUrl || "",
      apiKey: "",
      apiKeyConfigured: Boolean(provider?.apiKeyConfigured),
      enabled: card.source === "enterprise" ? Boolean(provider?.enabled) : true,
      assignedUserIds:
        card.source === "enterprise"
          ? [...(provider?.assignedUserIds || [])]
          : [...(systemAssignment?.assignedUserIds || [])],
    })
  }

  function applyProviderRouteEditor() {
    if (!editingRoute) return

    if (editingRoute.source === "enterprise") {
      const providerNeedsBaseUrl = shouldRequireEnterpriseProviderBaseUrl({
        providerId: editingRoute.providerId as EnterpriseModelProviderId,
        modelId: editingRoute.modelId,
        apiKey: editingRoute.apiKey,
        apiKeyConfigured: editingRoute.apiKeyConfigured,
      })
      if (providerNeedsBaseUrl && !editingRoute.baseUrl.trim()) {
        setMessage(copy.baseUrlRequired)
        return
      }
    }

    setSettings((current) => {
      if (editingRoute.source === "system") {
        return updateRouteAssignment(
          current,
          editingRoute.category,
          editingRoute.routeId,
          editingRoute.assignedUserIds,
        )
      }

      return updateCategoryConfig(current, editingRoute.category, (config) => ({
        ...config,
        providers: config.providers.map((provider) =>
          provider.providerId === editingRoute.providerId
            ? {
                ...provider,
                label: editingRoute.label,
                modelId: editingRoute.modelId || null,
                baseUrl: editingRoute.baseUrl || null,
                apiKey: editingRoute.apiKey || null,
                apiKeyConfigured: editingRoute.apiKey ? true : provider.apiKeyConfigured,
                clearApiKey: false,
                enabled: editingRoute.enabled,
                assignedUserIds: [...editingRoute.assignedUserIds],
              }
            : provider,
        ),
      }))
    })
    setEditingRoute(null)
  }

  const activeCategoryConfig = settings.modelConfig[activeCategory]
  const activeRoutingCards: ProviderRoutingCard[] = [
    ...getSupportedModelCards(activeCategory)
      .filter((card) => isProviderRouteConfigured(activeCategoryConfig, card.providerId))
      .map((card) => {
        const provider = getCategoryProviderConfig(activeCategoryConfig, card.providerId)
        return {
          routeId: card.providerId,
          category: activeCategory,
          providerId: card.providerId,
          source: "enterprise" as const,
          title: provider?.label || card.providerLabel,
          providerLabel: card.providerLabel,
          modelId: provider?.modelId || null,
          baseUrl: provider?.baseUrl || null,
          enabled: Boolean(provider?.enabled),
          assignedUserIds: [...(provider?.assignedUserIds || [])],
          isDefaultProvider: activeCategoryConfig.selectedProviderId === card.providerId,
          supportedModels: [...card.models],
        }
      }),
    ...getRuntimeProvidersForCategory(activeCategory, runtimeProviders).map((provider) => {
      const assignment = activeCategoryConfig.routeAssignments.find(
        (item) => item.routeId === provider.id,
      )
      return {
        routeId: provider.id,
        category: activeCategory,
        providerId: provider.id,
        source: "system" as const,
        title: getRuntimeProviderLabel(provider),
        providerLabel: getRuntimeProviderLabel(provider),
        modelId: provider.model,
        baseUrl: provider.baseURL,
        enabled: true,
        assignedUserIds: [...(assignment?.assignedUserIds || [])],
        isDefaultProvider: provider.active,
        supportedModels: provider.model ? [provider.model] : [],
      }
    }),
  ]

  async function saveSettings() {
    if (!canManageSettings) return

    const validationMessage = getSelectedProviderValidationMessage(settings)
    if (validationMessage) {
      setMessage(validationMessage)
      return
    }

    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch("/api/platform/governance/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(settings),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; data?: CustomerGovernanceSettings }
        | null
      if (!response.ok || !payload?.data) {
        const errorMessage =
          payload?.error && payload.error.startsWith("base_url_required:")
            ? copy.baseUrlRequired
            : payload?.error || copy.saveFailed
        throw new Error(errorMessage)
      }

      setSettings(payload.data)
      setMessage(copy.saved)
    } catch (error) {
      setMessage(error instanceof Error ? `${copy.saveFailed}: ${error.message}` : copy.saveFailed)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
      <div className="dashboard-kicker text-muted-foreground">{panelTitle}</div>
      <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
        {panelTitle}
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{panelBody}</p>

      {showGovernanceSection ? (
        <div className="mt-5 grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="governance-sso-domain">{copy.ssoDomain}</Label>
            <Input
              id="governance-sso-domain"
              value={settings.ssoDomain || ""}
              disabled={!canManageSettings || isSaving}
              placeholder={copy.ssoDomainPlaceholder}
              onChange={(event) => setSettings((current) => ({ ...current, ssoDomain: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="governance-seat-note">{copy.seatRequestNote}</Label>
            <Textarea
              id="governance-seat-note"
              value={settings.seatRequestNote || ""}
              disabled={!canManageSettings || isSaving}
              placeholder={copy.seatRequestPlaceholder}
              onChange={(event) => setSettings((current) => ({ ...current, seatRequestNote: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="governance-runtime-intake">{copy.runtimeIntakeMode}</Label>
            <Select
              value={settings.runtimeIntakeMode}
              disabled={!canManageSettings || isSaving}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  runtimeIntakeMode: value === "admin_review" ? "admin_review" : "workspace_default",
                }))
              }
            >
              <SelectTrigger id="governance-runtime-intake" className="w-full">
                <SelectValue placeholder={copy.runtimeIntakeMode} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace_default">{copy.runtimeDefault}</SelectItem>
                <SelectItem value="admin_review">{copy.runtimeReview}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {showModelSection ? (
        <div className={showGovernanceSection ? "mt-8 border-t border-border pt-6" : "mt-5"}>
          {showModelSectionIntro ? (
            <>
              <div className="dashboard-kicker text-muted-foreground">{copy.modelSectionTitle}</div>
              <h3 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {copy.modelSectionTitle}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.modelSectionBody}</p>
            </>
          ) : null}

          <Tabs
            className={showModelSectionIntro ? "mt-5" : ""}
            value={activeCategory}
            onValueChange={(value) => setActiveCategory(value as EnterpriseModelCategory)}
          >
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-[10px] bg-muted/60 p-1">
              <TabsTrigger value="text_generation" className="h-10 min-w-[120px] rounded-[8px] px-4">
                {copy.categoryTabs.text_generation}
              </TabsTrigger>
              <TabsTrigger value="image_generation" className="h-10 min-w-[120px] rounded-[8px] px-4">
                {copy.categoryTabs.image_generation}
              </TabsTrigger>
              <TabsTrigger value="video_generation" className="h-10 min-w-[120px] rounded-[8px] px-4">
                {copy.categoryTabs.video_generation}
              </TabsTrigger>
              <TabsTrigger value="audio_generation" className="h-10 min-w-[120px] rounded-[8px] px-4">
                {copy.categoryTabs.audio_generation}
              </TabsTrigger>
            </TabsList>

            {(["text_generation", "image_generation", "video_generation", "audio_generation"] as EnterpriseModelCategory[]).map(
              (category) => {
                const categoryConfig = settings.modelConfig[category]
                const cards = getSupportedModelCards(category)
                const selectedProviderId =
                  categoryConfig.selectedProviderId || categoryConfig.providers[0]?.providerId || cards[0]?.providerId
                const selectedProvider =
                  (selectedProviderId
                    ? getCategoryProviderConfig(categoryConfig, selectedProviderId)
                    : categoryConfig.providers[0]) || categoryConfig.providers[0]
                const selectedCard =
                  cards.find((item) => item.providerId === selectedProviderId) || cards[0]
                const baseUrlRequired = Boolean(
                  selectedProviderId && isEnterpriseModelProviderBaseUrlRequired(selectedProviderId),
                )
                const selectedProviderIsRunningHub =
                  category === "image_generation" && selectedProviderId === "runninghub"
                const showBaseUrlField =
                  baseUrlRequired || selectedProviderId === "runninghub"
                const defaultModelRouteOptions: DefaultModelRouteOption[] = cards.map((card) => {
                  const provider = getCategoryProviderConfig(categoryConfig, card.providerId)
                  const modelId = provider?.modelId || null
                  return {
                    value: buildDefaultModelRouteValue({
                      providerId: card.providerId,
                      modelId,
                    }),
                    providerId: card.providerId,
                    modelId,
                    label: `${provider?.label || card.providerLabel} / ${modelId || "—"}`,
                  }
                })
                const selectedDefaultModelRouteValue = buildDefaultModelRouteValue({
                  providerId: selectedProviderId,
                  modelId: categoryConfig.selectedModelId || selectedProvider?.modelId || null,
                })
                const runningHubRoutes = selectedProviderIsRunningHub
                  ? listRunningHubImageRoutes(selectedProvider as EnterpriseModelProviderConfig)
                  : []
                const runningHubRouteOptions: RunningHubRouteOption[] = runningHubRoutes.map((route) => ({
                  value: route.routeId,
                  label: `${route.label || route.routeId} / ${route.modelId || "—"}`,
                  mode: route.mode || "txt2img",
                }))
                const defaultTxt2imgRoute =
                  selectedProviderIsRunningHub
                    ? getDefaultRunningHubImageRoute(categoryConfig, "txt2img")
                    : null
                const defaultImg2imgRoute =
                  selectedProviderIsRunningHub
                    ? getDefaultRunningHubImageRoute(categoryConfig, "img2img")
                    : null
                return (
                  <TabsContent key={category} value={category} className="mt-5 space-y-5">
                    <div className="dashboard-chip rounded-[8px] px-4 py-3 text-sm text-foreground/85">
                      {copy.categoryDescriptions[category]}
                    </div>

                    <div className="w-full">
                      <div className="space-y-4 rounded-[10px] border border-primary/25 bg-primary/5 p-4 md:p-5">
                          <div className="space-y-1">
                            <h4 className="text-base font-semibold text-foreground">{copy.modelEditorTitle}</h4>
                            <p className="text-sm leading-6 text-muted-foreground">{copy.modelEditorBody}</p>
                            <p className="text-xs text-muted-foreground">{copy.selectedProviderHint}</p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <div className="space-y-2">
                              <Label htmlFor={`selected-provider-${category}`}>{copy.defaultModelRoute}</Label>
                              <Select
                                value={selectedDefaultModelRouteValue}
                                disabled={!canManageSettings || isSaving}
                                onValueChange={(value) =>
                                  setSettings((current) => {
                                    const parsed = parseDefaultModelRouteValue(value)
                                    if (!parsed) return current
                                    return updateCategoryConfig(current, category, (config) => ({
                                      ...config,
                                      selectedProviderId: parsed.providerId,
                                      selectedModelId:
                                        parsed.modelId ||
                                        getCategoryProviderConfig(config, parsed.providerId)?.modelId ||
                                        null,
                                    }))
                                  })
                                }
                              >
                                <SelectTrigger id={`selected-provider-${category}`} className="w-full">
                                  <SelectValue placeholder={copy.defaultModelRoute} />
                                </SelectTrigger>
                                <SelectContent>
                                  {defaultModelRouteOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`selected-provider-label-${category}`}>{copy.providerLabel}</Label>
                              <Input
                                id={`selected-provider-label-${category}`}
                                value={selectedProvider?.label || ""}
                                disabled={!canManageSettings || isSaving}
                                onChange={(event) =>
                                  setSettings((current) =>
                                    updateProviderField(
                                      current,
                                      category,
                                      selectedProviderId,
                                      "label",
                                      event.target.value,
                                    ),
                                  )
                                }
                              />
                            </div>

                            {!selectedProviderIsRunningHub ? (
                              <div className="space-y-2">
                                <Label htmlFor={`selected-model-${category}`}>{copy.selectedModel}</Label>
                                <Input
                                  id={`selected-model-${category}`}
                                  value={categoryConfig.selectedModelId || selectedProvider?.modelId || ""}
                                  disabled={!canManageSettings || isSaving}
                                  placeholder={copy.selectedModelPlaceholder}
                                  onChange={(event) =>
                                    setSettings((current) =>
                                      updateCategoryConfig(current, category, (config) => {
                                        const nextProviders = config.providers.map((provider) =>
                                          provider.providerId === selectedProviderId
                                            ? { ...provider, modelId: event.target.value }
                                            : provider,
                                        )
                                        return {
                                          ...config,
                                          selectedModelId: event.target.value,
                                          providers: nextProviders,
                                        }
                                      }),
                                    )
                                  }
                                />
                              </div>
                            ) : null}

                            {showBaseUrlField ? (
                              <div className="space-y-2">
                                <Label htmlFor={`selected-base-url-${category}`}>{copy.baseUrl}</Label>
                                <Input
                                  id={`selected-base-url-${category}`}
                                  value={selectedProvider?.baseUrl || ""}
                                  disabled={!canManageSettings || isSaving}
                                  placeholder={copy.baseUrlPlaceholder}
                                  onChange={(event) =>
                                    setSettings((current) =>
                                      updateProviderField(
                                        current,
                                        category,
                                        selectedProviderId,
                                        "baseUrl",
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                                {baseUrlRequired ? <p className="text-xs text-muted-foreground">{copy.baseUrlRequired}</p> : null}
                              </div>
                            ) : null}

                            <div
                              className={
                                showBaseUrlField
                                  ? "space-y-2 md:col-span-2 xl:col-span-3"
                                  : "space-y-2 xl:col-span-2"
                              }
                            >
                              <Label htmlFor={`selected-api-key-${category}`}>{copy.apiKey}</Label>
                              <Input
                                id={`selected-api-key-${category}`}
                                type="password"
                                value={selectedProvider?.apiKey || ""}
                                disabled={!canManageSettings || isSaving}
                                placeholder={selectedProvider?.apiKeyConfigured ? copy.apiKeyConfigured : copy.apiKeyPlaceholder}
                                onChange={(event) =>
                                  setSettings((current) =>
                                    updateProviderField(
                                      current,
                                      category,
                                      selectedProviderId,
                                      "apiKey",
                                      event.target.value,
                                    ),
                                  )
                                }
                              />
                            </div>
                          </div>

                          {selectedProviderIsRunningHub ? (
                            <div className="space-y-4 rounded-[8px] border border-border/70 bg-background/70 p-4">
                              <div className="space-y-1">
                                <h5 className="text-sm font-semibold text-foreground">RunningHub Routes</h5>
                                <p className="text-xs leading-6 text-muted-foreground">{copy.runningHubRouteHint}</p>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor={`runninghub-default-txt2img-${category}`}>{copy.txt2imgDefaultRoute}</Label>
                                  <Select
                                    value={defaultTxt2imgRoute?.routeId || ""}
                                    disabled={!canManageSettings || isSaving}
                                    onValueChange={(value) =>
                                      setSettings((current) =>
                                        updateRunningHubDefaultRoute(current, category, "txt2img", value),
                                      )
                                    }
                                  >
                                    <SelectTrigger id={`runninghub-default-txt2img-${category}`} className="w-full">
                                      <SelectValue placeholder={copy.txt2imgDefaultRoute} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {runningHubRouteOptions
                                        .filter((option) => option.mode === "txt2img")
                                        .map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor={`runninghub-default-img2img-${category}`}>{copy.img2imgDefaultRoute}</Label>
                                  <Select
                                    value={defaultImg2imgRoute?.routeId || ""}
                                    disabled={!canManageSettings || isSaving}
                                    onValueChange={(value) =>
                                      setSettings((current) =>
                                        updateRunningHubDefaultRoute(current, category, "img2img", value),
                                      )
                                    }
                                  >
                                    <SelectTrigger id={`runninghub-default-img2img-${category}`} className="w-full">
                                      <SelectValue placeholder={copy.img2imgDefaultRoute} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {runningHubRouteOptions
                                        .filter((option) => option.mode === "img2img")
                                        .map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                {runningHubRoutes.map((route) => (
                                  <div
                                    key={route.routeId}
                                    className="space-y-3 rounded-[8px] border border-border/70 bg-card/70 p-3"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="space-y-1">
                                        <div className="text-sm font-semibold text-foreground">{route.mode === "txt2img" ? copy.txt2imgDefaultRoute : copy.img2imgDefaultRoute}</div>
                                        <div className="text-xs text-muted-foreground">{copy.routeType}: {route.mode}</div>
                                      </div>
                                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span>{copy.providerEnabled}</span>
                                        <input
                                          type="checkbox"
                                          checked={Boolean(route.enabled)}
                                          disabled={!canManageSettings || isSaving}
                                          onChange={(event) =>
                                            setSettings((current) =>
                                              updateProviderRouteField(
                                                current,
                                                category,
                                                selectedProviderId,
                                                route.routeId,
                                                "enabled",
                                                event.target.checked,
                                              ),
                                            )
                                          }
                                        />
                                      </label>
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor={`${route.routeId}-label`}>{copy.routeLabel}</Label>
                                      <Input
                                        id={`${route.routeId}-label`}
                                        value={route.label}
                                        disabled={!canManageSettings || isSaving}
                                        onChange={(event) =>
                                          setSettings((current) =>
                                            updateProviderRouteField(
                                              current,
                                              category,
                                              selectedProviderId,
                                              route.routeId,
                                              "label",
                                              event.target.value,
                                            ),
                                          )
                                        }
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor={`${route.routeId}-endpoint`}>{copy.routeEndpoint}</Label>
                                      <Input
                                        id={`${route.routeId}-endpoint`}
                                        value={route.endpoint || ""}
                                        disabled={!canManageSettings || isSaving}
                                        placeholder={copy.runningHubRouteEndpointPlaceholder}
                                        onChange={(event) =>
                                          setSettings((current) =>
                                            updateProviderRouteField(
                                              current,
                                              category,
                                              selectedProviderId,
                                              route.routeId,
                                              "endpoint",
                                              event.target.value,
                                            ),
                                          )
                                        }
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor={`${route.routeId}-model`}>{copy.selectedModel}</Label>
                                      <Input
                                        id={`${route.routeId}-model`}
                                        value={route.modelId || ""}
                                        disabled={!canManageSettings || isSaving}
                                        placeholder={copy.runningHubRouteModelPlaceholder}
                                        onChange={(event) =>
                                          setSettings((current) =>
                                            updateProviderRouteField(
                                              current,
                                              category,
                                              selectedProviderId,
                                              route.routeId,
                                              "modelId",
                                              event.target.value,
                                            ),
                                          )
                                        }
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="flex flex-col gap-3 rounded-[8px] border border-border/70 bg-card/70 px-3 py-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <span className="text-xs text-muted-foreground">{copy.supportedModels}</span>
                              <div className="flex flex-wrap gap-2">
                                {selectedCard?.models.map((model) => (
                                  <span
                                    key={`${selectedProviderId}-${model}`}
                                    className="dashboard-chip rounded-[999px] px-2.5 py-1 text-xs text-foreground/85"
                                  >
                                    {model}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <label className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-background/80 px-3 py-2 text-sm text-foreground md:min-w-[220px]">
                              <span>{copy.providerEnabled}</span>
                              <input
                                type="checkbox"
                                checked={Boolean(selectedProvider?.enabled)}
                                disabled={!canManageSettings || isSaving}
                                onChange={(event) =>
                                  setSettings((current) =>
                                    updateProviderField(
                                      current,
                                      category,
                                      selectedProviderId,
                                      "enabled",
                                      event.target.checked,
                                    ),
                                  )
                                }
                              />
                            </label>
                          </div>
                      </div>

                    </div>
                  </TabsContent>
                )
              },
            )}
          </Tabs>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={saveSettings} disabled={!canManageSettings || isSaving}>
          {isSaving ? copy.saving : copy.save}
        </Button>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
        {!canManageSettings ? <span className="text-xs text-muted-foreground">{copy.readOnly}</span> : null}
        <span className="text-xs text-muted-foreground">{copy.saveHint}</span>
      </div>

      {showModelSection ? (
        <div className="mt-6 space-y-3 rounded-[10px] border border-border bg-background/70 p-4">
          <div className="space-y-1">
            <h4 className="text-base font-semibold text-foreground">{copy.providerRoutingTitle}</h4>
            <p className="text-sm leading-6 text-muted-foreground">{copy.providerRoutingBody}</p>
          </div>

          {activeRoutingCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.providerRoutingEmpty}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeRoutingCards.map((card) => {
                const assignedCount = card.assignedUserIds.length
                const isSystemRoute = card.source === "system"

                return (
                  <button
                    key={`${activeCategory}-${card.source}-${card.routeId}`}
                    type="button"
                    className={
                      isSystemRoute
                        ? "rounded-[10px] border border-amber-300/80 bg-amber-50/90 p-3 text-left transition hover:border-amber-400 hover:bg-amber-100/80"
                        : "rounded-[10px] border border-border bg-card/70 p-3 text-left transition hover:border-primary/35 hover:bg-primary/5"
                    }
                    onClick={() => openProviderRouteEditor(card)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-sm font-semibold text-foreground">
                            {card.title}
                          </h5>
                          {card.isDefaultProvider ? (
                            <span className="dashboard-chip rounded-[999px] px-2.5 py-1 text-[11px] text-foreground/85">
                              {copy.selectedProvider}
                            </span>
                          ) : null}
                          {isSystemRoute ? (
                            <span className="rounded-[999px] border border-amber-300 bg-amber-200/80 px-2.5 py-1 text-[11px] font-medium text-amber-950">
                              {copy.providerRoutingSystem}
                            </span>
                          ) : null}
                          <span
                            className={
                              isSystemRoute
                                ? "rounded-[999px] border border-amber-200 bg-white/80 px-2.5 py-1 text-[11px] text-amber-900"
                                : "dashboard-chip rounded-[999px] px-2.5 py-1 text-[11px] text-foreground/85"
                            }
                          >
                            {card.enabled ? copy.enableProvider : copy.disableProvider}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {card.providerLabel} · {card.modelId || "—"}
                        </p>
                      </div>

                      {card.source === "enterprise" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canManageSettings || isSaving}
                          onClick={(event) => {
                            event.stopPropagation()
                            setSettings((current) =>
                              updateProviderField(
                                current,
                                activeCategory,
                                card.providerId as EnterpriseModelProviderId,
                                "enabled",
                                !card.enabled,
                              ),
                            )
                          }}
                        >
                          {card.enabled ? copy.disableProvider : copy.enableProvider}
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {card.supportedModels.map((model) => (
                        <span
                          key={`${card.routeId}-${model}`}
                          className={
                            isSystemRoute
                              ? "rounded-[999px] border border-amber-200 bg-white/75 px-2 py-1 text-[11px] text-amber-900"
                              : "dashboard-chip rounded-[999px] px-2 py-1 text-[11px] text-foreground/85"
                          }
                        >
                          {model}
                        </span>
                      ))}
                    </div>

                    <div className={`mt-2 grid gap-1 text-xs ${isSystemRoute ? "text-amber-900/80" : "text-muted-foreground"}`}>
                      <div>{assignedCount > 0 ? `${copy.providerRoutingAssignedCount}: ${assignedCount}` : copy.providerRoutingAssignedAll}</div>
                      <div>{copy.providerEnabled}: {card.enabled ? copy.enableProvider : copy.disableProvider}</div>
                      {isSystemRoute ? <div>{copy.providerRoutingManagedByEnv}</div> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      <Dialog open={Boolean(editingRoute)} onOpenChange={(open) => (!open ? setEditingRoute(null) : null)}>
        {editingRoute ? (
          <DialogContent className="max-w-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {copy.editModel}
              </DialogTitle>
              <DialogDescription>{editingRoute.title}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider-route-label">{copy.providerLabel}</Label>
                <Input
                  id="provider-route-label"
                  value={editingRoute.label}
                  disabled={editingRoute.source === "system"}
                  onChange={(event) =>
                    setEditingRoute((current) => (current ? { ...current, label: event.target.value } : current))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-route-model">{copy.selectedModel}</Label>
                <Input
                  id="provider-route-model"
                  value={editingRoute.modelId}
                  disabled={editingRoute.source === "system"}
                  placeholder={copy.selectedModelPlaceholder}
                  onChange={(event) =>
                    setEditingRoute((current) => (current ? { ...current, modelId: event.target.value } : current))
                  }
                />
              </div>

              {editingRoute.source === "enterprise" &&
              isEnterpriseModelProviderBaseUrlRequired(editingRoute.providerId as EnterpriseModelProviderId) ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-route-base-url">{copy.baseUrl}</Label>
                  <Input
                    id="provider-route-base-url"
                    value={editingRoute.baseUrl}
                    placeholder={copy.baseUrlPlaceholder}
                    onChange={(event) =>
                      setEditingRoute((current) => (current ? { ...current, baseUrl: event.target.value } : current))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{copy.baseUrlRequired}</p>
                </div>
              ) : null}

              {editingRoute.source === "system" && editingRoute.baseUrl ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-route-system-base-url">{copy.baseUrl}</Label>
                  <Input
                    id="provider-route-system-base-url"
                    value={editingRoute.baseUrl}
                    disabled
                  />
                </div>
              ) : null}

              {editingRoute.source === "enterprise" ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-route-api-key">{copy.apiKey}</Label>
                  <Input
                    id="provider-route-api-key"
                    type="password"
                    value={editingRoute.apiKey}
                    placeholder={editingRoute.apiKeyConfigured ? copy.apiKeyConfigured : copy.apiKeyPlaceholder}
                    onChange={(event) =>
                      setEditingRoute((current) => (current ? { ...current, apiKey: event.target.value } : current))
                    }
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-background/70 px-3 py-3 text-sm text-foreground">
                <span>{copy.providerEnabled}</span>
                <input
                  type="checkbox"
                  checked={editingRoute.enabled}
                  disabled={editingRoute.source === "system"}
                  onChange={(event) =>
                    setEditingRoute((current) => (current ? { ...current, enabled: event.target.checked } : current))
                  }
                />
              </label>

              {editingRoute.source === "system" ? (
                <p className="text-xs text-muted-foreground">{copy.providerRoutingSystemHint}</p>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>{copy.assignedMembers}</Label>
                  <span className="text-xs text-muted-foreground">
                    {editingRoute.assignedUserIds.length > 0
                      ? `${copy.providerRoutingAssignedCount}: ${editingRoute.assignedUserIds.length}`
                      : copy.providerRoutingAssignedAll}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{copy.memberAssignmentHint}</p>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-[8px] border border-border bg-background/70 p-3">
                  {enterpriseMembers.map((member) => {
                    const checked = editingRoute.assignedUserIds.includes(member.id)
                    return (
                      <label
                        key={member.id}
                        className="flex items-center justify-between gap-3 rounded-[8px] border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {member.name || member.email}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {member.email}
                            {member.enterpriseRole ? ` · ${member.enterpriseRole}` : ""}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setEditingRoute((current) => {
                              if (!current) return current
                              const nextIds = event.target.checked
                                ? [...current.assignedUserIds, member.id]
                                : current.assignedUserIds.filter((id) => id !== member.id)
                              return { ...current, assignedUserIds: [...new Set(nextIds)] }
                            })
                          }
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              {editingRoute.source === "enterprise" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setSettings((current) =>
                      removeProviderRoute(
                        current,
                        editingRoute.category,
                        editingRoute.providerId as EnterpriseModelProviderId,
                      ),
                    )
                    setEditingRoute(null)
                  }}
                >
                  {copy.deleteModel}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setEditingRoute(null)}>
                {copy.close}
              </Button>
              <Button type="button" onClick={applyProviderRouteEditor}>
                {copy.saveModelDraft}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </article>
  )
}
