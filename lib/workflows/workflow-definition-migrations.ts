// SaaS compatibility surface. Migration identity and validation are owned by
// workflow-core; storage-specific revision assignment remains in the store.
export {
  migrateLegacyWorkflowDefinition,
  migrateWorkflowDefinitionToCurrent,
  parseAndMigrateWorkflowDefinition,
} from "@coworkany/workflow-core"

export type {
  LegacyWorkflowDefinition,
  LegacyWorkflowDefinitionEdge,
  LegacyWorkflowDefinitionNode,
  WorkflowDefinitionMigrationOptions,
} from "@coworkany/workflow-core"
