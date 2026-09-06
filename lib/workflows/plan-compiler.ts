// SaaS compatibility surface. Graph compilation and deterministic iteration
// behavior are shared with desktop through workflow-core.
export {
  assertWorkflowIterationCount,
  compileWorkflowPlan,
  createWorkflowIterationKeys,
  sortWorkflowIterationsForCollect,
  WorkflowPlanCompilationError,
} from "@coworkany/workflow-core"

export type {
  CompiledWorkflowPlan,
  CompiledWorkflowPlanStep,
  WorkflowCollectedIteration,
  WorkflowIterationKeyInput,
  WorkflowPlanDefinition,
  WorkflowPlanEdge,
  WorkflowPlanIssue,
  WorkflowPlanIssueCode,
  WorkflowPlanLimits,
  WorkflowPlanNode,
} from "@coworkany/workflow-core"
