import { randomBytes, randomInt } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createOpenCodeServeEventState, createOpenCodeServePromptPayload, createOpenCodeServeSessionPayload, normalizeOpenCodeServeEvent, openCodeServeSessionPath, openCodeServeSessionsPath, readOpenCodeServeSessionId, type OpenCodeRuntimeEvent, type OpenCodeServeEventState } from "@aimarketing/runtime-contracts/opencode";

type Provider = { readonly id?: string; readonly model?: string; readonly apiKey?: string };
type EventSink = (event: OpenCodeRuntimeEvent) => void;
type ActiveRun = { readonly runId: string; readonly sessionId: string; readonly sink: EventSink; readonly serveEvents: OpenCodeServeEventState; failed?: string };

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" ? value as Record<string, unknown> : null; }
function stringValue(...values: unknown[]) { return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? ""; }
function safe(value: unknown) { return stringValue(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1024); }
function modelParts(model: string | undefined) { const separator = model?.indexOf("/") ?? -1; return separator > 0 ? { providerID: model!.slice(0, separator), modelID: model!.slice(separator + 1) } : undefined; }

export class OpenCodeServeClient {
  private child: ChildProcess | undefined;
  private port = 0;
  private username = "";
  private password = "";
  private baseUrl = "";
  private stopping = false;
  private streamAbort: AbortController | undefined;
  private runtimeEnvironment: NodeJS.ProcessEnv = {};
  private runtimeWorkspace = "";
  private readonly active = new Map<string, ActiveRun>();

  constructor(private readonly executable: string, private readonly runtimeDirectory: string) {}

  private auth() { return `Basic ${Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64")}`; }

  private async request(path: string, init: RequestInit = {}, timeoutMs = 30_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, headers: { accept: "application/json", authorization: this.auth(), ...(init.headers ?? {}) }, signal: controller.signal });
    } finally { clearTimeout(timer); }
  }

  async ensureStarted(workspacePath: string, environment: NodeJS.ProcessEnv) {
    if (this.child && this.child.exitCode === null) return;
    await mkdir(this.runtimeDirectory, { recursive: true });
    this.port = await this.findFreePort();
    this.username = `aimarketing-${randomBytes(8).toString("hex")}`;
    this.password = randomBytes(32).toString("base64url");
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    this.runtimeEnvironment = { ...environment };
    this.runtimeWorkspace = workspacePath;
    this.stopping = false;
    this.child = spawn(this.executable, ["serve", "--hostname", "127.0.0.1", "--port", String(this.port), "--print-logs", "--log-level", "INFO"], {
      cwd: workspacePath,
      env: { ...environment, OPENCODE_SERVER_USERNAME: this.username, OPENCODE_SERVER_PASSWORD: this.password, OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[opencode-serve] ${chunk.toString("utf8").slice(-2048)}`));
    this.child.once("close", () => { this.streamAbort?.abort(); this.streamAbort = undefined; if (!this.stopping) for (const active of this.active.values()) { active.failed = "OpenCode serve exited before the turn completed."; active.sink({ event: "runtime_error", code: "opencode_serve_exited", message: active.failed, retryable: true, runId: active.runId }); } });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try { const response = await this.request("/global/health", {}, 2_000); if (response.ok) { this.startEventStream(workspacePath); return; } } catch { /* retry until the bounded deadline */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("opencode_serve_health_timeout");
  }

  async createOrResumeSession(workspacePath: string, requestedId: string | undefined, provider: Provider, environment: NodeJS.ProcessEnv) {
    await this.ensureStarted(workspacePath, environment);
    if (requestedId) {
      const existing = await this.request(openCodeServeSessionPath(requestedId, workspacePath, "message")).catch(() => undefined);
      if (existing?.ok) return requestedId;
    }
    const model = modelParts(provider.model);
    const body = createOpenCodeServeSessionPayload({ title: "AI Marketing Desktop", ...(model ? { providerId: model.providerID, modelId: model.modelID } : {}) });
    const response = await this.request(openCodeServeSessionsPath(workspacePath), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 30_000);
    const payload = await response.json().catch(() => null);
    const id = readOpenCodeServeSessionId(payload);
    if (!response.ok || !id) throw new Error(`opencode_session_create_failed:${safe(payload?.message) || response.statusText}`);
    return id;
  }

  async prompt(sessionId: string, workspacePath: string, runId: string, prompt: string, provider: Provider, sink: EventSink, signal?: AbortSignal) {
    await this.ensureStarted(workspacePath, this.runtimeEnvironment);
    const active: ActiveRun = { runId, sessionId, sink, serveEvents: createOpenCodeServeEventState() };
    this.active.set(runId, active);
    const abort = () => { void this.abort(sessionId); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const model = modelParts(provider.model);
      const response = await this.request(openCodeServeSessionPath(sessionId, workspacePath, "message"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createOpenCodeServePromptPayload({ prompt, ...(model ? { providerId: model.providerID, modelId: model.modelID } : {}) })),
      }, 30 * 60 * 1000);
      if (!response.ok && response.status !== 204) throw new Error(`opencode_prompt_failed_${response.status}`);
      if (signal?.aborted) throw new Error("opencode_aborted");
      if (active.failed) throw new Error(active.failed);
      sink({ event: "done", runId });
    } catch (error) {
      sink({ event: "runtime_error", code: signal?.aborted ? "opencode_aborted" : "opencode_prompt_failed", message: safe(error instanceof Error ? error.message : error), retryable: !signal?.aborted, runId });
    } finally { signal?.removeEventListener("abort", abort); this.active.delete(runId); }
  }

  async abort(sessionId: string) { await this.request(openCodeServeSessionPath(sessionId, this.runtimeWorkspace, "abort"), { method: "POST" }).catch(() => undefined); }

  async cancelRun(runId: string) {
    const active = this.active.get(runId);
    if (!active) return false;
    await this.abort(active.sessionId);
    return true;
  }

  async stop() {
    this.stopping = true;
    this.streamAbort?.abort();
    for (const active of this.active.values()) active.sink({ event: "runtime_error", code: "opencode_serve_stopped", message: "OpenCode serve stopped.", retryable: true, runId: active.runId });
    this.active.clear();
    if (this.child && this.child.exitCode === null) this.child.kill();
    this.child = undefined;
  }

  private async findFreePort() {
    const { createServer } = await import("node:net");
    return await new Promise<number>((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : randomInt(40_000, 60_000); server.close((error) => error ? reject(error) : resolve(port)); }); });
  }

  private startEventStream(workspacePath: string) {
    if (this.streamAbort) return;
    this.streamAbort = new AbortController();
    void (async () => {
      while (!this.stopping && this.streamAbort) {
        try {
          const response = await fetch(`${this.baseUrl}/event?directory=${encodeURIComponent(workspacePath)}`, { headers: { accept: "text/event-stream", authorization: this.auth() }, signal: this.streamAbort.signal });
          if (!response.ok || !response.body) throw new Error(`opencode_event_http_${response.status}`);
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
          while (!this.stopping) {
            const next = await reader.read(); if (next.done) break;
            buffer += decoder.decode(next.value, { stream: true });
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) { const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); this.handleEvent(frame); boundary = buffer.indexOf("\n\n"); }
          }
        } catch { if (!this.stopping) await new Promise((resolve) => setTimeout(resolve, 500)); }
      }
    })();
  }

  private handleEvent(frame: string) {
    const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    let payload: unknown; try { payload = JSON.parse(data); } catch { return; }
    const envelope = record(payload); const event = record(envelope?.payload) ?? envelope; const properties = record(event?.properties); const sessionId = stringValue(properties?.sessionID, record(properties?.part)?.sessionID);
    const active = [...this.active.values()].find((item) => item.sessionId === sessionId); if (!active) return;
    const normalized = normalizeOpenCodeServeEvent(active.runId, payload, active.serveEvents);
    for (const runtimeEvent of normalized.events) active.sink(runtimeEvent);
    if (normalized.terminalError) {
      active.failed = normalized.terminalError.message;
      active.sink({ event: "runtime_error", ...normalized.terminalError, runId: active.runId });
    }
  }
}
