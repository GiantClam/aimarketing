import type { BillingEntitlement } from "@/lib/billing/entitlements"
import type { FeatureKey } from "@/lib/enterprise/constants"
import type { AppLocale } from "@/lib/i18n/config"
import {
  getLocalizedPlatformCapabilities,
  type LocalizedCapabilityDescriptor,
} from "@/lib/platform/catalog"
import {
  getPlatformMediaCapabilityStateFromSnapshot,
  isPlatformMediaCapabilitySlug,
} from "@/lib/platform/media-runtime"
import type {
  PlatformEntitlementRuntime,
  PlatformProviderRuntime,
  PlatformRuntimeSnapshot,
  PlatformTaskRuntime,
} from "@/lib/platform/runtime"
import type { AuthUser } from "@/lib/auth/session"

export type PlatformCapabilityRuntimeStatus = "ready" | "deferred" | "runtime_disabled"
export type PlatformCapabilityAccessState =
  | "public"
  | "public_then_login"
  | "login_required"
  | "authorized"
  | "permission_required"
  | "admin_required"

export type PlatformCapabilityExecutionState = {
  capabilitySlug: string
  kind: LocalizedCapabilityDescriptor["kind"]
  title: string
  summary: string
  publicHref?: string
  workspaceHref?: string
  runtimeStatus: PlatformCapabilityRuntimeStatus
  accessState: PlatformCapabilityAccessState
  activeProviderIds: string[]
  fallbackProviderIds: string[]
  plannedProviderIds: string[]
  task: {
    id: string | null
    runtimeId: string | null
    mode: PlatformTaskRuntime["mode"] | null
    enabled: boolean
    statuses: PlatformTaskRuntime["statuses"]
  }
  entitlements: Array<{
    feature: FeatureKey
    accessModel: PlatformEntitlementRuntime["accessModel"]
    runtimeEnabled: boolean
  }>
  usesSharedCredits: boolean
  billing:
    | {
        planCode: string | null
        subscriptionStatus: string | null
        availableCredits: number | null
        canSpendCredits: boolean
      }
    | null
  notes: string[]
}

export type PlatformBindingTargetExecutionState = {
  bindingTarget: string
  title: string
  summary: string
  publicHref?: string
  workspaceHref?: string
  runtimeStatus: PlatformCapabilityRuntimeStatus
  accessState: PlatformCapabilityAccessState
  activeProviderIds: string[]
  fallbackProviderIds: string[]
  plannedProviderIds: string[]
  task: {
    id: string | null
    runtimeId: string | null
    mode: PlatformTaskRuntime["mode"] | null
    enabled: boolean
    statuses: PlatformTaskRuntime["statuses"]
  }
  entitlements: Array<{
    feature: FeatureKey
    accessModel: PlatformEntitlementRuntime["accessModel"]
    runtimeEnabled: boolean
  }>
  usesSharedCredits: boolean
  billing:
    | {
        planCode: string | null
        subscriptionStatus: string | null
        availableCredits: number | null
        canSpendCredits: boolean
      }
    | null
  notes: string[]
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function getCapabilityAccessDefault(slug: string) {
  if (slug === "ai-ppt") return "public_then_login" as const
  return "login_required" as const
}

function getCapabilityCreditHook(slug: string) {
  return slug === "ai-chat" || slug === "ai-ppt" || slug === "ai-image" || slug === "ai-video" || slug === "ai-music"
}

function getBindingTargetAccessDefault(bindingTarget: string) {
  if (bindingTarget === "campaign-launch") return "public_then_login" as const
  return "login_required" as const
}

function getBindingTargetCreditHook(bindingTarget: string) {
  return (
    bindingTarget === "content-repurpose" ||
    bindingTarget === "campaign-launch" ||
    bindingTarget === "visual-ad-pipeline" ||
    getCapabilityCreditHook(bindingTarget)
  )
}

function getCapabilityEntitlements(
  slug: string,
  snapshot: PlatformRuntimeSnapshot,
) {
  return snapshot.entitlements
    .filter((item) => item.capabilitySlugs.includes(slug))
    .map((item) => ({
      feature: item.feature,
      accessModel: item.accessModel,
      runtimeEnabled: item.runtimeEnabled,
    }))
}

function deriveRuntimeStatus(
  task: PlatformTaskRuntime | undefined,
  providers: PlatformProviderRuntime[],
): PlatformCapabilityRuntimeStatus {
  if (task) {
    if (task.mode === "deferred") return "deferred"
    if (!task.enabled) return "runtime_disabled"
    return "ready"
  }

  if (providers.length === 0) return "deferred"
  if (providers.every((provider) => !provider.configured && provider.role === "planned")) {
    return "deferred"
  }

  return "ready"
}

function deriveAccessState(
  slug: string,
  entitlements: Array<{
    feature: FeatureKey
    accessModel: PlatformEntitlementRuntime["accessModel"]
    runtimeEnabled: boolean
  }>,
  user: AuthUser | null | undefined,
): PlatformCapabilityAccessState {
  if (!user) {
    if (entitlements.length === 0) return getCapabilityAccessDefault(slug)
    return entitlements.some((item) => item.accessModel === "public_then_login")
      ? "public_then_login"
      : "login_required"
  }

  if (entitlements.some((item) => item.accessModel === "enterprise_admin") && user.enterpriseRole !== "admin") {
    return "admin_required"
  }

  const missingPermission = entitlements.some(
    (item) => item.accessModel === "enterprise_permission" && !user.permissions[item.feature],
  )
  if (missingPermission) return "permission_required"

  if (entitlements.length === 0 && slug === "ai-ppt") return "authorized"
  if (entitlements.some((item) => item.accessModel === "public_then_login")) return "authorized"

  return entitlements.length > 0 ? "authorized" : "public"
}

function deriveBindingTargetAccessState(
  bindingTarget: string,
  entitlements: Array<{
    feature: FeatureKey
    accessModel: PlatformEntitlementRuntime["accessModel"]
    runtimeEnabled: boolean
  }>,
  user: AuthUser | null | undefined,
): PlatformCapabilityAccessState {
  if (!user) {
    if (bindingTarget === "campaign-launch") return "public_then_login"
    if (entitlements.length === 0) return getBindingTargetAccessDefault(bindingTarget)
    return entitlements.some((item) => item.accessModel === "public_then_login")
      ? "public_then_login"
      : "login_required"
  }

  if (entitlements.some((item) => item.accessModel === "enterprise_admin") && user.enterpriseRole !== "admin") {
    return "admin_required"
  }

  const missingPermission = entitlements.some(
    (item) => item.accessModel === "enterprise_permission" && !user.permissions[item.feature],
  )
  if (missingPermission) return "permission_required"

  if (entitlements.length === 0 && bindingTarget === "campaign-launch") return "authorized"
  if (entitlements.some((item) => item.accessModel === "public_then_login")) return "authorized"

  return entitlements.length > 0 ? "authorized" : "public"
}

function buildBillingState(
  usesSharedCredits: boolean,
  entitlement: BillingEntitlement | null,
) {
  if (!usesSharedCredits || !entitlement) return null

  return {
    planCode: entitlement.subscription?.planCode || entitlement.plan?.code || null,
    subscriptionStatus: entitlement.subscription?.status || null,
    availableCredits: entitlement.creditAccount?.availableCredits ?? null,
    canSpendCredits: entitlement.canSpendCredits,
  }
}

async function getSafeBillingEntitlement(user: AuthUser | null | undefined) {
  if (!user) return null

  try {
    const module = await import("@/lib/billing/entitlements")
    return await module.getBillingEntitlementForUser(user)
  } catch (error) {
    console.warn("platform.capability.execution.billing.unavailable", {
      userId: user.id,
      enterpriseId: user.enterpriseId,
      message: error instanceof Error ? error.message : "unknown_error",
    })
    return null
  }
}

function buildExecutionNotes(
  capability: LocalizedCapabilityDescriptor,
  task: PlatformTaskRuntime | undefined,
  providers: PlatformProviderRuntime[],
  entitlements: Array<{
    feature: FeatureKey
    accessModel: PlatformEntitlementRuntime["accessModel"]
    runtimeEnabled: boolean
  }>,
  billing: PlatformCapabilityExecutionState["billing"],
  locale: AppLocale,
) {
  const providerNotes = providers.flatMap((provider) => provider.notes.slice(0, 1))
  const taskNotes = task?.notes.slice(0, 2) || []
  const entitlementNotes = entitlements.map((item) =>
    locale === "zh"
      ? `${item.feature} · ${item.accessModel}`
      : `${item.feature} · ${item.accessModel}`,
  )
  const billingNotes =
    billing == null
      ? []
      : [
          locale === "zh"
            ? `Credits 可用额度: ${billing.availableCredits ?? "未登录"}`
            : `Available credits: ${billing.availableCredits ?? "sign in to inspect"}`,
          locale === "zh"
            ? `订阅状态: ${billing.subscriptionStatus || "unknown"}`
            : `Subscription status: ${billing.subscriptionStatus || "unknown"}`,
        ]

  return unique([
    ...taskNotes,
    ...providerNotes,
    ...entitlementNotes,
    ...billingNotes,
    ...capability.proofPoints,
  ]).slice(0, 6)
}

function getBindingTargetDescriptor(bindingTarget: string, locale: AppLocale) {
  const zh = locale === "zh"
  if (bindingTarget === "content-repurpose") {
    return {
      title: zh ? "Content Repurpose" : "Content Repurpose",
      summary: zh
        ? "把现有研究、文章、脚本和品牌内容复用成 SEO、社媒和多格式输出。"
        : "Repurpose research, articles, scripts, and brand content into SEO, social, and multi-format outputs.",
      publicHref: "/workflows",
      workspaceHref: "/dashboard/writer",
      proofPoints: [
        zh ? "复用现有 writer 异步队列" : "Reuses the existing writer async queue.",
        zh ? "适合 SEO、社媒和内容工作流" : "Fits SEO, social, and content workflows.",
      ],
    }
  }

  if (bindingTarget === "campaign-launch") {
    return {
      title: zh ? "Campaign Launch" : "Campaign Launch",
      summary: zh
        ? "把 brief、PPT、文案和视觉入口串成统一营销启动流程。"
        : "Connects brief, PPT, copy, and visual entry points into a unified campaign launch flow.",
      publicHref: "/workflows",
      workspaceHref: "/dashboard/workflows",
      proofPoints: [
        zh ? "通过 AI PPT 预览链路承接公开入口" : "Uses the AI PPT preview chain as its public execution path.",
        zh ? "为企业级多步骤启动流程保留扩展位" : "Leaves room for enterprise multi-step launch orchestration.",
      ],
    }
  }

  if (bindingTarget === "visual-ad-pipeline") {
    return {
      title: zh ? "Visual Ad Pipeline" : "Visual Ad Pipeline",
      summary: zh
        ? "预留统一图片与视频任务层的广告视觉流水线入口。"
        : "Reserves the advertising visual pipeline for the future shared image and video task layer.",
      publicHref: "/workflows",
      workspaceHref: "/dashboard/workflows",
      proofPoints: [
        zh ? "当前仍是后续实现模块" : "Still deferred in the current phase.",
        zh ? "目标连接统一 media runtime" : "Targets the unified media runtime.",
      ],
    }
  }

  if (bindingTarget === "knowledge-base") {
    return {
      title: zh ? "Knowledge Hub" : "Knowledge Hub",
      summary: zh
        ? "统一知识、顾问上下文和治理入口。"
        : "Keeps knowledge, advisor context, and governance in one shared platform hub.",
      publicHref: "/capabilities",
      workspaceHref: "/dashboard/knowledge-base",
      proofPoints: [
        zh ? "连接知识、设置和计费治理入口" : "Connects knowledge, settings, and billing governance.",
        zh ? "作为企业资料与顾问上下文入口" : "Acts as the enterprise document and advisor context hub.",
      ],
    }
  }

  return {
    title: bindingTarget,
    summary: bindingTarget,
    publicHref: undefined,
    workspaceHref: undefined,
    proofPoints: [] as string[],
  }
}

export function resolvePlatformCapabilityExecutionFromSnapshot(
  capability: LocalizedCapabilityDescriptor,
  snapshot: PlatformRuntimeSnapshot,
  locale: AppLocale,
  user?: AuthUser | null,
  billingEntitlement?: BillingEntitlement | null,
): PlatformCapabilityExecutionState {
  const mediaState = isPlatformMediaCapabilitySlug(capability.slug)
    ? getPlatformMediaCapabilityStateFromSnapshot(snapshot, capability.slug)
    : null
  const providers = mediaState
    ? mediaState.providers
    : snapshot.providers.filter((provider) => provider.capabilitySlugs.includes(capability.slug))
  const task = mediaState
    ? mediaState.task
    : snapshot.tasks.find((item) => item.capabilitySlug === capability.slug)
  const entitlements = getCapabilityEntitlements(capability.slug, snapshot)
  const usesSharedCredits = getCapabilityCreditHook(capability.slug)
  const billing = buildBillingState(usesSharedCredits, billingEntitlement || null)

  return {
    capabilitySlug: capability.slug,
    kind: capability.kind,
    title: capability.title,
    summary: capability.summary,
    publicHref: capability.publicHref,
    workspaceHref: capability.workspaceHref,
    runtimeStatus: mediaState?.runtimeStatus || deriveRuntimeStatus(task, providers),
    accessState: deriveAccessState(capability.slug, entitlements, user || null),
    activeProviderIds: providers.filter((provider) => provider.active).map((provider) => provider.id),
    fallbackProviderIds: providers.filter((provider) => provider.role === "fallback").map((provider) => provider.id),
    plannedProviderIds: providers.filter((provider) => provider.role === "planned").map((provider) => provider.id),
    task: {
      id: task?.id || null,
      runtimeId: task?.runtimeId || null,
      mode: task?.mode || null,
      enabled: Boolean(task?.enabled),
      statuses: task?.statuses || [],
    },
    entitlements,
    usesSharedCredits,
    billing,
    notes: buildExecutionNotes(capability, task, providers, entitlements, billing, locale),
  }
}

export async function getPlatformCapabilityExecutionState(
  slug: string,
  locale: AppLocale,
  user?: AuthUser | null,
  options?: {
    includeBilling?: boolean
  },
) {
  const capability = getLocalizedPlatformCapabilities(locale, "all").find((item) => item.slug === slug)
  if (!capability) return null

  const billingEntitlement =
    options?.includeBilling === false
      ? null
      : await getSafeBillingEntitlement(user)
  const runtimeModule = await import("@/lib/platform/runtime")
  return resolvePlatformCapabilityExecutionFromSnapshot(
    capability,
    runtimeModule.getPlatformRuntimeSnapshot(),
    locale,
    user || null,
    billingEntitlement,
  )
}

export async function listPlatformCapabilityExecutionStates(
  locale: AppLocale,
  user?: AuthUser | null,
) {
  const capabilities = getLocalizedPlatformCapabilities(locale, "all")
  const runtimeModule = await import("@/lib/platform/runtime")
  const snapshot = runtimeModule.getPlatformRuntimeSnapshot()
  const billingEntitlement = await getSafeBillingEntitlement(user)

  return capabilities.map((capability) =>
    resolvePlatformCapabilityExecutionFromSnapshot(capability, snapshot, locale, user || null, billingEntitlement),
  )
}

export function resolvePlatformBindingTargetExecutionFromSnapshot(
  bindingTarget: string,
  snapshot: PlatformRuntimeSnapshot,
  locale: AppLocale,
  user?: AuthUser | null,
  billingEntitlement?: BillingEntitlement | null,
): PlatformBindingTargetExecutionState {
  if (
    bindingTarget === "ai-chat" ||
    bindingTarget === "ai-ppt" ||
    bindingTarget === "ai-image" ||
    bindingTarget === "ai-video" ||
    bindingTarget === "agent-platform"
  ) {
    const capability = getLocalizedPlatformCapabilities(locale, "all").find((item) => item.slug === bindingTarget)
    if (capability) {
      const capabilityState = resolvePlatformCapabilityExecutionFromSnapshot(
        capability,
        snapshot,
        locale,
        user || null,
        billingEntitlement,
      )

      return {
        bindingTarget,
        title: capabilityState.title,
        summary: capabilityState.summary,
        publicHref: capabilityState.publicHref,
        workspaceHref: capabilityState.workspaceHref,
        runtimeStatus: capabilityState.runtimeStatus,
        accessState: capabilityState.accessState,
        activeProviderIds: capabilityState.activeProviderIds,
        fallbackProviderIds: capabilityState.fallbackProviderIds,
        plannedProviderIds: capabilityState.plannedProviderIds,
        task: capabilityState.task,
        entitlements: capabilityState.entitlements,
        usesSharedCredits: capabilityState.usesSharedCredits,
        billing: capabilityState.billing,
        notes: capabilityState.notes,
      }
    }
  }

  const descriptor = getBindingTargetDescriptor(bindingTarget, locale)
  const providers = snapshot.providers.filter((provider) => provider.capabilitySlugs.includes(bindingTarget))
  const task = snapshot.tasks.find((item) => item.capabilitySlug === bindingTarget)
  const entitlements = getCapabilityEntitlements(bindingTarget, snapshot)
  const usesSharedCredits = getBindingTargetCreditHook(bindingTarget)
  const billing = buildBillingState(usesSharedCredits, billingEntitlement || null)

  return {
    bindingTarget,
    title: descriptor.title,
    summary: descriptor.summary,
    publicHref: descriptor.publicHref,
    workspaceHref: descriptor.workspaceHref,
    runtimeStatus: deriveRuntimeStatus(task, providers),
    accessState: deriveBindingTargetAccessState(bindingTarget, entitlements, user || null),
    activeProviderIds: providers.filter((provider) => provider.active).map((provider) => provider.id),
    fallbackProviderIds: providers.filter((provider) => provider.role === "fallback").map((provider) => provider.id),
    plannedProviderIds: providers.filter((provider) => provider.role === "planned").map((provider) => provider.id),
    task: {
      id: task?.id || null,
      runtimeId: task?.runtimeId || null,
      mode: task?.mode || null,
      enabled: Boolean(task?.enabled),
      statuses: task?.statuses || [],
    },
    entitlements,
    usesSharedCredits,
    billing,
    notes: unique([
      ...(task?.notes.slice(0, 2) || []),
      ...providers.flatMap((provider) => provider.notes.slice(0, 1)),
      ...entitlements.map((item) => `${item.feature} · ${item.accessModel}`),
      ...descriptor.proofPoints,
    ]).slice(0, 6),
  }
}

export async function getPlatformBindingTargetExecutionState(
  bindingTarget: string,
  locale: AppLocale,
  user?: AuthUser | null,
) {
  const billingEntitlement = await getSafeBillingEntitlement(user)
  const runtimeModule = await import("@/lib/platform/runtime")
  return resolvePlatformBindingTargetExecutionFromSnapshot(
    bindingTarget,
    runtimeModule.getPlatformRuntimeSnapshot(),
    locale,
    user || null,
    billingEntitlement,
  )
}
