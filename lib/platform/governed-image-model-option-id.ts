function isWorkspaceImageAssistantProviderId(providerId: string) {
  return providerId === "pptoken" || providerId === "aiberm" || providerId === "crazyroute"
}

function buildWorkspaceImageAssistantModelOptionId(input: {
  providerId: "pptoken" | "aiberm" | "crazyroute"
  modelId: string
}) {
  return `workspace:${input.providerId}:${encodeURIComponent(input.modelId)}`
}

function buildEnterpriseImageRuntimeSelectionId(input: {
  providerId: string
  model?: string
  routeId?: string | null
}) {
  return `enterprise:${input.providerId}:${encodeURIComponent(input.routeId || input.model || "")}`
}

export function buildGovernedImageAssistantModelOptionId(input: {
  providerId: string
  modelId: string
  routeId?: string | null
}) {
  if (isWorkspaceImageAssistantProviderId(input.providerId)) {
    return buildWorkspaceImageAssistantModelOptionId({
      providerId: input.providerId,
      modelId: input.modelId,
    })
  }

  return buildEnterpriseImageRuntimeSelectionId({
    providerId: input.providerId,
    model: input.modelId,
    routeId: input.routeId,
  })
}
