import type { WorkflowNodeType } from "@/lib/workflows/schema"

const TEXTLESS_OUTPUT_NODE_TYPES = new Set<WorkflowNodeType>(["product_store"])

export function shouldHideWorkflowNodeOutputTextSection(nodeType: string | null | undefined) {
  return nodeType === "product_store"
}

export function sanitizeWorkflowNodeOutputPayloadForDisplay(
  nodeType: string | null | undefined,
  outputPayload: Record<string, unknown> | null | undefined,
) {
  if (!outputPayload || typeof outputPayload !== "object") {
    return null
  }

  if (!TEXTLESS_OUTPUT_NODE_TYPES.has(nodeType as WorkflowNodeType)) {
    return Object.keys(outputPayload).length > 0 ? outputPayload : null
  }

  const { text: _legacyText, ...sanitizedPayload } = outputPayload
  return Object.keys(sanitizedPayload).length > 0 ? sanitizedPayload : null
}
