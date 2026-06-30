type BindingMode = "existing_runtime" | "deferred" | "external_runtime"

export type CustomAgentProjectionMetadata = {
  menuExposure: boolean
  visibilityPolicy: {
    publicVisible: boolean
    workspaceVisible: boolean
    bindingTarget: string
    bindingMode: BindingMode
  }
}

export type CustomAgentWorkflowArchiveMetadata = {
  workflowArchived: boolean
  workflowArchivedAt: string | null
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback
}

export function readCustomAgentProjectionMetadata(input: unknown): CustomAgentProjectionMetadata {
  const metadata = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const visibilityPolicy =
    metadata.visibilityPolicy && typeof metadata.visibilityPolicy === "object" && !Array.isArray(metadata.visibilityPolicy)
      ? (metadata.visibilityPolicy as Record<string, unknown>)
      : {}
  const bindingMode =
    visibilityPolicy.bindingMode === "deferred" || visibilityPolicy.bindingMode === "external_runtime"
      ? visibilityPolicy.bindingMode
      : "existing_runtime"

  return {
    menuExposure: metadata.menuExposure === true,
    visibilityPolicy: {
      publicVisible: visibilityPolicy.publicVisible === true,
      workspaceVisible: visibilityPolicy.workspaceVisible !== false,
      bindingTarget: normalizeText(visibilityPolicy.bindingTarget, "agent-platform"),
      bindingMode,
    },
  }
}

export function mergeCustomAgentProjectionMetadata(input: {
  metadata: Record<string, unknown> | null | undefined
  menuExposure: boolean
  visibilityPolicy: {
    publicVisible: boolean
    workspaceVisible: boolean
    bindingTarget: string
    bindingMode: BindingMode
  }
}) {
  const base =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? { ...input.metadata }
      : {}

  return {
    ...base,
    menuExposure: input.menuExposure,
    visibilityPolicy: {
      publicVisible: input.visibilityPolicy.publicVisible,
      workspaceVisible: input.visibilityPolicy.workspaceVisible,
      bindingTarget: normalizeText(input.visibilityPolicy.bindingTarget, "agent-platform"),
      bindingMode: input.visibilityPolicy.bindingMode,
    },
  } satisfies Record<string, unknown>
}

export function buildCustomAgentProjectionConfig(input: {
  metadata: Record<string, unknown> | null | undefined
  linkedWorkflowSlug?: string | null | undefined
}) {
  const parsed = readCustomAgentProjectionMetadata(input.metadata)
  return {
    menuExposure: parsed.menuExposure,
    publicVisible: parsed.visibilityPolicy.publicVisible,
    workspaceVisible: parsed.visibilityPolicy.workspaceVisible,
    bindingTarget:
      parsed.visibilityPolicy.bindingTarget === "agent-platform" && input.linkedWorkflowSlug
        ? input.linkedWorkflowSlug
        : parsed.visibilityPolicy.bindingTarget,
    bindingMode: parsed.visibilityPolicy.bindingMode,
  }
}

export function readCustomAgentWorkflowArchiveMetadata(input: unknown): CustomAgentWorkflowArchiveMetadata {
  const metadata = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  return {
    workflowArchived: metadata.workflowArchived === true,
    workflowArchivedAt: normalizeText(metadata.workflowArchivedAt, "") || null,
  }
}
