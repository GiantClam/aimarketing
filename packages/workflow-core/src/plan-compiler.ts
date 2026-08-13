import { hashWorkflowText, type WorkflowDefinitionEdgeV2, type WorkflowDefinitionEnvelope, type WorkflowDefinitionNodeV2, type WorkflowValidationIssueCode } from "./definition";
import { areWorkflowPortsCompatible, workflowNodeRegistry } from "./node-definitions/registry";

export type WorkflowPlanNode = Pick<WorkflowDefinitionNodeV2, "nodeKey" | "type"> & { config?: Record<string, unknown>; title?: string; positionX?: number; positionY?: number; nodeVersion?: number };
export type WorkflowPlanEdge = Pick<WorkflowDefinitionEdgeV2, "sourceNodeKey" | "targetNodeKey"> & { edgeKey?: string; sourcePortId?: string; targetPortId?: string; inputName?: string | null };
export type WorkflowPlanDefinition = { nodes: WorkflowPlanNode[]; edges: WorkflowPlanEdge[]; schemaVersion?: number; revision?: number; definitionHash?: string };
export type WorkflowPlanLimits = { maxIterations?: number; defaultMaxIterations?: number; maxConcurrency?: number; defaultConcurrency?: number };
export type CompiledWorkflowPlanStep = { kind: "node"; nodeKey: string; dependsOn: string[] } | { kind: "foreach"; nodeKey: string; collectNodeKey: string; bodyNodeKeys: string[]; inputPortId: string; concurrency: number; maxIterations: number; failurePolicy: "continue" | "fail_fast"; dependsOn: string[] };
export type CompiledWorkflowPlan = { schemaVersion: 1; definitionHash: string; steps: CompiledWorkflowPlanStep[] };
export type WorkflowPlanIssueCode = WorkflowValidationIssueCode | "foreach_scope_external_entry" | "foreach_scope_bypass_collect" | "foreach_nested_not_supported" | "foreach_collect_pair_invalid" | "workflow_iteration_limit_exceeded";
export type WorkflowPlanIssue = { code: WorkflowPlanIssueCode; nodeKey?: string; edgeKey?: string; message: string };

export class WorkflowPlanCompilationError extends Error {
  readonly issues: readonly WorkflowPlanIssue[];
  constructor(issues: readonly WorkflowPlanIssue[]) { super(issues.map((item) => item.message).join("; ") || "Invalid workflow plan"); this.name = "WorkflowPlanCompilationError"; this.issues = issues; }
}

const PLATFORM_MAX_ITERATIONS = 100; const PLATFORM_MAX_CONCURRENCY = 6; const DEFAULT_MAX_ITERATIONS = 20; const DEFAULT_CONCURRENCY = 3;
const compareStrings = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const stableJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(stableJson).join(",")}]` : !isRecord(value) ? JSON.stringify(value) : `{${Object.keys(value).sort(compareStrings).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
const issue = (code: WorkflowPlanIssueCode, message: string, fields: Omit<WorkflowPlanIssue, "code" | "message"> = {}): WorkflowPlanIssue => ({ code, message, ...fields });
const sortedUnique = (values: Iterable<string>) => [...new Set(values)].sort(compareStrings);
const nodeConfig = (node: WorkflowPlanNode) => isRecord(node.config) ? node.config : {};
function stringConfig(config: Record<string, unknown>, ...keys: string[]) { for (const key of keys) if (typeof config[key] === "string" && config[key].trim()) return config[key] as string; return null; }
function numberConfig(config: Record<string, unknown>, ...keys: string[]) { for (const key of keys) if (typeof config[key] === "number" && Number.isFinite(config[key])) return Number(config[key]); return null; }
function stringArrayConfig(config: Record<string, unknown>, ...keys: string[]) { for (const key of keys) if (Array.isArray(config[key]) && config[key].every((item) => typeof item === "string")) return config[key] as string[]; return null; }

function definitionHash(definition: WorkflowPlanDefinition) {
  if (typeof definition.definitionHash === "string" && definition.definitionHash.trim()) return definition.definitionHash;
  const normalized = { schemaVersion: definition.schemaVersion ?? 1, nodes: [...definition.nodes].map((node) => ({ ...node, config: node.config ?? {} })).sort((left, right) => compareStrings(left.nodeKey, right.nodeKey)), edges: [...definition.edges].sort((left, right) => compareStrings(left.edgeKey ?? `${left.sourceNodeKey}:${left.targetNodeKey}:${left.sourcePortId ?? ""}:${left.targetPortId ?? ""}`, right.edgeKey ?? `${right.sourceNodeKey}:${right.targetNodeKey}:${right.sourcePortId ?? ""}:${right.targetPortId ?? ""}`)) };
  return hashWorkflowText(stableJson(normalized));
}

function topologicalOrder(nodeKeys: Iterable<string>, adjacency: Map<string, Set<string>>, issues: WorkflowPlanIssue[], cycleNodeKey?: string) {
  const keys = sortedUnique(nodeKeys); const remaining = new Map(keys.map((key) => [key, 0]));
  for (const source of keys) for (const target of adjacency.get(source) ?? []) if (remaining.has(target)) remaining.set(target, (remaining.get(target) ?? 0) + 1);
  const queue = keys.filter((key) => remaining.get(key) === 0); const ordered: string[] = [];
  while (queue.length) { const next = queue.shift()!; ordered.push(next); for (const target of [...(adjacency.get(next) ?? [])].sort(compareStrings)) { if (!remaining.has(target)) continue; const degree = (remaining.get(target) ?? 0) - 1; remaining.set(target, degree); if (degree === 0) { queue.push(target); queue.sort(compareStrings); } } }
  if (ordered.length !== keys.length) issues.push(issue("workflow_cycle_detected", "Workflow graph contains a cycle", { nodeKey: cycleNodeKey }));
  return ordered;
}

function staticInputCount(config: Record<string, unknown>) { for (const key of ["items", "inputs", "inputItems", "collection", "staticItems"]) if (Array.isArray(config[key])) return config[key].length; const count = numberConfig(config, "inputCount", "staticInputCount"); return count !== null && Number.isInteger(count) && count >= 0 ? count : null; }
function resolveLimits(config: Record<string, unknown>, limits: WorkflowPlanLimits, nodeKey: string, issues: WorkflowPlanIssue[]) {
  const tenantMax = limits.maxIterations ?? PLATFORM_MAX_ITERATIONS; const hardMax = Math.min(PLATFORM_MAX_ITERATIONS, tenantMax); const requestedMax = numberConfig(config, "maxIterations") ?? limits.defaultMaxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (!Number.isInteger(tenantMax) || tenantMax < 1 || !Number.isInteger(requestedMax) || requestedMax < 1 || requestedMax > hardMax) issues.push(issue("workflow_iteration_limit_exceeded", `foreach maxIterations must be between 1 and ${hardMax}`, { nodeKey }));
  const tenantConcurrency = limits.maxConcurrency ?? PLATFORM_MAX_CONCURRENCY; const hardConcurrency = Math.min(PLATFORM_MAX_CONCURRENCY, tenantConcurrency); const requestedConcurrency = numberConfig(config, "concurrency") ?? limits.defaultConcurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(tenantConcurrency) || tenantConcurrency < 1 || !Number.isInteger(requestedConcurrency) || requestedConcurrency < 1 || requestedConcurrency > hardConcurrency) issues.push(issue("invalid_workflow_definition", `foreach concurrency must be between 1 and ${hardConcurrency}`, { nodeKey }));
  const failurePolicy = stringConfig(config, "failurePolicy"); if (failurePolicy && failurePolicy !== "continue" && failurePolicy !== "fail_fast") issues.push(issue("invalid_workflow_definition", "foreach failurePolicy must be continue or fail_fast", { nodeKey }));
  return { maxIterations: Math.max(1, Math.min(hardMax, Number.isInteger(requestedMax) ? requestedMax : DEFAULT_MAX_ITERATIONS)), concurrency: Math.max(1, Math.min(hardConcurrency, Number.isInteger(requestedConcurrency) ? requestedConcurrency : DEFAULT_CONCURRENCY)), failurePolicy: (failurePolicy === "fail_fast" ? "fail_fast" : "continue") as "continue" | "fail_fast" };
}

/** Validate a resolved collection before creating iteration rows. Empty input is valid. */
export function assertWorkflowIterationCount(count: number, limits: WorkflowPlanLimits = {}) {
  const max = Math.min(PLATFORM_MAX_ITERATIONS, limits.maxIterations ?? PLATFORM_MAX_ITERATIONS);
  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(max) || max < 1 || count > max) throw new WorkflowPlanCompilationError([issue("workflow_iteration_limit_exceeded", `foreach input count must be between 0 and ${max}`)]);
}

/** Compile graph-only workflow data into deterministic top-level execution steps. */
export function compileWorkflowPlan(input: WorkflowPlanDefinition | WorkflowDefinitionEnvelope, limits: WorkflowPlanLimits = {}): CompiledWorkflowPlan {
  const definition = input as WorkflowPlanDefinition; const nodes = Array.isArray(definition.nodes) ? definition.nodes : []; const edges = Array.isArray(definition.edges) ? definition.edges : []; const issues: WorkflowPlanIssue[] = [];
  const nodeMap = new Map<string, WorkflowPlanNode>();
  for (const node of nodes) { if (!node || typeof node.nodeKey !== "string" || !node.nodeKey.trim()) { issues.push(issue("invalid_workflow_definition", "Workflow nodeKey is required")); continue; } if (nodeMap.has(node.nodeKey)) issues.push(issue("duplicate_workflow_node_key", `Duplicate nodeKey: ${node.nodeKey}`, { nodeKey: node.nodeKey })); else nodeMap.set(node.nodeKey, node); }
  const edgeKeys = new Set<string>(); const adjacency = new Map<string, Set<string>>([...nodeMap.keys()].map((key) => [key, new Set()])); const incoming = new Map<string, WorkflowPlanEdge[]>([...nodeMap.keys()].map((key) => [key, []]));
  for (const [index, edge] of edges.entries()) {
    const edgeKey = edge.edgeKey ?? `edge:${index}`; if (edgeKeys.has(edgeKey)) issues.push(issue("duplicate_workflow_edge_key", `Duplicate edgeKey: ${edgeKey}`, { edgeKey })); edgeKeys.add(edgeKey);
    if (!nodeMap.has(edge.sourceNodeKey) || !nodeMap.has(edge.targetNodeKey)) { issues.push(issue("dangling_workflow_edge", `Edge references a missing node: ${edgeKey}`, { edgeKey })); continue; }
    const sourceDefinition = workflowNodeRegistry.get(nodeMap.get(edge.sourceNodeKey)!.type); const targetDefinition = workflowNodeRegistry.get(nodeMap.get(edge.targetNodeKey)!.type); const sourcePort = sourceDefinition && edge.sourcePortId ? sourceDefinition.outputs.find((port) => port.id === edge.sourcePortId) : undefined; const targetPort = targetDefinition && edge.targetPortId ? targetDefinition.inputs.find((port) => port.id === edge.targetPortId) : undefined;
    if (sourcePort && targetPort && !areWorkflowPortsCompatible(sourcePort, targetPort)) issues.push(issue("invalid_port_connection", "Source and target ports are not compatible", { edgeKey }));
    adjacency.get(edge.sourceNodeKey)!.add(edge.targetNodeKey); incoming.get(edge.targetNodeKey)!.push(edge);
  }
  topologicalOrder(nodeMap.keys(), adjacency, issues);
  const scopes = new Map<string, { foreachNode: WorkflowPlanNode; collectNodeKey: string; bodyNodeKeys: Set<string> }>(); const pairedCollects = new Set<string>();
  for (const foreachNode of nodes.filter((node) => node.type === "foreach")) {
    const config = nodeConfig(foreachNode); const explicitBody = stringArrayConfig(config, "bodyNodeKeys", "body"); const explicitCollect = stringConfig(config, "collectNodeKey", "collectNode", "collect"); const outgoing = [...(adjacency.get(foreachNode.nodeKey) ?? [])].sort(compareStrings); const bodyEntries = explicitBody ?? outgoing.filter((key) => nodeMap.get(key)?.type !== "collect"); const reachable = new Set<string>(); const candidates = new Set<string>(); const queue = [...bodyEntries]; const visited = new Set<string>();
    while (queue.length) { const next = queue.shift()!; if (visited.has(next)) continue; visited.add(next); const node = nodeMap.get(next); if (!node) continue; if (node.type === "collect") { candidates.add(next); continue; } reachable.add(next); queue.push(...[...(adjacency.get(next) ?? [])].sort(compareStrings)); }
    if (explicitCollect) candidates.add(explicitCollect); const collectKeys = [...candidates].filter((key) => nodeMap.get(key)?.type === "collect"); const collectNodeKey = explicitCollect ?? (collectKeys.length === 1 ? collectKeys[0] : null);
    if (!collectNodeKey || collectKeys.length !== 1 || (explicitCollect && collectKeys[0] !== explicitCollect)) { issues.push(issue("foreach_collect_pair_invalid", "foreach must resolve to exactly one collect node", { nodeKey: foreachNode.nodeKey })); continue; }
    if (pairedCollects.has(collectNodeKey)) { issues.push(issue("foreach_collect_pair_invalid", `collect node is paired with multiple foreach nodes: ${collectNodeKey}`, { nodeKey: foreachNode.nodeKey })); continue; }
    pairedCollects.add(collectNodeKey); const bodyNodeKeys = new Set([...reachable].filter((key) => key !== foreachNode.nodeKey && key !== collectNodeKey)); if (!bodyNodeKeys.size) issues.push(issue("foreach_collect_pair_invalid", "foreach scope body cannot be empty", { nodeKey: foreachNode.nodeKey }));
    for (const bodyNodeKey of bodyNodeKeys) { const bodyNode = nodeMap.get(bodyNodeKey)!; if (bodyNode.type === "foreach") issues.push(issue("foreach_nested_not_supported", "Nested foreach scopes are not supported", { nodeKey: bodyNodeKey })); for (const edge of incoming.get(bodyNodeKey) ?? []) if (edge.sourceNodeKey !== foreachNode.nodeKey && !bodyNodeKeys.has(edge.sourceNodeKey)) issues.push(issue("foreach_scope_external_entry", `Scope body node has an external incoming edge: ${bodyNodeKey}`, { nodeKey: bodyNodeKey, edgeKey: edge.edgeKey })); for (const target of adjacency.get(bodyNodeKey) ?? []) if (!bodyNodeKeys.has(target) && target !== collectNodeKey) issues.push(issue("foreach_scope_bypass_collect", `Scope body bypasses collect: ${bodyNodeKey} -> ${target}`, { nodeKey: bodyNodeKey })); }
    for (const target of outgoing) if (!bodyNodeKeys.has(target) && target !== collectNodeKey) issues.push(issue("foreach_scope_bypass_collect", `foreach scope bypasses collect: ${foreachNode.nodeKey} -> ${target}`, { nodeKey: foreachNode.nodeKey }));
    for (const edge of incoming.get(collectNodeKey) ?? []) if (edge.sourceNodeKey !== foreachNode.nodeKey && !bodyNodeKeys.has(edge.sourceNodeKey)) issues.push(issue("foreach_collect_pair_invalid", "collect has an external incoming edge", { nodeKey: collectNodeKey, edgeKey: edge.edgeKey }));
    const reverse = new Map<string, Set<string>>([...bodyNodeKeys, collectNodeKey].map((key) => [key, new Set()])); for (const source of [...bodyNodeKeys, foreachNode.nodeKey]) for (const target of adjacency.get(source) ?? []) if (reverse.has(target)) reverse.get(target)!.add(source); const canReach = new Set<string>([collectNodeKey]); const reverseQueue = [collectNodeKey]; while (reverseQueue.length) { const next = reverseQueue.shift()!; for (const parent of reverse.get(next) ?? []) if (bodyNodeKeys.has(parent) && !canReach.has(parent)) { canReach.add(parent); reverseQueue.push(parent); } } for (const bodyNodeKey of bodyNodeKeys) if (!canReach.has(bodyNodeKey)) issues.push(issue("foreach_scope_bypass_collect", `Scope body node cannot reach collect: ${bodyNodeKey}`, { nodeKey: bodyNodeKey }));
    scopes.set(foreachNode.nodeKey, { foreachNode, collectNodeKey, bodyNodeKeys });
  }
  if (issues.length) throw new WorkflowPlanCompilationError(issues);
  const scopeForBody = new Map<string, string>(); const scopeForCollect = new Map<string, string>(); for (const [foreachKey, scope] of scopes) { for (const bodyKey of scope.bodyNodeKeys) scopeForBody.set(bodyKey, foreachKey); scopeForCollect.set(scope.collectNodeKey, foreachKey); }
  const scopeStep = (nodeKey: string) => scopeForBody.get(nodeKey) ?? scopeForCollect.get(nodeKey) ?? nodeKey; const stepKeys = nodes.filter((node) => !scopeForBody.has(node.nodeKey) && !pairedCollects.has(node.nodeKey)).map((node) => node.nodeKey); const stepAdjacency = new Map<string, Set<string>>([...stepKeys].map((key) => [key, new Set()])); const dependsOn = new Map<string, Set<string>>([...stepKeys].map((key) => [key, new Set()]));
  for (const edge of edges) { const source = scopeStep(edge.sourceNodeKey); const target = scopeStep(edge.targetNodeKey); if (source === target || !stepAdjacency.has(source) || !stepAdjacency.has(target)) continue; stepAdjacency.get(source)!.add(target); dependsOn.get(target)!.add(source); }
  const stepOrder = topologicalOrder(stepKeys, stepAdjacency, issues); if (issues.length) throw new WorkflowPlanCompilationError(issues);
  const steps: CompiledWorkflowPlanStep[] = [];
  for (const stepKey of stepOrder) { const scope = scopes.get(stepKey); if (!scope) { steps.push({ kind: "node", nodeKey: stepKey, dependsOn: sortedUnique(dependsOn.get(stepKey) ?? []) }); continue; } const config = nodeConfig(scope.foreachNode); const resolved = resolveLimits(config, limits, stepKey, issues); const count = staticInputCount(config); if (count !== null) assertWorkflowIterationCount(count, limits); const bodyAdjacency = new Map<string, Set<string>>([...scope.bodyNodeKeys].map((key) => [key, new Set()])); for (const bodyKey of scope.bodyNodeKeys) for (const target of adjacency.get(bodyKey) ?? []) if (bodyAdjacency.has(target)) bodyAdjacency.get(bodyKey)!.add(target); const bodyNodeKeys = topologicalOrder(scope.bodyNodeKeys, bodyAdjacency, issues, stepKey); if (issues.length) throw new WorkflowPlanCompilationError(issues); steps.push({ kind: "foreach", nodeKey: stepKey, collectNodeKey: scope.collectNodeKey, bodyNodeKeys, inputPortId: stringConfig(config, "inputPortId", "inputPort") ?? "input", concurrency: resolved.concurrency, maxIterations: resolved.maxIterations, failurePolicy: resolved.failurePolicy, dependsOn: sortedUnique(dependsOn.get(stepKey) ?? []) }); }
  return { schemaVersion: 1, definitionHash: definitionHash(definition), steps };
}

export type WorkflowIterationKeyInput = { logicalId?: string | null; logical_id?: string | null; artifactId?: string | null; [key: string]: unknown };
function logicalIdForInput(input: unknown) { if (!isRecord(input)) return null; for (const key of ["logicalId", "logical_id", "artifactId"]) if (typeof input[key] === "string" && input[key].trim()) return input[key].trim(); return null; }
/** Generate deterministic keys from input order; duplicate logical IDs get :1, :2, ... suffixes. */
export function createWorkflowIterationKeys(inputs: readonly unknown[]) { const occurrences = new Map<string, number>(); return inputs.map((input) => { const base = logicalIdForInput(input) ?? hashWorkflowText(stableJson(input)).slice(0, 32); const occurrence = occurrences.get(base) ?? 0; occurrences.set(base, occurrence + 1); return occurrence === 0 ? base : `${base}:${occurrence}`; }); }
export type WorkflowCollectedIteration<T = unknown> = { iterationKey: string; index: number; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; value?: T; artifacts?: unknown[]; error?: unknown };
/** Collect always follows input index, never provider completion order. */
export function sortWorkflowIterationsForCollect<T>(iterations: readonly WorkflowCollectedIteration<T>[]) { return [...iterations].sort((left, right) => left.index - right.index || compareStrings(left.iterationKey, right.iterationKey)); }
