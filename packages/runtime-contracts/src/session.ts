import type { OpenCodeRuntimeEvent } from "./opencode";

export interface OpenCodeSessionTransport {
  request<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
  subscribe(runId: string, onEvent: (event: OpenCodeRuntimeEvent) => void): () => void;
}

export interface OpenCodeSessionRef { readonly conversationId: string; readonly sessionId: string; readonly workspacePath: string; }

export class OpenCodeSessionClient {
  constructor(private readonly transport: OpenCodeSessionTransport) {}

  create(conversationId: string, workspacePath: string, signal?: AbortSignal) {
    return this.transport.request<OpenCodeSessionRef>("session.create", { conversationId, workspacePath }, signal);
  }

  prompt(session: OpenCodeSessionRef, prompt: string, model?: string, signal?: AbortSignal) {
    return this.transport.request<{ runId: string }>("session.prompt", { sessionId: session.sessionId, prompt, ...(model ? { model } : {}) }, signal);
  }

  abort(runId: string, signal?: AbortSignal) {
    return this.transport.request<{ cancelled: boolean }>("run.cancel", { runId }, signal);
  }

  events(runId: string, onEvent: (event: OpenCodeRuntimeEvent) => void) {
    return this.transport.subscribe(runId, onEvent);
  }
}
