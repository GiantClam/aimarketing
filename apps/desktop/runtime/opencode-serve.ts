import { randomBytes, randomInt } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createOpenCodeServeEventState, createOpenCodeServePromptPayload, createOpenCodeServeSessionPayload, normalizeOpenCodeServeEvent, openCodeServePermissionPath, openCodeServeSessionPath, openCodeServeSessionStatusPath, openCodeServeSessionsPath, readOpenCodeServeSessionId, type OpenCodeRuntimeEvent, type OpenCodeServeEventState } from "@coworkany/runtime-contracts/opencode";

type Provider = { readonly id?: string; readonly model?: string; readonly apiKey?: string; readonly reasoningEffort?: string };
type EventSink = (event: OpenCodeRuntimeEvent) => void;
type ActiveRun = {
  readonly runId: string;
  readonly sessionId: string;
  readonly sink: EventSink;
  readonly serveEvents: OpenCodeServeEventState;
  readonly messageIds: Set<string>;
  readonly completion: Promise<void>;
  readonly resolveCompletion: () => void;
  readonly continueTurn: () => Promise<void>;
  readonly turnStartedAt: number;
  promptSubmitted: boolean;
  assistantMessageSeen: boolean;
  assistantFinalMessageSeen: boolean;
  lastAssistantFinish?: string;
  continuationAttempts: number;
  continuationInFlight?: Promise<void>;
  continuationPending: boolean;
  lastMessagePollAt: number;
  busySeen: boolean;
  activitySeen: boolean;
  completed: boolean;
  failed?: string;
};

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

function statusType(value: unknown) {
  if (typeof value === "string") return value;
  return record(value)?.type;
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
  // OpenCode Serve can be healthy before its session repository is ready for
  // concurrent POSTs. Serialize only the control-plane session handshake;
  // prompts remain fully concurrent once their session IDs exist.
  private sessionCreateQueue: Promise<void> = Promise.resolve();

  /** Extra arguments make the supervised executable testable without changing production invocation. */
  constructor(private readonly executable: string, private readonly runtimeDirectory: string, private readonly executableArgs: readonly string[] = [], private readonly promptTimeoutMs?: number) {}

  private auth() { return `Basic ${Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64")}`; }

  private async request(path: string, init: RequestInit = {}, timeoutMs: number | false = 30_000, externalSignal?: AbortSignal) {
    // Long-running prompt requests must remain under OpenCode's own provider
    // and chunk timeout settings. The optional timeout is only for bounded
    // control-plane calls and explicit test coverage.
    const controller = typeof timeoutMs === "number" ? new AbortController() : undefined;
    const forwardAbort = () => controller?.abort();
    if (externalSignal?.aborted) controller?.abort();
    externalSignal?.addEventListener("abort", forwardAbort, { once: true });
    let timedOut = false;
    const timer = typeof timeoutMs === "number" ? setTimeout(() => { timedOut = true; controller?.abort(); }, timeoutMs) : undefined;
    try {
      const signal = controller?.signal ?? externalSignal ?? init.signal;
      return await fetch(`${this.baseUrl}${path}`, { ...init, headers: { accept: "application/json", authorization: this.auth(), ...(init.headers ?? {}) }, ...(signal ? { signal } : {}) });
    } catch (error) {
      if (timedOut) throw new Error(`opencode_request_timeout:${timeoutMs}`);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", forwardAbort);
    }
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
    this.username = `coworkany-${randomBytes(8).toString("hex")}`;
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
    // The desktop host is the explicit authority boundary for this local
    // runtime. Permissions are supplied through OPENCODE_CONFIG_CONTENT;
    // this bundled OpenCode version does not support `--auto` on `serve`.
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
    const previous = this.sessionCreateQueue;
    let release: (() => void) | undefined;
    this.sessionCreateQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      if (requestedId) {
        const existing = await this.request(openCodeServeSessionPath(requestedId, workspacePath, "message")).catch(() => undefined);
        if (existing?.ok) return { sessionId: requestedId, recovered: false };
      }
      const model = modelParts(provider.model);
      const body = createOpenCodeServeSessionPayload({ title: "CoworkAny Desktop", ...(model ? { providerId: model.providerID, modelId: model.modelID } : {}) });
      const response = await this.request(openCodeServeSessionsPath(workspacePath), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 30_000);
      const payload = await response.json().catch(() => null);
      const id = readOpenCodeServeSessionId(payload);
      if (!response.ok || !id) {
        const detail = safe(payload?.message ?? payload?.error ?? payload?.detail ?? (payload ? JSON.stringify(payload) : ""));
        throw new Error(`opencode_session_create_failed:${detail || response.statusText}`);
      }
      return { sessionId: id, recovered: Boolean(requestedId) };
    } finally {
      release?.();
    }
  }

  async prompt(sessionId: string, workspacePath: string, runId: string, prompt: string, provider: Provider, sink: EventSink, signal?: AbortSignal, agent?: string, beforeDone?: () => Promise<void>, systemPrompt?: string) {
    await this.ensureStarted(workspacePath, this.runtimeEnvironment);
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => { resolveCompletion = resolve; });
    const model = modelParts(provider.model);
    const sendPrompt = async (nextPrompt: string) => {
      const response = await this.request(openCodeServeSessionPath(sessionId, workspacePath, "prompt_async"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createOpenCodeServePromptPayload({ prompt: nextPrompt, ...(model ? { providerId: model.providerID, modelId: model.modelID } : {}), ...(model?.modelID === "deepseek-v4-flash" ? { variant: deepSeekVariant(model.modelID, provider.reasoningEffort) } : {}), ...(agent?.trim() ? { agent: agent.trim() } : {}), ...(systemPrompt?.trim() ? { systemPrompt: systemPrompt.trim() } : {}) })),
      }, this.promptTimeoutMs ?? false, signal);
      if (!response.ok && response.status !== 204) throw new Error(`opencode_prompt_failed_${response.status}`);
    };
    let continueTurn!: () => Promise<void>;
    const active: ActiveRun = { runId, sessionId, sink, serveEvents: createOpenCodeServeEventState(), messageIds: new Set(), completion, resolveCompletion, continueTurn: () => continueTurn(), turnStartedAt: Date.now(), promptSubmitted: false, assistantMessageSeen: false, assistantFinalMessageSeen: false, continuationAttempts: 0, continuationPending: false, lastMessagePollAt: 0, busySeen: false, activitySeen: false, completed: false };
    const continuationPrompt = "Continue the current task from the latest tool result, following the active Skill's instructions and interaction flow.";
    continueTurn = () => sendPrompt(continuationPrompt);
    this.active.set(runId, active);
    const abort = () => { void this.abort(sessionId); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      // Long-running Skills must not hold the synchronous `/message` request
      // open. OpenCode's async endpoint returns immediately; completion is
      // delivered by the session.status=idle SSE event below.
      active.promptSubmitted = true;
      const completionWait = this.waitForCompletion(active, workspacePath, signal);
      const promptSubmission = this.request(openCodeServeSessionPath(sessionId, workspacePath, "prompt_async"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createOpenCodeServePromptPayload({ prompt, ...(model ? { providerId: model.providerID, modelId: model.modelID } : {}), ...(model?.modelID === "deepseek-v4-flash" ? { variant: deepSeekVariant(model.modelID, provider.reasoningEffort) } : {}), ...(agent?.trim() ? { agent: agent.trim() } : {}), ...(systemPrompt?.trim() ? { systemPrompt: systemPrompt.trim() } : {}) })),
      }, this.promptTimeoutMs ?? false, signal)
        .then((response) => ({ kind: "response" as const, response }))
        .catch((error) => ({ kind: "error" as const, error }));
      const first = await Promise.race([
        promptSubmission,
        completionWait.then(() => ({ kind: "completed" as const })),
      ]);
      if (first.kind === "error") throw first.error;
      if (first.kind === "response" && !first.response.ok && first.response.status !== 204) {
        const detail = safe(await first.response.text().catch(() => ""));
        throw new Error(`opencode_prompt_failed_${first.response.status}${detail ? `:${detail}` : ""}`);
      }
      if (signal?.aborted) throw new Error("opencode_aborted");
      if (active.failed) throw new Error(active.failed);
      await completionWait;
      if (active.failed) throw new Error(active.failed);
      await beforeDone?.();
      if (signal?.aborted) throw new Error("opencode_aborted");
      if (active.failed) throw new Error(active.failed);
      sink({ event: "done", runId });
    } catch (error) {
      // A Skill can finish writing a usable artifact just before OpenCode
      // reports a failed turn (for example, after a late preview check). Give
      // the host one last chance to attach files, without masking the original
      // runtime error or emitting process details as assistant content.
      try { await beforeDone?.(); } catch { /* preserve the original failure */ }
      const timedOut = error instanceof Error && error.message.startsWith("opencode_request_timeout:");
      if (timedOut) {
        const message = "Text provider request timed out. Check the Provider base URL, API key, or select another model.";
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
    this.complete(active);
  }

  private failActiveRuns(code: string, message: string) {
    for (const active of this.active.values()) {
      if (active.failed) continue;
      active.failed = message;
      active.sink({ event: "runtime_error", code, message, retryable: true, runId: active.runId });
      this.complete(active);
      void this.abort(active.sessionId);
    }
  }

  async abort(sessionId: string) { await this.request(openCodeServeSessionPath(sessionId, this.runtimeWorkspace, "abort"), { method: "POST" }, 2_000).catch(() => undefined); }

  async replyPermission(sessionId: string, permissionId: string, response: "once" | "always" | "reject", workspacePath: string) {
    const result = await this.request(openCodeServePermissionPath(sessionId, permissionId, workspacePath), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response }),
    }, 30_000);
    if (!result.ok) {
      const detail = safe(await result.text().catch(() => ""));
      throw new Error(`opencode_permission_reply_failed_${result.status}${detail ? `:${detail}` : ""}`);
    }
  }

  async cancelRun(runId: string) {
    const active = this.active.get(runId);
    if (!active) return false;
    if (!active.failed) {
      active.failed = "OpenCode run cancelled.";
      active.sink({ event: "runtime_error", code: "opencode_aborted", message: active.failed, retryable: false, runId });
    }
    this.complete(active);
    // The prompt request is cancelled by the per-run AbortSignal owned by the
    // host. Do not wait for OpenCode's abort endpoint here: older Serve builds
    // can keep that control-plane request open while the model is unwinding.
    void this.abort(active.sessionId);
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

  private complete(active: ActiveRun) {
    if (active.completed) return;
    active.completed = true;
    active.resolveCompletion();
  }

  private requestContinuation(active: ActiveRun) {
    if (active.completed || active.failed || active.continuationPending || active.continuationInFlight) return;
    active.continuationAttempts += 1;
    active.continuationPending = true;
    active.continuationInFlight = active.continueTurn()
      .catch((error) => {
        if (active.completed || active.failed) return;
        active.continuationPending = false;
        active.failed = safe(error instanceof Error ? error.message : error);
        active.sink({ event: "runtime_error", code: "opencode_continuation_failed", message: active.failed, retryable: true, runId: active.runId });
        this.complete(active);
      })
      .finally(() => { active.continuationInFlight = undefined; });
  }

  private async waitForCompletion(active: ActiveRun, workspacePath: string, signal?: AbortSignal) {
    const pollController = new AbortController();
    const abortPoll = () => pollController.abort();
    signal?.addEventListener("abort", abortPoll, { once: true });
    try {
      await Promise.race([active.completion, this.pollSessionStatus(active, workspacePath, pollController.signal)]);
    } finally {
      pollController.abort();
      signal?.removeEventListener("abort", abortPoll);
    }
  }

  private async pollSessionStatus(active: ActiveRun, workspacePath: string, signal: AbortSignal) {
    while (!active.completed && !active.failed && !signal.aborted) {
      try {
        const response = await this.request(openCodeServeSessionStatusPath(workspacePath), {}, 2_000, signal);
        if (response.ok) {
          const payload = await response.json().catch(() => null);
          const sessions = record(payload);
          const session = sessions?.[active.sessionId];
          const type = statusType(session);
          if (type === "busy") active.busySeen = true;
          if ((type === "idle" || session === undefined) && (active.busySeen || active.activitySeen)) {
            if (active.assistantFinalMessageSeen) {
              this.complete(active);
              return;
            }
            if (active.lastAssistantFinish === "tool-calls") this.requestContinuation(active);
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      // The SSE idle event is normally authoritative, but under high
      // concurrency OpenCode can persist the completed message before the
      // corresponding status event reaches this client. Reconcile against
      // the session message list independently of the status request: a
      // stalled status endpoint must not prevent completion detection.
      if (Date.now() - active.lastMessagePollAt >= 1_000) {
        active.lastMessagePollAt = Date.now();
        try { await this.reconcileCompletedMessage(active, workspacePath, signal); } catch { if (signal.aborted) return; }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private async reconcileCompletedMessage(active: ActiveRun, workspacePath: string, signal: AbortSignal) {
    const response = await this.request(openCodeServeSessionPath(active.sessionId, workspacePath, "message"), {}, 2_000, signal);
    if (!response.ok) return;
    const payload = await response.json().catch(() => null);
    const payloadRecord = record(payload);
    const messages: unknown[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payloadRecord?.messages)
        ? payloadRecord.messages
        : [];
    for (const entry of [...messages].reverse()) {
      const message = record(record(entry)?.info) ?? record(entry);
      if (message?.role !== "assistant") continue;
      const messageId = typeof message.id === "string" ? message.id : undefined;
      const time = record(message.time);
      const completed = typeof time?.completed === "number"
        ? time.completed
        : typeof message.completed === "number"
          ? message.completed
          : undefined;
      if (completed === undefined || completed < active.turnStartedAt) continue;
      if (active.continuationPending && messageId && !active.messageIds.has(messageId)) active.continuationPending = false;
      if (messageId) active.messageIds.add(messageId);
      active.activitySeen = true;
      active.assistantMessageSeen = true;
      active.lastAssistantFinish = typeof message.finish === "string" ? message.finish : undefined;
      active.assistantFinalMessageSeen = active.lastAssistantFinish !== "tool-calls";
      if (active.assistantFinalMessageSeen) {
        this.complete(active);
      } else this.requestContinuation(active);
      return;
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
    if (routing.sessionStatus === "busy") {
      for (const item of sessionRuns) { item.busySeen = true; item.activitySeen = true; }
    }
    if (routing.sessionIdle) {
      // Status belongs to a session rather than a single message. Resolve
      // every submitted run for that session, which also keeps same-session
      // concurrent prompts from waiting forever on one shared idle event.
      for (const item of sessionRuns) {
        if (!item.promptSubmitted || (!item.busySeen && !item.activitySeen)) continue;
        if (item.assistantFinalMessageSeen) this.complete(item);
        else if (item.lastAssistantFinish === "tool-calls") this.requestContinuation(item);
      }
    }
    let active = routing.messageId ? sessionRuns.find((item) => item.messageIds.has(routing.messageId!)) : undefined;
    if (!active && routing.messageRole === "assistant") active = sessionRuns.find((item) => item.messageIds.size === 0);
    if (!active) active = sessionRuns.find((item) => item.messageIds.size === 0);
    // Permission events can carry the tool message id rather than the
    // assistant message id. When only one turn is active, route that event to
    // the sole session run instead of dropping the approval request.
    if (!active && sessionRuns.length === 1) active = sessionRuns[0];
    if (!active) return;
    const isNewAssistantMessage = routing.messageRole === "assistant" && Boolean(routing.messageId) && !active.messageIds.has(routing.messageId!);
    // A single desktop run can contain several OpenCode assistant messages:
    // one reports a tool-call turn and a later one continues after the tool
    // result. The desktop transcript intentionally renders one Message for
    // the run, so preserve that message boundary as a Markdown paragraph
    // break instead of concatenating progress sentences into one paragraph.
    if (isNewAssistantMessage && active.lastAssistantFinish === "tool-calls") {
      active.sink({ event: "text_delta", delta: "\n\n", runId: active.runId });
    }
    if (isNewAssistantMessage) active.continuationPending = false;
    if (routing.messageRole === "assistant") { active.assistantMessageSeen = true; active.activitySeen = true; }
    // Only message.updated events with an explicit role identify a message.
    // session.updated also exposes `info.id` (the session ID), which must not
    // consume the run's empty-message routing slot.
    if (routing.messageId && routing.messageRole && routing.messageRole !== "user") active.messageIds.add(routing.messageId);
    const normalized = normalizeOpenCodeServeEvent(active.runId, payload, active.serveEvents);
    if (normalized.events.length) active.activitySeen = true;
    if (normalized.messageCompleted && normalized.messageFinish) {
      active.lastAssistantFinish = normalized.messageFinish;
      active.assistantFinalMessageSeen = normalized.messageFinish !== "tool-calls";
    } else if (normalized.messageCompleted) {
      active.assistantFinalMessageSeen = true;
    }
    for (const runtimeEvent of normalized.events) active.sink(runtimeEvent);
    if (normalized.terminalError) {
      active.failed = normalized.terminalError.message;
      active.sink({ event: "runtime_error", ...normalized.terminalError, runId: active.runId });
      this.complete(active);
    }
  }
}
