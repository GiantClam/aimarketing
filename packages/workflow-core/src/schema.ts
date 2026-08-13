import { workflowNodeRegistry } from "./node-definitions/registry";
import { WORKFLOW_NODE_TYPES, WORKFLOW_VALUE_KINDS, type WorkflowLocale, type WorkflowNodeDefinitionV2, type WorkflowNodeType, type WorkflowValueKind } from "./node-definitions/types";

export { WORKFLOW_NODE_TYPES, WORKFLOW_VALUE_KINDS };
export type { WorkflowLocale, WorkflowNodeType, WorkflowValueKind };

export type WorkflowNodeInputName = "text" | "assets" | "images" | "videos" | "audios" | "presentations";
export type WorkflowNodeDefinition = WorkflowNodeDefinitionV2;
export type WorkflowDefinitionNode = { nodeKey: string; type: WorkflowNodeType; title: string; positionX: number; positionY: number; config: Record<string, unknown> };
export type WorkflowDefinitionEdge = { edgeKey?: string; sourceNodeKey: string; sourcePortId?: string | null; targetNodeKey: string; targetPortId?: string | null; inputName?: string | null };

export function isWorkflowNodeType(value: string): value is WorkflowNodeType { return workflowNodeRegistry.get(value) !== null; }
export function isWorkflowValueKind(value: string): value is WorkflowValueKind { return (WORKFLOW_VALUE_KINDS as readonly string[]).includes(value); }
export function getWorkflowNodeDefinition(type: WorkflowNodeType) { return workflowNodeRegistry.require(type); }
export function getAllowedWorkflowTargetInputKinds(type: WorkflowNodeType): WorkflowValueKind[] { return [...new Set(workflowNodeRegistry.require(type).inputs.map((port) => port.valueKind))]; }
export function getWorkflowNodeOutputKinds(type: WorkflowNodeType): WorkflowValueKind[] { return [...new Set(workflowNodeRegistry.require(type).outputs.map((port) => port.valueKind))]; }
export function isWorkflowFileKind(kind: WorkflowValueKind) { return kind === "asset" || kind === "image" || kind === "video" || kind === "audio" || kind === "ppt"; }
export function getDefaultWorkflowNodeTitle(type: WorkflowNodeType, locale: WorkflowLocale = "en") { return workflowNodeRegistry.require(type).title[locale]; }
export function isDefaultWorkflowNodeTitle(type: WorkflowNodeType, value: string | null | undefined) {
  if (!value?.trim()) return true;
  const definition = workflowNodeRegistry.require(type);
  return Object.values(definition.title).includes(value.trim()) || (definition.legacyTitles ?? []).includes(value.trim());
}
export function resolveWorkflowNodeTitle(type: WorkflowNodeType, value: string | null | undefined, locale: WorkflowLocale = "en") { return isDefaultWorkflowNodeTitle(type, value) ? getDefaultWorkflowNodeTitle(type, locale) : value!.trim(); }
