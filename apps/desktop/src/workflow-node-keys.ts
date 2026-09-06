import type { WorkflowDefinitionEnvelope, WorkflowDefinitionNodeV2 } from "@coworkany/workflow-core";

let fallbackSequence = 0;

function nodeKeyBase(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized || "node";
}

export function createUniqueWorkflowNodeKey(type: string, nodes: readonly Pick<WorkflowDefinitionNodeV2, "nodeKey">[]) {
  const existing = new Set(nodes.map((node) => node.nodeKey));
  const base = nodeKeyBase(type);
  let candidate = `${base}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${fallbackSequence += 1}`}`;
  while (existing.has(candidate)) {
    candidate = `${base}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${fallbackSequence += 1}`}`;
  }
  return candidate;
}

/**
 * Repairs imported legacy graphs whose duplicate node keys make React reconciliation unsafe.
 * Existing edges keep their original key and therefore remain attached to the first occurrence.
 */
export function repairWorkflowNodeKeys(definition: WorkflowDefinitionEnvelope) {
  const reserved = new Set(definition.nodes.map((node) => node.nodeKey));
  const used = new Set<string>();
  const occurrences = new Map<string, number>();
  let changed = false;
  const nodes = definition.nodes.map((node) => {
    const original = nodeKeyBase(node.nodeKey);
    const occurrence = (occurrences.get(original) ?? 0) + 1;
    occurrences.set(original, occurrence);
    if (node.nodeKey === original && !used.has(original)) {
      used.add(original);
      return node;
    }
    let suffix = occurrence;
    let nodeKey = `${original}-recovered-${suffix}`;
    while (used.has(nodeKey) || reserved.has(nodeKey)) {
      suffix += 1;
      nodeKey = `${original}-recovered-${suffix}`;
    }
    used.add(nodeKey);
    changed = true;
    return { ...node, nodeKey };
  });
  return changed ? { ...definition, nodes } : definition;
}
