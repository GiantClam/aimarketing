import type { WorkflowDefinitionEnvelope } from "@aimarketing/workflow-core";

const SENSITIVE_CONFIG_KEY = /(?:^|[_-])(api[_-]?key|access[_-]?token|authorization|secret|password|token)(?:$|[_-])/iu;
const NON_PORTABLE_CONFIG_KEY = /^(?:(?:referenced[_-]?)?artifact[_-]?ids?|checkpoint[_-]?key|conversation[_-]?id|idempotency[_-]?key|project[_-]?id|provider[_-]?task[_-]?id|run[_-]?id|session[_-]?id)$/iu;
const PROVIDER_BINDING_CONFIG_KEY = /^(?:base[_-]?url|endpoint|model|provider|query[_-]?endpoint)$/iu;
const PATH_CONFIG_KEY = /(?:^|[_-])(file|index|source|target|vault|workspace|path|uploaded[_-]?files)(?:$|[_-])/iu;

function isAbsolutePath(value: string) {
  return /^(?:[a-z]:[\\/]|\\\\|\/)/iu.test(value.trim());
}

function portableKey(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
}

function stripPortableValue(value: unknown, key = ""): unknown {
  const normalizedKey = portableKey(key);
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" && PATH_CONFIG_KEY.test(normalizedKey) && isAbsolutePath(item) ? undefined : stripPortableValue(item, key))).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([childKey, child]) => { const normalizedChildKey = portableKey(childKey); return !SENSITIVE_CONFIG_KEY.test(normalizedChildKey) && !NON_PORTABLE_CONFIG_KEY.test(normalizedChildKey) && !PROVIDER_BINDING_CONFIG_KEY.test(normalizedChildKey) && !(PATH_CONFIG_KEY.test(normalizedChildKey) && typeof child === "string" && isAbsolutePath(child)); })
      .map(([childKey, child]) => [childKey, stripPortableValue(child, childKey)])
      .filter(([, child]) => child !== undefined),
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
      config: stripPortableValue(node.config) as Record<string, unknown>,
    })),
  };
}
