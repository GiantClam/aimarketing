import { hashWorkflowDefinition, validateWorkflowDefinition, type WorkflowDefinitionEnvelope, type WorkflowValidationIssue } from "./definition";

export type WorkflowPlanStep = { kind: "node"; nodeKey: string; dependsOn: string[] };
export type CompiledWorkflowPlan = { schemaVersion: 1; definitionHash: string; steps: WorkflowPlanStep[] };

export function compileWorkflowPlan(definition: WorkflowDefinitionEnvelope): CompiledWorkflowPlan {
  const issues = validateWorkflowDefinition(definition);
  if (issues.length > 0) throw new Error(issues.map((issue: WorkflowValidationIssue) => issue.message).join("; "));
  const dependencies = new Map(definition.nodes.map((node) => [node.nodeKey, new Set<string>()]));
  for (const edge of definition.edges) dependencies.get(edge.targetNodeKey)?.add(edge.sourceNodeKey);
  const remaining = new Set(definition.nodes.map((node) => node.nodeKey));
  const steps: WorkflowPlanStep[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((nodeKey) => [...(dependencies.get(nodeKey) ?? [])].every((dependency) => !remaining.has(dependency))).sort();
    if (ready.length === 0) throw new Error("workflow_cycle_detected");
    for (const nodeKey of ready) {
      remaining.delete(nodeKey);
      steps.push({ kind: "node", nodeKey, dependsOn: [...(dependencies.get(nodeKey) ?? [])].sort() });
    }
  }
  return { schemaVersion: 1, definitionHash: definition.definitionHash || hashWorkflowDefinition(definition), steps };
}
