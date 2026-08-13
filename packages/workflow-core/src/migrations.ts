import { workflowNodeRegistry } from "./node-definitions/registry";
import { CURRENT_WORKFLOW_SCHEMA_VERSION, LEGACY_WORKFLOW_SCHEMA_VERSION, canonicalizeWorkflowDefinition, hashWorkflowDefinition, parseWorkflowDefinitionEnvelope, type WorkflowDefinitionEdgeV2, type WorkflowDefinitionEnvelope, type WorkflowDefinitionNodeV2 } from "./definition";

export type LegacyWorkflowDefinition = { schemaVersion?: number | null; revision?: number | null; nodes: Array<{ nodeKey: string; type: string; title?: string | null; positionX?: number | null; positionY?: number | null; config?: Record<string, unknown> | null; nodeVersion?: number | null }>; edges: Array<{ id?: number | string | null; sourceNodeKey: string; targetNodeKey: string; inputName?: string | null }> };
const inputPort = (name: string | null | undefined) => ({ text: "text", assets: "assets", asset: "assets", images: "images", image: "images", videos: "videos", video: "videos", audios: "audios", audio: "audios", presentations: "presentations", presentation: "presentations", ppt: "presentations" })[name ?? ""] ?? name ?? "input";
const outputPort = (name: string | null | undefined) => ({ text: "text", assets: "asset", asset: "asset", images: "image", image: "image", videos: "video", video: "video", audios: "audio", audio: "audio", presentations: "ppt", presentation: "ppt", ppt: "ppt" })[name ?? ""] ?? name ?? "output";

export function migrateWorkflowDefinitionToCurrent(input: LegacyWorkflowDefinition | WorkflowDefinitionEnvelope, revision = 1): WorkflowDefinitionEnvelope {
  if ((input as WorkflowDefinitionEnvelope).schemaVersion === CURRENT_WORKFLOW_SCHEMA_VERSION) return parseWorkflowDefinitionEnvelope(input);
  const legacy = input as LegacyWorkflowDefinition;
  const nodes: WorkflowDefinitionNodeV2[] = legacy.nodes.map((node) => {
    const definition = workflowNodeRegistry.get(node.type);
    return { nodeKey: node.nodeKey, type: node.type, nodeVersion: node.nodeVersion && node.nodeVersion > 0 ? node.nodeVersion : definition?.version ?? 1, title: node.title ?? definition?.title.en ?? node.type, positionX: Number.isFinite(node.positionX) ? Number(node.positionX) : 0, positionY: Number.isFinite(node.positionY) ? Number(node.positionY) : 0, config: node.config ? JSON.parse(JSON.stringify(node.config)) : {} };
  });
  const edges: WorkflowDefinitionEdgeV2[] = legacy.edges.map((edge, index) => ({ edgeKey: `legacy:${index}:${edge.sourceNodeKey}:${edge.targetNodeKey}`, sourceNodeKey: edge.sourceNodeKey, sourcePortId: outputPort(edge.inputName), targetNodeKey: edge.targetNodeKey, targetPortId: inputPort(edge.inputName), inputName: edge.inputName ?? null }));
  const canonical = canonicalizeWorkflowDefinition({ schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION, revision: Number.isInteger(legacy.revision) && Number(legacy.revision) > 0 ? Number(legacy.revision) : revision, definitionHash: "", nodes, edges });
  return { ...canonical, definitionHash: hashWorkflowDefinition(canonical) };
}

export function migrateLegacyWorkflowDefinition(input: LegacyWorkflowDefinition, revision?: number) { return migrateWorkflowDefinitionToCurrent({ ...input, schemaVersion: input.schemaVersion ?? LEGACY_WORKFLOW_SCHEMA_VERSION }, revision); }
