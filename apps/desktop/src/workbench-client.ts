import type {
  WorkbenchClient,
  WorkbenchConversation,
  WorkbenchMessage,
  WorkbenchRun,
  WorkbenchRunEvent,
  WorkbenchRunRequest,
  WorkbenchUsage,
  WorkbenchWorkflow,
  WorkbenchWorkflowInput,
} from "@aimarketing/workbench-client";
import type { TauriBridge } from "./tauri";

type DesktopConversationRow = { id: string; title: string; updated_at: string; message_count?: number };
type DesktopMessageRow = { id: string; conversation_id: string; role: WorkbenchMessage["role"]; content: string; created_at: string };
type DesktopWorkflowRow = { id: string; name: string; definition_json: string; updated_at: string };

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

export function createDesktopWorkbenchClient(bridge: TauriBridge, navigation: WorkbenchClient["navigation"]): WorkbenchClient {
  const conversations = {
    async list(): Promise<readonly WorkbenchConversation[]> {
      const rows = await bridge.invoke<DesktopConversationRow[]>("list_conversations");
      return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at, messageCount: row.message_count ?? 0 }));
    },
    async create(title = "新对话"): Promise<WorkbenchConversation> {
      const id = makeId("conversation");
      const row = await bridge.invoke<DesktopConversationRow>("create_conversation", { input: { id, title, project_id: null } });
      return { id: row.id, title: row.title, updatedAt: row.updated_at, messageCount: row.message_count ?? 0 };
    },
    async messages(conversationId: string): Promise<readonly WorkbenchMessage[]> {
      const rows = await bridge.invoke<DesktopMessageRow[]>("list_messages", { conversationId });
      return rows.map((row) => ({ id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content, createdAt: row.created_at }));
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
  };

  const runs = {
    async start(request: WorkbenchRunRequest): Promise<WorkbenchRun> {
      const run = { id: request.id ?? makeId("run"), conversationId: request.conversationId, status: "queued" as const, startedAt: new Date().toISOString() };
      await bridge.invoke("create_run", { runId: run.id, conversationId: run.conversationId, model: request.model ?? null });
      return run;
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
          if (event.event === "text_delta") onEvent({ type: "text", delta: String(event.delta ?? "") });
          else if (event.event === "usage") onEvent({ type: "usage", usage: { runId, provider: typeof event.provider === "string" ? event.provider : undefined, model: String(event.model ?? "unknown"), inputTokens: Number(event.inputTokens ?? 0), outputTokens: Number(event.outputTokens ?? 0), providerCost: typeof event.costUsd === "number" ? event.costUsd : undefined } });
          else if (event.event === "done") onEvent({ type: "status", status: "succeeded" });
          else if (event.event === "runtime_error") {
            const code = String(event.code ?? "");
            onEvent({ type: "status", status: ["opencode_aborted", "workflow_cancelled", "media_cancelled"].includes(code) ? "cancelled" : "failed" });
          }
          else if (event.event === "tool_event") onEvent({ type: "tool", tool: String(event.tool ?? "tool"), phase: "started", message: typeof event.message === "string" ? event.message : undefined });
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
