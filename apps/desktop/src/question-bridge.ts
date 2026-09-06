import { parseWorkbenchQuestionEvent, parseWorkbenchQuestionRequest, type WorkbenchQuestionClient, type WorkbenchQuestionRequest } from "@coworkany/workbench-client";
import type { TauriBridge } from "./tauri";

function parseFrame(raw: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw.slice(raw.indexOf(":") + 1));
    return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

/** Uses the same framed host_send/runtime-response channel as permissions. */
export function createQuestionBridge(bridge: TauriBridge): WorkbenchQuestionClient {
  async function command(type: string, payload: Record<string, unknown>) {
    await bridge.invoke("host_start");
    const requestId = `question-command-${globalThis.crypto.randomUUID()}`;
    let disposeResponse: (() => void) | undefined;
    let disposeLog: (() => void) | undefined;
    try {
      // Install the response listener before sending; ignore streaming events even
      // when their envelope happens to carry a matching correlation ID.
      let resolveResponse!: (frame: Record<string, unknown>) => void;
      let rejectResponse!: (error: Error) => void;
      const response = new Promise<Record<string, unknown>>((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
      disposeResponse = await bridge.listen<{ raw: string }>("desktop://runtime-response", ({ raw }) => {
        const frame = parseFrame(raw);
        if (frame?.requestId === requestId && typeof frame.ok === "boolean") resolveResponse(frame);
      });
      disposeLog = await bridge.listen<{ raw: string }>("desktop://runtime-log", ({ raw }) => {
        if (raw.includes("workflow_host_exit")) rejectResponse(new Error("workflow_host_exit"));
      });
      await bridge.invoke("host_send", { message: { version: 1, requestId, sessionId: payload.sessionId, type, payload } });
      const result = await response;
      if (result.ok !== true) {
        const error = result.error as { message?: string; code?: string } | undefined;
        throw new Error(error?.message ?? error?.code ?? "question_command_failed");
      }
      return result.data;
    } finally {
      disposeResponse?.();
      disposeLog?.();
    }
  }
  return {
    async list(sessionId) {
      const data = await command("question.list", { sessionId });
      const pending = (data as { questions?: unknown } | undefined)?.questions;
      if (!Array.isArray(pending)) throw new Error("question_list_invalid");
      return pending.map((item: unknown) => {
        if (!item || typeof item !== "object") return undefined;
        const row = item as Record<string, unknown>;
        return parseWorkbenchQuestionRequest({ ...row, requestId: row.id, sessionId: row.sessionID });
      }).filter((request): request is WorkbenchQuestionRequest => request !== undefined && request.sessionId === sessionId);
    },
    async reply(payload) { await command("question.reply", payload); },
    async reject(payload) { await command("question.reject", payload); },
    async subscribe(sessionId, onEvent) {
      return bridge.listen<{ raw: string }>("desktop://runtime-response", ({ raw }) => {
        const data = parseFrame(raw)?.data as { event?: unknown } | undefined;
        const event = parseWorkbenchQuestionEvent(data?.event);
        if (event && (sessionId === null || event.sessionId === sessionId)) onEvent(event);
      });
    },
  };
}
