import type { WorkbenchMessagePart, WorkbenchPartStatus, WorkbenchPlanStep, WorkbenchTaskStep } from "@aimarketing/workbench-client";
import type { AttachmentItem, AIElementStatus, ModelOption, PlanStep, TaskStep } from "../ai-elements/source";

export function toAIElementStatus(status: WorkbenchPartStatus | undefined): AIElementStatus {
  if (status === "blocked") return "waiting";
  return status ?? "running";
}

export function toAIElementAttachment(item: Extract<WorkbenchMessagePart, { type: "attachment" }>): AttachmentItem {
  return { id: item.id, name: item.name, mediaType: item.mediaType, uri: item.uri, status: item.status };
}

export function toAIElementModel(item: { id: string; label: string; provider?: string; description?: string }): ModelOption {
  return { id: item.id, label: item.label, provider: item.provider, description: item.description };
}

export function toAIElementPlanStep(step: WorkbenchPlanStep): PlanStep {
  return { id: step.id, title: step.title, ...(step.detail ? { detail: step.detail } : {}), status: toAIElementStatus(step.status) };
}

export function toAIElementTaskStep(step: WorkbenchTaskStep): TaskStep {
  return { ...toAIElementPlanStep(step), toolName: step.toolName };
}

export function groupReasoningParts(parts: readonly WorkbenchMessagePart[]) {
  return parts.filter((part): part is Extract<WorkbenchMessagePart, { type: "reasoning" }> => part.type === "reasoning").reduce((text, part) => `${text}${text ? "\n" : ""}${part.text}`, "");
}

export function isKnownAIElementPart(part: WorkbenchMessagePart) {
  return part.type === "text" || part.type === "reasoning" || part.type === "plan" || part.type === "task" || part.type === "tool-call" || part.type === "attachment" || part.type === "source" || part.type === "artifact" || part.type === "report";
}
