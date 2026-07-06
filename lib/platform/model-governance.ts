import type { AiEntryProviderId } from "@/lib/ai-entry/provider-routing"
import type { OpenAiCompatibleImageProviderId } from "@/lib/image-assistant/openai-compatible-image"
import { getOpenAiCompatibleImageProviderConfig } from "@/lib/image-assistant/openai-compatible-image"
import type { WorkflowImageProviderOption } from "@/lib/image-assistant/model-options"
import {
  buildEnterpriseTextRuntimeProvidersForCatalog,
  listEnterpriseImageRuntimeOptionsForUser,
  type EnterpriseImageRuntimeConfig,
} from "@/lib/platform/enterprise-runtime-config"
import {
  buildGovernedAiEntryModelCatalog,
  buildGovernedWorkflowImageProviderOptions,
  canUserAccessAssignedRoute,
  type ModelGovernanceUser,
  type RuntimeProviderLike,
} from "@/lib/platform/model-governance-core"
import {
  getCustomerGovernanceSettings,
  type CustomerGovernanceSettings,
} from "@/lib/platform/customer-governance"
import type {
  EnterpriseModelCategory,
  EnterpriseModelRouteAssignment,
} from "@/lib/platform/model-config"
import { getPlatformRuntimeSnapshot } from "@/lib/platform/runtime"

export { buildGovernedAiEntryModelCatalog, buildGovernedWorkflowImageProviderOptions, canUserAccessAssignedRoute }
export type { ModelGovernanceUser }

type GovernedMediaRouteId = "runninghub-image" | "runninghub-video" | "minimax-video" | "minimax-audio"
type ImageAssistantOptionSource = "workspace" | "enterprise"

export type GovernedImageAssistantModelOption = {
  id: string
  label: string
  providerId: string
  providerLabel: string
  modelId: string
  source: ImageAssistantOptionSource
}

export type GovernedImageAssistantSelection = {
  source: ImageAssistantOptionSource
  modelOptionId: string
  model: string
  providerId: string
  providerLabel: string
  providerLock: OpenAiCompatibleImageProviderId | null
  modelOptions: GovernedImageAssistantModelOption[]
  providerOptions: WorkflowImageProviderOption[]
  enterpriseRuntime: EnterpriseImageRuntimeConfig | null
}

const IMAGE_ASSISTANT_PROVIDER_ORDER: OpenAiCompatibleImageProviderId[] = [
  "pptoken",
  "aiberm",
  "crazyroute",
]

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getLocalDevelopmentTextDefaultModelHint() {
  if (process.env.NODE_ENV !== "development") return ""
  return normalizeText(process.env.AI_ENTRY_NORMAL_DEFAULT_MODEL) || normalizeText(process.env.AI_ENTRY_MODEL)
}

function mergeRuntimeProvidersForLocalTextDefault(params: {
  enterpriseRuntimeProviders: RuntimeProviderLike[]
  platformRuntimeProviders: RuntimeProviderLike[]
}) {
  const { enterpriseRuntimeProviders, platformRuntimeProviders } = params
  if (enterpriseRuntimeProviders.length === 0) return platformRuntimeProviders

  const preferredModelHint = getLocalDevelopmentTextDefaultModelHint()
  if (!preferredModelHint) return enterpriseRuntimeProviders

  const preferredPlatformProviders = platformRuntimeProviders.filter(
    (provider) =>
      provider.scope === "text" &&
      provider.configured &&
      normalizeText(provider.model) === preferredModelHint,
  )
  if (preferredPlatformProviders.length === 0) return enterpriseRuntimeProviders

  const merged = new Map<string, RuntimeProviderLike>()
  for (const provider of [
    ...preferredPlatformProviders,
    ...enterpriseRuntimeProviders,
    ...platformRuntimeProviders.filter((provider) => provider.scope === "text" && provider.configured),
  ]) {
    if (!merged.has(provider.id)) {
      merged.set(provider.id, provider)
    }
  }
  return [...merged.values()]
}

function hasEnterpriseContext(user: ModelGovernanceUser | null | undefined) {
  return Boolean(
    user &&
      typeof user.enterpriseId === "number" &&
      user.enterpriseId > 0,
  )
}

function hasActiveEnterpriseContext(user: ModelGovernanceUser | null | undefined) {
  return hasEnterpriseContext(user) && user?.enterpriseStatus === "active"
}

function getCategoryAssignments(
  settings: CustomerGovernanceSettings | null,
  category: EnterpriseModelCategory,
) {
  return settings?.modelConfig?.[category]?.routeAssignments || []
}

function findRouteAssignment(
  assignments: EnterpriseModelRouteAssignment[],
  routeId: string,
) {
  return assignments.find((item) => normalizeText(item.routeId) === routeId) || null
}

function getImageAssistantProviderLabel(providerId: OpenAiCompatibleImageProviderId) {
  if (providerId === "pptoken") return "PPTOKEN"
  if (providerId === "aiberm") return "Aiberm"
  return "CrazyRouter"
}

function getImageAssistantProviderModel(providerId: OpenAiCompatibleImageProviderId) {
  if (providerId === "pptoken" || providerId === "crazyroute") {
    return getOpenAiCompatibleImageProviderConfig(providerId)?.model || "gpt-image-2"
  }
  return "gpt-image-2"
}

function listConfiguredImageAssistantProviders() {
  return IMAGE_ASSISTANT_PROVIDER_ORDER.filter((providerId) => {
    if (providerId === "aiberm") {
      return Boolean(
        process.env.IMAGE_ASSISTANT_AIBERM_API_KEY ||
          process.env.AIBERM_API_KEY ||
          process.env.WRITER_AIBERM_API_KEY,
      )
    }
    return Boolean(getOpenAiCompatibleImageProviderConfig(providerId))
  })
}

function buildWorkspaceImageAssistantModelOptionId(input: {
  providerId: OpenAiCompatibleImageProviderId
  modelId: string
}) {
  return `workspace:${input.providerId}:${encodeURIComponent(input.modelId)}`
}

function buildImageAssistantModelOptionLabel(providerLabel: string, modelId: string) {
  return `${providerLabel} / ${modelId}`
}

function resolveRunningHubRouteModePreference(params: {
  taskType?: string | null
  hasReferenceInput?: boolean
  hasMask?: boolean
  hasSnapshot?: boolean
}) {
  if (params.taskType === "edit" || params.taskType === "mask_edit") {
    return "img2img" as const
  }
  if (params.hasReferenceInput || params.hasMask || params.hasSnapshot) {
    return "img2img" as const
  }
  return "txt2img" as const
}

export async function getGovernedAiEntryModelCatalogForUser(params: {
  user: ModelGovernanceUser | null | undefined
  requestedProviderId?: AiEntryProviderId | null
}) {
  const settings =
    hasActiveEnterpriseContext(params.user)
      ? await getCustomerGovernanceSettings(params.user!.enterpriseId!, {
          includeSecrets: false,
        }).catch(() => null)
      : null
  const enterpriseRuntimeProviders = await buildEnterpriseTextRuntimeProvidersForCatalog(
    params.user,
    settings,
  )
  const platformRuntimeProviders = getPlatformRuntimeSnapshot().providers
  const runtimeProviders =
    enterpriseRuntimeProviders.length > 0
      ? mergeRuntimeProvidersForLocalTextDefault({
          enterpriseRuntimeProviders,
          platformRuntimeProviders,
        })
      : platformRuntimeProviders

  return buildGovernedAiEntryModelCatalog({
    user: params.user,
    runtimeProviders,
    assignments: getCategoryAssignments(settings, "text_generation"),
    requestedProviderId: params.requestedProviderId,
  })
}

export async function getGovernedWorkflowImageProviderOptionsForUser(
  user: ModelGovernanceUser | null | undefined,
) {
  const settings =
    hasActiveEnterpriseContext(user)
      ? await getCustomerGovernanceSettings(user!.enterpriseId!, {
          includeSecrets: false,
        }).catch(() => null)
      : null

  const providers: WorkflowImageProviderOption[] = listConfiguredImageAssistantProviders().map((providerId) => ({
    providerId,
    label: getImageAssistantProviderLabel(providerId),
    models: [
      {
        modelId: getImageAssistantProviderModel(providerId),
        label: getImageAssistantProviderModel(providerId),
      },
    ],
  }))

  return buildGovernedWorkflowImageProviderOptions({
    user,
    providers,
    assignments: getCategoryAssignments(settings, "image_generation"),
  })
}

export async function resolveGovernedImageAssistantSelectionForUser(params: {
  user: ModelGovernanceUser | null | undefined
  modelOptionId?: string | null
  providerLock?: OpenAiCompatibleImageProviderId | null
  model?: string | null
  taskType?: string | null
  hasReferenceInput?: boolean
  hasMask?: boolean
  hasSnapshot?: boolean
}) {
  const requestedModelOptionId = normalizeText(params.modelOptionId)
  const enterpriseOptions = await listEnterpriseImageRuntimeOptionsForUser(params.user)
  if (enterpriseOptions.length > 0) {
    const modelOptions = enterpriseOptions.map((item) => ({
      id: item.selectionId,
      label:
        item.runtime.kind === "runninghub"
          ? `${item.runtime.label} / ${item.runtime.model}`
          : buildImageAssistantModelOptionLabel(item.runtime.label, item.runtime.model),
      providerId: item.runtime.providerId,
      providerLabel: item.runtime.kind === "runninghub" ? item.runtime.providerLabel : item.runtime.label,
      modelId: item.runtime.model,
      source: "enterprise" as const,
    }))
    const preferredRunningHubMode = resolveRunningHubRouteModePreference({
      taskType: params.taskType,
      hasReferenceInput: params.hasReferenceInput,
      hasMask: params.hasMask,
      hasSnapshot: params.hasSnapshot,
    })
    const selectedOption =
      (requestedModelOptionId
        ? enterpriseOptions.find((item) => item.selectionId === requestedModelOptionId) || null
        : null) ||
      (enterpriseOptions.some((item) => item.runtime.kind === "runninghub")
        ? enterpriseOptions.find(
            (item) => item.runtime.kind === "runninghub" && item.runtime.routeMode === preferredRunningHubMode,
          ) || null
        : null) ||
      (normalizeText(params.model)
        ? enterpriseOptions.find((item) => item.runtime.model === normalizeText(params.model)) || null
        : null) ||
      enterpriseOptions[0] ||
      null

    if (!selectedOption) {
      throw new Error("image_assistant_model_unavailable_for_user")
    }

    return {
      source: "enterprise" as const,
      modelOptionId: selectedOption.selectionId,
      model: selectedOption.runtime.model,
      providerId: selectedOption.runtime.providerId,
      providerLabel:
        selectedOption.runtime.kind === "runninghub"
          ? selectedOption.runtime.providerLabel
          : selectedOption.runtime.label,
      providerLock: null,
      modelOptions,
      providerOptions: [],
      enterpriseRuntime: selectedOption.runtime,
    } satisfies GovernedImageAssistantSelection
  }

  const providerOptions = await getGovernedWorkflowImageProviderOptionsForUser(params.user)
  const modelOptions = providerOptions.flatMap((provider) =>
    provider.models.map((model) => ({
      id: buildWorkspaceImageAssistantModelOptionId({
        providerId: provider.providerId as OpenAiCompatibleImageProviderId,
        modelId: model.modelId,
      }),
      label: buildImageAssistantModelOptionLabel(provider.label, model.modelId),
      providerId: provider.providerId,
      providerLabel: provider.label,
      modelId: model.modelId,
      source: "workspace" as const,
    })),
  )
  const selectedModelOption =
    (requestedModelOptionId
      ? modelOptions.find((item) => item.id === requestedModelOptionId) || null
      : null)
  const selectedProvider =
    (selectedModelOption
      ? providerOptions.find((provider) => provider.providerId === selectedModelOption.providerId) || null
      : null) ||
    (params.providerLock
      ? providerOptions.find((provider) => provider.providerId === params.providerLock) || null
      : null) ||
    providerOptions[0] ||
    null

  if (!selectedProvider) {
    throw new Error("image_assistant_model_unavailable_for_user")
  }

  const requestedModel = normalizeText(params.model)
  const resolvedModel =
    selectedModelOption?.modelId ||
    selectedProvider.models.find((model) => model.modelId === requestedModel)?.modelId ||
    selectedProvider.models[0]?.modelId ||
    "gpt-image-2"
  const resolvedModelOptionId =
    selectedModelOption?.id ||
    buildWorkspaceImageAssistantModelOptionId({
      providerId: selectedProvider.providerId as OpenAiCompatibleImageProviderId,
      modelId: resolvedModel,
    })

  return {
    source: "workspace" as const,
    modelOptionId: resolvedModelOptionId,
    providerLock: selectedProvider.providerId as OpenAiCompatibleImageProviderId,
    providerId: selectedProvider.providerId,
    providerLabel: selectedProvider.label,
    model: resolvedModel,
    modelOptions,
    providerOptions,
    enterpriseRuntime: null,
  }
}

export async function canUserAccessGovernedMediaRoute(params: {
  user: ModelGovernanceUser | null | undefined
  routeId: GovernedMediaRouteId
  category: Extract<EnterpriseModelCategory, "image_generation" | "video_generation" | "audio_generation">
}) {
  if (hasEnterpriseContext(params.user) && !hasActiveEnterpriseContext(params.user)) {
    return false
  }

  if (!hasActiveEnterpriseContext(params.user)) {
    return true
  }

  const settings = await getCustomerGovernanceSettings(params.user!.enterpriseId!, {
    includeSecrets: false,
  }).catch(() => null)
  const assignments = getCategoryAssignments(settings, params.category)
  const assignment = findRouteAssignment(assignments, params.routeId)
  return canUserAccessAssignedRoute({
    user: params.user,
    assignedUserIds: assignment?.assignedUserIds,
  })
}
