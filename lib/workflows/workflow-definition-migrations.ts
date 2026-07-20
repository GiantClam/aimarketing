import { workflowNodeRegistry } from "@/lib/workflows/node-definitions/registry"
import {
  canonicalizeWorkflowDefinition,
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  hashWorkflowDefinition,
  LEGACY_WORKFLOW_SCHEMA_VERSION,
  parseWorkflowDefinitionEnvelope,
  type WorkflowDefinitionEdgeV2,
  type WorkflowDefinitionEnvelopeV2,
  type WorkflowDefinitionNodeV2,
} from "@/lib/workflows/workflow-definition-v2"

export type LegacyWorkflowDefinitionNode = {
  nodeKey: string
  type: string
  title?: string | null
  positionX?: number | null
  positionY?: number | null
  config?: Record<string, unknown> | null
  nodeVersion?: number | null
  [key: string]: unknown
}

export type LegacyWorkflowDefinitionEdge = {
  id?: number | string | null
  sourceNodeKey: string
  targetNodeKey: string
  inputName?: string | null
  [key: string]: unknown
}

export type LegacyWorkflowDefinition = {
  schemaVersion?: number | null
  revision?: number | null
  definitionHash?: string | null
  nodes: LegacyWorkflowDefinitionNode[]
  edges: LegacyWorkflowDefinitionEdge[]
  [key: string]: unknown
}

export type WorkflowDefinitionMigrationOptions = {
  revision?: number
  /** Optional database edge ids when the payload does not contain ids. */
  edgeIds?: Array<number | string | null | undefined>
}

const INPUT_PORT_BY_NAME: Record<string, string> = {
  text: "text",
  assets: "assets",
  asset: "assets",
  images: "images",
  image: "images",
  videos: "videos",
  video: "videos",
  audios: "audios",
  audio: "audios",
  presentations: "presentations",
  presentation: "presentations",
  ppt: "presentations",
}

const OUTPUT_PORT_BY_NAME: Record<string, string> = {
  text: "text",
  assets: "asset",
  asset: "asset",
  images: "image",
  image: "image",
  videos: "video",
  video: "video",
  audios: "audio",
  audio: "audio",
  presentations: "ppt",
  presentation: "ppt",
  ppt: "ppt",
}

function cloneConfig(config: Record<string, unknown> | null | undefined) {
  // Config is persisted JSON. Structured cloning avoids mutating caller-owned
  // nested values while preserving unknown fields during migration.
  return config ? (JSON.parse(JSON.stringify(config)) as Record<string, unknown>) : {}
}

function compareLegacyIds(left: number | string | null | undefined, right: number | string | null | undefined) {
  if (typeof left === "number" && typeof right === "number") return left - right
  if (left == null && right != null) return 1
  if (left != null && right == null) return -1
  return String(left ?? "").localeCompare(String(right ?? ""))
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function getRegisteredPortId(node: LegacyWorkflowDefinitionNode | undefined, inputName: string | null | undefined, direction: "inputs" | "outputs") {
  const definition = node ? workflowNodeRegistry.get(node.type) : null
  if (!definition) return direction === "inputs" ? INPUT_PORT_BY_NAME[inputName ?? ""] ?? inputName ?? "input" : OUTPUT_PORT_BY_NAME[inputName ?? ""] ?? inputName ?? "output"
  const wanted = direction === "inputs" ? INPUT_PORT_BY_NAME[inputName ?? ""] : OUTPUT_PORT_BY_NAME[inputName ?? ""]
  if (wanted && definition[direction].some((port) => port.id === wanted)) return wanted
  // A legacy edge may have omitted inputName. Prefer a semantically matching
  // value kind, then fall back to the first stable Registry port.
  if (inputName) {
    const aliases = new Set([inputName, INPUT_PORT_BY_NAME[inputName], OUTPUT_PORT_BY_NAME[inputName]])
    const byAlias = definition[direction].find((port) => aliases.has(port.id))
    if (byAlias) return byAlias.id
  }
  return definition[direction][0]?.id ?? (direction === "inputs" ? "input" : "output")
}

function edgeId(edge: LegacyWorkflowDefinitionEdge, index: number, options: WorkflowDefinitionMigrationOptions) {
  return edge.id ?? options.edgeIds?.[index] ?? null
}

function semanticEdgeTuple(edge: {
  sourceNodeKey: string
  targetNodeKey: string
  sourcePortId: string
  targetPortId: string
  inputName?: string | null
}) {
  // Delimiters are length-prefixed so two different legacy names cannot
  // collide merely because they contain ':' or another separator.
  return [edge.sourceNodeKey, edge.sourcePortId, edge.targetNodeKey, edge.targetPortId, edge.inputName ?? ""]
    .map((value) => `${value.length}:${value}`)
    .join("|")
}

/**
 * Convert the normalized v1 nodes/edges payload into the current envelope.
 * This function is pure and does not assign database revisions or write rows.
 */
export function migrateWorkflowDefinitionToCurrent(
  input: LegacyWorkflowDefinition | WorkflowDefinitionEnvelopeV2,
  options: WorkflowDefinitionMigrationOptions = {},
): WorkflowDefinitionEnvelopeV2 {
  if ((input as WorkflowDefinitionEnvelopeV2).schemaVersion === CURRENT_WORKFLOW_SCHEMA_VERSION) {
    const current = input as WorkflowDefinitionEnvelopeV2
    const canonical = canonicalizeWorkflowDefinition({
      ...current,
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      revision: Number.isInteger(current.revision) && current.revision > 0 ? current.revision : options.revision ?? 1,
      nodes: current.nodes.map((node) => ({ ...node, config: cloneConfig(node.config) })),
      edges: current.edges.map((edge) => ({ ...edge })),
    })
    // Keep migration idempotent while making a missing/stale hash repairable.
    return { ...canonical, definitionHash: hashWorkflowDefinition(canonical) }
  }

  const legacy = input as LegacyWorkflowDefinition
  const revision = Number.isInteger(options.revision) && Number(options.revision) > 0
    ? Number(options.revision)
    : Number.isInteger(legacy.revision) && Number(legacy.revision) > 0
      ? Number(legacy.revision)
      : 1
  const nodes: WorkflowDefinitionNodeV2[] = legacy.nodes.map((node) => {
    const registered = workflowNodeRegistry.get(node.type)
    return {
      nodeKey: node.nodeKey,
      type: node.type,
      nodeVersion: Number.isInteger(node.nodeVersion) && Number(node.nodeVersion) > 0
        ? Number(node.nodeVersion)
        : registered?.version ?? 1,
      title: typeof node.title === "string" ? node.title : registered?.title.en ?? node.type,
      positionX: Number.isFinite(node.positionX) ? Number(node.positionX) : 0,
      positionY: Number.isFinite(node.positionY) ? Number(node.positionY) : 0,
      config: cloneConfig(node.config),
    }
  })
  const nodesByKey = new Map(nodes.map((node) => [node.nodeKey, node]))
  const indexedEdges = legacy.edges.map((edge, index) => {
    const inputName = edge.inputName ?? null
    const sourceNode = nodesByKey.get(edge.sourceNodeKey)
    const targetNode = nodesByKey.get(edge.targetNodeKey)
    const sourcePortId = getRegisteredPortId(sourceNode, inputName, "outputs")
    const targetPortId = getRegisteredPortId(targetNode, inputName, "inputs")
    return { edge, index, id: edgeId(edge, index, options), inputName, sourcePortId, targetPortId,
      tuple: semanticEdgeTuple({ sourceNodeKey: edge.sourceNodeKey, targetNodeKey: edge.targetNodeKey, sourcePortId, targetPortId, inputName }) }
  })
  const hasDatabaseIds = indexedEdges.some((item) => item.id !== null && item.id !== undefined)
  indexedEdges.sort((left, right) => {
    if (hasDatabaseIds) return compareLegacyIds(left.id, right.id) || compareStrings(left.tuple, right.tuple) || left.index - right.index
    return compareStrings(left.tuple, right.tuple) || left.index - right.index
  })
  const tupleOrdinals = new Map<string, number>()
  const edges: WorkflowDefinitionEdgeV2[] = indexedEdges.map(({ edge, inputName, sourcePortId, targetPortId, tuple }) => {
    const ordinal = tupleOrdinals.get(tuple) ?? 0
    tupleOrdinals.set(tuple, ordinal + 1)
    const legacyName = inputName ?? "input"
    return {
      edgeKey: `legacy:${edge.sourceNodeKey}:${edge.targetNodeKey}:${legacyName}:${ordinal}`,
      sourceNodeKey: edge.sourceNodeKey,
      sourcePortId,
      targetNodeKey: edge.targetNodeKey,
      targetPortId,
      inputName,
    }
  })
  const migrated: WorkflowDefinitionEnvelopeV2 = {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    revision,
    definitionHash: "",
    nodes,
    edges,
  }
  const canonical = canonicalizeWorkflowDefinition(migrated)
  return { ...canonical, definitionHash: hashWorkflowDefinition(canonical) }
}

/** Alias with a more explicit name for callers that only accept v1 payloads. */
export function migrateLegacyWorkflowDefinition(
  input: LegacyWorkflowDefinition,
  options?: WorkflowDefinitionMigrationOptions,
) {
  return migrateWorkflowDefinitionToCurrent({ ...input, schemaVersion: input.schemaVersion ?? LEGACY_WORKFLOW_SCHEMA_VERSION }, options)
}

/** Parse v2 or migrate v1, then validate the resulting envelope. */
export function parseAndMigrateWorkflowDefinition(
  input: LegacyWorkflowDefinition | WorkflowDefinitionEnvelopeV2,
  options?: WorkflowDefinitionMigrationOptions,
) {
  return parseWorkflowDefinitionEnvelope(migrateWorkflowDefinitionToCurrent(input, options))
}
