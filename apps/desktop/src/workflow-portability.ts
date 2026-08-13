import { parseAndMigrateWorkflowDefinition, type WorkflowDefinitionEnvelope } from "@aimarketing/workflow-core";
import { sanitizeWorkflowDefinitionForStorage } from "./workflow-storage";

export type WorkflowExportPayload = {
  format: "aimarketing-workflow";
  exportedAt: string;
  definition: WorkflowDefinitionEnvelope;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function createWorkflowExportPayload(definition: WorkflowDefinitionEnvelope, exportedAt = new Date().toISOString()): WorkflowExportPayload {
  return {
    format: "aimarketing-workflow",
    exportedAt,
    definition: sanitizeWorkflowDefinitionForStorage(definition),
  };
}

export function serializeWorkflowExport(definition: WorkflowDefinitionEnvelope, exportedAt?: string): string {
  return JSON.stringify(createWorkflowExportPayload(definition, exportedAt), null, 2);
}

export function parseWorkflowImportPayload(value: unknown): WorkflowDefinitionEnvelope {
  const rawDefinition = isRecord(value) && "definition" in value ? value.definition : value;
  if (!isRecord(rawDefinition) || !Array.isArray(rawDefinition.nodes) || !Array.isArray(rawDefinition.edges)) throw new Error("invalid_workflow_file");
  return sanitizeWorkflowDefinitionForStorage(parseAndMigrateWorkflowDefinition(rawDefinition as WorkflowDefinitionEnvelope));
}

export function parseWorkflowImportText(text: string): WorkflowDefinitionEnvelope {
  return parseWorkflowImportPayload(JSON.parse(text) as unknown);
}
