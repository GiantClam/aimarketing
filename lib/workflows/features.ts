export type WorkflowFeatures = {
  nodeRegistryV2: boolean
  definitionV2Write: boolean
  iterationsV1: boolean
  openAiImageAdapterV1: boolean
}

function isEnabled(value: string | undefined) {
  return value === "1"
}

export function resolveWorkflowFeatures(env: Record<string, string | undefined> = process.env): WorkflowFeatures {
  const iterationsV1 = isEnabled(env.WORKFLOW_ITERATIONS_V1)
  if (iterationsV1 && new TextEncoder().encode(env.WORKFLOW_CONFIRMATION_SECRET ?? "").byteLength < 32) {
    throw new Error("workflow_confirmation_secret_invalid")
  }
  return {
    nodeRegistryV2: isEnabled(env.WORKFLOW_NODE_REGISTRY_V2),
    definitionV2Write: isEnabled(env.WORKFLOW_DEFINITION_V2_WRITE),
    iterationsV1,
    openAiImageAdapterV1: isEnabled(env.WORKFLOW_OPENAI_IMAGE_ADAPTER_V1),
  }
}
