import type {
  WorkbenchClient,
  WorkbenchConversation,
  WorkbenchMessage,
  WorkbenchRun,
  WorkbenchRunDetail,
  WorkbenchArtifact,
  WorkbenchEmbeddingConfig,
  WorkbenchKnowledgeIndex,
  WorkbenchKnowledgeResult,
  WorkbenchRunEvent,
  WorkbenchRunRequest,
  WorkbenchUsage,
  WorkbenchWorkflow,
  WorkbenchWorkflowInput,
} from "@aimarketing/workbench-client";
import { WORKBENCH_MESSAGE_PARTS_VERSION, createDesktopRunTransport, desktopUIMessageStorage, desktopUIMessageText, desktopUIMessageToWorkbenchParts, normalizeWorkbenchMessageParts, parseDesktopUIMessage, workbenchMessageToDesktopUIMessage } from "@aimarketing/workbench-client";
import type { DesktopUIMessage } from "@aimarketing/workbench-client";
import type { TauriBridge } from "./tauri";

type DesktopConversationRow = { id: string; title: string; updated_at: string; message_count?: number; opencode_session_id?: string | null; agent_id?: string | null };
type DesktopMessageRow = { id: string; conversation_id: string; role: WorkbenchMessage["role"]; content: string; parts_json?: string | null; metadata_json?: string | null; created_at: string };
type DesktopWorkflowRow = { id: string; name: string; definition_json: string; updated_at: string };
type DesktopArtifactRow = { id: string; relative_path: string; mime_type: string; byte_length: number; sha256: string; created_at: string; available?: boolean };
type DesktopRunRow = { id: string; conversation_id?: string | null; status: WorkbenchRun["status"] | string; model?: string | null; started_at: string; finished_at?: string | null };
type DesktopRunDetail = { run: DesktopRunRow; nodes: Array<{ node_key: string; status: string; output_json?: string | null; updated_at: string }>; events: Array<{ sequence: number; event_type: string; payload_json: string; created_at: string }>; usage: Array<{ provider?: string | null; model: string; input_tokens?: number | null; output_tokens?: number | null; provider_cost?: number | null; estimated_cost?: number | null; created_at: string }> };
type DesktopKnowledgeIndex = { generation: number; documents: number; chunks: number; indexPath: string; semantic: boolean; embeddingModel?: string; embeddingDimension?: number; watcher?: string };
type DesktopKnowledgeResult = { chunkId: string; documentPath: string; heading?: string; excerpt: string; score?: number; lineStart?: number; lineEnd?: number };

export type DesktopChatTransportOptions = {
  readonly resolveSessionId: (chatId: string) => Promise<string>;
  readonly resolveProvider: (message: DesktopUIMessage) => Record<string, unknown>;
  readonly ensureSession?: (request: { readonly chatId: string; readonly sessionId: string; readonly provider: Record<string, unknown>; readonly message: DesktopUIMessage }) => Promise<string>;
  readonly resolveSkillId?: (message: DesktopUIMessage) => string | undefined;
  readonly resolveAgentId?: (message: DesktopUIMessage) => string | undefined;
  readonly onRunStarted?: (runId: string, chatId: string, message: DesktopUIMessage) => void;
};

function makeId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function readWorkflowDefinition(raw: string): WorkbenchWorkflow["definition"] {
  try {
    const value = JSON.parse(raw) as { schemaVersion?: unknown; revision?: unknown; definitionHash?: unknown; nodes?: unknown; edges?: unknown };
    return {
      ...(typeof value.schemaVersion === "number" ? { schemaVersion: value.schemaVersion } : {}),
      ...(typeof value.revision === "number" ? { revision: value.revision } : {}),
      ...(typeof value.definitionHash === "string" ? { definitionHash: value.definitionHash } : {}),
      nodes: Array.isArray(value.nodes) ? value.nodes : [],
      edges: Array.isArray(value.edges) ? value.edges : [],
    };
  } catch {
    return { nodes: [], edges: [] };
  }
}

function toWorkbenchWorkflow(row: DesktopWorkflowRow): WorkbenchWorkflow {
  return { id: row.id, title: row.name, definition: readWorkflowDefinition(row.definition_json), updatedAt: row.updated_at };
}

function toWorkbenchArtifact(row: DesktopArtifactRow): WorkbenchArtifact {
  return { id: row.id, relativePath: row.relative_path, title: row.relative_path, mimeType: row.mime_type, byteLength: row.byte_length, sha256: row.sha256, createdAt: row.created_at, available: row.available };
}

function readMessageParts(raw: string | null | undefined, content: string): WorkbenchMessage["parts"] {
  if (!raw) return normalizeWorkbenchMessageParts(undefined, content);
  try {
    const value = JSON.parse(raw) as unknown;
    return normalizeWorkbenchMessageParts(Array.isArray(value) ? value as NonNullable<WorkbenchMessage["parts"]> : undefined, content);
  } catch {
    return normalizeWorkbenchMessageParts(undefined, content);
  }
}

function readStoredUIMessage(row: DesktopMessageRow): DesktopUIMessage {
  let parts: unknown = [];
  let metadata: unknown;
  try { parts = JSON.parse(row.parts_json ?? "[]"); } catch { parts = []; }
  try { metadata = JSON.parse(row.metadata_json ?? "{}"); } catch { metadata = undefined; }
  const storedParts = Array.isArray(parts) ? parts : [];
  const isUIMessageParts = storedParts.length > 0 && storedParts.every((part) => {
    if (!part || typeof part !== "object") return false;
    const type = (part as { type?: unknown }).type;
    return typeof type === "string" && (type === "text" || type === "reasoning" || type === "dynamic-tool" || type === "file" || type === "source-url" || type === "source-document" || type.startsWith("data-"));
  });
  if (isUIMessageParts || (metadata && typeof metadata === "object" && Object.keys(metadata).length > 0)) {
    return parseDesktopUIMessage({ id: row.id, role: row.role === "system" || row.role === "tool" ? "assistant" : row.role, parts: storedParts, metadata });
  }
  return workbenchMessageToDesktopUIMessage({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    partsVersion: WORKBENCH_MESSAGE_PARTS_VERSION,
    parts: readMessageParts(row.parts_json, row.content),
  });
}

function hasStoredUIMessageParts(row: DesktopMessageRow) {
  let parts: unknown;
  let metadata: unknown;
  try { parts = JSON.parse(row.parts_json ?? "[]"); } catch { parts = []; }
  try { metadata = JSON.parse(row.metadata_json ?? "{}"); } catch { metadata = undefined; }
  const storedParts = Array.isArray(parts) ? parts : [];
  const isUIMessageParts = storedParts.length > 0 && storedParts.every((part) => {
    if (!part || typeof part !== "object") return false;
    const type = (part as { type?: unknown }).type;
    return typeof type === "string" && (type === "text" || type === "reasoning" || type === "dynamic-tool" || type === "file" || type === "source-url" || type === "source-document" || type.startsWith("data-"));
  });
  return isUIMessageParts || (metadata && typeof metadata === "object" && Object.keys(metadata).length > 0);
}

function eventMetadata(event: Record<string, unknown>) {
  return {
    ...(typeof event.sequence === "number" ? { sequence: event.sequence } : {}),
    ...(typeof event.createdAt === "string" ? { createdAt: event.createdAt } : {}),
  };
}

function toWorkbenchRun(row: DesktopRunRow): WorkbenchRun {
  const status = ["queued", "running", "succeeded", "failed", "cancelled", "interrupted"].includes(row.status) ? row.status as WorkbenchRun["status"] : "interrupted";
  return { id: row.id, conversationId: row.conversation_id ?? "", status, model: row.model ?? undefined, startedAt: row.started_at, finishedAt: row.finished_at ?? undefined };
}

function toWorkbenchRunDetail(detail: DesktopRunDetail): WorkbenchRunDetail {
  return {
    run: toWorkbenchRun(detail.run),
    nodes: detail.nodes.map((node) => ({ nodeKey: node.node_key, status: node.status, outputJson: node.output_json, updatedAt: node.updated_at })),
    events: detail.events.map((event) => ({ sequence: event.sequence, eventType: event.event_type, payloadJson: event.payload_json, createdAt: event.created_at })),
    usage: detail.usage.map((item) => ({ provider: item.provider, model: item.model, inputTokens: item.input_tokens, outputTokens: item.output_tokens, providerCost: item.provider_cost, estimatedCost: item.estimated_cost, createdAt: item.created_at })),
  };
}

function toWorkbenchKnowledgeIndex(value: DesktopKnowledgeIndex): WorkbenchKnowledgeIndex {
  return { generation: value.generation, documents: value.documents, chunks: value.chunks, indexPath: value.indexPath, semantic: value.semantic, embeddingModel: value.embeddingModel, embeddingDimension: value.embeddingDimension, watcher: value.watcher };
}

function toWorkbenchKnowledgeResult(value: DesktopKnowledgeResult): WorkbenchKnowledgeResult {
  return { chunkId: value.chunkId, documentPath: value.documentPath, heading: value.heading, excerpt: value.excerpt, score: typeof value.score === "number" ? value.score : 0, lineStart: value.lineStart, lineEnd: value.lineEnd };
}

export function createDesktopWorkbenchClient(bridge: TauriBridge, navigation: WorkbenchClient["navigation"]): WorkbenchClient {
  async function sendHostCommand(type: "knowledge.index" | "knowledge.search", payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    await bridge.invoke("host_start");
    const requestId = makeId("knowledge");
    const frame = { version: 1, requestId, type, payload };
    let dispose: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let resolveResponse: (value: Record<string, unknown>) => void = () => undefined;
      let rejectResponse: (error: unknown) => void = () => undefined;
      const response = new Promise<Record<string, unknown>>((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
      timer = setTimeout(() => { dispose?.(); rejectResponse(new Error("workflow_host_response_timeout")); }, 60_000);
      // Await listener registration before host_send so a fast local response
      // cannot be lost between the two IPC calls.
      dispose = await bridge.listen<{ raw: string }>("desktop://runtime-response", (event) => {
        try {
          const separator = event.raw.indexOf(":");
          const parsed = JSON.parse(event.raw.slice(separator + 1)) as { requestId?: string };
          if (parsed.requestId !== requestId) return;
          if (timer) clearTimeout(timer);
          dispose?.();
          resolveResponse(parsed as Record<string, unknown>);
        } catch {
          // Ignore unrelated or malformed host frames; the timeout remains authoritative.
        }
      });
      await bridge.invoke("host_send", { message: frame });
      return await response;
    } catch (error) {
      if (timer) clearTimeout(timer);
      dispose?.();
      throw error;
    }
  }

  const conversations = {
    async list(): Promise<readonly WorkbenchConversation[]> {
      const rows = await bridge.invoke<DesktopConversationRow[]>("list_conversations");
      return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at, messageCount: row.message_count ?? 0, opencodeSessionId: row.opencode_session_id ?? undefined, agentId: row.agent_id ?? undefined }));
    },
    async create(title = "新对话"): Promise<WorkbenchConversation> {
      const id = makeId("conversation");
      const row = await bridge.invoke<DesktopConversationRow>("create_conversation", { input: { id, title, project_id: null } });
      return { id: row.id, title: row.title, updatedAt: row.updated_at, messageCount: row.message_count ?? 0, opencodeSessionId: row.opencode_session_id ?? undefined, agentId: row.agent_id ?? undefined };
    },
    async messages(conversationId: string): Promise<readonly WorkbenchMessage[]> {
      const rows = await bridge.invoke<DesktopMessageRow[]>("list_messages", { conversationId });
      return rows.map((row) => {
        if (!hasStoredUIMessageParts(row)) {
          return { id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content, createdAt: row.created_at, partsVersion: WORKBENCH_MESSAGE_PARTS_VERSION, parts: readMessageParts(row.parts_json, row.content) };
        }
        const message = readStoredUIMessage(row);
        return { id: row.id, conversationId: row.conversation_id, role: row.role, content: desktopUIMessageText(message) || row.content, createdAt: row.created_at, partsVersion: WORKBENCH_MESSAGE_PARTS_VERSION, parts: desktopUIMessageToWorkbenchParts(message) };
      });
    },
    async uiMessages(conversationId: string): Promise<readonly DesktopUIMessage[]> {
      const rows = await bridge.invoke<DesktopMessageRow[]>("list_messages", { conversationId });
      return rows.map(readStoredUIMessage);
    },
  };

  const workflows = {
    async list(): Promise<readonly WorkbenchWorkflow[]> {
      const rows = await bridge.invoke<DesktopWorkflowRow[]>("list_workflows");
      return rows.map(toWorkbenchWorkflow);
    },
    async save(input: WorkbenchWorkflowInput): Promise<WorkbenchWorkflow> {
      const id = input.id ?? makeId("workflow");
      const row = await bridge.invoke<DesktopWorkflowRow>("save_workflow", {
        input: { id, name: input.title, project_id: null, definition_json: JSON.stringify(input.definition) },
      });
      return toWorkbenchWorkflow(row);
    },
    async remove(workflowId: string): Promise<void> {
      await bridge.invoke("remove_workflow", { workflowId });
    },
  };

  const runs = {
    async start(request: WorkbenchRunRequest): Promise<WorkbenchRun> {
      const run = { id: request.id ?? makeId("run"), conversationId: request.conversationId ?? "", status: "queued" as const, startedAt: new Date().toISOString() };
      await bridge.invoke("create_run", { runId: run.id, conversationId: request.conversationId || null, model: request.model ?? null });
      return run;
    },
    async list(): Promise<readonly WorkbenchRun[]> {
      const rows = await bridge.invoke<DesktopRunRow[]>("list_runs");
      return rows.map(toWorkbenchRun);
    },
    async inspect(runId: string): Promise<WorkbenchRunDetail> {
      return toWorkbenchRunDetail(await bridge.invoke<DesktopRunDetail>("inspect_run", { runId }));
    },
    async cancel(runId: string) {
      await bridge.invoke("host_send", { message: { version: 1, requestId: makeId("cancel"), runId, type: "run.cancel", payload: { runId } } });
    },
    async emergencyStop(runId: string) {
      await bridge.invoke("host_send", { message: { version: 1, requestId: makeId("emergency-stop"), runId, type: "run.emergency_stop", payload: { runId, emergency: true } } });
    },
    subscribe(runId: string, onEvent: (event: WorkbenchRunEvent) => void) {
      let dispose: (() => void) | undefined;
      void bridge.listen<{ raw: string }>("desktop://runtime-response", (payload) => {
        try {
          const separator = payload.raw.indexOf(":");
          const frame = JSON.parse(payload.raw.slice(separator + 1)) as { data?: { event?: Record<string, unknown> } };
          const event = frame.data?.event;
          if (!event || event.runId !== runId) return;
          const metadata = eventMetadata(event);
          if (event.event === "text_delta") onEvent({ type: "text", delta: String(event.delta ?? ""), ...metadata });
          else if (event.event === "reasoning_delta") onEvent({ type: "reasoning", delta: String(event.delta ?? ""), ...metadata });
          else if (event.event === "runtime_warning") onEvent({ type: "warning", code: String(event.code ?? "runtime_warning"), message: String(event.message ?? "Runtime warning"), ...metadata });
          else if (event.event === "usage") onEvent({ type: "usage", usage: { runId, provider: typeof event.provider === "string" ? event.provider : undefined, model: String(event.model ?? "unknown"), inputTokens: Number(event.inputTokens ?? 0), outputTokens: Number(event.outputTokens ?? 0), providerCost: typeof event.costUsd === "number" ? event.costUsd : undefined }, ...metadata });
          else if (event.event === "artifact" && event.artifact && typeof event.artifact === "object") onEvent({ type: "artifact", artifact: event.artifact as WorkbenchArtifact, ...metadata });
          else if (event.event === "done") onEvent({ type: "status", status: "succeeded", ...metadata });
          else if (event.event === "runtime_error") {
            const code = String(event.code ?? "");
            onEvent({ type: "status", status: ["opencode_aborted", "workflow_cancelled", "media_cancelled"].includes(code) ? "cancelled" : "failed", ...metadata });
          }
          else if (event.event === "plan" && event.plan && typeof event.plan === "object") onEvent({ type: "plan", plan: event.plan as { id: string; title?: string; steps: Array<{ id: string; title: string; status: "queued" | "running" | "completed" | "succeeded" | "failed" | "cancelled" | "blocked" | "waiting"; detail?: string }>; status: "queued" | "running" | "completed" | "succeeded" | "failed" | "cancelled" | "blocked" | "waiting" }, ...metadata });
          else if (event.event === "task" && event.task && typeof event.task === "object") onEvent({ type: "task", task: event.task as { id: string; taskId?: string; title: string; steps?: Array<{ id: string; title: string; status: "queued" | "running" | "completed" | "succeeded" | "failed" | "cancelled" | "blocked" | "waiting"; detail?: string; toolName?: string }>; status: "queued" | "running" | "completed" | "succeeded" | "failed" | "cancelled" | "blocked" | "waiting" }, ...metadata });
          else if (event.event === "source" && event.source && typeof event.source === "object") onEvent({ type: "source", source: event.source as { id: string; title: string; href?: string; excerpt?: string }, ...metadata });
          else if (event.event === "media" && event.media && typeof event.media === "object") onEvent({ type: "media", media: event.media as { artifactId: string; kind: "image" | "video" | "audio" | "document"; mimeType: string; title: string; relativePath?: string; previewable?: boolean }, ...metadata });
          else if ((event.event === "tool_call" || event.event === "tool_result") && (event.data || event.toolName || event.tool)) {
            const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : event;
            const phase = event.event === "tool_result" ? (data.ok === false || data.error ? "failed" : "completed") : "started";
            onEvent({ type: "tool_call", toolName: String(data.toolName ?? data.tool ?? "tool"), toolCallId: String(data.toolCallId ?? data.id ?? "tool"), phase, input: data.args ?? data.input, output: data.result ?? data.output, error: typeof data.error === "string" ? data.error : undefined, ...metadata });
          }
          else if (event.event === "attachment" && event.attachment && typeof event.attachment === "object") onEvent({ type: "attachment", attachment: event.attachment as { id: string; name: string; mediaType: string; uri?: string; status?: "queued" | "uploading" | "ready" | "failed" }, ...metadata });
          else if (event.event === "tool_event") {
            const phase = event.phase === "completed" || event.phase === "failed" ? event.phase : "started";
            onEvent({ type: "tool", tool: String(event.tool ?? "tool"), phase, message: typeof event.message === "string" ? event.message : undefined, ...metadata });
          }
        } catch { /* malformed frames remain in host diagnostics */ }
      }).then((unlisten) => { dispose = unlisten; }).catch(() => undefined);
      return () => dispose?.();
    },
  };

  return {
    navigation,
    files: {
      open: (relativePath, mimeType = "application/octet-stream") => bridge.invoke("open_artifact_default", { relativePath, mimeType }).then(() => undefined),
      reveal: (relativePath, mimeType = "application/octet-stream") => bridge.invoke("open_artifact", { relativePath, mimeType }).then(() => undefined),
      openFolder: (relativePath, mimeType = "application/octet-stream") => bridge.invoke("open_artifact_folder", { relativePath, mimeType }).then(() => undefined),
      openWith: (relativePath, mimeType = "application/octet-stream") => bridge.invoke("open_artifact_with", { relativePath, mimeType }).then(() => undefined),
    },
    artifacts: {
      async list(): Promise<readonly WorkbenchArtifact[]> {
        const rows = await bridge.invoke<DesktopArtifactRow[]>("list_artifacts");
        return rows.map(toWorkbenchArtifact);
      },
      async remove(artifactId: string): Promise<void> {
        await bridge.invoke("remove_artifact", { artifactId });
      },
    },
    knowledge: {
      async index(options: { readonly vaultPath: string; readonly indexPath: string; readonly embedding?: WorkbenchEmbeddingConfig }): Promise<WorkbenchKnowledgeIndex> {
        const response = await sendHostCommand("knowledge.index", { vaultPath: options.vaultPath, indexPath: options.indexPath, ...(options.embedding ? { embedding: options.embedding } : {}) });
        if (response.ok !== true) throw new Error(String((response.error as { message?: string } | undefined)?.message ?? "vault_index_failed"));
        return toWorkbenchKnowledgeIndex(response.data as DesktopKnowledgeIndex);
      },
      async search(options: { readonly indexPath: string; readonly query: string; readonly limit?: number; readonly embedding?: WorkbenchEmbeddingConfig }): Promise<readonly WorkbenchKnowledgeResult[]> {
        const embedding = options.embedding;
        const response = await sendHostCommand("knowledge.search", { indexPath: options.indexPath, query: options.query, limit: options.limit ?? 8, ...(embedding ? { embeddingMode: embedding.mode, embeddingBaseUrl: embedding.baseUrl, embeddingModel: embedding.model, embeddingApiKey: embedding.apiKey } : {}) });
        if (response.ok !== true) throw new Error(String((response.error as { message?: string } | undefined)?.message ?? "knowledge_search_failed"));
        const results = (response.data as { results?: unknown } | undefined)?.results;
        return Array.isArray(results) ? results.filter((item): item is DesktopKnowledgeResult => Boolean(item && typeof item === "object" && typeof (item as DesktopKnowledgeResult).chunkId === "string" && typeof (item as DesktopKnowledgeResult).documentPath === "string" && typeof (item as DesktopKnowledgeResult).excerpt === "string")).map(toWorkbenchKnowledgeResult) : [];
      },
      async open(relativePath: string): Promise<void> {
        await bridge.invoke("open_vault_file", { relativePath });
      },
    },
    conversations,
    workflows,
    runs,
    usage: {
      async list(conversationId?: string): Promise<readonly WorkbenchUsage[]> {
        const summary = await bridge.invoke<{ input_tokens: number; output_tokens: number; provider_cost?: number; estimated_cost?: number }>("usage_summary");
        return [{ runId: conversationId ?? "summary", model: "local", inputTokens: summary.input_tokens, outputTokens: summary.output_tokens, providerCost: summary.provider_cost, estimatedCost: summary.estimated_cost }];
      },
    },
  };
}

/**
 * Concrete renderer-to-Tauri adapter for AI SDK UIMessage streams.
 * Provider credentials stay in the existing config-driven resolver supplied by
 * the desktop shell; this adapter only forwards the selected run payload to
 * the local Host process.
 */
export function createDesktopChatTransport(bridge: TauriBridge, workbenchClient: WorkbenchClient, options: DesktopChatTransportOptions) {
  return createDesktopRunTransport({
    start: async ({ chatId, message, prompt }) => {
      const runId = makeId("run");
      const provider = options.resolveProvider(message);
      const requestedSessionId = await options.resolveSessionId(chatId);
      const sessionId = options.ensureSession ? await options.ensureSession({ chatId, sessionId: requestedSessionId, provider, message }) : requestedSessionId;
      const resolvedProviderId = typeof provider.id === "string" ? provider.id : undefined;
      const resolvedModelId = typeof provider.model === "string" ? provider.model : undefined;
      if (message.metadata?.providerId && resolvedProviderId && message.metadata.providerId !== resolvedProviderId) throw new Error("desktop_transport_provider_changed");
      if (message.metadata?.modelId && resolvedModelId && message.metadata.modelId !== resolvedModelId) throw new Error("desktop_transport_model_changed");
      await bridge.invoke("create_run", { runId, conversationId: chatId, model: message.metadata?.modelId ?? null });
      const stored = desktopUIMessageStorage(message);
      await bridge.invoke("append_message", { input: { id: message.id, conversation_id: chatId, role: "user", content: stored.content, parts_json: stored.parts_json, metadata_json: stored.metadata_json, created_at: message.metadata?.createdAt ?? new Date().toISOString() } });
      options.onRunStarted?.(runId, chatId, message);
      await bridge.invoke("host_start");
      await bridge.invoke("host_send", { message: {
        version: 1,
        requestId: runId,
        runId,
        sessionId,
        type: "session.prompt",
        payload: {
          prompt,
          model: message.metadata?.modelId,
          provider,
          ...(options.resolveSkillId?.(message) ? { skillId: options.resolveSkillId(message) } : {}),
          ...(options.resolveAgentId?.(message) ? { agentId: options.resolveAgentId(message) } : {}),
        },
      } });
      return { runId };
    },
    subscribe: workbenchClient.runs.subscribe,
    stop: workbenchClient.runs.cancel,
  });
}
