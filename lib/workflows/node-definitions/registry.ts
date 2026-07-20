import { WORKFLOW_BUILTIN_NODE_DEFINITIONS } from "@/lib/workflows/node-definitions/builtins"
import {
  WORKFLOW_NODE_TYPES,
  WORKFLOW_VALUE_KINDS,
  type WorkflowFieldDefinition,
  type WorkflowNodeDefinitionV2,
  type WorkflowNodeRegistry,
  type WorkflowNodeType,
  type WorkflowRegistryError,
} from "@/lib/workflows/node-definitions/types"
import type { WorkflowPortDefinition } from "@/lib/workflows/node-definitions/types"

const registryByType = new Map<string, WorkflowNodeDefinitionV2>()
for (const definition of WORKFLOW_BUILTIN_NODE_DEFINITIONS) {
  registryByType.set(definition.type, definition)
}

const WORKFLOW_RENDERERS = new Set<WorkflowFieldDefinition["rendererId"]>([
  "text",
  "textarea",
  "number",
  "select",
  "toggle",
  "asset",
  "model",
  "agent",
  "dataset",
  "custom",
])

const WORKFLOW_CATEGORIES = new Set<WorkflowNodeDefinitionV2["category"]>([
  "input",
  "control",
  "ai",
  "media",
  "integration",
  "output",
])

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function matchesFieldType(field: WorkflowFieldDefinition, value: unknown) {
  if (value === undefined) return !field.required
  if (field.valueType === "object") {
    // Asset pickers commonly persist a list of asset records even though the
    // renderer exposes an object-shaped value to the editor.
    return typeof value === "object" && value !== null && (field.rendererId === "asset" || !Array.isArray(value))
  }
  if (field.valueType === "string[]") return Array.isArray(value) && value.every((item) => typeof item === "string")
  if (field.valueType === "number") return typeof value === "number" && Number.isFinite(value)
  if (field.valueType === "boolean") return typeof value === "boolean"
  return typeof value === "string"
}

function validateDefinition(definition: WorkflowNodeDefinitionV2, allTypes: Set<string>): WorkflowRegistryError[] {
  const errors: WorkflowRegistryError[] = []
  if (!definition.type || allTypes.has(definition.type)) {
    errors.push({ code: "workflow_registry_duplicate_type", nodeType: definition.type })
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    errors.push({ code: "workflow_registry_invalid_version", nodeType: definition.type, field: "version" })
  }
  if (!WORKFLOW_NODE_TYPES.includes(definition.type as WorkflowNodeType)) {
    errors.push({ code: "workflow_registry_duplicate_type", nodeType: definition.type, field: "type" })
  }
  if (!WORKFLOW_CATEGORIES.has(definition.category)) {
    errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: "category" })
  }
  if (!definition.executorId.trim()) {
    errors.push({ code: "workflow_registry_executor_missing", nodeType: definition.type, field: "executorId" })
  }
  for (const direction of ["inputs", "outputs"] as const) {
    const ids = new Set<string>()
    for (const port of definition[direction]) {
      if (
        !port.id.trim() ||
        ids.has(port.id) ||
        !(WORKFLOW_VALUE_KINDS as readonly string[]).includes(port.valueKind) ||
        !["one", "many"].includes(port.cardinality) ||
        (port.cardinality === "one" && port.maxItems !== undefined && port.maxItems > 1) ||
        (port.minItems !== undefined && (!Number.isInteger(port.minItems) || port.minItems < 0)) ||
        (port.maxItems !== undefined && (!Number.isInteger(port.maxItems) || port.maxItems < 1)) ||
        (port.minItems !== undefined && port.maxItems !== undefined && port.minItems > port.maxItems)
      ) {
        errors.push({ code: "workflow_registry_invalid_port", nodeType: definition.type, field: port.id })
      }
      ids.add(port.id)
    }
  }
  const fieldIds = new Set<string>()
  for (const field of definition.configSchema) {
    if (!field.id.trim() || fieldIds.has(field.id) || !WORKFLOW_RENDERERS.has(field.rendererId)) {
      errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: field.id })
    }
    if (field.rendererId === "custom" && !field.extensionId) {
      errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: field.id })
    }
    if (field.rendererId !== "custom" && field.extensionId) {
      errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: field.id })
    }
    if (field.rendererId === "select" && (!field.options || field.options.length === 0)) {
      errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: field.id })
    }
    if (field.defaultValue !== undefined && !matchesFieldType(field, field.defaultValue)) {
      errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: field.id })
    }
    fieldIds.add(field.id)
  }
  for (const key of Object.keys(definition.defaultConfig)) {
    const field = definition.configSchema.find((item) => item.id === key)
    if (!field || !matchesFieldType(field, definition.defaultConfig[key])) {
      errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: key })
    }
  }
  for (const field of definition.configSchema) {
    if (field.required && !hasOwn(definition.defaultConfig, field.id) && field.defaultValue === undefined) {
      errors.push({ code: "workflow_registry_invalid_default_config", nodeType: definition.type, field: field.id })
    }
  }
  return errors
}

const errors = (() => {
  const seen = new Set<string>()
  const result: WorkflowRegistryError[] = []
  for (const definition of WORKFLOW_BUILTIN_NODE_DEFINITIONS) {
    result.push(...validateDefinition(definition, seen))
    seen.add(definition.type)
  }
  return result
})()

export const workflowNodeRegistry: WorkflowNodeRegistry = {
  get(type: string) {
    return registryByType.get(type) ?? null
  },
  require(type: string) {
    const definition = registryByType.get(type)
    if (!definition) throw new Error("unsupported_node_type")
    return definition
  },
  list() {
    return WORKFLOW_BUILTIN_NODE_DEFINITIONS
  },
  validate() {
    return errors
  },
}

/**
 * Canonical edge compatibility rule shared by the canvas, compiler, and
 * persisted-definition validator.  A generic asset output may feed a
 * concrete media input; all other value kinds must match exactly.  A
 * specialized semantic role is compatible with an unspecified role, but two
 * different explicit roles are never interchangeable.  A single-valued
 * target cannot accept a fan-out port.
 */
export function areWorkflowPortsCompatible(source: WorkflowPortDefinition, target: WorkflowPortDefinition) {
  const valueCompatible = source.valueKind === target.valueKind ||
    (source.valueKind === "asset" && ["image", "video", "audio", "ppt"].includes(target.valueKind))
  if (!valueCompatible) return false
  if (source.role && target.role && source.role !== target.role) return false
  if (source.cardinality === "many" && target.cardinality === "one") return false
  return true
}

export function getWorkflowNodeDefinitionV2(type: WorkflowNodeType | string) {
  return workflowNodeRegistry.get(type)
}
