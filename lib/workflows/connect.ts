import {
  canWorkflowNodeConnectValueKind,
  getWorkflowNodeOutputKinds,
  type WorkflowNodeType,
  type WorkflowValueKind,
} from "@/lib/workflows/schema"

// Maps a workflow value kind to the edge inputName used in workflow definitions.
// Kept here (next to the click-connect resolver) so UI and logic share one
// source of truth for the kind -> inputName mapping.
export function workflowValueKindToInputName(kind: WorkflowValueKind): string {
  if (kind === "text") return "text"
  if (kind === "asset") return "assets"
  if (kind === "image") return "images"
  if (kind === "video") return "videos"
  if (kind === "audio") return "audios"
  return "presentations"
}

// Resolves the inputName to wire a click-driven connection between two nodes,
// picking the first source output kind the target can accept. Returns null when
// the pair is not connectable. Mirrors the compatibility check used by the
// pointer-drag path so both connect flows agree on what is allowed.
export function resolveClickConnectInputName(
  sourceType: WorkflowNodeType,
  targetType: WorkflowNodeType,
): string | null {
  for (const outputKind of getWorkflowNodeOutputKinds(sourceType)) {
    if (canWorkflowNodeConnectValueKind(targetType, outputKind)) {
      return workflowValueKindToInputName(outputKind)
    }
  }
  return null
}
