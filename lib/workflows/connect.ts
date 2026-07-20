import {
  getWorkflowNodeDefinition,
  type WorkflowNodeType,
  type WorkflowValueKind,
} from "@/lib/workflows/schema"
import type { WorkflowFeatures } from "@/lib/workflows/features"
import type { WorkflowPortDefinition } from "@/lib/workflows/node-definitions/types"
import { areWorkflowPortsCompatible as areRegistryWorkflowPortsCompatible } from "@/lib/workflows/node-definitions/registry"

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

export type WorkflowPortConnection = {
  sourcePortId: string
  targetPortId: string
}

/**
 * Resolve a legacy value-kind connection to stable Registry port ids. This is
 * the only compatibility fallback used by the canvas; newly-created edges
 * must carry the two ids and leave inputName to the store migration layer.
 */
export function resolveWorkflowPortConnection(
  sourceType: WorkflowNodeType,
  targetType: WorkflowNodeType,
  sourcePortId?: string | null,
  targetPortId?: string | null,
  inputName?: string | null,
): WorkflowPortConnection | null {
  const sourceDefinition = getWorkflowNodeDefinition(sourceType)
  const targetDefinition = getWorkflowNodeDefinition(targetType)

  if (sourcePortId || targetPortId) {
    const target = targetDefinition.inputs.find((port) => port.id === targetPortId) ?? targetDefinition.inputs[0]
    const source = sourceDefinition.outputs.find((port) => port.id === sourcePortId) ??
      sourceDefinition.outputs.find((port) => target && areWorkflowPortsCompatible(port, target))
    if (source && target && areWorkflowPortsCompatible(source, target)) return { sourcePortId: source.id, targetPortId: target.id }
    return null
  }

  const legacyName = inputName ?? null
  const wantedName = legacyName ? workflowInputNameToValueKind(legacyName) : null
  for (const source of sourceDefinition.outputs) {
    for (const target of targetDefinition.inputs) {
      if (!areWorkflowPortsCompatible(source, target)) continue
      if (wantedName && source.valueKind !== wantedName && target.valueKind !== wantedName) continue
      return { sourcePortId: source.id, targetPortId: target.id }
    }
  }
  return null
}

export function resolveClickConnectPorts(
  sourceType: WorkflowNodeType,
  targetType: WorkflowNodeType,
): WorkflowPortConnection | null {
  return resolveWorkflowPortConnection(sourceType, targetType)
}

export function areWorkflowPortsCompatible(source: WorkflowPortDefinition, target: WorkflowPortDefinition) {
  return areRegistryWorkflowPortsCompatible(source, target)
}

export function workflowInputNameToValueKind(inputName: string | null | undefined): WorkflowValueKind | null {
  if (inputName === "text") return "text"
  if (inputName === "assets" || inputName === "asset") return "asset"
  if (inputName === "images" || inputName === "image") return "image"
  if (inputName === "videos" || inputName === "video") return "video"
  if (inputName === "audios" || inputName === "audio") return "audio"
  if (inputName === "presentations" || inputName === "presentation" || inputName === "ppt") return "ppt"
  return null
}

export function isWorkflowV2OnlyPort(port: WorkflowPortDefinition) {
  return port.role === "image.first_frame" || port.role === "image.last_frame" || port.role === "image.mask"
}

export function isWorkflowPortCreatable(port: WorkflowPortDefinition, features?: Pick<WorkflowFeatures, "definitionV2Write">) {
  return !(features?.definitionV2Write === false && isWorkflowV2OnlyPort(port))
}

export function getWorkflowPortLabel(locale: "zh" | "en", port: WorkflowPortDefinition): string {
  const roleLabels: Record<string, [string, string]> = {
    "image.reference": ["参考图片", "Image reference"],
    "image.first_frame": ["首帧图片", "First frame"],
    "image.last_frame": ["尾帧图片", "Last frame"],
    "image.mask": ["遮罩图片", "Mask"],
    "text.prompt": ["提示词", "Prompt"],
  }
  const role = port.role ? roleLabels[port.role] : undefined
  if (role) return locale === "zh" ? role[0] : role[1]
  const kindLabels: Record<WorkflowValueKind, [string, string]> = {
    text: ["文本", "Text"],
    asset: ["文件", "File"],
    image: ["图片", "Image"],
    video: ["视频", "Video"],
    audio: ["音频", "Audio"],
    ppt: ["PPT", "PPT"],
  }
  const labels = kindLabels[port.valueKind]
  return locale === "zh" ? labels[0] : labels[1]
}

// Resolves the inputName to wire a click-driven connection between two nodes,
// picking the first source output kind the target can accept. Returns null when
// the pair is not connectable. Mirrors the compatibility check used by the
// pointer-drag path so both connect flows agree on what is allowed.
export function resolveClickConnectInputName(
  sourceType: WorkflowNodeType,
  targetType: WorkflowNodeType,
): string | null {
  const connection = resolveClickConnectPorts(sourceType, targetType)
  if (!connection) return null
  const target = getWorkflowNodeDefinition(targetType).inputs.find((port) => port.id === connection.targetPortId)
  return target ? workflowValueKindToInputName(target.valueKind) : null
}
