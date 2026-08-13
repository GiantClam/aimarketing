export type MediaTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type MediaProviderId = string & { readonly __mediaProviderId: unique symbol };

export class ProviderConfigurationRequiredError extends Error {
  readonly code = "provider_configuration_required";
  constructor(readonly provider: MediaProviderId, readonly capability: string) {
    super(`Provider configuration required for ${capability} (${provider})`);
    this.name = "ProviderConfigurationRequiredError";
  }
}

export function requireMediaProvider<T>(provider: MediaProviderAdapter | undefined, providerId: MediaProviderId, capability: string): MediaProviderAdapter {
  if (!provider) throw new ProviderConfigurationRequiredError(providerId, capability);
  return provider;
}

export interface MediaRequest<TInput = Record<string, unknown>> {
  readonly provider: MediaProviderId;
  readonly modelId: string;
  readonly input: TInput;
  readonly idempotencyKey?: string;
}

export interface MediaTask {
  readonly providerTaskId: string;
  readonly status: MediaTaskStatus;
  readonly providerStatus?: string;
  readonly outputs: readonly Record<string, unknown>[];
}

export interface CancellationPort {
  readonly signal?: AbortSignal;
  readonly throwIfCancelled: () => void;
}

export interface MediaProviderAdapter {
  readonly provider: MediaProviderId;
  readonly execute: (request: MediaRequest, cancellation: CancellationPort) => Promise<MediaTask>;
  readonly query?: (providerTaskId: string, cancellation: CancellationPort) => Promise<MediaTask>;
  readonly cancel?: (providerTaskId: string, cancellation: CancellationPort) => Promise<MediaTask>;
}

export interface MediaPollingOptions { readonly pollIntervalMs?: number; readonly timeoutMs?: number; readonly initialTask?: MediaTask; readonly onSubmitted?: (task: MediaTask) => Promise<void> | void; readonly onUpdate?: (task: MediaTask) => Promise<void> | void; }

export interface MediaHttpAdapterOptions {
  readonly provider: MediaProviderId;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly submitPath: string;
  readonly queryPath?: (providerTaskId: string) => string;
  readonly cancelPath?: (providerTaskId: string) => string;
  readonly fetchImpl?: typeof fetch;
  readonly headers?: Readonly<Record<string, string>>;
}

function isHttpEndpoint(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function requireInjectedProviderConfig(
  options: Pick<MediaHttpAdapterOptions, "provider" | "baseUrl" | "apiKey">,
  capability: string,
) {
  const provider = String(options.provider ?? "").trim() as MediaProviderId;
  if (!provider || !isHttpEndpoint(options.baseUrl) || !options.apiKey?.trim()) {
    throw new ProviderConfigurationRequiredError(provider, capability);
  }
}

/** OpenAI-compatible and simple async JSON provider adapter. No SaaS transport is involved. */
export function createHttpMediaAdapter(options: MediaHttpAdapterOptions): MediaProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = async (path: string, init: RequestInit, cancellation: CancellationPort) => {
    requireInjectedProviderConfig(options, "media");
    cancellation.throwIfCancelled();
    const response = await fetchImpl(new URL(path, options.baseUrl).toString(), {
      ...init,
      headers: {
        accept: "application/json",
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        ...options.headers,
        ...(init.headers ?? {}),
      },
      signal: cancellation.signal,
    });
    const body = await response.text();
    let parsed: unknown = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { parsed = { raw: body.slice(0, 1000) }; }
    if (!response.ok) throw new Error(`media_provider_http_${response.status}`);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  };
  const toTask = (value: Record<string, unknown>): MediaTask => {
    const providerTaskId = String(value.id ?? value.task_id ?? value.taskId ?? `sync-${Date.now()}`);
    const statusText = String(value.status ?? value.state ?? "succeeded").toLowerCase();
    const status: MediaTaskStatus = statusText.includes("fail") || statusText.includes("error") ? "failed" : statusText.includes("queue") ? "queued" : statusText.includes("run") || statusText.includes("process") ? "running" : "succeeded";
    const outputValues = Array.isArray(value.data) ? value.data : Array.isArray(value.output) ? value.output : Array.isArray(value.outputs) ? value.outputs : [];
    const outputs = outputValues.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ ...item }));
    return { providerTaskId, status, ...(typeof value.status === "string" ? { providerStatus: value.status } : {}), outputs };
  };
  return {
    provider: options.provider,
    execute: async (requestInput, cancellation) => toTask(await request(options.submitPath, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: requestInput.modelId, ...requestInput.input, ...(requestInput.idempotencyKey ? { idempotency_key: requestInput.idempotencyKey } : {}) }) }, cancellation)),
    ...(options.queryPath ? { query: async (providerTaskId, cancellation) => toTask(await request(options.queryPath!(providerTaskId), { method: "GET" }, cancellation)) } : {}),
    ...(options.cancelPath ? { cancel: async (providerTaskId, cancellation) => toTask(await request(options.cancelPath!(providerTaskId), { method: "POST" }, cancellation)) } : {}),
  };
}

export interface DirectProviderOptions {
  readonly provider: MediaProviderId;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
}

function providerUrl(baseUrl: string, path: string, query?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url;
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numberValue(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

function mapProviderStatus(value: unknown): MediaTaskStatus {
  const status = text(value).toLowerCase();
  if (status.includes("fail") || status.includes("error")) return "failed";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("queue") || status.includes("pending") || status.includes("submitted")) return "queued";
  if (status.includes("process") || status.includes("run") || status.includes("doing")) return "running";
  return "succeeded";
}

function asTask(provider: MediaProviderId, payload: Record<string, unknown>, fallbackId?: string): MediaTask {
  const output = payload.output && typeof payload.output === "object" ? payload.output as Record<string, unknown> : payload;
  const providerTaskId = text(output.task_id) || text(output.taskId) || text(payload.task_id) || text(payload.id) || fallbackId || `sync-${Date.now()}`;
  const providerStatus = output.task_status ?? output.status ?? payload.status ?? payload.state;
  const values: unknown[] = [];
  for (const value of [output.video_url, output.audio, output.url, output.file_url, payload.data, payload.output, payload.outputs]) {
    if (Array.isArray(value)) values.push(...value);
    else if (value !== undefined && value !== null) values.push(value);
  }
  const outputs = values.flatMap((value) => {
    if (typeof value === "string") return [{ url: value }];
    if (!value || typeof value !== "object") return [];
    return [{ ...(value as Record<string, unknown>) }];
  });
  return { providerTaskId, status: mapProviderStatus(providerStatus), ...(providerStatus ? { providerStatus: String(providerStatus) } : {}), outputs };
}

async function jsonRequest(options: DirectProviderOptions, path: string, init: RequestInit, cancellation: CancellationPort, query?: Record<string, string>) {
  requireInjectedProviderConfig(options, "media");
  cancellation.throwIfCancelled();
  const response = await (options.fetchImpl ?? fetch)(providerUrl(options.baseUrl, path, query), {
    ...init,
    headers: { accept: "application/json", authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: cancellation.signal,
  });
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw: raw.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`media_provider_http_${response.status}`);
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

/** Direct DashScope/Bailian async video adapter. It intentionally contains no SaaS/database imports. */
export function createBailianVideoAdapter(options: DirectProviderOptions): MediaProviderAdapter {
  return {
    provider: options.provider,
    execute: async (request, cancellation) => {
      const input = request.input as Record<string, unknown>;
      const model = request.modelId;
      const prompt = text(input.prompt);
      const feature = text(input.featureId) || (text(input.firstFrameUrl) ? "image-to-video" : "text-to-video");
      if (!prompt && feature !== "image-to-video") throw new Error("video_prompt_required");
      const parameters = { resolution: text(input.resolution).toUpperCase() === "720P" ? "720P" : "1080P", ratio: text(input.ratio) || "16:9", duration: Math.max(3, Math.min(15, numberValue(input.duration, 5))) };
      const body = { model, input: { ...(prompt ? { prompt } : {}), ...(feature === "image-to-video" && text(input.firstFrameUrl) ? { media: [{ type: "first_frame", url: text(input.firstFrameUrl) }] } : {}) }, parameters };
      const payload = await jsonRequest(options, "/api/v1/services/aigc/video-generation/video-synthesis", { method: "POST", body: JSON.stringify(body), headers: { "X-DashScope-Async": "enable", ...(request.idempotencyKey ? { "X-Request-ID": request.idempotencyKey } : {}) } }, cancellation);
      return asTask(options.provider, payload);
    },
    query: async (providerTaskId, cancellation) => asTask(options.provider, await jsonRequest(options, `/api/v1/tasks/${encodeURIComponent(providerTaskId)}`, { method: "GET" }, cancellation), providerTaskId),
  };
}

/** Direct MiniMax video adapter for official text/image-to-video endpoints. */
export function createMiniMaxVideoAdapter(options: DirectProviderOptions): MediaProviderAdapter {
  return {
    provider: options.provider,
    execute: async (request, cancellation) => {
      const input = request.input as Record<string, unknown>;
      const body = { model: request.modelId || "MiniMax-Hailuo-2.3", prompt: text(input.prompt) || "Create a polished marketing video with smooth cinematic motion.", duration: Math.max(6, Math.min(10, numberValue(input.duration, 6))), resolution: text(input.resolution) || "768P", prompt_optimizer: true, ...(text(input.firstFrameUrl) ? { first_frame_image: text(input.firstFrameUrl) } : {}) };
      const payload = await jsonRequest(options, "/video_generation", { method: "POST", body: JSON.stringify(body), headers: request.idempotencyKey ? { "X-Request-ID": request.idempotencyKey } : {} }, cancellation);
      const task = asTask(options.provider, payload);
      const fileId = text((payload.output as Record<string, unknown> | undefined)?.file_id) || text(payload.file_id);
      return fileId && task.outputs.length === 0 ? { ...task, outputs: [{ url: providerUrl(options.baseUrl, "/files/retrieve", { file_id: fileId }).toString() }] } : task;
    },
    query: async (providerTaskId, cancellation) => asTask(options.provider, await jsonRequest(options, "/query/video_generation", { method: "GET" }, cancellation, { task_id: providerTaskId }), providerTaskId),
  };
}

/** Direct MiniMax async speech/music adapter. Music may return a synchronous base64 payload. */
export function createMiniMaxAudioAdapter(options: DirectProviderOptions): MediaProviderAdapter {
  return {
    provider: options.provider,
    execute: async (request, cancellation) => {
      const input = request.input as Record<string, unknown>;
      const kind = text(input.kind) || "speech";
      const path = kind === "music" ? "/music_generation" : "/t2a_async_v2";
      const payload = await jsonRequest(options, path, { method: "POST", body: JSON.stringify({ model: request.modelId, ...input }) }, cancellation);
      const task = asTask(options.provider, payload);
      const audio = text((payload.data as Record<string, unknown> | undefined)?.audio);
      if (kind === "music" && audio) return { ...task, status: "succeeded", outputs: [{ b64_json: audio }] };
      return task;
    },
    query: async (providerTaskId, cancellation) => {
      const payload = await jsonRequest(options, "/query/t2a_async_query_v2", { method: "GET" }, cancellation, { task_id: providerTaskId });
      const task = asTask(options.provider, payload, providerTaskId);
      const fileId = text((payload as Record<string, unknown>).file_id) || text((payload.data as Record<string, unknown> | undefined)?.file_id);
      return fileId && task.status === "succeeded" ? { ...task, outputs: [{ url: providerUrl(options.baseUrl, "/files/retrieve_content", { file_id: fileId }).toString() }] } : task;
    },
  };
}

/** Direct RunningHub task adapter. Endpoint selection stays in desktop config so no cloud defaults are hidden. */
export function createRunningHubAdapter(options: DirectProviderOptions & { readonly submitPath: string; readonly queryPath?: string }): MediaProviderAdapter {
  const queryPath = options.queryPath || "/openapi/v2/query";
  const map = (payload: Record<string, unknown>, fallbackId?: string): MediaTask => {
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : payload;
    const status = data.status ?? data.taskStatus ?? payload.status;
    const task = asTask(options.provider, { ...payload, ...data }, fallbackId);
    const results = Array.isArray(data.results) ? data.results : [];
    const outputs = results.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      return text(value.url) ? [{ url: text(value.url) }] : [];
    });
    return { ...task, status: mapProviderStatus(status), ...(outputs.length ? { outputs } : {}) };
  };
  return {
    provider: options.provider,
    execute: async (request, cancellation) => map(await jsonRequest(options, options.submitPath, { method: "POST", body: JSON.stringify({ ...(request.input as Record<string, unknown>), ...(request.idempotencyKey ? { clientRequestId: request.idempotencyKey } : {}) }) }, cancellation)),
    query: async (providerTaskId, cancellation) => map(await jsonRequest(options, queryPath, { method: "POST", body: JSON.stringify({ taskId: providerTaskId }) }, cancellation), providerTaskId),
  };
}

export interface DownloadedMediaArtifact { readonly relativePath: string; readonly bytes: number; readonly sha256: string; readonly contentType?: string; }

/** Downloads provider URLs before a task is considered durable. */
export async function downloadMediaOutputs(task: MediaTask, directory: string, options: { readonly fetchImpl?: typeof fetch; readonly filenamePrefix?: string; readonly maxBytes?: number; readonly allowedContentTypes?: readonly string[] } = {}): Promise<readonly DownloadedMediaArtifact[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const crypto = await import("node:crypto");
  await fs.mkdir(directory, { recursive: true });
  const artifacts: DownloadedMediaArtifact[] = [];
  for (const [index, output] of task.outputs.entries()) {
    const url = typeof output.url === "string" ? output.url : typeof output.uri === "string" ? output.uri : undefined;
    const encoded = typeof output.b64_json === "string" ? output.b64_json : typeof output.base64 === "string" ? output.base64 : undefined;
    if (!url && !encoded) continue;
    const response = url ? await fetchImpl(url) : undefined;
    if (response && (!response.ok || !response.body)) throw new Error(`media_download_http_${response.status}`);
    const contentType = response?.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType && options.allowedContentTypes?.length && !options.allowedContentTypes.some((allowed) => contentType === allowed.toLowerCase() || contentType.startsWith(`${allowed.toLowerCase()}/`))) throw new Error(`media_download_mime_rejected:${contentType}`);
    const maxBytes = Math.max(1, options.maxBytes ?? 512 * 1024 * 1024);
    const advertisedBytes = Number(response?.headers.get("content-length") ?? 0);
    if (advertisedBytes > maxBytes) throw new Error("media_download_too_large");
    const extension = url ? path.extname(new URL(url).pathname) || ".bin" : ".bin";
    const temporary = path.join(directory, `${options.filenamePrefix ?? "media"}-${index + 1}-${Date.now()}-${process.pid}.tmp`);
    let name = "";
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    let digest = "";
    let byteLength = 0;
    try {
      const hash = crypto.createHash("sha256");
      handle = await fs.open(temporary, "w");
      if (encoded) {
        const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
        if (bytes.byteLength > maxBytes) throw new Error("media_download_too_large");
        await handle.write(bytes as unknown as Uint8Array<ArrayBuffer>);
        hash.update(bytes as unknown as Uint8Array<ArrayBuffer>);
        byteLength = bytes.byteLength;
      } else {
        const reader = response!.body!.getReader();
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            const chunk = next.value;
            byteLength += chunk.byteLength;
            if (byteLength > maxBytes) throw new Error("media_download_too_large");
            await handle.write(chunk);
            hash.update(chunk);
          }
        } finally {
          reader.releaseLock();
        }
      }
      await handle.sync();
      await handle.close();
      handle = undefined;
      digest = hash.digest("hex");
      name = `${options.filenamePrefix ?? "media"}-${index + 1}-${digest.slice(0, 12)}${extension}`;
      const target = path.join(directory, name);
      await fs.rename(temporary, target);
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    artifacts.push({ relativePath: name, bytes: byteLength, sha256: digest, ...(contentType ? { contentType } : {}) });
  }
  return artifacts;
}

export async function runMediaJob(adapter: MediaProviderAdapter, request: MediaRequest, cancellation: CancellationPort, options: MediaPollingOptions = {}): Promise<MediaTask> {
  let task = normalizeMediaTask(options.initialTask ?? await adapter.execute(request, cancellation));
  if (!options.initialTask) await options.onSubmitted?.(task);
  await options.onUpdate?.(task);
  if (isMediaTerminal(task.status) || !adapter.query) return task;
  let cancelPromise: Promise<void> | undefined;
  const onAbort = () => {
    if (!adapter.cancel || isMediaTerminal(task.status) || cancelPromise) return;
    // The provider cancel request must still be sent after the local run is
    // aborted. Reusing the aborted port makes every provider client throw
    // before its HTTP request is issued.
    const cancelPort: CancellationPort = { throwIfCancelled: () => undefined };
    cancelPromise = Promise.resolve(adapter.cancel(task.providerTaskId, cancelPort)).then(() => undefined).catch(() => undefined);
  };
  cancellation.signal?.addEventListener("abort", onAbort, { once: true });
  const deadline = Date.now() + Math.max(1000, options.timeoutMs ?? 30 * 60 * 1000);
  try {
    while (!isMediaTerminal(task.status)) {
      cancellation.throwIfCancelled();
      if (Date.now() >= deadline) throw new Error("media_poll_timeout");
      await new Promise((resolve) => setTimeout(resolve, Math.max(10, options.pollIntervalMs ?? 1000)));
      task = normalizeMediaTask(await adapter.query(task.providerTaskId, cancellation));
      await options.onUpdate?.(task);
    }
  } finally {
    cancellation.signal?.removeEventListener("abort", onAbort);
  }
  return task;
}

export interface MediaJobRecord {
  readonly runId: string;
  readonly nodeId: string;
  readonly idempotencyKey: string;
  readonly provider: MediaProviderId;
  readonly providerTaskId?: string;
  readonly status: MediaTaskStatus | "interrupted";
  readonly submittedAt: string;
  readonly updatedAt: string;
}

export function createMediaIdempotencyKey(runId: string, nodeId: string, attempt: number) {
  return `${runId}:${nodeId}:${Math.max(1, Math.floor(attempt))}`;
}

export function isMediaTerminal(status: MediaTaskStatus | "interrupted") {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function recoverMediaJob(record: MediaJobRecord): "poll" | "submit" | "done" {
  if (isMediaTerminal(record.status)) return "done";
  if (record.providerTaskId) return "poll";
  return "submit";
}

export function normalizeMediaTask(task: MediaTask): MediaTask {
  const status: MediaTaskStatus = ["queued", "running", "succeeded", "failed", "cancelled"].includes(task.status) ? task.status : "failed";
  return { providerTaskId: task.providerTaskId.trim(), status, ...(task.providerStatus ? { providerStatus: task.providerStatus.slice(0, 160) } : {}), outputs: task.outputs.map((output) => ({ ...output })) };
}
