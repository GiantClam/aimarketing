import type { WorkflowDefinitionEnvelope } from "@aimarketing/workflow-core";

const SENSITIVE_CONFIG_KEY = /(?:^|[_-])(api[_-]?key|access[_-]?token|authorization|secret|password|token)(?:$|[_-])/iu;

function stripSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_CONFIG_KEY.test(key))
      .map(([key, child]) => [key, stripSensitiveValue(child)]),
  );
}

/**
 * Provider credentials are transport-only. A workflow definition may be
 * saved, exported, imported, or sent to the local host, so node config never
 * carries a credential; the current Provider payload supplies it in memory.
 */
export function sanitizeWorkflowDefinitionForStorage(definition: WorkflowDefinitionEnvelope): WorkflowDefinitionEnvelope {
  return {
    ...definition,
    nodes: definition.nodes.map((node) => ({
      ...node,
      config: stripSensitiveValue(node.config) as Record<string, unknown>,
    })),
  };
}
