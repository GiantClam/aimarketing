import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { OpenCodeRuntimeEvent } from "@aimarketing/runtime-contracts/opencode";
import { encodeRpcMessage } from "./rpc";

export interface LocalChatRequest {
  readonly prompt: string;
  readonly model?: string;
  readonly runId?: string;
}

export interface LocalChatRuntime {
  readonly hostExecutable: string;
  readonly hostArgs: readonly string[];
  readonly opencodeExecutable?: string;
}

export interface LocalChatResult {
  readonly runId: string;
  readonly events: readonly OpenCodeRuntimeEvent[];
}

export class LocalChatService {
  constructor(private readonly runtime: LocalChatRuntime) {}

  run(request: LocalChatRequest, signal?: AbortSignal): Promise<LocalChatResult> {
    const runId = request.runId ?? randomUUID();
    const child = spawn(this.runtime.hostExecutable, this.runtime.hostArgs, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const events: OpenCodeRuntimeEvent[] = [];
    let stderr = "";
    let buffer = new Uint8Array(0);
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4096); });
    child.stdout.on("data", (chunk: Buffer) => {
      const next = new Uint8Array(buffer.length + chunk.length);
      next.set(buffer); next.set(chunk, buffer.length); buffer = next;
      while (true) {
        const separator = buffer.indexOf(58);
        if (separator < 1) break;
        const size = Number.parseInt(Buffer.from(buffer.subarray(0, separator)).toString("ascii"), 10);
        const end = separator + 1 + size;
        if (!Number.isSafeInteger(size) || size < 2 || end > buffer.length) break;
        const payload = JSON.parse(Buffer.from(buffer.subarray(separator + 1, end)).toString("utf8")) as { readonly data?: { readonly event?: OpenCodeRuntimeEvent } };
        const event = payload.data?.event;
        if (event) events.push(event);
        buffer = buffer.subarray(end + (buffer[end] === 10 ? 1 : 0));
      }
    });
    return new Promise((resolve, reject) => {
      child.once("error", (error) => { signal?.removeEventListener("abort", abort); reject(error); });
      child.once("close", (code) => {
        signal?.removeEventListener("abort", abort);
        if (code !== 0 && !events.some((event) => event.event === "runtime_error")) events.push({ event: "runtime_error", code: "host_exit", message: stderr || `workflow-host exited with code ${code ?? "unknown"}`, retryable: true, runId });
        resolve({ runId, events });
      });
      child.stdin.end(encodeRpcMessage({ version: 1, requestId: randomUUID(), runId, type: "chat.run", payload: { prompt: request.prompt, model: request.model, ...(this.runtime.opencodeExecutable ? { executable: this.runtime.opencodeExecutable } : {}) } }));
    });
  }
}
