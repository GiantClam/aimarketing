// SaaS compatibility surface. Migration identity and validation are owned by
// workflow-core; storage-specific revision assignment remains in the store.
export {
  migrateLegacyWorkflowDefinition,
  migrateWorkflowDefinitionToCurrent,
  parseAndMigrateWorkflowDefinition,
} from "@aimarketing/workflow-core"

export type {
  LegacyWorkflowDefinition,
  LegacyWorkflowDefinitionEdge,
  LegacyWorkflowDefinitionNode,
  WorkflowDefinitionMigrationOptions,
} from "@aimarketing/workflow-core"
