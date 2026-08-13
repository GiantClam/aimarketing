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
  readonly usage?: MediaUsage;
}

export interface MediaUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly requestCount?: number;
  readonly durationSeconds?: number;
  readonly providerCost?: number;
  readonly estimatedCost?: number;
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
    try { parsed = body ? JSON.parse(body) : null; } catch { throw new Error("media_provider_invalid_response"); }
    if (!response.ok) throw new Error(`media_provider_http_${response.status}`);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("media_provider_invalid_response");
    return parsed as Record<string, unknown>;
  };
  const toTask = (value: Record<string, unknown>): MediaTask => {
    const providerTaskId = String(value.id ?? value.task_id ?? value.taskId ?? `sync-${Date.now()}`);
    const statusText = String(value.status ?? value.state ?? "succeeded").toLowerCase();
    const status: MediaTaskStatus = statusText.includes("fail") || statusText.includes("error") ? "failed" : statusText.includes("queue") ? "queued" : statusText.includes("run") || statusText.includes("process") ? "running" : "succeeded";
    const outputValues = Array.isArray(value.data) ? value.data : Array.isArray(value.output) ? value.output : Array.isArray(value.outputs) ? value.outputs : [];
    const outputs = outputValues.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ ...item }));
    const nestedOutput = value.output && typeof value.output === "object" ? value.output as Record<string, unknown> : undefined;
    const usage = normalizeUsage(value.usage ?? value.usage_info ?? nestedOutput?.usage);
    return { providerTaskId, status, ...(typeof value.status === "string" ? { providerStatus: value.status } : {}), outputs, ...(usage ? { usage } : {}) };
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
  /** Workspace root used for provider-side uploads initiated by local adapters. */
  readonly workspacePath?: string;
}

function providerUrl(baseUrl: string, path: string, query?: Record<string, string>) {
  // Treat provider paths as relative to the configured base path. A leading
  // slash would make URL() discard a `/v1` prefix used by OpenAI-compatible
  // gateways.
  const relativePath = path.replace(/^\/+/u, "");
  const url = new URL(relativePath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url;
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numberValue(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function finiteNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeUsage(value: unknown): MediaUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const inputTokens = finiteNumber(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens);
  const outputTokens = finiteNumber(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens);
  const requestCount = finiteNumber(usage.request_count ?? usage.requestCount ?? usage.requests);
  const durationSeconds = finiteNumber(usage.duration_seconds ?? usage.durationSeconds ?? (finiteNumber(usage.duration_ms) !== undefined ? Number(usage.duration_ms) / 1000 : undefined));
  const providerCost = finiteNumber(usage.provider_cost ?? usage.providerCost ?? usage.cost_usd ?? usage.costUsd ?? usage.cost);
  const estimatedCost = finiteNumber(usage.estimated_cost ?? usage.estimatedCost);
  const normalized = { inputTokens, outputTokens, requestCount, durationSeconds, providerCost, estimatedCost };
  return Object.values(normalized).some((entry) => entry !== undefined) ? Object.fromEntries(Object.entries(normalized).filter(([, entry]) => entry !== undefined)) as MediaUsage : undefined;
}

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
  const addValue = (value: unknown) => {
    if (value === undefined || value === null || values.includes(value)) return;
    if (Array.isArray(value)) values.push(value);
    else values.push(value);
  };
  for (const value of [output.video_url, output.audio, output.url, output.file_url, output.results, output.images, output.data, payload.data, payload.results, payload.outputs]) addValue(value);
  const seen = new Set<string>();
  const outputs = values.flatMap((value) => {
    const candidates = Array.isArray(value) ? value : [value];
    return candidates.flatMap((item) => {
      if (typeof item === "string") return [{ url: item }];
      if (!item || typeof item !== "object") return [];
      return [{ ...(item as Record<string, unknown>) }];
    });
  }).filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const usage = normalizeUsage(output.usage ?? output.usage_info ?? payload.usage ?? payload.usage_info);
  return { providerTaskId, status: mapProviderStatus(providerStatus), ...(providerStatus ? { providerStatus: String(providerStatus) } : {}), outputs, ...(usage ? { usage } : {}) };
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

async function uploadMiniMaxFile(options: DirectProviderOptions, sourcePath: string, cancellation: CancellationPort): Promise<string> {
  requireInjectedProviderConfig(options, "voice-clone");
  cancellation.throwIfCancelled();
  const workspacePath = text(options.workspacePath);
  if (!workspacePath) throw new Error("voice_clone_workspace_required");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  if (path.isAbsolute(sourcePath)) throw new Error("voice_clone_source_file_unsafe");
  const root = path.resolve(workspacePath);
  const candidate = path.resolve(root, sourcePath);
  if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) throw new Error("voice_clone_source_file_unsafe");
  const metadata = await fs.stat(candidate).catch(() => undefined);
  if (!metadata?.isFile()) throw new Error("voice_clone_source_file_missing");
  const bytes = await fs.readFile(candidate);
  const form = new FormData();
  form.set("purpose", "voice_clone");
  form.set("file", new Blob([bytes as unknown as BlobPart]), path.basename(candidate));
  const response = await (options.fetchImpl ?? fetch)(providerUrl(options.baseUrl, "/files/upload"), {
    method: "POST",
    headers: { accept: "application/json", authorization: `Bearer ${options.apiKey}` },
    body: form,
    signal: cancellation.signal,
  });
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`voice_clone_upload_failed:${response.status}`);
  const file = body && typeof body === "object" && "file" in body && body.file && typeof body.file === "object" ? body.file as Record<string, unknown> : undefined;
  const rawFileId = file?.file_id ?? file?.fileId;
  const fileId = typeof rawFileId === "number" && Number.isSafeInteger(rawFileId) && rawFileId > 0 ? String(rawFileId) : text(rawFileId);
  if (!fileId) throw new Error("voice_clone_upload_missing_file_id");
  return fileId;
}

/** Direct OpenAI-compatible image generation adapter. The provider response is
 * kept as a local task so the host can download URLs or decode b64_json without
 * involving a SaaS route.
 */
export function createOpenAICompatibleImageAdapter(options: DirectProviderOptions): MediaProviderAdapter {
  return {
    provider: options.provider,
    execute: async (request, cancellation) => {
      const input = request.input as Record<string, unknown>;
      const prompt = text(input.prompt);
      if (!prompt) throw new Error("image_prompt_required");
      const count = Math.max(1, Math.min(4, Math.floor(numberValue(input.n, 1))));
      const optional = (key: string) => {
        const value = input[key];
        return typeof value === "string" && value.trim() ? { [key]: value.trim() } : {};
      };
      const body = {
        model: request.modelId,
        prompt,
        n: count,
        ...optional("size"),
        ...optional("quality"),
        ...optional("background"),
        ...optional("output_format"),
        ...optional("response_format"),
        ...(request.idempotencyKey ? { user: request.idempotencyKey } : {}),
      };
      const payload = await jsonRequest(options, "/images/generations", {
        method: "POST",
        body: JSON.stringify(body),
        headers: request.idempotencyKey ? { "Idempotency-Key": request.idempotencyKey } : undefined,
      }, cancellation);
      return asTask(options.provider, payload);
    },
  };
}

/** Direct DashScope/Bailian text-to-image adapter with recoverable async tasks. */
export function createBailianImageAdapter(options: DirectProviderOptions): MediaProviderAdapter {
  return {
    provider: options.provider,
    execute: async (request, cancellation) => {
      const input = request.input as Record<string, unknown>;
      const prompt = text(input.prompt);
      if (!prompt) throw new Error("image_prompt_required");
      const parameters = {
        size: text(input.size) || "1024*1024",
        n: Math.max(1, Math.min(4, Math.floor(numberValue(input.n, 1)))),
        ...(text(input.style) ? { style: text(input.style) } : {}),
        ...(text(input.seed) ? { seed: numberValue(input.seed, 0) } : {}),
      };
      const payload = await jsonRequest(options, "/api/v1/services/aigc/text2image/image-synthesis", {
        method: "POST",
        body: JSON.stringify({
          model: request.modelId,
          input: { prompt, ...(text(input.negativePrompt) ? { negative_prompt: text(input.negativePrompt) } : {}) },
          parameters,
        }),
        headers: { "X-DashScope-Async": "enable", ...(request.idempotencyKey ? { "X-Request-ID": request.idempotencyKey } : {}) },
      }, cancellation);
      return asTask(options.provider, payload);
    },
    query: async (providerTaskId, cancellation) => asTask(options.provider, await jsonRequest(options, `/api/v1/tasks/${encodeURIComponent(providerTaskId)}`, { method: "GET" }, cancellation), providerTaskId),
  };
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
      const featureId = text(input.featureId);
      if (featureId === "voice-clone" || text(input.kind) === "voice_clone") {
        let sourceFileId = text(input.sourceFileId);
        if (!sourceFileId) {
          const attachments = Array.isArray(input.localAttachments) ? input.localAttachments.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
          const sourceFilePath = text(input.sourceFilePath) || attachments[0] || "";
          if (!sourceFilePath) throw new Error("voice_clone_source_file_required");
          sourceFileId = await uploadMiniMaxFile(options, sourceFilePath, cancellation);
        }
        if (!sourceFileId) throw new Error("voice_clone_source_file_required");
        const numericSourceFileId = Number(sourceFileId);
        if (!Number.isSafeInteger(numericSourceFileId) || numericSourceFileId <= 0) throw new Error("voice_clone_source_file_invalid");
        const voiceId = text(input.voiceId) || `desktop-voice-${Date.now()}`;
        const body: Record<string, unknown> = {
          file_id: numericSourceFileId,
          voice_id: voiceId,
          need_noise_reduction: String(input.needNoiseReduction ?? "false") === "true",
          need_volume_normalization: String(input.needVolumeNormalization ?? "false") === "true",
          aigc_watermark: false,
        };
        const previewText = text(input.previewText) || text(input.prompt);
        if (previewText) {
          body.text = previewText;
          body.model = request.modelId || "speech-2.8-turbo";
          body.language_boost = text(input.languageBoost) || "auto";
        }
        const promptAudioFileId = text(input.promptAudioFileId);
        const promptText = text(input.promptText);
        if (promptAudioFileId && promptText) {
          const numericPromptAudioFileId = Number(promptAudioFileId);
          if (!Number.isSafeInteger(numericPromptAudioFileId) || numericPromptAudioFileId <= 0) throw new Error("voice_clone_prompt_audio_invalid");
          body.clone_prompt = { prompt_audio: numericPromptAudioFileId, prompt_text: promptText };
        }
        const payload = await jsonRequest(options, "/voice_clone", { method: "POST", body: JSON.stringify(body) }, cancellation);
        const task = asTask(options.provider, payload);
        const previewUrl = text(payload.demo_audio);
        return {
          ...task,
          status: "succeeded",
          outputs: [...task.outputs, ...(previewUrl ? [{ url: previewUrl }] : []), { voiceId }],
        };
      }
      const kind = text(input.kind) || (featureId === "ai-music" ? "music" : "speech");
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
export async function downloadMediaOutputs(task: MediaTask, directory: string, options: { readonly fetchImpl?: typeof fetch; readonly filenamePrefix?: string; readonly maxBytes?: number; readonly allowedContentTypes?: readonly string[]; readonly tempDirectory?: string } = {}): Promise<readonly DownloadedMediaArtifact[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const crypto = await import("node:crypto");
  const tempDirectory = options.tempDirectory ?? directory;
  await fs.mkdir(directory, { recursive: true });
  if (tempDirectory !== directory) await fs.mkdir(tempDirectory, { recursive: true });
  const artifacts: DownloadedMediaArtifact[] = [];
  try {
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
      const temporary = path.join(tempDirectory, `${options.filenamePrefix ?? "media"}-${index + 1}-${Date.now()}-${process.pid}.tmp`);
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
  } finally {
    if (tempDirectory !== directory) await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
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
  return { providerTaskId: task.providerTaskId.trim(), status, ...(task.providerStatus ? { providerStatus: task.providerStatus.slice(0, 160) } : {}), outputs: task.outputs.map((output) => ({ ...output })), ...(task.usage ? { usage: normalizeUsage(task.usage) } : {}) };
}
