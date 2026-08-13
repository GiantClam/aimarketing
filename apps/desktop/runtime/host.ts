import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { buildOpenCodeCommand, createOpenCodeEventParser, type OpenCodeRuntimeEvent } from "@aimarketing/runtime-contracts/opencode";
import { createBailianImageAdapter, createBailianVideoAdapter, createHttpMediaAdapter, createMiniMaxAudioAdapter, createMiniMaxVideoAdapter, createOpenAICompatibleImageAdapter, createRunningHubAdapter, downloadMediaOutputs, runMediaJob, type MediaProviderId, type MediaProviderAdapter } from "@aimarketing/media-runtime";
import { executeWorkflow, migrateWorkflowDefinitionToCurrent, type WorkflowArtifactPort, type WorkflowCapabilityPort, type WorkflowDefinitionEnvelope } from "@aimarketing/workflow-core";
import { searchVaultIndex } from "./rag";
import { activateIndexGeneration, createIndexGenerationPath, indexObsidianVault, ObsidianVaultWatcher, writeObsidianNote } from "./obsidian";
import { detectPresentationArtifacts } from "./presentation-artifacts";
import { buildLanceIndex } from "./lancedb";
import { OpenCodeServeClient } from "./opencode-serve";
import { createRpcReader, writeRpcResponse } from "./rpc";
import { createDesktopWorkflowPorts } from "./workflow-ports";

type HostCommand = { readonly version: 1; readonly requestId: string; readonly type: "chat.run" | "workflow.run" | "run.cancel" | "run.emergency_stop" | "run.retry" | "media.resume" | "health" | "session.create" | "session.prompt" | "knowledge.index" | "knowledge.search"; readonly runId?: string; readonly sessionId?: string; readonly payload?: Record<string, unknown> };
type ProviderConfig = { readonly id?: string; readonly source?: string; readonly model?: string; readonly baseUrl?: string; readonly apiKey?: string; readonly reasoningEffort?: string; readonly endpoint?: string; readonly queryEndpoint?: string };
const active = new Map<string, ReturnType<typeof spawn>>();
const workflowControllers = new Map<string, AbortController>();
const vaultWatchers = new Map<string, ObsidianVaultWatcher>();
const sessions = new Map<string, { readonly conversationId: string; readonly workspacePath: string; readonly sessionId: string; readonly provider?: ProviderConfig }>();
let shuttingDown = false;
function defaultOpenCodeExecutable() {
  if (process.env.AIMARKETING_OPENCODE_PATH) return process.env.AIMARKETING_OPENCODE_PATH;
  if (process.platform === "win32") {
    const bundled = join(dirname(process.execPath), "node_modules", "opencode-ai", "bin", "opencode.exe");
    if (existsSync(bundled)) return bundled;
    return "opencode.exe";
  }
  return "opencode";
}
const serveClient = new OpenCodeServeClient(defaultOpenCodeExecutable(), join(process.env.OPENCODE_RUNTIME_DIR ?? process.cwd(), ".opencode-server"));
process.once("exit", () => { for (const watcher of vaultWatchers.values()) watcher.stop(); vaultWatchers.clear(); });

async function shutdownHost() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const watcher of vaultWatchers.values()) watcher.stop();
  vaultWatchers.clear();
  await serveClient.stop().catch(() => undefined);
  process.exit(0);
}

process.once("SIGTERM", () => { void shutdownHost(); });
process.once("SIGINT", () => { void shutdownHost(); });

function respond(command: HostCommand, data: unknown) { writeRpcResponse(process.stdout, { version: 1, requestId: command.requestId, ok: true, data }); }
function fail(command: HostCommand, code: string, message: string) { writeRpcResponse(process.stdout, { version: 1, requestId: command.requestId, ok: false, error: { code, message, retryable: false } }); }

async function runOpenCode(command: HostCommand, session?: { readonly workspacePath: string; readonly sessionId?: string; readonly provider?: ProviderConfig }, options: { readonly respond?: boolean; readonly signal?: AbortSignal } = {}) {
  const prompt = typeof command.payload?.prompt === "string" ? command.payload.prompt : "";
  if (!prompt.trim()) return fail(command, "invalid_prompt", "prompt is required");
  const runId = command.runId ?? randomUUID();
  const modelHint = typeof command.payload?.model === "string" ? command.payload.model : undefined;
  const provider = readProvider(command.payload?.provider);
  const executable = typeof command.payload?.executable === "string" ? command.payload.executable : defaultOpenCodeExecutable();
  const workspacePath = session?.workspacePath ?? (typeof command.payload?.workspacePath === "string" ? command.payload.workspacePath : process.cwd());
  const configDirectory = await prepareSkillWorkspace(workspacePath);
  await writeOpenCodeConfig(configDirectory, provider, modelHint);
  const environment = withPrivatePython({ ...process.env, OPENCODE_CONFIG_DIR: configDirectory, ...(provider?.apiKey && provider.id ? { [`${providerKey(provider.id).toUpperCase()}_API_KEY`]: provider.apiKey } : {}) });
  const persistentSession = session?.sessionId ? session as { readonly workspacePath: string; readonly sessionId: string; readonly provider?: ProviderConfig } : undefined;
  if (persistentSession?.sessionId) {
    if (options.respond !== false) respond(command, { runId });
    const events: OpenCodeRuntimeEvent[] = [];
    await serveClient.prompt(persistentSession.sessionId, workspacePath, runId, prompt, provider ?? persistentSession.provider ?? {}, (event) => { const enriched = enrichUsageEvent(event, provider ?? persistentSession.provider, modelHint); events.push(enriched); emit(command, enriched); }, options.signal);
    return events;
  }
  const child = spawn(executable, buildOpenCodeCommand({ modelHint }).args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, cwd: workspacePath, env: environment });
  active.set(runId, child);
  const parser = createOpenCodeEventParser(runId);
  const events: OpenCodeRuntimeEvent[] = [];
  child.stdout.on("data", (chunk: Buffer) => { for (const event of parser.push(chunk.toString("utf8"))) { const enriched = enrichUsageEvent(event, provider, modelHint); events.push(enriched); emit(command, enriched); } });
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(`[opencode:${runId}] ${chunk.toString("utf8")}`));
  const result = new Promise<readonly OpenCodeRuntimeEvent[]>((resolve) => {
    const abort = () => { if (!child.killed) child.kill(); };
    options.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (error) => { const event: OpenCodeRuntimeEvent = { event: "runtime_error", code: "opencode_spawn_failed", message: error.message.slice(0, 1024), retryable: true, runId }; events.push(event); emit(command, event); });
    child.on("close", (code) => { options.signal?.removeEventListener("abort", abort); for (const event of parser.finish()) if (code === 0 || event.event !== "done") { const enriched = enrichUsageEvent(event, provider, modelHint); events.push(enriched); emit(command, enriched); } active.delete(runId); if (code !== 0) { const event: OpenCodeRuntimeEvent = { event: "runtime_error", code: options.signal?.aborted ? "opencode_aborted" : "opencode_exit", message: options.signal?.aborted ? "OpenCode run cancelled." : `OpenCode exited with code ${code ?? "unknown"}`, retryable: !options.signal?.aborted, runId }; events.push(event); emit(command, event); } resolve(events); });
  });
  child.stdin.end(prompt);
  if (options.respond !== false) respond(command, { runId });
  return result;
}

function enrichUsageEvent(event: OpenCodeRuntimeEvent, provider: ProviderConfig | undefined, modelHint: string | undefined): OpenCodeRuntimeEvent {
  if (event.event !== "usage" || event.provider) return event;
  return { ...event, provider: selectedModel(provider, modelHint).providerId };
}

function readProvider(value: unknown): ProviderConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.id === "string" ? { id: record.id } : {}),
    ...(typeof record.source === "string" ? { source: record.source } : {}),
    ...(typeof record.model === "string" ? { model: record.model } : {}),
    ...(typeof record.baseUrl === "string" ? { baseUrl: record.baseUrl } : {}),
    ...(typeof record.apiKey === "string" ? { apiKey: record.apiKey } : {}),
    ...(typeof record.reasoningEffort === "string" ? { reasoningEffort: record.reasoningEffort } : {}),
    ...(typeof record.endpoint === "string" ? { endpoint: record.endpoint } : {}),
    ...(typeof record.queryEndpoint === "string" ? { queryEndpoint: record.queryEndpoint } : {}),
  };
}

function readProviderMap(value: unknown): Record<string, ProviderConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const profiles: Record<string, ProviderConfig> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const provider = readProvider(raw);
    if (provider) profiles[key] = provider;
  }
  return profiles;
}

function readWorkflowRecovery(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const recovering: Record<string, { providerTaskId: string; metadata?: Record<string, unknown> }> = {};
  for (const [nodeKey, attempt] of Object.entries(value as Record<string, unknown>)) {
    if (!attempt || typeof attempt !== "object") continue;
    const record = attempt as Record<string, unknown>;
    if (typeof record.providerTaskId !== "string" || !record.providerTaskId.trim()) continue;
    recovering[nodeKey] = {
      providerTaskId: record.providerTaskId.trim(),
      ...(record.metadata && typeof record.metadata === "object" ? { metadata: record.metadata as Record<string, unknown> } : {}),
    };
  }
  return Object.keys(recovering).length ? recovering : undefined;
}

function providerKey(providerId: string) {
  return providerId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "local";
}

function withPrivatePython(environment: NodeJS.ProcessEnv) {
  const executable = environment.AIMARKETING_PYTHON_PATH;
  if (!executable) return environment;
  const separator = process.platform === "win32" ? ";" : ":";
  return { ...environment, PATH: `${dirname(executable)}${separator}${environment.PATH ?? process.env.PATH ?? ""}` };
}

function selectedModel(provider: ProviderConfig | undefined, modelHint: string | undefined) {
  const configured = (provider?.model || modelHint || "").trim();
  const slash = configured.indexOf("/");
  return {
    // A local desktop default may keep `id=local` while selecting an
    // OpenAI-compatible model such as `ollama/qwen3:8b`. The model prefix is
    // the authoritative OpenCode provider in that form; otherwise a provider
    // without a qualified model keeps its explicit id.
    providerId: providerKey(slash > 0 ? configured.slice(0, slash) : (provider?.id || "local")),
    modelId: slash > 0 ? configured.slice(slash + 1) : configured || "qwen3:8b",
  };
}

async function writeOpenCodeConfig(configDirectory: string, provider: ProviderConfig | undefined, modelHint: string | undefined) {
  const selected = selectedModel(provider, modelHint);
  const model = selected.modelId;
  const options = {
    ...(provider?.baseUrl ? { baseURL: provider.baseUrl } : {}),
    ...(provider?.apiKey ? { apiKey: `{env:${selected.providerId.toUpperCase()}_API_KEY}` } : {}),
  };
  const config = {
    share: "disabled",
    autoupdate: false,
    permission: {
      read: "allow", edit: "allow", bash: "allow", glob: "allow", grep: "allow", list: "allow",
      skill: "allow", task: "allow", websearch: "allow", webfetch: "allow", question: "deny", delete: "allow",
      external_directory: "allow", todowrite: "allow", lsp: "allow", doom_loop: "allow",
    },
    provider: {
      [selected.providerId]: {
        npm: "@ai-sdk/openai-compatible",
        name: selected.providerId,
        ...(Object.keys(options).length ? { options: { ...options, ...(provider?.reasoningEffort ? { reasoningEffort: provider.reasoningEffort } : {}) } } : {}),
        models: { [model]: { name: model } },
      },
    },
  };
  await mkdir(configDirectory, { recursive: true });
  const target = join(configDirectory, "opencode.json");
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(config, null, 2), "utf8");
  await rename(temporary, target);
}

type EmbeddingConfig = { readonly mode?: "local" | "remote"; readonly baseUrl?: string; readonly model?: string; readonly apiKey?: string };

async function rebuildVaultIndex(vaultPath: string, indexPath: string, embedding: EmbeddingConfig) {
  const generationPath = createIndexGenerationPath(indexPath);
  const manifest = await indexObsidianVault(vaultPath, indexPath, 0, generationPath);
  let state: Awaited<ReturnType<typeof buildLanceIndex>>;
  try {
    state = await buildLanceIndex(generationPath, manifest, embedding);
  } catch {
    state = { schemaVersion: 1, generation: manifest.generation, status: "lexical_ready", embeddingModel: "lexical-fallback", embeddingDimension: 0, updatedAt: new Date().toISOString() };
  }
  await activateIndexGeneration(indexPath, generationPath, manifest.generation);
  return { manifest, state };
}

function watchVault(vaultPath: string, indexPath: string, embedding: EmbeddingConfig) {
  const existing = vaultWatchers.get(indexPath);
  existing?.stop();
  const watcher = new ObsidianVaultWatcher(vaultPath, () => {
    void rebuildVaultIndex(vaultPath, indexPath, embedding).catch(() => undefined);
  }).start();
  vaultWatchers.set(indexPath, watcher);
}

async function prepareSkillWorkspace(workspacePath: string) {
  const source = process.env.AIMARKETING_SKILLS_DIR;
  const configDirectory = join(workspacePath, ".opencode");
  if (!source) return configDirectory;
  const target = join(configDirectory, "skills");
  try { await mkdir(target, { recursive: true }); await cp(source, target, { recursive: true, force: false, errorOnExist: false }); } catch { /* missing optional bundled skills are surfaced by OpenCode */ }
  return configDirectory;
}

async function runWorkflow(command: HostCommand) {
  const definition = command.payload?.definition;
  if (!definition || typeof definition !== "object") return fail(command, "invalid_workflow", "workflow definition is required");
  const runId = command.runId ?? randomUUID(); const workspacePath = typeof command.payload?.workspacePath === "string" ? command.payload.workspacePath : process.cwd();
  respond(command, { runId });
  const normalizedDefinition = migrateWorkflowDefinitionToCurrent(definition as WorkflowDefinitionEnvelope);
  const workflowStartedAt = Date.now();
  const controller = new AbortController(); workflowControllers.set(runId, controller);
  let result: Awaited<ReturnType<typeof executeWorkflow>>;
  let artifactPort: WorkflowArtifactPort;
  const capability: WorkflowCapabilityPort = { execute: async ({ executorId, nodeKey, config, inputs }, signal) => {
      if (executorId === "text_input") return { text: typeof config.text === "string" ? config.text : "" };
      if (executorId === "upload") {
        const uploadedFiles = Array.isArray(config.uploadedFiles) ? config.uploadedFiles : [];
        const referencedArtifactIds = Array.isArray(config.referencedArtifactIds) ? config.referencedArtifactIds : [];
        return { assets: [...uploadedFiles, ...referencedArtifactIds], asset: [...uploadedFiles, ...referencedArtifactIds] };
      }
      if (executorId === "collect" || executorId === "output") return inputs;
      if (executorId === "product_store") return { ...inputs, stored: true };
      if (executorId === "foreach") {
        const inputPort = typeof config.inputPortId === "string" && config.inputPortId.startsWith("asset") ? "asset" : "image";
        const source = inputs[`items.${inputPort}`] ?? inputs[`${inputPort}s`] ?? inputs[inputPort];
        const values = Array.isArray(source) ? source : source === undefined ? [] : [source];
        return inputPort === "asset" ? { assets: values, asset: values } : { images: values, image: values };
      }
      if (executorId === "file_create") {
        const output = await createFileArtifact(workspacePath, runId, nodeKey, config, inputs);
        const extension = output.artifact.relativePath.toLowerCase().split(".").pop() ?? "bin";
        const mimeType = extension === "md" ? "text/markdown" : extension === "txt" ? "text/plain" : "application/octet-stream";
        const registration = await artifactPort.register({ relativePath: output.artifact.relativePath, mimeType, byteLength: output.artifact.bytes, sha256: output.artifact.sha256 });
        return { ...output, artifact: { ...output.artifact, artifactId: registration.artifactId, registered: true } };
      }
      if (executorId === "knowledge_retrieve") {
        const indexPath = typeof config.indexPath === "string" ? config.indexPath : typeof command.payload?.indexPath === "string" ? command.payload.indexPath : "";
        if (!indexPath) throw new Error("knowledge_index_required");
        const query = typeof config.query === "string" ? config.query : typeof inputs.text === "string" ? inputs.text : "";
        const citations = await searchVaultIndex(indexPath, query, Number(config.limit ?? 8), { mode: config.embeddingMode === "remote" ? "remote" : "local", baseUrl: typeof config.embeddingBaseUrl === "string" ? config.embeddingBaseUrl : undefined, model: typeof config.embeddingModel === "string" ? config.embeddingModel : undefined, apiKey: typeof config.embeddingApiKey === "string" ? config.embeddingApiKey : undefined });
        return { citations, text: citations.map((item) => `[${item.documentPath}${item.heading ? `#${item.heading}` : ""}] ${item.excerpt}`).join("\n") };
      }
      if (executorId === "knowledge_write") {
        const vaultPath = typeof config.vaultPath === "string" ? config.vaultPath : typeof command.payload?.vaultPath === "string" ? command.payload.vaultPath : "";
        if (!vaultPath) throw new Error("knowledge_vault_required");
        return writeObsidianNote({ vaultPath, targetPath: typeof config.targetPath === "string" ? config.targetPath : undefined, content: typeof inputs.text === "string" ? inputs.text : JSON.stringify(inputs, null, 2), baseHash: typeof config.baseHash === "string" ? config.baseHash : undefined });
      }
      if (["image_generate", "video_generate", "digital_human", "music_generate", "voice_synthesis", "voice_clone", "audio_generate"].includes(executorId)) return runMediaCapability(command, runId, nodeKey, executorId, config, inputs, workspacePath, signal);
      const prompt = [typeof config.prompt === "string" ? config.prompt : "", typeof config.script === "string" ? config.script : "", typeof config.text === "string" ? config.text : "", typeof inputs.text === "string" ? inputs.text : ""].filter(Boolean).join("\n\n");
      const nodeCommand: HostCommand = { ...command, runId: `${runId}:${nodeKey}`, payload: { ...(command.payload ?? {}), prompt: executorId === "ppt_generate" ? `${prompt}\n\nUse the local ppt-master skill and write the editable PPTX into the project workspace.` : prompt } };
      const workflowProvider = readProvider(command.payload?.provider);
      const workflowConfigDirectory = await prepareSkillWorkspace(workspacePath);
      await writeOpenCodeConfig(workflowConfigDirectory, workflowProvider, workflowProvider?.model);
      const workflowEnvironment = withPrivatePython({ ...process.env, OPENCODE_CONFIG_DIR: workflowConfigDirectory, ...(workflowProvider?.apiKey && workflowProvider.id ? { [`${providerKey(workflowProvider.id).toUpperCase()}_API_KEY`]: workflowProvider.apiKey } : {}) });
      const { sessionId: workflowSessionId } = await serveClient.createOrResumeSession(workspacePath, undefined, workflowProvider ?? {}, workflowEnvironment);
      const events = await runOpenCode(nodeCommand, { workspacePath, sessionId: workflowSessionId, provider: workflowProvider }, { respond: false, signal });
      const text = (events ?? []).filter((event): event is Extract<OpenCodeRuntimeEvent, { event: "text_delta" }> => event.event === "text_delta").map((event) => event.delta).join("");
      const artifacts = executorId === "ppt_generate" ? await detectPresentationArtifacts(workspacePath, workflowStartedAt) : [];
      return { text, ...(artifacts.length ? { artifacts } : {}) };
    }, resume: async ({ executorId, nodeKey, config, inputs, providerTaskId }, signal) => {
      if (["image_generate", "video_generate", "digital_human", "music_generate", "voice_synthesis", "voice_clone", "audio_generate"].includes(executorId)) {
        return runMediaCapability(command, runId, nodeKey, executorId, config, inputs, workspacePath, signal, providerTaskId);
      }
      throw new Error(`workflow_recovery_unsupported:${executorId}`);
    } };
  const ports = createDesktopWorkflowPorts({ runId, emit: (event) => emit(command, event), capability });
  artifactPort = ports.artifacts;
  const recoveryDefinitionHash = typeof command.payload?.recoveryDefinitionHash === "string" && command.payload.recoveryDefinitionHash.trim() ? command.payload.recoveryDefinitionHash.trim() : undefined;
  try { result = await executeWorkflow(normalizedDefinition, { runId, signal: controller.signal, recovering: readWorkflowRecovery(command.payload?.recovering), ...(recoveryDefinitionHash ? { recoveryDefinitionHash } : {}), ...(command.payload?.completed && typeof command.payload.completed === "object" ? { completed: command.payload.completed as Record<string, Record<string, unknown>> } : {}), ports }); } catch (error) {
    workflowControllers.delete(runId);
    emit(command, { event: "runtime_error", code: "workflow_invalid", message: error instanceof Error ? error.message : String(error), retryable: false, runId });
    return;
  }
  workflowControllers.delete(runId);
  for (const [nodeKey, output] of Object.entries(result.outputs)) {
    const artifacts = Array.isArray(output.artifacts) ? output.artifacts : output.artifact ? [output.artifact] : [];
    for (const artifact of artifacts) emit(command, { event: "tool_event", tool: `artifact:${nodeKey}`, phase: "completed", message: JSON.stringify(artifact).slice(0, 64 * 1024), runId });
  }
  if (result.status === "succeeded") emit(command, { event: "done", runId });
  else emit(command, { event: "runtime_error", code: "workflow_failed", message: result.error ?? result.status, retryable: result.status !== "cancelled", runId });
}


async function createFileArtifact(workspacePath: string, runId: string, nodeKey: string, config: Record<string, unknown>, inputs: Record<string, unknown>) {
  const directory = resolve(workspacePath, "artifacts", runId.replace(/[^a-zA-Z0-9_-]/g, "_"));
  const requested = typeof config.fileName === "string" && config.fileName.trim() ? config.fileName.trim() : `${nodeKey}.md`;
  const target = resolve(directory, requested);
  if (target !== directory && !target.startsWith(`${directory}${sep}`)) throw new Error("artifact_path_escape");
  const content = typeof inputs.text === "string" ? inputs.text : JSON.stringify(inputs, null, 2);
  await mkdir(resolve(target, ".."), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8"); await rename(temporary, target);
  const hash = createHash("sha256").update(content).digest("hex");
  return { artifact: { relativePath: relative(workspacePath, target).replaceAll("\\", "/"), bytes: Buffer.byteLength(content, "utf8"), sha256: hash }, text: content };
}

async function runMediaCapability(command: HostCommand, runId: string, nodeKey: string, executorId: string, config: Record<string, unknown>, inputs: Record<string, unknown>, workspacePath: string, signal?: AbortSignal, resumeProviderTaskId?: string) {
  const configuredMedia = command.payload?.media && typeof command.payload.media === "object" ? command.payload.media as Record<string, unknown> : undefined;
  const textProvider = command.payload?.provider && typeof command.payload.provider === "object" ? command.payload.provider as Record<string, unknown> : undefined;
  const providerProfiles = readProviderMap(command.payload?.providers);
  const provider = typeof config.provider === "string" ? config.provider : typeof configuredMedia?.id === "string" ? configuredMedia.id : typeof textProvider?.id === "string" ? textProvider.id : "";
  const profile = providerProfiles[provider] ?? readProvider(configuredMedia) ?? readProvider(textProvider);
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl : profile?.baseUrl ?? "";
  if (!provider || !baseUrl) {
    const error = new Error(`provider_configuration_required:${executorId}`); (error as Error & { code?: string }).code = "provider_configuration_required"; throw error;
  }
  const defaultEndpoints: Record<string, string> = { image_generate: "/images/generations", video_generate: "/videos/generations", digital_human: "/videos/generations", music_generate: "/audio/generations", voice_synthesis: "/audio/speech", voice_clone: "/voice_clone", audio_generate: "/audio/generations" };
  const endpoint = typeof config.endpoint === "string" ? config.endpoint : profile?.endpoint ?? defaultEndpoints[executorId] ?? "";
  if (!endpoint) throw new Error(`provider_endpoint_required:${executorId}`);
  const apiKey = typeof config.apiKey === "string" ? config.apiKey : profile?.apiKey ?? (typeof command.payload?.apiKey === "string" ? command.payload.apiKey : undefined);
  const providerOptions = { provider: provider as MediaProviderId, baseUrl, apiKey: apiKey ?? "", fetchImpl: fetch, workspacePath };
  const providerLower = provider.toLowerCase();
  const adapter: MediaProviderAdapter = providerLower.includes("bailian") && executorId === "image_generate"
    ? createBailianImageAdapter(providerOptions)
    : providerLower.includes("bailian") && (executorId === "video_generate" || executorId === "digital_human")
      ? createBailianVideoAdapter(providerOptions)
      : providerLower.includes("minimax") && executorId === "video_generate"
      ? createMiniMaxVideoAdapter(providerOptions)
      : providerLower.includes("minimax") && ["music_generate", "voice_synthesis", "voice_clone", "audio_generate"].includes(executorId)
      ? createMiniMaxAudioAdapter(providerOptions)
      : providerLower.includes("runninghub")
     ? createRunningHubAdapter({ ...providerOptions, submitPath: endpoint, queryPath: typeof config.queryEndpoint === "string" ? config.queryEndpoint : profile?.queryEndpoint ?? "/openapi/v2/query" })
      : executorId === "image_generate" && (providerLower.includes("openai") || providerLower.includes("pptoken") || endpoint === "/images/generations")
        ? createOpenAICompatibleImageAdapter(providerOptions)
       : createHttpMediaAdapter({ provider: provider as MediaProviderId, baseUrl, apiKey, submitPath: endpoint, queryPath: typeof config.queryEndpoint === "string" ? (taskId) => `${config.queryEndpoint}/${encodeURIComponent(taskId)}` : profile?.queryEndpoint ? (taskId) => `${profile.queryEndpoint}/${encodeURIComponent(taskId)}` : undefined });
  if (resumeProviderTaskId && !adapter.query) throw new Error(`provider_resume_query_unsupported:${provider}`);
  const idempotencyKey = `${runId}:${nodeKey}:1`;
  const modelId = typeof config.model === "string" ? config.model : profile?.model ?? "default";
  emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "started", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, idempotencyKey, status: "queued" }), runId });
  const cancellation = { signal, throwIfCancelled() { if (signal?.aborted) throw new Error("media_cancelled"); } };
  let task: Awaited<ReturnType<typeof runMediaJob>>;
  try {
    task = await runMediaJob(adapter, { provider: provider as MediaProviderId, modelId, input: { ...config, ...inputs, ...(executorId === "voice_clone" ? { featureId: "voice-clone" } : {}) }, idempotencyKey }, cancellation, {
      pollIntervalMs: 1000,
      timeoutMs: 30 * 60 * 1000,
      ...(resumeProviderTaskId ? { initialTask: { providerTaskId: resumeProviderTaskId, status: "queued", outputs: [] } } : {}),
      onSubmitted: async (submitted) => emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "started", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: submitted.providerTaskId, idempotencyKey, status: submitted.status === "succeeded" ? "submitted" : submitted.status }), runId }),
      onUpdate: async (updated) => emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "progress", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: updated.providerTaskId, idempotencyKey, status: updated.status === "succeeded" ? "submitted" : updated.status, providerStatus: updated.providerStatus }), runId }),
    });
  } catch (error) {
    const status = signal?.aborted || (error instanceof Error && error.message === "media_cancelled") ? "cancelled" : "failed";
    emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "failed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: resumeProviderTaskId, idempotencyKey, status }), runId });
    throw error;
  }
  if (task.status !== "succeeded") {
    emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "failed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: task.providerTaskId, idempotencyKey, status: task.status }), runId });
    throw new Error(`media_task_${task.status}`);
  }
  const outputDirectory = join(workspacePath, "artifacts", runId.replace(/[^a-zA-Z0-9_-]/g, "_"), nodeKey.replace(/[^a-zA-Z0-9_-]/g, "_"));
  const tempDirectories = command.payload?.mediaTempDirectories && typeof command.payload.mediaTempDirectories === "object" ? command.payload.mediaTempDirectories as Record<string, unknown> : {};
  const tempRelativePath = typeof tempDirectories[nodeKey] === "string" ? tempDirectories[nodeKey].trim() : "";
  if (tempRelativePath && isAbsolute(tempRelativePath)) throw new Error("media_temp_path_escape");
  if (tempRelativePath && (!tempRelativePath.startsWith("artifacts/.tmp/") || tempRelativePath.split(/[\\/]/u).includes(".."))) throw new Error("media_temp_path_escape");
  const workspaceRoot = resolve(workspacePath);
  const tempDirectory = tempRelativePath ? resolve(workspaceRoot, tempRelativePath) : undefined;
  if (tempDirectory && (tempDirectory === workspaceRoot || !tempDirectory.startsWith(`${workspaceRoot}${sep}`))) throw new Error("media_temp_path_escape");
  let artifacts: Awaited<ReturnType<typeof downloadMediaOutputs>>;
  try {
    artifacts = await downloadMediaOutputs(task, outputDirectory, { filenamePrefix: executorId, ...(tempDirectory ? { tempDirectory } : {}) });
    if (!artifacts.length && task.outputs.length) throw new Error("media_outputs_not_downloadable");
  } catch (error) {
    emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "failed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: task.providerTaskId, idempotencyKey, status: "download_failed", error: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) }), runId });
    throw error;
  }
  emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "completed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: task.providerTaskId, idempotencyKey, status: "succeeded", ...(task.usage ? { usage: task.usage } : {}) }), runId });
  return { artifacts, providerTaskId: task.providerTaskId, status: task.status };
}

async function resumeMediaRun(command: HostCommand) {
  const runId = command.runId ?? (typeof command.payload?.runId === "string" ? command.payload.runId : randomUUID());
  const providerTaskId = typeof command.payload?.providerTaskId === "string" ? command.payload.providerTaskId : "";
  const executorId = typeof command.payload?.executorId === "string" ? command.payload.executorId : "video_generate";
  const nodeKey = typeof command.payload?.nodeKey === "string" ? command.payload.nodeKey : executorId;
  const config = command.payload?.config && typeof command.payload.config === "object" ? command.payload.config as Record<string, unknown> : {};
  if (!providerTaskId) return fail(command, "media_resume_task_missing", "providerTaskId is required");
  respond(command, { runId, resumed: true, providerTaskId });
  try {
    const workspacePath = typeof command.payload?.workspacePath === "string" ? command.payload.workspacePath : process.cwd();
    const result = await runMediaCapability(command, runId, nodeKey, executorId, config, {}, workspacePath, undefined, providerTaskId);
    for (const artifact of Array.isArray(result.artifacts) ? result.artifacts : []) emit(command, { event: "tool_event", tool: `artifact:${nodeKey}`, phase: "completed", message: JSON.stringify(artifact), runId });
    emit(command, { event: "done", runId });
  } catch (error) {
    emit(command, { event: "runtime_error", code: "media_resume_failed", message: error instanceof Error ? error.message : String(error), retryable: true, runId });
  }
}

function emit(command: HostCommand, event: OpenCodeRuntimeEvent) { writeRpcResponse(process.stdout, { version: 1, requestId: command.requestId, ok: true, data: { event } }); }

async function stopRun(command: HostCommand, emergency: boolean) {
  const runId = String(command.runId ?? command.payload?.runId ?? "");
  if (!runId) return fail(command, "run_id_required", "runId is required");
  const controller = workflowControllers.get(runId);
  controller?.abort();
  let stopped = Boolean(controller);
  for (const [key, child] of active) {
    if (key !== runId && !key.startsWith(`${runId}:`)) continue;
    child.kill();
    active.delete(key);
    stopped = true;
  }
  const served = await serveClient.cancelRun(runId);
  if (emergency) emit(command, { event: "tool_event", tool: "run:emergency_stop", phase: "completed", message: JSON.stringify({ runId, stopped: stopped || served }), runId });
  respond(command, { cancelled: stopped || served, emergency });
}

createRpcReader(process.stdin, (raw) => {
  const command = raw as unknown as HostCommand;
  if (!command.requestId || !command.type) return;
  if (command.type === "health") return respond(command, { status: "ok", capabilities: ["opencode", "opencode-serve", "persistent-sessions", "streaming", "artifacts", "full-access"] });
  if (command.type === "session.create") {
    const conversationId = typeof command.payload?.conversationId === "string" ? command.payload.conversationId : "";
    const workspacePath = typeof command.payload?.workspacePath === "string" ? command.payload.workspacePath : "";
    if (!conversationId || !workspacePath) return fail(command, "invalid_session", "conversationId and workspacePath are required");
    const provider = readProvider(command.payload?.provider);
    return void (async () => {
      try {
        const configDirectory = await prepareSkillWorkspace(workspacePath);
        await writeOpenCodeConfig(configDirectory, provider, typeof command.payload?.model === "string" ? command.payload.model : provider?.model);
        const environment = withPrivatePython({ ...process.env, OPENCODE_CONFIG_DIR: configDirectory, ...(provider?.apiKey && provider.id ? { [`${providerKey(provider.id).toUpperCase()}_API_KEY`]: provider.apiKey } : {}) });
        const { sessionId, recovered } = await serveClient.createOrResumeSession(workspacePath, typeof command.payload?.sessionId === "string" ? command.payload.sessionId : undefined, provider ?? {}, environment);
        sessions.set(sessionId, { conversationId, workspacePath, sessionId, provider });
        respond(command, { conversationId, sessionId, workspacePath, transport: "opencode-serve", fullAccess: true, recovered });
      } catch (error) { fail(command, "opencode_session_unavailable", error instanceof Error ? error.message : String(error)); }
    })();
  }
  if (command.type === "session.prompt") {
    const sessionId = typeof command.sessionId === "string" ? command.sessionId : typeof command.payload?.sessionId === "string" ? command.payload.sessionId : "";
    const session = sessions.get(sessionId);
    if (!session) return fail(command, "session_not_found", "OpenCode session is not available");
    return void runOpenCode(command, session);
  }
  if (command.type === "run.retry") {
    const prompt = typeof command.payload?.prompt === "string" ? command.payload.prompt.trim() : "";
    const retrySessionId = typeof command.sessionId === "string" ? command.sessionId : typeof command.payload?.sessionId === "string" ? command.payload.sessionId : "";
    if (retrySessionId && sessions.has(retrySessionId) && prompt) return void runOpenCode({ ...command, type: "session.prompt", sessionId: retrySessionId }, sessions.get(retrySessionId));
    if (command.payload?.definition && typeof command.payload.definition === "object") return void runWorkflow({ ...command, type: "workflow.run" });
    return fail(command, "invalid_retry", "retry requires a persisted OpenCode session prompt or workflow definition");
  }
  if (command.type === "media.resume") return void resumeMediaRun(command);
  if (command.type === "workflow.run") return void runWorkflow(command);
  if (command.type === "chat.run") return void runOpenCode(command);
  if (command.type === "knowledge.index") {
    const vaultPath = typeof command.payload?.vaultPath === "string" ? command.payload.vaultPath : "";
    const indexPath = typeof command.payload?.indexPath === "string" ? command.payload.indexPath : "";
    if (!vaultPath || !indexPath) return fail(command, "invalid_vault_index", "vaultPath and indexPath are required");
    return void rebuildVaultIndex(vaultPath, indexPath, command.payload?.embedding && typeof command.payload.embedding === "object" ? command.payload.embedding as EmbeddingConfig : {}).then(async ({ manifest, state }) => {
      const embedding = command.payload?.embedding && typeof command.payload.embedding === "object" ? command.payload.embedding as EmbeddingConfig : {};
      try {
        watchVault(vaultPath, indexPath, embedding);
        respond(command, { generation: manifest.generation, documents: manifest.documents.length, chunks: manifest.chunks.length, indexPath, semantic: state.status === "semantic_ready", embeddingModel: state.embeddingModel, embeddingDimension: state.embeddingDimension, watcher: "active" });
      } catch (error) {
        watchVault(vaultPath, indexPath, embedding);
        respond(command, { generation: manifest.generation, documents: manifest.documents.length, chunks: manifest.chunks.length, indexPath, semantic: false, embeddingModel: "lexical-fallback", warning: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) });
      }
    }).catch((error) => fail(command, "vault_index_failed", error instanceof Error ? error.message : String(error)));
  }
  if (command.type === "knowledge.search") {
    const indexPath = typeof command.payload?.indexPath === "string" ? command.payload.indexPath : "";
    const query = typeof command.payload?.query === "string" ? command.payload.query.trim() : "";
      if (!indexPath || !query) return fail(command, "invalid_knowledge_search", "indexPath and query are required");
    return void searchVaultIndex(indexPath, query, Number(command.payload?.limit ?? 8), { mode: command.payload?.embeddingMode === "remote" ? "remote" : "local", baseUrl: typeof command.payload?.embeddingBaseUrl === "string" ? command.payload.embeddingBaseUrl : undefined, model: typeof command.payload?.embeddingModel === "string" ? command.payload.embeddingModel : undefined, apiKey: typeof command.payload?.embeddingApiKey === "string" ? command.payload.embeddingApiKey : undefined })
      .then((results) => respond(command, { indexPath, query, results }))
      .catch((error) => fail(command, "knowledge_search_failed", error instanceof Error ? error.message : String(error)));
  }
  if (command.type === "run.cancel" || command.type === "run.emergency_stop") return void stopRun(command, command.type === "run.emergency_stop" || command.payload?.emergency === true);
  fail(command, "unknown_method", `Unsupported method: ${command.type}`);
}, (error) => process.stderr.write(`[workflow-host] ${error.message}\n`));
