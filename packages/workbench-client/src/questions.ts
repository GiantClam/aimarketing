export interface WorkbenchQuestion {
  readonly question: string;
  readonly header: string;
  readonly options: readonly { readonly label: string; readonly description: string }[];
  readonly multiple?: boolean;
  readonly custom?: boolean;
}

export interface WorkbenchQuestionRequest {
  readonly requestId: string;
  readonly sessionId: string;
  /** Pending list rows may omit runId; live events always include it. */
  readonly runId?: string;
  readonly questions: readonly WorkbenchQuestion[];
}

export type WorkbenchQuestionEvent =
  | (WorkbenchQuestionRequest & { readonly type: "question_request"; readonly runId: string })
  | { readonly type: "question_response"; readonly requestId: string; readonly sessionId: string; readonly runId: string; readonly rejected: boolean };

export interface WorkbenchQuestionClient {
  readonly list: (sessionId: string) => Promise<readonly WorkbenchQuestionRequest[]>;
  readonly reply: (payload: { sessionId: string; requestId: string; answers: string[][] }) => Promise<void>;
  readonly reject: (payload: { sessionId: string; requestId: string }) => Promise<void>;
  /** Resolves after registration so restoring pending requests cannot race the listener. */
  readonly subscribe: (sessionId: string | null, onEvent: (event: WorkbenchQuestionEvent) => void) => Promise<() => void>;
}

export interface WorkbenchQuestionDraft {
  readonly selected: readonly string[];
  readonly custom: string;
}

export function questionKey(request: Pick<WorkbenchQuestionRequest, "sessionId" | "runId" | "requestId">) {
  // OpenCode request IDs are unique within a session; keep the form stable when
  // a pending-list row acquires its run ID from a later live event.
  return JSON.stringify([request.sessionId, request.requestId]);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** OpenCode can emit generic tool progress alongside the native question events. */
export function isWorkbenchQuestionToolEvent(value: unknown): boolean {
  if (!record(value) || !["tool_event", "tool_call", "tool_result"].includes(String(value.event))) return false;
  const data = record(value.data) ? value.data : value;
  return (data.toolName ?? data.tool) === "question";
}

export function parseWorkbenchQuestionRequest(value: unknown): WorkbenchQuestionRequest | undefined {
  if (!record(value) || ![value.requestId, value.sessionId].every((id) => typeof id === "string" && id.trim())) return undefined;
  if (value.runId !== undefined && (typeof value.runId !== "string" || !value.runId.trim())) return undefined;
  if (!Array.isArray(value.questions) || !value.questions.length) return undefined;
  const questions: WorkbenchQuestion[] = [];
  for (const item of value.questions) {
    if (!record(item) || typeof item.question !== "string" || !item.question.trim() || typeof item.header !== "string" || !Array.isArray(item.options)) return undefined;
    if ((item.multiple !== undefined && typeof item.multiple !== "boolean") || (item.custom !== undefined && typeof item.custom !== "boolean")) return undefined;
    const options: { label: string; description: string }[] = [];
    for (const option of item.options) {
      if (!record(option) || typeof option.label !== "string" || !option.label.trim() || typeof option.description !== "string") return undefined;
      options.push({ label: option.label, description: option.description });
    }
    questions.push({ question: item.question, header: item.header, options, ...(typeof item.multiple === "boolean" ? { multiple: item.multiple } : {}), ...(typeof item.custom === "boolean" ? { custom: item.custom } : {}) });
  }
  return { requestId: value.requestId as string, sessionId: value.sessionId as string, ...(typeof value.runId === "string" ? { runId: value.runId } : {}), questions };
}

export function parseWorkbenchQuestionEvent(value: unknown): WorkbenchQuestionEvent | undefined {
  if (!record(value)) return undefined;
  if (value.event === "question_request") {
    const request = parseWorkbenchQuestionRequest(value);
    return request && typeof value.runId === "string" && value.runId.trim() ? { ...request, type: "question_request", runId: value.runId } : undefined;
  }
  if (value.event === "question_response" && typeof value.rejected === "boolean" && [value.requestId, value.sessionId, value.runId].every((id) => typeof id === "string" && id.trim())) {
    return { type: "question_response", requestId: value.requestId as string, sessionId: value.sessionId as string, runId: value.runId as string, rejected: value.rejected };
  }
  return undefined;
}

/** Build native answers in question/option order; null means at least one answer is incomplete. */
export function questionAnswers(questions: readonly WorkbenchQuestion[], drafts: readonly WorkbenchQuestionDraft[]): string[][] | null {
  if (!questions.length || questions.length !== drafts.length) return null;
  const answers: string[][] = [];
  for (const [index, question] of questions.entries()) {
    const draft = drafts[index]!;
    if (draft.selected.some((label) => !question.options.some((option) => option.label === label))) return null;
    const custom = question.custom !== false ? draft.custom.trim() : "";
    const selected = question.options.filter((option) => draft.selected.includes(option.label)).map((option) => option.label);
    const answer = [...new Set([...selected, ...(custom ? [custom] : [])])];
    if (!answer.length || (!question.multiple && answer.length !== 1)) return null;
    answers.push(answer);
  }
  return answers;
}
