import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { buildOpenCodeCommand, createOpenCodeEventParser, type OpenCodeRuntimeEvent } from "@aimarketing/runtime-contracts/opencode";
import { createBailianImageAdapter, createBailianVideoAdapter, createHttpMediaAdapter, createMiniMaxAudioAdapter, createMiniMaxVideoAdapter, createOpenAICompatibleImageAdapter, createRunningHubAdapter, createRunningHubWorkflowAdapter, downloadMediaOutputs, IMAGE_GENERATION_REQUEST_TIMEOUT_MS, listMiniMaxVoices, runMediaJob, uploadRunningHubMediaAsset, type MediaProviderId, type MediaProviderAdapter } from "@aimarketing/media-runtime";
import { executeWorkflow, migrateWorkflowDefinitionToCurrent, type WorkflowArtifactPort, type WorkflowCapabilityPort, type WorkflowDefinitionEnvelope } from "@aimarketing/workflow-core";
import { detectPresentationArtifacts } from "./presentation-artifacts";
import { OpenCodeServeClient } from "./opencode-serve";
import { createRpcReader, writeRpcResponse, writeRpcServiceRequest } from "./rpc";
import { createDesktopWorkflowPorts } from "./workflow-ports";
import { buildMediaCapabilityInput } from "./media-input";
import { assertVideoMediaCapability, resolveVideoMediaCapabilities } from "./media-capabilities";
import type { RunningHubWorkflowRegistration } from "../src/runninghub-workflow";
import { migrateLegacyRunningHubWorkflows } from "../src/runninghub-workflow";
// Namespace access is compatible with the Node 24 + tsx loader used by the
// source-host validator, which otherwise misclassifies this sibling module.
import * as chatAttachmentExtractor from "../../../lib/chat-attachments/extract.ts";

type HostCommand = { readonly version: 1; readonly requestId: string; readonly type: "chat.run" | "workflow.run" | "run.cancel" | "run.emergency_stop" | "run.retry" | "media.resume" | "media.voices" | "health" | "session.create" | "session.prompt" | "attachment.extract" | "knowledge.index" | "knowledge.search"; readonly runId?: string; readonly sessionId?: string; readonly payload?: Record<string, unknown> };
type ProviderConfig = { readonly id?: string; readonly source?: string; readonly model?: string; readonly baseUrl?: string; readonly apiKey?: string; readonly reasoningEffort?: string; readonly endpoint?: string; readonly queryEndpoint?: string; readonly workflowId?: string; readonly digitalHumanWorkflowId?: string; readonly videoEnhanceWorkflowId?: string; readonly workflows?: readonly RunningHubWorkflowRegistration[] };
const active = new Map<string, ReturnType<typeof spawn>>();
const workflowControllers = new Map<string, AbortController>();
const sessions = new Map<string, { readonly conversationId: string; readonly workspacePath: string; readonly sessionId: string; readonly provider?: ProviderConfig; readonly agentName?: string }>();
const preparedAgentWorkspaces = new Set<string>();
type DesktopServiceMethod = "knowledge.index" | "knowledge.search" | "knowledge.write" | "workflow.repository.create" | "workflow.repository.update_status" | "workflow.artifact.register" | "workflow.event.append" | "runtime.artifact.write";
const serviceRequests = new Map<string, { readonly resolve: (value: Record<string, unknown>) => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }>();
let shuttingDown = false;

function isAvailableWorkflowLocalFile(localPath: string) {
  try {
    return isAbsolute(localPath) && statSync(localPath).isFile();
  } catch {
    return false;
  }
}

function localPathFromWorkflowValue(value: unknown): string | undefined {
  if (typeof value === "string" && isAbsolute(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const localPath = (value as Record<string, unknown>).localPath;
  return typeof localPath === "string" && isAbsolute(localPath) ? localPath : undefined;
}

async function resolveRegisteredWorkflowInputs(
  registration: RunningHubWorkflowRegistration,
  inputs: Record<string, unknown>,
  providerOptions: Parameters<typeof uploadRunningHubMediaAsset>[0],
  cancellation: { readonly signal?: AbortSignal; throwIfCancelled(): void },
) {
  const resolved: Record<string, unknown> = {};
  for (const binding of registration.nodeBindings) {
    const raw = inputs[binding.inputId] ?? binding.defaultValue;
    if (raw === undefined || raw === null || raw === "") continue;
    const values = binding.valueType === "file_list" ? (Array.isArray(raw) ? raw : [raw]) : binding.valueType === "file" && Array.isArray(raw) ? raw.slice(0, 1) : [raw];
    const output: unknown[] = [];
    for (const value of values) {
      cancellation.throwIfCancelled();
      const localPath = localPathFromWorkflowValue(value);
      if (!localPath) {
        output.push(value);
        continue;
      }
      if (!isAvailableWorkflowLocalFile(localPath)) throw new Error(`workflow_local_file_missing:${localPath}`);
      const uploaded = await uploadRunningHubMediaAsset(providerOptions, localPath, cancellation);
      output.push(uploaded.downloadUrl ?? uploaded.fileName);
    }
    resolved[binding.inputId] = binding.valueType === "file_list" ? output : output[0];
  }
  return resolved;
}

function defaultOpenCodeExecutable() {
  if (process.env.AIMARKETING_OPENCODE_PATH) return process.env.AIMARKETING_OPENCODE_PATH;
  if (process.platform === "win32") {
    const bundled = join(dirname(process.execPath), "node_modules", "opencode-ai", "bin", "opencode.exe");
    if (existsSync(bundled)) return bundled;
    const globalNodeModules = process.env.ProgramFiles
      ? join(process.env.ProgramFiles, "nodejs", "node_modules", "opencode-ai", "bin", "opencode.exe")
      : "";
    if (globalNodeModules && existsSync(globalNodeModules)) return globalNodeModules;
    const localAppData = process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Programs", "opencode", "opencode.exe")
      : "";
    if (localAppData && existsSync(localAppData)) return localAppData;
    return "opencode.exe";
  }
  return "opencode";
}
const configuredOpenCodeExecutable = defaultOpenCodeExecutable();
const serveClient = new OpenCodeServeClient(
  /\.(?:mjs|cjs|js)$/iu.test(configuredOpenCodeExecutable) ? process.execPath : configuredOpenCodeExecutable,
  join(process.env.OPENCODE_RUNTIME_DIR ?? process.cwd(), ".opencode-server"),
  /\.(?:mjs|cjs|js)$/iu.test(configuredOpenCodeExecutable) ? [configuredOpenCodeExecutable] : [],
);

async function shutdownHost() {
  if (shuttingDown) return;
  shuttingDown = true;
  await serveClient.stop().catch(() => undefined);
  process.exit(0);
}

process.once("SIGTERM", () => { void shutdownHost(); });
process.once("SIGINT", () => { void shutdownHost(); });

function respond(command: HostCommand, data: unknown) { writeRpcResponse(process.stdout, { version: 1, requestId: command.requestId, ok: true, data }); }
function fail(command: HostCommand, code: string, message: string) { writeRpcResponse(process.stdout, { version: 1, requestId: command.requestId, ok: false, error: { code, message, retryable: false } }); }

function requestService(method: DesktopServiceMethod, payload: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const requestId = randomUUID();
  const response = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => { serviceRequests.delete(requestId); reject(new Error("service_request_timeout")); }, 120_000);
    serviceRequests.set(requestId, { resolve, reject, timer });
    signal?.addEventListener("abort", () => { clearTimeout(timer); serviceRequests.delete(requestId); reject(new Error("service_request_cancelled")); }, { once: true });
  });
  writeRpcServiceRequest(process.stdout, { version: 1, requestId, type: "service_request", method, payload });
  return response;
}

function resolveServiceResponse(raw: Record<string, unknown>) {
  const requestId = typeof raw.requestId === "string" ? raw.requestId : "";
  const pending = serviceRequests.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  serviceRequests.delete(requestId);
  if (raw.ok === true && raw.data && typeof raw.data === "object") pending.resolve(raw.data as Record<string, unknown>);
  else {
    const error = raw.error && typeof raw.error === "object" ? raw.error as Record<string, unknown> : {};
    pending.reject(new Error(typeof error.message === "string" ? error.message : "knowledge_service_failed"));
  }
  return true;
}

async function extractAttachment(command: HostCommand) {
  const workspacePath = typeof command.payload?.workspacePath === "string" ? command.payload.workspacePath : "";
  const relativePath = typeof command.payload?.relativePath === "string" ? command.payload.relativePath : "";
  const fileName = typeof command.payload?.fileName === "string" ? command.payload.fileName : relativePath;
  const mediaType = typeof command.payload?.mediaType === "string" ? command.payload.mediaType : "";
  if (!workspacePath || !relativePath) return fail(command, "invalid_attachment", "workspacePath and relativePath are required");
  const root = resolve(workspacePath);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) return fail(command, "invalid_attachment_path", "attachment path escapes the workspace");
  try {
    const extracted = chatAttachmentExtractor.extractChatAttachmentText({ fileName, mediaType, bytes: Uint8Array.from(await readFile(target)) });
    respond(command, extracted);
  } catch (error) {
    fail(command, error instanceof Error && "code" in error ? String((error as { code?: unknown }).code ?? "attachment_extract_failed") : "attachment_extract_failed", error instanceof Error ? error.message : String(error));
  }
}

function selectedAgentId(value: unknown) {
  const agentId = typeof value === "string" ? value.trim() : "";
  return /^agency-[a-z0-9_-]{1,180}$/u.test(agentId) ? agentId : undefined;
}

async function preparedAgentName(configDirectory: string, agentId?: string) {
  if (!agentId) return undefined;
  try {
    const source = await readFile(join(configDirectory, "agents", `${agentId}.md`), "utf8");
    const match = source.match(/^\s*name:\s*(.+?)\s*$/imu);
    const name = match?.[1]?.trim().replace(/^(['"])(.*)\1$/u, "$2");
    return name || undefined;
  } catch {
    return undefined;
  }
}

async function runOpenCode(command: HostCommand, session?: { readonly workspacePath: string; readonly sessionId?: string; readonly provider?: ProviderConfig }, options: { readonly respond?: boolean; readonly signal?: AbortSignal } = {}) {
  const prompt = typeof command.payload?.prompt === "string" ? command.payload.prompt : "";
  if (!prompt.trim()) return fail(command, "invalid_prompt", "prompt is required");
  const runId = command.runId ?? randomUUID();
  const modelHint = typeof command.payload?.model === "string" ? command.payload.model : undefined;
  const agentId = selectedAgentId(command.payload?.agentId);
  const provider = readProvider(command.payload?.provider);
  const activeProvider = provider ?? session?.provider;
  if (!(activeProvider?.model?.trim() || modelHint?.trim())) return fail(command, "text_provider_model_required", "Configure a text Provider and model before sending.");
  const executable = typeof command.payload?.executable === "string" ? command.payload.executable : defaultOpenCodeExecutable();
  const workspacePath = session?.workspacePath ?? (typeof command.payload?.workspacePath === "string" ? command.payload.workspacePath : process.cwd());
  const configDirectory = await prepareSkillWorkspace(workspacePath, agentId);
  const agentName = await preparedAgentName(configDirectory, agentId);
  const environment = await createOpenCodeEnvironment(configDirectory, provider, modelHint, agentId);
  const persistentSession = session?.sessionId ? session as { readonly workspacePath: string; readonly sessionId: string; readonly provider?: ProviderConfig; readonly agentName?: string } : undefined;
  if (persistentSession?.sessionId) {
    if (options.respond !== false) respond(command, { runId });
    const events: OpenCodeRuntimeEvent[] = [];
    await serveClient.prompt(persistentSession.sessionId, workspacePath, runId, prompt, provider ?? persistentSession.provider ?? {}, (event) => { const enriched = enrichUsageEvent(event, provider ?? persistentSession.provider, modelHint); events.push(enriched); emit(command, enriched); }, options.signal, persistentSession.agentName ?? agentName);
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

function providerRequestUrl(baseUrl: string, endpoint: string) {
  try {
    return new URL(endpoint.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    throw new Error("text_provider_base_url_invalid");
  }
}

function readTextResponse(payload: Record<string, unknown>) {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const message = choice && typeof choice === "object" ? (choice as Record<string, unknown>).message : undefined;
  const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : undefined;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const value = (part as Record<string, unknown>).text;
      return typeof value === "string" ? [value] : [];
    }).join("").trim();
    if (text) return text;
  }
  const output = payload.output_text;
  if (typeof output === "string" && output.trim()) return output.trim();
  throw new Error("text_provider_empty_response");
}

function isDeepSeekV4Flash(provider: ProviderConfig | undefined, model: string | undefined) {
  return (model ?? provider?.model ?? "").trim().toLowerCase() === "deepseek-v4-flash";
}

/** Plain workflow text nodes must not enter the tool-enabled build agent. */
async function runDirectTextCapability(command: HostCommand, executorId: string, config: Record<string, unknown>, inputs: Record<string, unknown>, signal?: AbortSignal) {
  const provider = readProvider(command.payload?.provider);
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl : provider?.baseUrl ?? "";
  if (!baseUrl) throw new Error("text_provider_configuration_required");
  const model = typeof config.model === "string" ? config.model : provider?.model ?? "";
  if (!model) throw new Error("text_provider_model_required");
  const prompt = [typeof config.prompt === "string" ? config.prompt : "", typeof config.script === "string" ? config.script : "", typeof config.text === "string" ? config.text : "", typeof inputs.text === "string" ? inputs.text : ""].filter(Boolean).join("\n\n").trim();
  if (!prompt) throw new Error("text_prompt_required");
  const defaultTextEndpoint = `/${["chat", "completions"].join("/")}`;
  const endpoint = typeof config.endpoint === "string" && config.endpoint.trim() ? config.endpoint : provider?.endpoint || defaultTextEndpoint;
  const response = await fetch(providerRequestUrl(baseUrl, endpoint), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...(provider?.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0,
      stream: false,
      ...(isDeepSeekV4Flash(provider, model) ? { thinking: { type: "disabled" } } : {}),
    }),
    signal,
  });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* preserve a bounded transport error below */ }
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    const detail = typeof error.message === "string" ? error.message.slice(0, 180) : `HTTP ${response.status}`;
    throw new Error(`text_provider_http_${response.status}:${detail}`);
  }
  const text = readTextResponse(payload);
  emit(command, { event: "text_delta", delta: text, runId: command.runId ?? "" });
  return { text, executorId };
}

async function runDirectSessionPrompt(command: HostCommand, session: { readonly provider?: ProviderConfig }) {
  const runId = command.runId ?? randomUUID();
  const provider = readProvider(command.payload?.provider) ?? session.provider;
  const prompt = typeof command.payload?.prompt === "string" ? command.payload.prompt : "";
  if (!prompt.trim()) return fail(command, "invalid_prompt", "prompt is required");
  respond(command, { runId, transport: "direct-provider" });
  try {
    await runDirectTextCapability({ ...command, runId, payload: { ...(command.payload ?? {}), provider } }, "writer", {
      prompt,
      model: provider?.model ?? command.payload?.model,
      baseUrl: provider?.baseUrl,
      endpoint: provider?.endpoint,
    }, {});
    emit(command, { event: "done", runId });
  } catch (error) {
    emit(command, { event: "runtime_error", code: "text_provider_request_failed", message: error instanceof Error ? error.message : String(error), retryable: true, runId });
  }
}

function enrichUsageEvent(event: OpenCodeRuntimeEvent, provider: ProviderConfig | undefined, modelHint: string | undefined): OpenCodeRuntimeEvent {
  if (event.event !== "usage") return event;
  const selected = selectedModel(provider, modelHint);
  const model = provider?.model?.trim() || modelHint?.trim() || `${selected.providerId}/${selected.modelId}`;
  return {
    ...event,
    ...(event.provider ? {} : { provider: selected.providerId }),
    ...(event.model?.trim() ? {} : { model }),
  };
}

function readProvider(value: unknown): ProviderConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const workflows = Array.isArray(record.workflows)
    ? record.workflows.filter((workflow): workflow is RunningHubWorkflowRegistration => Boolean(workflow && typeof workflow === "object" && typeof (workflow as Record<string, unknown>).id === "string" && typeof (workflow as Record<string, unknown>).remoteWorkflowId === "string" && Array.isArray((workflow as Record<string, unknown>).inputSchema) && Array.isArray((workflow as Record<string, unknown>).nodeBindings)))
    : [];
  const migratedWorkflows = migrateLegacyRunningHubWorkflows(workflows, {
    ...(typeof record.workflowId === "string" ? { workflowId: record.workflowId } : {}),
    ...(typeof record.digitalHumanWorkflowId === "string" ? { digitalHumanWorkflowId: record.digitalHumanWorkflowId } : {}),
    ...(typeof record.videoEnhanceWorkflowId === "string" ? { videoEnhanceWorkflowId: record.videoEnhanceWorkflowId } : {}),
  });
  return {
    ...(typeof record.id === "string" ? { id: record.id } : {}),
    ...(typeof record.source === "string" ? { source: record.source } : {}),
    ...(typeof record.model === "string" ? { model: record.model } : {}),
    ...(typeof record.baseUrl === "string" ? { baseUrl: record.baseUrl } : {}),
    ...(typeof record.apiKey === "string" ? { apiKey: record.apiKey } : {}),
    ...(typeof record.reasoningEffort === "string" ? { reasoningEffort: record.reasoningEffort } : {}),
    ...(typeof record.endpoint === "string" ? { endpoint: record.endpoint } : {}),
    ...(typeof record.queryEndpoint === "string" ? { queryEndpoint: record.queryEndpoint } : {}),
    ...(typeof record.workflowId === "string" ? { workflowId: record.workflowId } : {}),
    ...(typeof record.digitalHumanWorkflowId === "string" ? { digitalHumanWorkflowId: record.digitalHumanWorkflowId } : {}),
    ...(typeof record.videoEnhanceWorkflowId === "string" ? { videoEnhanceWorkflowId: record.videoEnhanceWorkflowId } : {}),
    ...(migratedWorkflows?.length ? { workflows: migratedWorkflows } : {}),
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

async function retryTransientMediaJob<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 2 || !/(?:fetch failed|network|socket|connection|timeout|request_timeout|media_provider_(?:curl_failed|request_timeout)|media_provider_http_(?:408|425|429|5\d\d))/iu.test(message)) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
  const source = provider?.source?.trim() || provider?.id || "local";
  return {
    // A local desktop profile may keep `id=local` while selecting an
    // OpenAI-compatible model such as `provider/model`. The model prefix is
    // the authoritative OpenCode provider in that form; otherwise a provider
    // without a qualified model keeps its explicit id.
    providerId: providerKey(slash > 0 ? configured.slice(0, slash) : source),
    modelId: slash > 0 ? configured.slice(slash + 1) : configured,
  };
}

function providerApiKeyEnvironment(provider: ProviderConfig | undefined, modelHint: string | undefined): Record<string, string> {
  if (!provider?.apiKey) return {};
  return { [`${selectedModel(provider, modelHint).providerId.toUpperCase()}_API_KEY`]: provider.apiKey };
}

function deepSeekVariant(model: string, reasoningEffort: string | undefined) {
  if (model !== "deepseek-v4-flash") return undefined;
  const normalized = reasoningEffort?.trim().toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "low" || normalized === "high") return normalized;
  return "max";
}

function openCodeModelDefinition(provider: ProviderConfig | undefined, model: string) {
  const variant = deepSeekVariant(model, provider?.reasoningEffort);
  if (!variant) return { name: model };
  return {
    name: model,
    // DeepSeek V4 Flash exposes `reasoning_content` through the
    // OpenAI-compatible stream, but this OpenCode adapter currently forwards
    // that channel as visible text when thinking is enabled. Disable upstream
    // thinking for desktop runs so Writer always contains deliverable text.
    variants: { [variant]: { body: { thinking: { type: "disabled" } } } },
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
    // The desktop runtime owns its Skill catalog. An explicit empty list is
    // important because OpenCode otherwise merges user-level skill paths.
    skills: { paths: [] },
    ...(model ? { model: `${selected.providerId}/${model}` } : {}),
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
        models: model ? { [model]: openCodeModelDefinition(provider, model) } : {},
      },
    },
  };
  await mkdir(configDirectory, { recursive: true });
  const target = join(configDirectory, "opencode.json");
  const temporary = `${target}.${process.pid}.tmp`;
  const serialized = JSON.stringify(config, null, 2);
  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, target);
  return serialized;
}

async function createOpenCodeEnvironment(configDirectory: string, provider: ProviderConfig | undefined, modelHint: string | undefined, agentId?: string) {
  const configContent = await writeOpenCodeConfig(configDirectory, provider, modelHint);
  // OpenCode resolves its global config before applying OPENCODE_CONFIG_DIR.
  // Give the child process an isolated home so the user's ~/.config/opencode
  // plugins and Skill paths cannot enter the resolved configuration at all.
  const isolatedHome = join(configDirectory, ".desktop-home");
  await mkdir(isolatedHome, { recursive: true });
  const isolatedConfigHome = join(isolatedHome, ".config");
  const isolatedDataHome = join(isolatedHome, ".data");
  const isolatedCacheHome = join(isolatedHome, ".cache");
  const isolatedStateHome = join(isolatedHome, ".state");
  return withPrivatePython({
    ...process.env,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    XDG_CONFIG_HOME: isolatedConfigHome,
    XDG_DATA_HOME: isolatedDataHome,
    XDG_CACHE_HOME: isolatedCacheHome,
    XDG_STATE_HOME: isolatedStateHome,
    OPENCODE_CONFIG_DIR: configDirectory,
    OPENCODE_CONFIG_CONTENT: configContent,
    AIMARKETING_DESKTOP_LOCAL: "1",
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    ...(agentId ? { AIMARKETING_OPENCODE_AGENT_ID: agentId } : {}),
    ...providerApiKeyEnvironment(provider, modelHint),
  });
}

async function prepareSkillWorkspace(workspacePath: string, agentId?: string) {
  const source = process.env.AIMARKETING_SKILLS_DIR;
  const agentsSource = process.env.AIMARKETING_AGENTS_DIR;
  const configDirectory = join(workspacePath, ".opencode");
  if (source) {
    const target = join(configDirectory, "skills");
    try { await mkdir(target, { recursive: true }); await cp(source, target, { recursive: true, force: false, errorOnExist: false }); } catch { /* missing optional bundled skills are surfaced by OpenCode */ }
  }
  if (agentsSource && !preparedAgentWorkspaces.has(configDirectory)) {
    const target = join(configDirectory, "agents");
    try {
      await mkdir(target, { recursive: true });
      // OpenCode caches the Agent catalog when the serve process starts. Copy
      // every packaged Agent up front so switching sessions never requires a
      // process restart; normalize legacy colors before OpenCode parses them.
      await cp(agentsSource, target, { recursive: true, force: true });
      for (const entry of await readdir(target, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const targetPath = join(target, entry.name);
        const agentSource = await readFile(targetPath, "utf8");
        const normalizedAgent = agentSource.replace(
          /^(\s*color:\s*)(?!#[0-9a-f]{6}\s*$)([^\r\n]+)$/imu,
          '$1"#6b7280"',
        ).replace(/^\s*(?:tools|services):[^\r\n]*\r?\n/imu, "");
        if (normalizedAgent !== agentSource) await writeFile(targetPath, normalizedAgent, "utf8");
      }
      preparedAgentWorkspaces.add(configDirectory);
    } catch { /* the selected bundled agent is surfaced by OpenCode */ }
  }
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
        const isMimeType = (value: unknown, prefix: string) => Boolean(value && typeof value === "object" && typeof (value as { mimeType?: unknown }).mimeType === "string" && (value as { mimeType: string }).mimeType.startsWith(prefix));
        const assets = [...uploadedFiles, ...referencedArtifactIds];
        return {
          assets,
          asset: assets,
          images: uploadedFiles.filter((file) => isMimeType(file, "image/")),
          image: uploadedFiles.filter((file) => isMimeType(file, "image/")),
          videos: uploadedFiles.filter((file) => isMimeType(file, "video/")),
          video: uploadedFiles.filter((file) => isMimeType(file, "video/")),
          audios: uploadedFiles.filter((file) => isMimeType(file, "audio/")),
          audio: uploadedFiles.filter((file) => isMimeType(file, "audio/")),
        };
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
        const output = await createFileArtifact(workspacePath, runId, nodeKey, config, inputs, (method, payload) => requestService(method, payload, signal));
        const extension = output.artifact.relativePath.toLowerCase().split(".").pop() ?? "bin";
        const mimeType = extension === "md" ? "text/markdown" : extension === "txt" ? "text/plain" : "application/octet-stream";
        const registration = await artifactPort.register({ relativePath: output.artifact.relativePath, mimeType, byteLength: output.artifact.bytes, sha256: output.artifact.sha256 });
        return { ...output, artifact: { ...output.artifact, artifactId: registration.artifactId, registered: true } };
      }
      if (executorId === "knowledge_retrieve") {
        const indexPath = typeof config.indexPath === "string" ? config.indexPath : typeof command.payload?.indexPath === "string" ? command.payload.indexPath : "";
        if (!indexPath) throw new Error("knowledge_index_required");
        const query = typeof config.query === "string" ? config.query : typeof inputs.text === "string" ? inputs.text : "";
        const result = await requestService("knowledge.search", { indexPath, query, limit: Number(config.limit ?? 8), embeddingMode: config.embeddingMode, embeddingBaseUrl: config.embeddingBaseUrl, embeddingModel: config.embeddingModel, embeddingApiKey: config.embeddingApiKey }, signal);
        const citations = Array.isArray(result.results) ? result.results : [];
        return { citations, text: citations.map((item) => { const value = item as Record<string, unknown>; return `[${String(value.documentPath ?? "")}${value.heading ? `#${String(value.heading)}` : ""}] ${String(value.excerpt ?? "")}`; }).join("\n") };
      }
      if (executorId === "knowledge_write") {
        const vaultPath = typeof config.vaultPath === "string" ? config.vaultPath : typeof command.payload?.vaultPath === "string" ? command.payload.vaultPath : "";
        if (!vaultPath) throw new Error("knowledge_vault_required");
        return requestService("knowledge.write", { vaultPath, targetPath: config.targetPath, content: typeof inputs.text === "string" ? inputs.text : JSON.stringify(inputs, null, 2), baseHash: config.baseHash }, signal);
      }
      if (["image_generate", "video_generate", "digital_human", "music_generate", "voice_synthesis", "voice_clone", "audio_generate"].includes(executorId)) return runMediaCapability(command, runId, nodeKey, executorId, config, inputs, workspacePath, signal);
      if (["writer", "llm_generate"].includes(executorId)) {
        const configuredTextProvider = readProvider(command.payload?.provider);
        // Keep fixture/local OpenCode workflows on the session path when no
        // direct text Provider is configured; real configured Providers use
        // the deterministic host-mediated request path.
        if (typeof config.baseUrl === "string" || configuredTextProvider?.baseUrl) {
          return runDirectTextCapability({ ...command, runId: `${runId}:${nodeKey}` }, executorId, config, inputs, signal);
        }
      }
      const prompt = [typeof config.prompt === "string" ? config.prompt : "", typeof config.script === "string" ? config.script : "", typeof config.text === "string" ? config.text : "", typeof inputs.text === "string" ? inputs.text : ""].filter(Boolean).join("\n\n");
      const nodeCommand: HostCommand = { ...command, runId: `${runId}:${nodeKey}`, payload: { ...(command.payload ?? {}), prompt: executorId === "ppt_generate" ? `${prompt}\n\nUse the local ppt-master skill and write the editable PPTX into the project workspace.` : prompt } };
      const workflowProvider = readProvider(command.payload?.provider);
      const workflowConfigDirectory = await prepareSkillWorkspace(workspacePath);
      const workflowEnvironment = await createOpenCodeEnvironment(workflowConfigDirectory, workflowProvider, workflowProvider?.model);
      const { sessionId: workflowSessionId } = await serveClient.createOrResumeSession(workspacePath, undefined, workflowProvider ?? {}, workflowEnvironment);
      const events = await runOpenCode(nodeCommand, { workspacePath, sessionId: workflowSessionId, provider: workflowProvider }, { respond: false, signal });
      const text = (events ?? []).filter((event): event is Extract<OpenCodeRuntimeEvent, { event: "text_delta" }> => event.event === "text_delta").map((event) => event.delta).join("");
      const artifacts = executorId === "ppt_generate" ? await detectPresentationArtifacts(workspacePath, workflowStartedAt) : [];
      return { text, ...(artifacts.length ? { artifacts, ...(executorId === "ppt_generate" ? { ppt: artifacts } : {}) } : {}) };
    }, resume: async ({ executorId, nodeKey, config, inputs, providerTaskId }, signal) => {
      if (["image_generate", "video_generate", "digital_human", "music_generate", "voice_synthesis", "voice_clone", "audio_generate"].includes(executorId)) {
        return runMediaCapability(command, runId, nodeKey, executorId, config, inputs, workspacePath, signal, providerTaskId);
      }
      throw new Error(`workflow_recovery_unsupported:${executorId}`);
    } };
  const ports = createDesktopWorkflowPorts({ runId, emit: (event) => emit(command, event), requestService: (method, payload) => requestService(method, payload, controller.signal), capability });
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


async function createFileArtifact(workspacePath: string, runId: string, nodeKey: string, config: Record<string, unknown>, inputs: Record<string, unknown>, writeService: (method: "runtime.artifact.write", payload: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const directory = join("artifacts", runId.replace(/[^a-zA-Z0-9_-]/g, "_"));
  const requested = typeof config.fileName === "string" && config.fileName.trim() ? config.fileName.trim() : `${nodeKey}.md`;
  const safeName = requested.replace(/[\\/]/g, "_").replace(/\.\.+/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) || `${nodeKey}.md`;
  const content = typeof inputs.text === "string" ? inputs.text : JSON.stringify(inputs, null, 2);
  const relativePath = `${directory}/${safeName}`;
  const extension = safeName.toLowerCase().split(".").pop() ?? "bin";
  const mimeType = extension === "md" ? "text/markdown" : extension === "txt" ? "text/plain" : extension === "json" ? "application/json" : "application/octet-stream";
  const result = await writeService("runtime.artifact.write", { relativePath, mimeType, content, workspacePath });
  return { artifact: { relativePath: typeof result.relativePath === "string" ? result.relativePath : relativePath, bytes: Number(result.byteLength ?? Buffer.byteLength(content, "utf8")), sha256: typeof result.sha256 === "string" ? result.sha256 : "" }, text: content };
}

async function runMediaCapability(command: HostCommand, runId: string, nodeKey: string, executorId: string, config: Record<string, unknown>, inputs: Record<string, unknown>, workspacePath: string, signal?: AbortSignal, resumeProviderTaskId?: string) {
  const configuredMedia = command.payload?.media && typeof command.payload.media === "object" ? command.payload.media as Record<string, unknown> : undefined;
  const textProvider = command.payload?.provider && typeof command.payload.provider === "object" ? command.payload.provider as Record<string, unknown> : undefined;
  const providerProfiles = readProviderMap(command.payload?.providers);
  const provider = typeof config.provider === "string" ? config.provider : typeof configuredMedia?.id === "string" ? configuredMedia.id : typeof textProvider?.id === "string" ? textProvider.id : "";
  const configuredMediaProfile = providerProfiles[provider] ?? readProvider(configuredMedia);
  const profile = configuredMediaProfile ?? readProvider(textProvider);
  const imageCapability = executorId === "image_generate";
  // Image nodes are rebound from the desktop `defaults.image` profile before
  // reaching the host. Keep legacy node fields only as a fallback when an
  // older caller does not send the provider profile map at all.
  const baseUrl = imageCapability && configuredMediaProfile
    ? profile?.baseUrl ?? ""
    : (typeof config.baseUrl === "string" ? config.baseUrl : profile?.baseUrl ?? "");
  if (!provider || !baseUrl) {
    const error = new Error(`provider_configuration_required:${executorId}`); (error as Error & { code?: string }).code = "provider_configuration_required"; throw error;
  }
  const defaultEndpoints: Record<string, string> = { image_generate: "/images/generations", video_generate: "/videos/generations", digital_human: "/videos/generations", music_generate: "/audio/generations", voice_synthesis: "/audio/speech", voice_clone: "/voice_clone", audio_generate: "/audio/generations" };
  const configuredEndpoint = typeof config.endpoint === "string" && config.endpoint.trim()
    ? config.endpoint.trim()
    : profile?.endpoint?.trim();
  const endpoint = configuredEndpoint ?? defaultEndpoints[executorId] ?? "";
  if (!endpoint) throw new Error(`provider_endpoint_required:${executorId}`);
  const apiKey = imageCapability && configuredMediaProfile
    ? profile?.apiKey
    : (typeof config.apiKey === "string" ? config.apiKey : profile?.apiKey ?? (typeof command.payload?.apiKey === "string" ? command.payload.apiKey : undefined));
  const providerKind = (profile?.source ?? provider).toLowerCase();
  const providerHostname = new URL(baseUrl).hostname.toLowerCase();
  const pptokenImageProvider = executorId === "image_generate" && (
    providerKind.includes("pptoken")
    || provider.toLowerCase().includes("pptoken")
    || providerHostname === "pptoken.cc"
    || providerHostname.endsWith(".pptoken.cc")
  );
  const providerOptions = { provider: provider as MediaProviderId, baseUrl, apiKey: apiKey ?? "", fetchImpl: fetch, workspacePath, requestTimeoutMs: executorId === "image_generate" ? IMAGE_GENERATION_REQUEST_TIMEOUT_MS : undefined, imageTransport: pptokenImageProvider ? "curl" as const : undefined };
  // Workflow IDs are account-scoped Provider settings. Never trust a node's
  // portable config here: imported workflows may contain another account's ID.
  const workflowId = typeof config.workflowRef === "string" ? config.workflowRef.trim() : "";
  const workflowCapability = executorId === "image_generate"
    ? "image"
    : executorId === "video_generate" && config.featureId === "video-enhance"
      ? "video_enhance"
      : executorId === "video_generate"
        ? "video"
        : executorId === "digital_human"
          ? "digital_human"
          : executorId === "audio_generate" || executorId === "music_generate" || executorId === "voice_synthesis" || executorId === "voice_clone"
            ? "audio"
            : undefined;
  const workflowCandidates = workflowCapability ? profile?.workflows?.filter((workflow) => workflow.capability === workflowCapability) ?? [] : [];
  const registeredWorkflow = workflowId
    ? workflowCandidates.find((workflow) => workflow.id === workflowId || workflow.remoteWorkflowId === workflowId)
    : workflowCandidates.length === 1 ? workflowCandidates[0] : undefined;
  if (providerKind.includes("runninghub") && workflowCandidates.length > 1 && !workflowId) throw new Error("runninghub_workflow_ref_required: select a registered workflow for this capability");
  if (providerKind.includes("runninghub") && workflowId && !registeredWorkflow && workflowCandidates.length) throw new Error(`runninghub_workflow_registration_not_found:${workflowId}`);
  // RunningHub supports both account-owned registered workflows and direct
  // endpoint profiles (for example the configured H3/Seedance endpoints).
  // Only the latter must skip workflow registration; a profile with neither
  // an endpoint nor a registered workflow still fails with an actionable
  // configuration error.
  if (providerKind.includes("runninghub") && workflowCapability && !registeredWorkflow && !configuredEndpoint) throw new Error(`runninghub_workflow_registration_required:${workflowCapability}`);
  const registeredWorkflowAdapter = providerKind.includes("runninghub") && registeredWorkflow && (registeredWorkflow.capability === "image" || registeredWorkflow.capability === "video" || registeredWorkflow.capability === "digital_human" || registeredWorkflow.capability === "video_enhance" || registeredWorkflow.capability === "audio")
    ? createRunningHubWorkflowAdapter({ ...providerOptions, workflowId: registeredWorkflow.remoteWorkflowId, bindings: registeredWorkflow.nodeBindings, queryPath: typeof config.queryEndpoint === "string" ? config.queryEndpoint : profile?.queryEndpoint ?? "/openapi/v2/query" })
    : undefined;
  const adapter: MediaProviderAdapter = registeredWorkflowAdapter ?? (providerKind.includes("bailian") && executorId === "image_generate"
    ? createBailianImageAdapter(providerOptions)
    : providerKind.includes("bailian") && (executorId === "video_generate" || executorId === "digital_human")
      ? createBailianVideoAdapter(providerOptions)
      : providerKind.includes("minimax") && executorId === "video_generate"
      ? createMiniMaxVideoAdapter(providerOptions)
      : providerKind.includes("minimax") && ["music_generate", "voice_synthesis", "voice_clone", "audio_generate"].includes(executorId)
      ? createMiniMaxAudioAdapter(providerOptions)
      : providerKind.includes("runninghub")
     ? createRunningHubAdapter({ ...providerOptions, submitPath: endpoint, queryPath: typeof config.queryEndpoint === "string" ? config.queryEndpoint : profile?.queryEndpoint ?? "/openapi/v2/query" })
      : executorId === "image_generate" && (providerKind.includes("openai") || providerKind.includes("pptoken") || endpoint === "/images/generations")
        ? createOpenAICompatibleImageAdapter(providerOptions)
       : createHttpMediaAdapter({ provider: provider as MediaProviderId, baseUrl, apiKey, submitPath: endpoint, queryPath: typeof config.queryEndpoint === "string" ? (taskId) => `${config.queryEndpoint}/${encodeURIComponent(taskId)}` : profile?.queryEndpoint ? (taskId) => `${profile.queryEndpoint}/${encodeURIComponent(taskId)}` : undefined, requestTimeoutMs: providerOptions.requestTimeoutMs }));
  if (resumeProviderTaskId && !adapter.query) throw new Error(`provider_resume_query_unsupported:${provider}`);
  const modelId = imageCapability && configuredMediaProfile
    ? profile?.model ?? "default"
    : (typeof config.model === "string" ? config.model : profile?.model ?? "default");
  const mediaInput = buildMediaCapabilityInput(executorId, config, inputs);
  if (executorId === "video_generate" && !registeredWorkflow) assertVideoMediaCapability(resolveVideoMediaCapabilities(providerKind, modelId), mediaInput);
  const localAttachments = Array.isArray(mediaInput.localAttachments) ? mediaInput.localAttachments.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  if (localAttachments.length) {
    for (const localPath of localAttachments) {
      if (!isAvailableWorkflowLocalFile(localPath)) throw new Error(`workflow_local_file_missing:${localPath}`);
    }
    const runningHubRegisteredWorkflow = Boolean(providerKind.includes("runninghub") && registeredWorkflow);
    if ((executorId !== "voice_clone" || !providerKind.includes("minimax")) && !runningHubRegisteredWorkflow) throw new Error(`provider_local_file_unsupported:${provider}:${executorId}`);
    if (executorId === "voice_clone") mediaInput.workflowLocalAttachments = true;
  }
  const providerInput = { ...mediaInput };
  delete providerInput.localMediaReferences;
  const localMediaReferences = mediaInput.localMediaReferences && typeof mediaInput.localMediaReferences === "object"
    ? mediaInput.localMediaReferences as Record<string, unknown>
    : {};
  const cancellation = { signal, throwIfCancelled() { if (signal?.aborted) throw new Error("media_cancelled"); } };
  if (registeredWorkflow) {
    const registeredInputSource: Record<string, unknown> = { ...config, ...providerInput, ...inputs };
    if (registeredWorkflow.capability === "digital_human") {
      const audioInputs = registeredInputSource.audios ?? registeredInputSource.audio ?? localMediaReferences.audios;
      const imageInputs = registeredInputSource.images ?? registeredInputSource.image ?? localMediaReferences.images;
      if (audioInputs !== undefined) registeredInputSource.audios = audioInputs;
      if (imageInputs !== undefined) registeredInputSource.images = imageInputs;
      registeredInputSource.__legacyDigitalHumanAudioMode = Array.isArray(audioInputs) ? (audioInputs.length ? 0 : 1) : audioInputs ? 0 : 1;
    }
    if (registeredWorkflow.capability === "video_enhance" && registeredInputSource.sourceVideoUrl === undefined) {
      registeredInputSource.sourceVideoUrl = registeredInputSource.videos ?? registeredInputSource.video ?? localMediaReferences.sourceVideo;
    }
    const registeredInputs = await resolveRegisteredWorkflowInputs(registeredWorkflow, registeredInputSource, providerOptions, cancellation);
    Object.assign(providerInput, registeredInputs);
  }
  if (executorId === "digital_human" && providerKind.includes("runninghub") && !registeredWorkflow) {
    const imageReferences = Array.isArray(localMediaReferences.images) ? localMediaReferences.images : [];
    const audioReferences = Array.isArray(localMediaReferences.audios) ? localMediaReferences.audios : [];
    const localAvatarPath = imageReferences.find((reference): reference is Record<string, unknown> => Boolean(reference && typeof reference === "object" && typeof (reference as Record<string, unknown>).localPath === "string"))?.localPath;
    const localAudioPath = audioReferences.find((reference): reference is Record<string, unknown> => Boolean(reference && typeof reference === "object" && typeof (reference as Record<string, unknown>).localPath === "string"))?.localPath;
    if (!providerInput.avatarImageUrl && typeof localAvatarPath === "string") {
      const uploaded = await uploadRunningHubMediaAsset(providerOptions, localAvatarPath, cancellation);
      providerInput.avatarImageUrl = uploaded.downloadUrl ?? uploaded.fileName;
    }
    if (!providerInput.audioUrl && typeof localAudioPath === "string") {
      const uploaded = await uploadRunningHubMediaAsset(providerOptions, localAudioPath, cancellation);
      providerInput.audioUrl = uploaded.downloadUrl ?? uploaded.fileName;
    }
  }
  const idempotencyKey = `${runId}:${nodeKey}:1`;
  emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "started", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, idempotencyKey, status: "queued" }), runId });
  let task: Awaited<ReturnType<typeof runMediaJob>>;
  try {
    task = await retryTransientMediaJob(() => runMediaJob(adapter, { provider: provider as MediaProviderId, modelId, input: { ...providerInput, ...(executorId === "voice_clone" ? { featureId: "voice-clone" } : {}) }, idempotencyKey }, cancellation, {
      pollIntervalMs: 1000,
      timeoutMs: 30 * 60 * 1000,
      ...(resumeProviderTaskId ? { initialTask: { providerTaskId: resumeProviderTaskId, status: "queued", outputs: [] } } : {}),
      onSubmitted: async (submitted) => emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "started", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: submitted.providerTaskId, idempotencyKey, status: submitted.status === "succeeded" ? "submitted" : submitted.status }), runId }),
      onUpdate: async (updated) => emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "progress", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: updated.providerTaskId, idempotencyKey, status: updated.status === "succeeded" ? "submitted" : updated.status, providerStatus: updated.providerStatus, ...(updated.error ? { error: updated.error } : {}) }), runId }),
    }));
  } catch (error) {
    const status = signal?.aborted || (error instanceof Error && error.message === "media_cancelled") ? "cancelled" : "failed";
    emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "failed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: resumeProviderTaskId, idempotencyKey, status, stage: "provider_request", error: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) }), runId });
    throw error;
  }
  if (task.status !== "succeeded") {
    const detail = task.error ? `:${task.error}` : "";
    emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "failed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: task.providerTaskId, idempotencyKey, status: task.status, ...(task.providerStatus ? { providerStatus: task.providerStatus } : {}), ...(task.error ? { error: task.error } : {}) }), runId });
    throw new Error(`media_task_${task.status}${detail}`);
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
    const mediaDownloadFetch = providerKind.includes("minimax") && apiKey
      ? (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${apiKey}` } })
      : fetch;
    artifacts = await downloadMediaOutputs(task, outputDirectory, { filenamePrefix: executorId, fetchImpl: mediaDownloadFetch, ...(tempDirectory ? { tempDirectory } : {}) });
    if (!artifacts.length && executorId !== "voice_clone") throw new Error("media_outputs_not_downloadable");
  } catch (error) {
    emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "failed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: task.providerTaskId, idempotencyKey, status: "download_failed", stage: "result_download", error: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180) }), runId });
    throw error;
  }
  const persistedArtifacts = artifacts.map((artifact) => ({
    ...artifact,
    relativePath: join("artifacts", runId.replace(/[^a-zA-Z0-9_-]/g, "_"), nodeKey.replace(/[^a-zA-Z0-9_-]/g, "_"), artifact.relativePath).replaceAll("\\", "/"),
  }));
  const outputPort = executorId === "image_generate" ? "image" : executorId === "video_generate" || executorId === "digital_human" ? "video" : "audio";
  const providerOutputs = task.outputs.flatMap((output, index) => {
    const url = typeof output.url === "string" && output.url.trim() ? output.url.trim() : typeof output.uri === "string" && output.uri.trim() ? output.uri.trim() : undefined;
    const artifact = artifacts[index];
    if (!url && !artifact) return [];
    return [{
      ...(url ? { url } : {}),
      ...(artifact ? { localPath: join(outputDirectory, artifact.relativePath), fileName: artifact.relativePath, ...(artifact.contentType ? { mimeType: artifact.contentType } : {}), byteLength: artifact.bytes } : {}),
    }];
  });
  emit(command, { event: "tool_event", tool: `media:${executorId}`, phase: "completed", message: JSON.stringify({ provider, model: modelId, executorId, nodeKey, providerTaskId: task.providerTaskId, idempotencyKey, status: "succeeded", ...(task.usage ? { usage: task.usage } : {}) }), runId });
  return { artifacts: persistedArtifacts, [outputPort]: providerOutputs, providerTaskId: task.providerTaskId, status: task.status };
}

async function listMediaVoices(command: HostCommand) {
  const configuredMedia = command.payload?.media && typeof command.payload.media === "object" ? command.payload.media as Record<string, unknown> : undefined;
  const textProvider = command.payload?.provider && typeof command.payload.provider === "object" ? command.payload.provider as Record<string, unknown> : undefined;
  const providerProfiles = readProviderMap(command.payload?.providers);
  const provider = typeof configuredMedia?.id === "string" ? configuredMedia.id : typeof textProvider?.id === "string" ? textProvider.id : "";
  const profile = providerProfiles[provider] ?? readProvider(configuredMedia) ?? readProvider(textProvider);
  const providerKind = (profile?.source ?? provider).toLowerCase();
  const baseUrl = profile?.baseUrl ?? "";
  const apiKey = profile?.apiKey ?? "";
  if (!provider || !baseUrl || !apiKey) return fail(command, "provider_configuration_required", "A configured media Provider is required to load voices");
  if (!providerKind.includes("minimax")) return fail(command, "voice_provider_unsupported", "Voice library loading currently supports MiniMax");
  const voiceType = command.payload?.voiceType === "system" || command.payload?.voiceType === "voice_cloning" || command.payload?.voiceType === "voice_generation" ? command.payload.voiceType : "all";
  try {
    const voices = await listMiniMaxVoices({ provider: provider as MediaProviderId, baseUrl, apiKey, fetchImpl: fetch }, voiceType);
    respond(command, { provider, voices });
  } catch (error) {
    fail(command, "media_voice_list_failed", error instanceof Error ? error.message : String(error));
  }
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
  const rawRecord = raw && typeof raw === "object" ? raw as unknown as Record<string, unknown> : undefined;
  if (rawRecord?.type === "service_response") {
    resolveServiceResponse(rawRecord);
    return;
  }
  const command = raw as unknown as HostCommand;
  if (!command.requestId || !command.type) return;
  if (command.type === "health") return respond(command, { status: "ok", capabilities: ["opencode", "opencode-serve", "persistent-sessions", "streaming", "artifacts", "full-access"] });
  if (command.type === "attachment.extract") return void extractAttachment(command);
  if (command.type === "session.create") {
    const conversationId = typeof command.payload?.conversationId === "string" ? command.payload.conversationId : "";
    const workspacePath = typeof command.payload?.workspacePath === "string" ? command.payload.workspacePath : "";
    if (!conversationId || !workspacePath) return fail(command, "invalid_session", "conversationId and workspacePath are required");
    const provider = readProvider(command.payload?.provider);
    return void (async () => {
      try {
        const agentId = selectedAgentId(command.payload?.agentId);
        const configDirectory = await prepareSkillWorkspace(workspacePath, agentId);
        const agentName = await preparedAgentName(configDirectory, agentId);
        const environment = await createOpenCodeEnvironment(configDirectory, provider, typeof command.payload?.model === "string" ? command.payload.model : provider?.model, agentId);
        const { sessionId, recovered } = await serveClient.createOrResumeSession(workspacePath, typeof command.payload?.sessionId === "string" ? command.payload.sessionId : undefined, provider ?? {}, environment);
        sessions.set(sessionId, { conversationId, workspacePath, sessionId, provider, agentName });
        respond(command, { conversationId, sessionId, workspacePath, transport: "opencode-serve", fullAccess: true, recovered });
      } catch (error) { fail(command, "opencode_session_unavailable", error instanceof Error ? error.message : String(error)); }
    })();
  }
  if (command.type === "session.prompt") {
    const sessionId = typeof command.sessionId === "string" ? command.sessionId : typeof command.payload?.sessionId === "string" ? command.payload.sessionId : "";
    const session = sessions.get(sessionId);
    if (!session) return fail(command, "session_not_found", "OpenCode session is not available");
    if (isDeepSeekV4Flash(session.provider, typeof command.payload?.model === "string" ? command.payload.model : session.provider?.model)) {
      return void runDirectSessionPrompt(command, session);
    }
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
  if (command.type === "media.voices") return void listMediaVoices(command);
  if (command.type === "workflow.run") return void runWorkflow(command);
  if (command.type === "chat.run") return void runOpenCode(command);
  if (command.type === "knowledge.index") {
    const vaultPath = typeof command.payload?.vaultPath === "string" ? command.payload.vaultPath : "";
    const indexPath = typeof command.payload?.indexPath === "string" ? command.payload.indexPath : "";
    if (!vaultPath || !indexPath) return fail(command, "invalid_vault_index", "vaultPath and indexPath are required");
    return void requestService("knowledge.index", { ...command.payload }, undefined)
      .then((data) => respond(command, data))
      .catch((error) => fail(command, "vault_index_failed", error instanceof Error ? error.message : String(error)));
  }
  if (command.type === "knowledge.search") {
    const indexPath = typeof command.payload?.indexPath === "string" ? command.payload.indexPath : "";
    const query = typeof command.payload?.query === "string" ? command.payload.query.trim() : "";
    if (!indexPath || !query) return fail(command, "invalid_knowledge_search", "indexPath and query are required");
    return void requestService("knowledge.search", { ...command.payload, indexPath, query }, undefined)
      .then((data) => respond(command, data))
      .catch((error) => fail(command, "knowledge_search_failed", error instanceof Error ? error.message : String(error)));
  }
  if (command.type === "run.cancel" || command.type === "run.emergency_stop") return void stopRun(command, command.type === "run.emergency_stop" || command.payload?.emergency === true);
  fail(command, "unknown_method", `Unsupported method: ${command.type}`);
}, (error) => process.stderr.write(`[workflow-host] ${error.message}\n`));
