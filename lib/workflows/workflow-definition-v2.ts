// SaaS compatibility surface. Host-neutral definition semantics live in the
// shared core so desktop and web validate and hash the same workflow payload.
export {
  canonicalizeWorkflowDefinition,
  canonicalizeWorkflowDefinitionJson,
  canonicalJson,
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  hashWorkflowDefinition,
  LEGACY_WORKFLOW_SCHEMA_VERSION,
  parseWorkflowDefinitionEnvelope,
  validateWorkflowDefinition,
  validateWorkflowDefinitionEnvelope,
  validateWorkflowPortDefinition,
  WorkflowDefinitionValidationError,
} from "@aimarketing/workflow-core"

export type {
  WorkflowDefinitionEdgeV2,
  WorkflowDefinitionEnvelopeV2,
  WorkflowDefinitionNodeV2,
  WorkflowDefinitionPortRole,
  WorkflowDefinitionPortValueKind,
  WorkflowValidationIssue,
  WorkflowValidationIssueCode,
} from "@aimarketing/workflow-core"
