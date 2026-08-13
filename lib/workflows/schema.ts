/**
 * Compatibility export. Workflow schema types and helpers have one owner in
 * workflow-core; SaaS-specific execution remains in this host layer.
 */
export {
  WORKFLOW_NODE_TYPES,
  WORKFLOW_VALUE_KINDS,
  canWorkflowNodeAcceptValueKind,
  canWorkflowNodeConnectValueKind,
  getAllowedWorkflowTargetInputKinds,
  getDefaultWorkflowNodeTitle,
  getWorkflowNodeDefinition,
  getWorkflowNodeOutputKinds,
  isDefaultWorkflowNodeTitle,
  isWorkflowFileKind,
  isWorkflowNodeType,
  isWorkflowValueKind,
  resolveWorkflowNodeTitle,
} from "@aimarketing/workflow-core"

export type {
  WorkflowDefinitionEdge,
  WorkflowDefinitionNode,
  WorkflowLocale,
  WorkflowNodeDefinition,
  WorkflowNodeInputName,
  WorkflowNodeType,
  WorkflowValueKind,
} from "@aimarketing/workflow-core"
