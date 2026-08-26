"use client";

import React from "react";
import type { WorkbenchMessagePart, WorkbenchPartStatus, WorkbenchPlanStep, WorkbenchTaskStep } from "@aimarketing/workbench-client";
import { Confirmation, Message, MessageContent, Plan, Reasoning, Task, Tool } from "./ai-elements/index";

export function WorkbenchMessage({ role, label, timestamp, children, actions }: { role: "user" | "assistant"; label?: string; timestamp?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return <Message from={role}><div className="wb-ai-message-header"><strong>{label || (role === "user" ? "Your prompt" : "AI response")}</strong><span>{timestamp}</span>{actions}</div><MessageContent>{children}</MessageContent></Message>;
}

export function WorkbenchReasoning({ text, status = "running", locale = "zh" }: { text: string; status?: WorkbenchPartStatus; locale?: "zh" | "en" }) { return <Reasoning text={text} status={status === "blocked" ? "waiting" : status} locale={locale} />; }
export function WorkbenchPlan({ title, steps, status = "running", locale = "zh" }: { title?: string; steps: readonly WorkbenchPlanStep[]; status?: WorkbenchPartStatus; locale?: "zh" | "en" }) { return <Plan title={title || (locale === "zh" ? "执行计划" : "Plan")} steps={steps} status={status === "blocked" ? "waiting" : status} locale={locale} />; }
export function WorkbenchTask({ title, steps = [], status = "running", locale = "zh" }: { title: string; steps?: readonly WorkbenchTaskStep[]; status?: WorkbenchPartStatus; locale?: "zh" | "en" }) { return <Task title={title} steps={steps} status={status === "blocked" ? "waiting" : status} locale={locale} />; }
export function WorkbenchTool({ toolName, toolCallId, input, output, error, status = "running", locale = "zh", onApprove, onReject }: { toolName: string; toolCallId?: string; input?: unknown; output?: unknown; error?: string; status?: WorkbenchPartStatus; locale?: "zh" | "en"; onApprove?: () => void; onReject?: () => void }) {
  const waiting = status === "waiting" || status === "blocked";
  const confirmationStatus = waiting ? "approval-requested" : error && status === "failed" ? "output-denied" : output !== undefined ? "output-available" : undefined;
  return <Tool toolName={toolName} toolCallId={toolCallId} input={input} output={output} error={error} status={status === "blocked" ? "waiting" : status} locale={locale}>{confirmationStatus && (onApprove || onReject) ? <Confirmation status={confirmationStatus} onApprove={onApprove} onReject={onReject}>{waiting ? (locale === "zh" ? "此工具调用需要审批" : "This tool call requires approval") : error ? error : (locale === "zh" ? "工具输出已就绪" : "Tool output available")}</Confirmation> : null}</Tool>;
}

export function renderWorkbenchProcessPart(part: WorkbenchMessagePart, locale: "zh" | "en", actions?: { onToolApproval?: (part: Extract<WorkbenchMessagePart, { type: "tool-call" }>, decision: "approve" | "reject") => void }) {
  if (part.type === "reasoning") return <WorkbenchReasoning key={part.id} text={part.text} status={part.status} locale={locale} />;
  if (part.type === "plan") return <WorkbenchPlan key={part.id} title={part.title} steps={part.steps} status={part.status} locale={locale} />;
  if (part.type === "task") return <WorkbenchTask key={part.id} title={part.title} steps={part.steps} status={part.status} locale={locale} />;
  if (part.type === "tool-call") return <WorkbenchTool key={part.id} toolName={part.toolName} toolCallId={part.toolCallId} input={part.input} output={part.output} error={part.error} status={part.status} locale={locale} onApprove={actions?.onToolApproval ? () => actions.onToolApproval?.(part, "approve") : undefined} onReject={actions?.onToolApproval ? () => actions.onToolApproval?.(part, "reject") : undefined} />;
  return null;
}
