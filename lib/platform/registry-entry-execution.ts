import type { AuthUser } from "@/lib/auth/session"
import type { AppLocale } from "@/lib/i18n/config"
import type { PlatformRegistryControlEntry, PlatformRegistryItemType } from "@/lib/platform/control-plane"
import { listPlatformRegistryAdminEntries, listVisiblePlatformRegistryEntries } from "@/lib/platform/directory-resolver"
import {
  getPlatformBindingTargetExecutionState,
  listPlatformCapabilityExecutionStates,
  type PlatformBindingTargetExecutionState,
  type PlatformCapabilityExecutionState,
} from "@/lib/platform/execution"
import { buildPlatformLaunchPath } from "@/lib/platform/launch-path"

type RegistryEntryExecutionSummary = {
  label: string
  notes: string[]
}

type RegistryResolvedExecutionState = Pick<
  PlatformCapabilityExecutionState,
  "runtimeStatus" | "accessState" | "notes" | "usesSharedCredits" | "billing"
> |
  Pick<PlatformBindingTargetExecutionState, "runtimeStatus" | "accessState" | "notes" | "usesSharedCredits" | "billing">

export type PlatformRegistryEntryExecutionState = {
  itemType: PlatformRegistryItemType
  slug: string
  status: PlatformRegistryControlEntry["status"]
  title: string
  summary: string
  enabled: boolean
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: PlatformRegistryControlEntry["config"]["bindingMode"]
  mappedCapabilitySlug: string | null
  runtimeStatus: PlatformCapabilityExecutionState["runtimeStatus"] | null
  accessState: PlatformCapabilityExecutionState["accessState"] | null
  usesSharedCredits: boolean
  billing: PlatformCapabilityExecutionState["billing"]
  label: string
  notes: string[]
  publicHref?: string
  workspaceHref?: string
  publicLaunchPath: string
  workspaceLaunchPath: string
}

export function mapBindingTargetToCapabilitySlug(bindingTarget: string) {
  if (
    bindingTarget === "ai-chat" ||
    bindingTarget === "ai-ppt" ||
    bindingTarget === "ai-image" ||
    bindingTarget === "ai-video" ||
    bindingTarget === "agent-platform"
  ) {
    return bindingTarget
  }

  if (bindingTarget === "content-repurpose") return "content-repurpose"
  if (bindingTarget === "campaign-launch") return "campaign-launch"
  if (bindingTarget === "visual-ad-pipeline") return "visual-ad-pipeline"
  if (bindingTarget === "knowledge-base") return "knowledge-base"
  return null
}

function getRuntimeLabel(locale: AppLocale, runtimeStatus: PlatformCapabilityExecutionState["runtimeStatus"]) {
  if (locale === "zh") {
    return {
      ready: "运行中",
      deferred: "后续实现",
      runtime_disabled: "运行时关闭",
    }[runtimeStatus]
  }

  return {
    ready: "Runtime ready",
    deferred: "Deferred",
    runtime_disabled: "Runtime disabled",
  }[runtimeStatus]
}

function getAccessLabel(locale: AppLocale, accessState: PlatformCapabilityExecutionState["accessState"]) {
  if (locale === "zh") {
    return {
      public: "公开可见",
      public_then_login: "先公开后登录",
      login_required: "需登录",
      authorized: "已授权",
      permission_required: "需企业权限",
      admin_required: "需管理员",
    }[accessState]
  }

  return {
    public: "Public",
    public_then_login: "Public then login",
    login_required: "Login required",
    authorized: "Authorized",
    permission_required: "Permission required",
    admin_required: "Admin required",
  }[accessState]
}

function getDeferredBindingLabel(locale: AppLocale, bindingTarget: string) {
  const suffix = bindingTarget.toUpperCase()
  return locale === "zh" ? `后续实现 · ${suffix}` : `Deferred · ${suffix}`
}

export function resolveRegistryEntryExecution(
  entry: PlatformRegistryControlEntry,
  locale: AppLocale,
  executionMap: Map<string, RegistryResolvedExecutionState>,
): PlatformRegistryEntryExecutionState {
  const bindingTarget = entry.config.bindingTarget?.trim() || entry.defaultConfig.bindingTarget?.trim() || ""
  const mappedCapabilitySlug =
    entry.itemType === "capability" ? entry.slug : mapBindingTargetToCapabilitySlug(bindingTarget)
  const publicLaunchPath = buildPlatformLaunchPath({
    itemType: entry.itemType,
    slug: entry.slug,
    surface: "public",
    locale,
  })
  const workspaceLaunchPath = buildPlatformLaunchPath({
    itemType: entry.itemType,
    slug: entry.slug,
    surface: "workspace",
    locale,
  })
  const resolvedState = mappedCapabilitySlug ? executionMap.get(mappedCapabilitySlug) : null

  if (entry.config.bindingMode === "deferred" && (!resolvedState || resolvedState.runtimeStatus === "deferred")) {
    return {
      itemType: entry.itemType,
      slug: entry.slug,
      status: entry.status,
      title: entry.title,
      summary: entry.summary,
      enabled: entry.config.enabled,
      publicVisible: entry.config.publicVisible,
      workspaceVisible: entry.config.workspaceVisible,
      bindingTarget,
      bindingMode: entry.config.bindingMode,
      mappedCapabilitySlug,
      runtimeStatus: "deferred",
      accessState: null,
      usesSharedCredits: false,
      billing: null,
      label: getDeferredBindingLabel(locale, bindingTarget || entry.slug),
      notes: [...entry.proofPoints],
      publicHref: entry.publicHref,
      workspaceHref: entry.workspaceHref,
      publicLaunchPath,
      workspaceLaunchPath,
    }
  }

  if (!resolvedState) {
    return {
      itemType: entry.itemType,
      slug: entry.slug,
      status: entry.status,
      title: entry.title,
      summary: entry.summary,
      enabled: entry.config.enabled,
      publicVisible: entry.config.publicVisible,
      workspaceVisible: entry.config.workspaceVisible,
      bindingTarget,
      bindingMode: entry.config.bindingMode,
      mappedCapabilitySlug,
      runtimeStatus: null,
      accessState: null,
      usesSharedCredits: false,
      billing: null,
      label: entry.surfaceLabel,
      notes: [...entry.proofPoints],
      publicHref: entry.publicHref,
      workspaceHref: entry.workspaceHref,
      publicLaunchPath,
      workspaceLaunchPath,
    }
  }

  return {
    itemType: entry.itemType,
    slug: entry.slug,
    status: entry.status,
    title: entry.title,
    summary: entry.summary,
    enabled: entry.config.enabled,
    publicVisible: entry.config.publicVisible,
    workspaceVisible: entry.config.workspaceVisible,
    bindingTarget,
    bindingMode: entry.config.bindingMode,
    mappedCapabilitySlug,
    runtimeStatus: resolvedState.runtimeStatus,
    accessState: resolvedState.accessState,
    usesSharedCredits: resolvedState.usesSharedCredits,
    billing: resolvedState.billing,
    label: `${getRuntimeLabel(locale, resolvedState.runtimeStatus)} · ${getAccessLabel(locale, resolvedState.accessState)}`,
    notes: [...resolvedState.notes, ...entry.proofPoints].slice(0, 6),
    publicHref: entry.publicHref,
    workspaceHref: entry.workspaceHref,
    publicLaunchPath,
    workspaceLaunchPath,
  }
}

export function summarizeRegistryEntryExecution(
  entry: PlatformRegistryControlEntry,
  locale: AppLocale,
  executionMap: Map<string, RegistryResolvedExecutionState>,
): RegistryEntryExecutionSummary {
  const resolved = resolveRegistryEntryExecution(entry, locale, executionMap)
  return {
    label: resolved.label,
    notes: resolved.notes,
  }
}

export async function buildRegistryEntryExecutionMap(
  locale: AppLocale,
  user?: AuthUser | null,
) {
  const capabilityStates = await listPlatformCapabilityExecutionStates(locale, user)
  const executionMap = new Map<string, RegistryResolvedExecutionState>(
    capabilityStates.map((item) => [item.capabilitySlug, item] as const),
  )

  for (const bindingTarget of ["content-repurpose", "campaign-launch", "visual-ad-pipeline", "knowledge-base"] as const) {
    executionMap.set(
      bindingTarget,
      await getPlatformBindingTargetExecutionState(bindingTarget, locale, user),
    )
  }

  return executionMap
}

export async function getPlatformRegistryEntryExecutionState(input: {
  locale: AppLocale
  itemType: PlatformRegistryItemType
  slug: string
  surface: "public" | "workspace"
  enterpriseId?: number | null
  currentUser?: AuthUser | null
}) {
  const { locale, itemType, slug, surface, enterpriseId, currentUser } = input
  const entry = (
    await listPlatformRegistryAdminEntries({
      locale,
      itemType,
      enterpriseId,
    })
  ).find((item) => item.slug === slug)

  if (!entry) return null
  if (surface === "public" && !entry.config.publicVisible) return null
  if (surface === "workspace" && !entry.config.workspaceVisible) return null
  const executionMap = await buildRegistryEntryExecutionMap(locale, currentUser)
  return resolveRegistryEntryExecution(entry, locale, executionMap)
}

export async function listPlatformRegistryEntryExecutionStates(input: {
  locale: AppLocale
  itemType: PlatformRegistryItemType
  surface: "public" | "workspace"
  enterpriseId?: number | null
  currentUser?: AuthUser | null
}) {
  const { locale, itemType, surface, enterpriseId, currentUser } = input
  const executionMap = await buildRegistryEntryExecutionMap(locale, currentUser)
  const entries = await listVisiblePlatformRegistryEntries({
    locale,
    itemType,
    surface,
    enterpriseId,
  })

  return entries.map((entry) => resolveRegistryEntryExecution(entry, locale, executionMap))
}

export async function listPlatformRegistryAdminExecutionStates(input: {
  locale: AppLocale
  itemType: PlatformRegistryItemType
  enterpriseId?: number | null
  currentUser?: AuthUser | null
}) {
  const { locale, itemType, enterpriseId, currentUser } = input
  const executionMap = await buildRegistryEntryExecutionMap(locale, currentUser)
  const entries = await listPlatformRegistryAdminEntries({
    locale,
    itemType,
    enterpriseId,
  })

  return entries.map((entry) => resolveRegistryEntryExecution(entry, locale, executionMap))
}
