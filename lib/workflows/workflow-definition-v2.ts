import { createHash } from "node:crypto"

import { areWorkflowPortsCompatible, workflowNodeRegistry } from "@/lib/workflows/node-definitions/registry"
import {
  WORKFLOW_VALUE_KINDS,
  type WorkflowPortDefinition,
  type WorkflowPortRole,
  type WorkflowPortValueKind,
} from "@/lib/workflows/node-definitions/types"

export const CURRENT_WORKFLOW_SCHEMA_VERSION = 2 as const
export const LEGACY_WORKFLOW_SCHEMA_VERSION = 1 as const

export type WorkflowDefinitionPortValueKind = WorkflowPortValueKind | "workflow"
export type WorkflowDefinitionPortRole = WorkflowPortRole

export type WorkflowDefinitionNodeV2 = {
  nodeKey: string
  type: string
  nodeVersion: number
  title: string
  positionX: number
  positionY: number
  config: Record<string, unknown>
}

export type WorkflowDefinitionEdgeV2 = {
  edgeKey: string
  sourceNodeKey: string
  sourcePortId: string
  targetNodeKey: string
  targetPortId: string
  inputName?: string | null
}

export type WorkflowDefinitionEnvelopeV2 = {
  schemaVersion: typeof CURRENT_WORKFLOW_SCHEMA_VERSION
  revision: number
  definitionHash: string
  nodes: WorkflowDefinitionNodeV2[]
  edges: WorkflowDefinitionEdgeV2[]
}

export type WorkflowValidationIssueCode =
  | "duplicate_workflow_node_key"
  | "duplicate_workflow_edge_key"
  | "dangling_workflow_edge"
  | "workflow_cycle_detected"
  | "invalid_port_connection"
  | "invalid_workflow_port_role"
  | "invalid_workflow_port_cardinality"
  | "unsupported_node_type"
  | "unsupported_node_version"
  | "invalid_workflow_definition"

export type WorkflowValidationIssue = {
  code: WorkflowValidationIssueCode
  nodeKey?: string
  edgeKey?: string
  field?: string
  message: string
}

export class WorkflowDefinitionValidationError extends Error {
  readonly issues: readonly WorkflowValidationIssue[]

  constructor(issues: readonly WorkflowValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; ") || "Invalid workflow definition")
    this.name = "WorkflowDefinitionValidationError"
    this.issues = issues
  }
}

const VALID_PORT_ROLES = new Set<WorkflowPortRole>([
  "image.reference",
  "image.first_frame",
  "image.last_frame",
  "image.mask",
  "text.prompt",
])

const VALID_CARDINALITIES = new Set<WorkflowPortDefinition["cardinality"]>(["one", "many"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys)
  if (!isRecord(value)) return value
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort(compareStrings)) sorted[key] = sortObjectKeys(value[key])
  return sorted
}

/** Stable JSON encoding used for revision hashes. */
export function canonicalJson(value: unknown) {
  return JSON.stringify(sortObjectKeys(value))
}

function canonicalHashPayload(definition: WorkflowDefinitionEnvelopeV2) {
  // definitionHash is deliberately excluded. Including it would make a hash
  // depend on itself and would prevent the server from recomputing it. The
  // revision is also excluded: it is metadata assigned by persistence, so a
  // content-identical save must keep the same hash and avoid a new revision.
  return {
    schemaVersion: definition.schemaVersion,
    nodes: [...definition.nodes].sort((left, right) => compareStrings(left.nodeKey, right.nodeKey)),
    edges: [...definition.edges].sort((left, right) => compareStrings(left.edgeKey, right.edgeKey)),
  }
}

/**
 * Returns a detached, deterministically ordered definition. Unknown config
 * fields are retained; only the top-level collection order is normalized.
 */
export function canonicalizeWorkflowDefinition(definition: WorkflowDefinitionEnvelopeV2): WorkflowDefinitionEnvelopeV2 {
  return {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    revision: definition.revision,
    definitionHash: definition.definitionHash,
    nodes: [...definition.nodes]
      .map((node) => ({ ...node, config: sortObjectKeys(node.config) as Record<string, unknown> }))
      .sort((left, right) => compareStrings(left.nodeKey, right.nodeKey)),
    edges: [...definition.edges].sort((left, right) => compareStrings(left.edgeKey, right.edgeKey)),
  }
}

export function canonicalizeWorkflowDefinitionJson(definition: WorkflowDefinitionEnvelopeV2) {
  return canonicalJson(canonicalHashPayload(canonicalizeWorkflowDefinition(definition)))
}

export function hashWorkflowDefinition(definition: WorkflowDefinitionEnvelopeV2) {
  return createHash("sha256").update(canonicalizeWorkflowDefinitionJson(definition)).digest("hex")
}

function issue(
  code: WorkflowValidationIssueCode,
  message: string,
  fields: Partial<Pick<WorkflowValidationIssue, "nodeKey" | "edgeKey" | "field">> = {},
): WorkflowValidationIssue {
  return { code, message, ...fields }
}

function validatePortShape(port: unknown, nodeKey: string, field: string): WorkflowValidationIssue[] {
  if (!isRecord(port)) return [issue("invalid_port_connection", `${field} must be an object`, { nodeKey, field })]
  const issues: WorkflowValidationIssue[] = []
  if (typeof port.id !== "string" || !port.id.trim()) {
    issues.push(issue("invalid_port_connection", `${field}.id is required`, { nodeKey, field }))
  }
  if (!VALID_CARDINALITIES.has(port.cardinality as WorkflowPortDefinition["cardinality"])) {
    issues.push(issue("invalid_workflow_port_cardinality", `${field}.cardinality is invalid`, { nodeKey, field }))
  }
  if (port.role !== undefined && (typeof port.role !== "string" || !VALID_PORT_ROLES.has(port.role as WorkflowPortRole))) {
    issues.push(issue("invalid_workflow_port_role", `${field}.role is invalid`, { nodeKey, field }))
  }
  if (typeof port.valueKind !== "string" || !(WORKFLOW_VALUE_KINDS as readonly string[]).includes(port.valueKind)) {
    issues.push(issue("invalid_port_connection", `${field}.valueKind is invalid`, { nodeKey, field }))
  }
  return issues
}

/** Validate an envelope without throwing, useful for API diagnostics/tests. */
export function validateWorkflowDefinitionEnvelope(value: unknown): WorkflowValidationIssue[] {
  if (!isRecord(value)) return [issue("invalid_workflow_definition", "Workflow definition must be an object")]
  const issues: WorkflowValidationIssue[] = []
  if (value.schemaVersion !== CURRENT_WORKFLOW_SCHEMA_VERSION) {
    issues.push(issue("invalid_workflow_definition", "schemaVersion must be 2", { field: "schemaVersion" }))
  }
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) {
    issues.push(issue("invalid_workflow_definition", "revision must be a positive integer", { field: "revision" }))
  }
  if (typeof value.definitionHash !== "string") {
    issues.push(issue("invalid_workflow_definition", "definitionHash must be a string", { field: "definitionHash" }))
  }
  if (!Array.isArray(value.nodes)) return [...issues, issue("invalid_workflow_definition", "nodes must be an array", { field: "nodes" })]
  if (!Array.isArray(value.edges)) return [...issues, issue("invalid_workflow_definition", "edges must be an array", { field: "edges" })]

  const nodeKeys = new Set<string>()
  for (const candidate of value.nodes) {
    if (!isRecord(candidate)) {
      issues.push(issue("invalid_workflow_definition", "node must be an object", { field: "nodes" }))
      continue
    }
    const nodeKey = typeof candidate.nodeKey === "string" ? candidate.nodeKey : undefined
    if (!nodeKey || nodeKey.length > 120) {
      issues.push(issue("invalid_workflow_definition", "nodeKey is required and must be <= 120 characters", { nodeKey, field: "nodeKey" }))
    } else if (nodeKeys.has(nodeKey)) {
      issues.push(issue("duplicate_workflow_node_key", `Duplicate nodeKey: ${nodeKey}`, { nodeKey }))
    } else nodeKeys.add(nodeKey)
    if (typeof candidate.type !== "string" || !candidate.type) {
      issues.push(issue("invalid_workflow_definition", "node type is required", { nodeKey, field: "type" }))
    } else {
      const registered = workflowNodeRegistry.get(candidate.type)
      if (!registered) issues.push(issue("unsupported_node_type", `Unsupported node type: ${candidate.type}`, { nodeKey, field: "type" }))
      else if (!Number.isInteger(candidate.nodeVersion) || Number(candidate.nodeVersion) < 1 || Number(candidate.nodeVersion) > registered.version) {
        issues.push(issue("unsupported_node_version", `Unsupported node version for ${candidate.type}`, { nodeKey, field: "nodeVersion" }))
      }
    }
    if (!Number.isFinite(candidate.positionX) || !Number.isFinite(candidate.positionY)) {
      issues.push(issue("invalid_workflow_definition", "node position must be finite", { nodeKey, field: "position" }))
    }
    if (!isRecord(candidate.config)) issues.push(issue("invalid_workflow_definition", "node config must be an object", { nodeKey, field: "config" }))
  }

  const edgeKeys = new Set<string>()
  for (const candidate of value.edges) {
    if (!isRecord(candidate)) {
      issues.push(issue("invalid_workflow_definition", "edge must be an object", { field: "edges" }))
      continue
    }
    const edgeKey = typeof candidate.edgeKey === "string" ? candidate.edgeKey : undefined
    if (!edgeKey) issues.push(issue("invalid_workflow_definition", "edgeKey is required", { edgeKey, field: "edgeKey" }))
    else if (edgeKeys.has(edgeKey)) issues.push(issue("duplicate_workflow_edge_key", `Duplicate edgeKey: ${edgeKey}`, { edgeKey }))
    else edgeKeys.add(edgeKey)
    const sourceNodeKey = typeof candidate.sourceNodeKey === "string" ? candidate.sourceNodeKey : undefined
    const targetNodeKey = typeof candidate.targetNodeKey === "string" ? candidate.targetNodeKey : undefined
    if (!sourceNodeKey || !targetNodeKey || !nodeKeys.has(sourceNodeKey) || !nodeKeys.has(targetNodeKey)) {
      issues.push(issue("dangling_workflow_edge", "Edge references a missing node", { edgeKey }))
      continue
    }
    for (const field of ["sourcePortId", "targetPortId"] as const) {
      if (typeof candidate[field] !== "string" || !candidate[field]) {
        issues.push(issue("invalid_port_connection", `${field} is required`, { edgeKey, field }))
      }
    }
    const sourceNode = value.nodes.find((node) => isRecord(node) && node.nodeKey === sourceNodeKey)
    const targetNode = value.nodes.find((node) => isRecord(node) && node.nodeKey === targetNodeKey)
    const sourceDefinition = sourceNode && typeof sourceNode.type === "string" ? workflowNodeRegistry.get(sourceNode.type) : null
    const targetDefinition = targetNode && typeof targetNode.type === "string" ? workflowNodeRegistry.get(targetNode.type) : null
    if (sourceDefinition && typeof candidate.sourcePortId === "string" && !sourceDefinition.outputs.some((port) => port.id === candidate.sourcePortId)) {
      issues.push(issue("invalid_port_connection", "sourcePortId is not declared by source node", { edgeKey, field: "sourcePortId" }))
    }
    if (targetDefinition && typeof candidate.targetPortId === "string" && !targetDefinition.inputs.some((port) => port.id === candidate.targetPortId)) {
      issues.push(issue("invalid_port_connection", "targetPortId is not declared by target node", { edgeKey, field: "targetPortId" }))
    }
    if (sourceDefinition && targetDefinition && typeof candidate.sourcePortId === "string" && typeof candidate.targetPortId === "string") {
      const sourcePort = sourceDefinition.outputs.find((port) => port.id === candidate.sourcePortId)
      const targetPort = targetDefinition.inputs.find((port) => port.id === candidate.targetPortId)
      if (sourcePort && targetPort && !areWorkflowPortsCompatible(sourcePort, targetPort)) {
        issues.push(issue("invalid_port_connection", "Source and target ports are not compatible", { edgeKey }))
      }
    }
  }
  issues.push(...detectCycles(value.nodes as WorkflowDefinitionNodeV2[], value.edges as WorkflowDefinitionEdgeV2[]))
  if (typeof value.definitionHash === "string" && /^[a-f0-9]{64}$/.test(value.definitionHash)) {
    const expectedHash = hashWorkflowDefinition(value as WorkflowDefinitionEnvelopeV2)
    if (value.definitionHash !== expectedHash) {
      issues.push(issue("invalid_workflow_definition", "definitionHash does not match canonical definition", { field: "definitionHash" }))
    }
  } else if (typeof value.definitionHash === "string") {
    issues.push(issue("invalid_workflow_definition", "definitionHash must be a lowercase SHA-256 hex digest", { field: "definitionHash" }))
  }
  return issues
}

function detectCycles(nodes: WorkflowDefinitionNodeV2[], edges: WorkflowDefinitionEdgeV2[]) {
  const adjacency = new Map<string, string[]>()
  for (const node of nodes) adjacency.set(node.nodeKey, [])
  for (const edge of edges) {
    const targets = adjacency.get(edge.sourceNodeKey)
    if (targets) targets.push(edge.targetNodeKey)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const issues: WorkflowValidationIssue[] = []
  const visit = (nodeKey: string): boolean => {
    if (visiting.has(nodeKey)) return true
    if (visited.has(nodeKey)) return false
    visiting.add(nodeKey)
    for (const target of adjacency.get(nodeKey) ?? []) if (visit(target)) return true
    visiting.delete(nodeKey)
    visited.add(nodeKey)
    return false
  }
  for (const node of nodes) {
    if (visit(node.nodeKey)) {
      issues.push(issue("workflow_cycle_detected", "Workflow graph contains a cycle", { nodeKey: node.nodeKey }))
      break
    }
  }
  return issues
}

/** Parse and validate an already-migrated v2 envelope. */
export function parseWorkflowDefinitionEnvelope(value: unknown): WorkflowDefinitionEnvelopeV2 {
  const issues = validateWorkflowDefinitionEnvelope(value)
  if (issues.length) throw new WorkflowDefinitionValidationError(issues)
  return canonicalizeWorkflowDefinition(value as WorkflowDefinitionEnvelopeV2)
}

export function validateWorkflowPortDefinition(port: unknown, field = "port") {
  return validatePortShape(port, "", field)
}
