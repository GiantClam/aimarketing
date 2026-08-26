import { randomBytes, randomInt } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createOpenCodeServeEventState, createOpenCodeServePromptPayload, createOpenCodeServeSessionPayload, normalizeOpenCodeServeEvent, openCodeServeSessionPath, openCodeServeSessionsPath, readOpenCodeServeSessionId, type OpenCodeRuntimeEvent, type OpenCodeServeEventState } from "@aimarketing/runtime-contracts/opencode";

type Provider = { readonly id?: string; readonly model?: string; readonly apiKey?: string; readonly reasoningEffort?: string };
type EventSink = (event: OpenCodeRuntimeEvent) => void;
type ActiveRun = { readonly runId: string; readonly sessionId: string; readonly sink: EventSink; readonly serveEvents: OpenCodeServeEventState; readonly messageIds: Set<string>; failed?: string };
const DEFAULT_PROMPT_TIMEOUT_MS = 60_000;

function runtimeEnvironmentSignature(environment: Record<string, string | undefined>) {
  const relevant = Object.entries(environment)
    .filter(([key]) => key === "OPENCODE_CONFIG_CONTENT" || key === "OPENCODE_CONFIG_DIR" || key === "HOME" || key === "USERPROFILE" || key.startsWith("XDG_") || key.endsWith("_API_KEY"))
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(relevant);
}

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" ? value as Record<string, unknown> : null; }
function stringValue(...values: unknown[]) { return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? ""; }
function safe(value: unknown) { return stringValue(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1024); }
function modelParts(model: string | undefined) { const separator = model?.indexOf("/") ?? -1; return separator > 0 ? { providerID: model!.slice(0, separator), modelID: model!.slice(separator + 1) } : undefined; }
function deepSeekVariant(model: string | undefined, reasoningEffort: string | undefined) {
  if (model !== "deepseek-v4-flash") return undefined;
  const normalized = reasoningEffort?.trim().toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "low" || normalized === "high") return normalized;
  return "max";
}

async function terminateProcessTree(child: ChildProcess) {
  if (child.exitCode !== null) return;
  if (process.platform !== "win32" || !child.pid) {
    child.kill();
    return;
  }
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.once("close", () => resolve());
    killer.once("error", () => resolve());
  });
  if (child.exitCode === null) child.kill();
}

export class OpenCodeServeClient {
  private child: ChildProcess | undefined;
  private port = 0;
  private username = "";
  private password = "";
  private baseUrl = "";
  private stopping = false;
  private streamAbort: AbortController | undefined;
  private startPromise: Promise<void> | undefined;
  private runtimeEnvironment: Record<string, string | undefined> = { NODE_ENV: process.env.NODE_ENV ?? "production" };
  private runtimeEnvironmentSignature = "";
  private runtimeWorkspace = "";
  private readonly active = new Map<string, ActiveRun>();

  /** Extra arguments make the supervised executable testable without changing production invocation. */
  constructor(private readonly executable: string, private readonly runtimeDirectory: string, private readonly executableArgs: readonly string[] = [], private readonly promptTimeoutMs = DEFAULT_PROMPT_TIMEOUT_MS) {}

  private auth() { return `Basic ${Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64")}`; }

  private async request(path: string, init: RequestInit = {}, timeoutMs = 30_000) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, headers: { accept: "application/json", authorization: this.auth(), ...(init.headers ?? {}) }, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new Error(`opencode_request_timeout:${timeoutMs}`);
      throw error;
    } finally { clearTimeout(timer); }
  }

  async ensureStarted(workspacePath: string, environment: Record<string, string | undefined>) {
    // OpenCode loads OPENCODE_CONFIG_CONTENT and provider credentials only at
    // process start. Reuse the process while its effective config is stable,
    // but restart it before a turn that selects a different model/provider.
    const requestedSignature = runtimeEnvironmentSignature(environment);
    if (this.child && this.child.exitCode === null && this.runtimeWorkspace === workspacePath && this.runtimeEnvironmentSignature === requestedSignature) return;
    if (this.startPromise) {
      await this.startPromise;
      if (this.child && this.child.exitCode === null && this.runtimeWorkspace === workspacePath && this.runtimeEnvironmentSignature === requestedSignature) return;
    }
    if (this.child && this.child.exitCode === null) await this.stop();
    const startPromise = this.startServe(workspacePath, environment);
    this.startPromise = startPromise;
    try { await startPromise; }
    finally { if (this.startPromise === startPromise) this.startPromise = undefined; }
  }

  private async startServe(workspacePath: string, environment: Record<string, string | undefined>) {
    await mkdir(this.runtimeDirectory, { recursive: true });
    this.port = await this.findFreePort();
    this.username = `aimarketing-${randomBytes(8).toString("hex")}`;
    this.password = randomBytes(32).toString("base64url");
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    // Keep the supervised runtime independent from the user's OpenCode
    // installation. The host supplies the desktop config content, while
    // these guards prevent project/global skill and plugin discovery from
    // reintroducing user-level entries such as superpowers.
    const isolatedEnvironment = {
      ...environment,
      NODE_ENV: environment.NODE_ENV ?? process.env.NODE_ENV ?? "production",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
      OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
      OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    };
    this.runtimeEnvironment = isolatedEnvironment;
    this.runtimeEnvironmentSignature = runtimeEnvironmentSignature(isolatedEnvironment);
    this.runtimeWorkspace = workspacePath;
    this.stopping = false;
    const child = spawn(this.executable, [...this.executableArgs, "serve", "--pure", "--hostname", "127.0.0.1", "--port", String(this.port), "--print-logs", "--log-level", "INFO"], {
      cwd: workspacePath,
      env: { ...isolatedEnvironment, OPENCODE_SERVER_USERNAME: this.username, OPENCODE_SERVER_PASSWORD: this.password, OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true" } as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }) as ChildProcess;
    this.child = child;
    child.stderr?.on("data", (chunk: Buffer) => {
      const diagnostic = chunk.toString("utf8");
      process.stderr.write(`[opencode-serve] ${diagnostic.slice(-2048)}`);
      // OpenCode retries upstream 429s internally and can leave the prompt
      // request open indefinitely. Surface a bounded terminal event so the
      // desktop composer never appears to hang without an explanation.
      if (/(?:too many requests|rate limit exceeded|\bstatus(?:code)?[=: ]*429\b|\bhttp\s*429\b)/iu.test(diagnostic)) {
        this.failActiveRuns("provider_rate_limited", "Provider rate limit reached (HTTP 429). Choose another configured text model or retry later.");
      } else if (/(?:access forbidden|\bforbidden\b|\bstatus(?:code)?[=: ]*403\b|\bhttp\s*403\b)/iu.test(diagnostic)) {
        this.failActiveRuns("provider_access_forbidden", "Provider rejected the request (HTTP 403). Check the provider key, model permission, or choose another configured text model.");
      }
    });
    child.once("close", () => { this.streamAbort?.abort(); this.streamAbort = undefined; if (!this.stopping) for (const active of this.active.values()) this.reportServeExit(active); });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try { const response = await this.request("/global/health", {}, 2_000); if (response.ok) { this.startEventStream(workspacePath); return; } } catch { /* retry until the bounded deadline */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("opencode_serve_health_timeout");
  }

  async createOrResumeSession(workspacePath: string, requestedId: string | undefined, provider: Provider, environment: Record<string, string | undefined>) {
    await this.ensureStarted(workspacePath, environment);
    if (requestedId) {
      const existing = await this.request(openCodeServeSessionPath(requestedId, workspacePath, "message")).catch(() => undefined);
      if (existing?.ok) return { sessionId: requestedId, recovered: false };
    }
    const model = modelParts(provider.model);
    const body = createOpenCodeServeSessionPayload({ title: "AI Marketing Desktop", ...(model ? { providerId: model.providerID, modelId: model.modelID } : {}) });
    const response = await this.request(openCodeServeSessionsPath(workspacePath), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 30_000);
    const payload = await response.json().catch(() => null);
    const id = readOpenCodeServeSessionId(payload);
    if (!response.ok || !id) throw new Error(`opencode_session_create_failed:${safe(payload?.message) || response.statusText}`);
    return { sessionId: id, recovered: Boolean(requestedId) };
  }

  async prompt(sessionId: string, workspacePath: string, runId: string, prompt: string, provider: Provider, sink: EventSink, signal?: AbortSignal, agent?: string) {
    await this.ensureStarted(workspacePath, this.runtimeEnvironment);
    const active: ActiveRun = { runId, sessionId, sink, serveEvents: createOpenCodeServeEventState(), messageIds: new Set() };
    this.active.set(runId, active);
    const abort = () => { void this.abort(sessionId); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const model = modelParts(provider.model);
      const response = await this.request(openCodeServeSessionPath(sessionId, workspacePath, "message"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createOpenCodeServePromptPayload({ prompt, ...(model ? { providerId: model.providerID, modelId: model.modelID } : {}), ...(model?.modelID === "deepseek-v4-flash" ? { variant: deepSeekVariant(model.modelID, provider.reasoningEffort) } : {}), ...(agent?.trim() ? { agent: agent.trim() } : {}) })),
      }, this.promptTimeoutMs);
      if (!response.ok && response.status !== 204) {
        const detail = safe(await response.text().catch(() => ""));
        throw new Error(`opencode_prompt_failed_${response.status}${detail ? `:${detail}` : ""}`);
      }
      if (signal?.aborted) throw new Error("opencode_aborted");
      if (active.failed) throw new Error(active.failed);
      sink({ event: "done", runId });
    } catch (error) {
      const timedOut = error instanceof Error && error.message.startsWith("opencode_request_timeout:");
      if (timedOut) {
        const seconds = Math.max(1, Math.round(this.promptTimeoutMs / 1000));
        const message = `Text provider request timed out after ${seconds} seconds. Check the Provider base URL, API key, or select another model.`;
        active.failed = message;
        sink({ event: "runtime_error", code: "opencode_prompt_timeout", message, retryable: true, runId });
        void this.abort(sessionId);
        return;
      }
      if (!active.failed && error instanceof TypeError) await new Promise((resolve) => setTimeout(resolve, 100));
      if (!active.failed && this.child?.exitCode !== null) this.reportServeExit(active);
      if (active.failed) return;
      sink({ event: "runtime_error", code: signal?.aborted ? "opencode_aborted" : "opencode_prompt_failed", message: safe(error instanceof Error ? error.message : error), retryable: !signal?.aborted, runId });
    } finally { signal?.removeEventListener("abort", abort); this.active.delete(runId); }
  }

  private reportServeExit(active: ActiveRun) {
    if (active.failed) return;
    active.failed = "OpenCode serve exited before the turn completed.";
    active.sink({ event: "runtime_error", code: "opencode_serve_exited", message: active.failed, retryable: true, runId: active.runId });
  }

  private failActiveRuns(code: string, message: string) {
    for (const active of this.active.values()) {
      if (active.failed) continue;
      active.failed = message;
      active.sink({ event: "runtime_error", code, message, retryable: true, runId: active.runId });
      void this.abort(active.sessionId);
    }
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
    const child = this.child;
    this.child = undefined;
    this.runtimeWorkspace = "";
    this.runtimeEnvironmentSignature = "";
    if (child && child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5_000);
        child.once("close", () => { clearTimeout(timer); resolve(); });
        void terminateProcessTree(child);
      });
    }
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
            // SSE servers commonly use CRLF, while the test fixture and some
            // proxies use LF. Accept either separator so events are dispatched
            // as soon as a complete frame arrives.
            while (true) {
              const lfBoundary = buffer.indexOf("\n\n");
              const crlfBoundary = buffer.indexOf("\r\n\r\n");
              const useCrlf = crlfBoundary >= 0 && (lfBoundary < 0 || crlfBoundary < lfBoundary);
              const boundary = useCrlf ? crlfBoundary : lfBoundary;
              if (boundary < 0) break;
              const separatorLength = useCrlf ? 4 : 2;
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + separatorLength);
              this.handleEvent(frame);
            }
          }
        } catch { if (!this.stopping) await new Promise((resolve) => setTimeout(resolve, 500)); }
      }
    })();
  }

  private handleEvent(frame: string) {
    const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    let payload: unknown; try { payload = JSON.parse(data); } catch { return; }
    const routing = normalizeOpenCodeServeEvent("pending", payload, createOpenCodeServeEventState());
    const sessionId = routing.sessionId;
    if (!sessionId) return;
    const sessionRuns = [...this.active.values()].filter((item) => item.sessionId === sessionId && !item.failed);
    let active = routing.messageId ? sessionRuns.find((item) => item.messageIds.has(routing.messageId!)) : undefined;
    if (!active && routing.messageRole === "assistant") active = sessionRuns.find((item) => item.messageIds.size === 0);
    if (!active) active = sessionRuns.find((item) => item.messageIds.size === 0);
    if (!active) return;
    // Only message.updated events with an explicit role identify a message.
    // session.updated also exposes `info.id` (the session ID), which must not
    // consume the run's empty-message routing slot.
    if (routing.messageId && routing.messageRole && routing.messageRole !== "user") active.messageIds.add(routing.messageId);
    const normalized = normalizeOpenCodeServeEvent(active.runId, payload, active.serveEvents);
    for (const runtimeEvent of normalized.events) active.sink(runtimeEvent);
    if (normalized.terminalError) {
      active.failed = normalized.terminalError.message;
      active.sink({ event: "runtime_error", ...normalized.terminalError, runId: active.runId });
    }
  }
}
