import { areWorkflowPortsCompatible, workflowNodeRegistry } from "./node-definitions/registry";

export const CURRENT_WORKFLOW_SCHEMA_VERSION = 2 as const;
export const LEGACY_WORKFLOW_SCHEMA_VERSION = 1 as const;

export type WorkflowDefinitionNodeV2 = { nodeKey: string; type: string; nodeVersion: number; title: string; positionX: number; positionY: number; config: Record<string, unknown> };
export type WorkflowDefinitionEdgeV2 = { edgeKey: string; sourceNodeKey: string; sourcePortId: string; targetNodeKey: string; targetPortId: string; inputName?: string | null };
export type WorkflowDefinitionEnvelope = { schemaVersion: typeof CURRENT_WORKFLOW_SCHEMA_VERSION; revision: number; definitionHash: string; nodes: WorkflowDefinitionNodeV2[]; edges: WorkflowDefinitionEdgeV2[] };
export type WorkflowValidationIssue = { code: "duplicate_workflow_node_key" | "duplicate_workflow_edge_key" | "dangling_workflow_edge" | "workflow_cycle_detected" | "invalid_port_connection" | "unsupported_node_type" | "unsupported_node_version" | "invalid_workflow_definition"; nodeKey?: string; edgeKey?: string; message: string };

export class WorkflowDefinitionValidationError extends Error {
  readonly issues: readonly WorkflowValidationIssue[];
  constructor(issues: readonly WorkflowValidationIssue[]) { super(issues.map((issue) => issue.message).join("; ") || "Invalid workflow definition"); this.name = "WorkflowDefinitionValidationError"; this.issues = issues; }
}

function cloneConfig(config: Record<string, unknown>) { return JSON.parse(JSON.stringify(config)) as Record<string, unknown>; }

// Keep the shared definition contract usable in the browser/Tauri WebView as
// well as Node. This is a small synchronous SHA-256 implementation so the
// canonical hash does not pull the Node-only `crypto` module into Vite.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
function sha256Hex(input: string) {
  const source = new TextEncoder().encode(input);
  const bitLength = source.length * 8;
  const paddedLength = (((source.length + 9 + 63) >> 6) << 6);
  const bytes = new Uint8Array(paddedLength); bytes.set(source); bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer); view.setUint32(paddedLength - 4, bitLength >>> 0, false); view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a; let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index++) { const s0 = rotr(words[index - 15], 7) ^ rotr(words[index - 15], 18) ^ (words[index - 15] >>> 3); const s1 = rotr(words[index - 2], 17) ^ rotr(words[index - 2], 19) ^ (words[index - 2] >>> 10); words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0; }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let index = 0; index < 64; index++) { const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25); const choice = (e & f) ^ (~e & g); const temp1 = (h + s1 + choice + SHA256_K[index] + words[index]) >>> 0; const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22); const majority = (a & b) ^ (a & c) ^ (b & c); const temp2 = (s0 + majority) >>> 0; h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0; }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((value) => value.toString(16).padStart(8, "0")).join("");
}
export function canonicalizeWorkflowDefinition(input: Omit<WorkflowDefinitionEnvelope, "definitionHash"> & { definitionHash?: string }): WorkflowDefinitionEnvelope {
  return {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    definitionHash: input.definitionHash ?? "",
    nodes: [...input.nodes].map((node) => ({ ...node, config: cloneConfig(node.config ?? {}) })).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)),
    edges: [...input.edges].map((edge) => ({ ...edge })).sort((a, b) => a.edgeKey.localeCompare(b.edgeKey)),
  };
}

export function hashWorkflowDefinition(input: WorkflowDefinitionEnvelope) {
  const canonical = canonicalizeWorkflowDefinition({ ...input, definitionHash: "" });
  return sha256Hex(JSON.stringify(canonical));
}

export function validateWorkflowDefinition(input: WorkflowDefinitionEnvelope): readonly WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const nodes = new Map<string, WorkflowDefinitionNodeV2>();
  for (const node of input.nodes) {
    if (nodes.has(node.nodeKey)) issues.push({ code: "duplicate_workflow_node_key", nodeKey: node.nodeKey, message: `Duplicate node key: ${node.nodeKey}` });
    nodes.set(node.nodeKey, node);
    const definition = workflowNodeRegistry.get(node.type);
    if (!definition) issues.push({ code: "unsupported_node_type", nodeKey: node.nodeKey, message: `Unsupported node type: ${node.type}` });
    else if (node.nodeVersion > definition.version) issues.push({ code: "unsupported_node_version", nodeKey: node.nodeKey, message: `Unsupported node version: ${node.nodeVersion}` });
  }
  const edges = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const edge of input.edges) {
    if (edges.has(edge.edgeKey)) issues.push({ code: "duplicate_workflow_edge_key", edgeKey: edge.edgeKey, message: `Duplicate edge key: ${edge.edgeKey}` });
    edges.add(edge.edgeKey);
    const source = nodes.get(edge.sourceNodeKey);
    const target = nodes.get(edge.targetNodeKey);
    if (!source || !target) { issues.push({ code: "dangling_workflow_edge", edgeKey: edge.edgeKey, message: `Dangling edge: ${edge.edgeKey}` }); continue; }
    const sourcePort = workflowNodeRegistry.get(source.type)?.outputs.find((port) => port.id === edge.sourcePortId);
    const targetPort = workflowNodeRegistry.get(target.type)?.inputs.find((port) => port.id === edge.targetPortId);
    if (!sourcePort || !targetPort || !areWorkflowPortsCompatible(sourcePort, targetPort)) issues.push({ code: "invalid_port_connection", edgeKey: edge.edgeKey, message: `Invalid port connection: ${edge.edgeKey}` });
    adjacency.set(source.nodeKey, [...(adjacency.get(source.nodeKey) ?? []), target.nodeKey]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeKey: string) => {
    if (visiting.has(nodeKey)) { issues.push({ code: "workflow_cycle_detected", nodeKey, message: `Workflow cycle detected at: ${nodeKey}` }); return; }
    if (visited.has(nodeKey)) return;
    visiting.add(nodeKey);
    for (const next of adjacency.get(nodeKey) ?? []) visit(next);
    visiting.delete(nodeKey);
    visited.add(nodeKey);
  };
  for (const node of nodes.keys()) visit(node);
  return issues;
}

export function parseWorkflowDefinitionEnvelope(input: unknown): WorkflowDefinitionEnvelope {
  if (!input || typeof input !== "object") throw new WorkflowDefinitionValidationError([{ code: "invalid_workflow_definition", message: "Workflow definition must be an object" }]);
  const value = input as Partial<WorkflowDefinitionEnvelope>;
  if (value.schemaVersion !== CURRENT_WORKFLOW_SCHEMA_VERSION || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new WorkflowDefinitionValidationError([{ code: "invalid_workflow_definition", message: "Unsupported workflow definition envelope" }]);
  const canonical = canonicalizeWorkflowDefinition({ schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION, revision: value.revision ?? 1, definitionHash: typeof value.definitionHash === "string" ? value.definitionHash : "", nodes: value.nodes, edges: value.edges });
  const issues = validateWorkflowDefinition(canonical);
  if (issues.length > 0) throw new WorkflowDefinitionValidationError(issues);
  return { ...canonical, definitionHash: hashWorkflowDefinition(canonical) };
}
