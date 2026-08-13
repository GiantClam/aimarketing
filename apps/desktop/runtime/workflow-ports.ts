import type {
  WorkflowArtifactPort,
  WorkflowCapabilityPort,
  WorkflowDefinitionEnvelope,
  WorkflowRunEventSink,
  WorkflowRunRepository,
} from "@aimarketing/workflow-core";
import type { OpenCodeRuntimeEvent } from "@aimarketing/runtime-contracts/opencode";

export type DesktopWorkflowPortEvent = Extract<OpenCodeRuntimeEvent, { event: "tool_event" }>;

export interface DesktopWorkflowPortDependencies {
  readonly runId: string;
  readonly emit: (event: OpenCodeRuntimeEvent) => void;
  readonly capability: WorkflowCapabilityPort;
}

export interface DesktopWorkflowPorts {
  readonly capability: WorkflowCapabilityPort;
  readonly repository: WorkflowRunRepository;
  readonly artifacts: WorkflowArtifactPort;
  readonly events: WorkflowRunEventSink;
}

const MAX_EVENT_BYTES = 64 * 1024;

/**
 * Bridges the shared workflow-core ports to the desktop host RPC stream.
 * Persistence remains owned by the Tauri side, which consumes the bounded
 * events and writes SQLite records with its existing idempotency rules.
 */
export function createDesktopWorkflowPorts(dependencies: DesktopWorkflowPortDependencies): DesktopWorkflowPorts {
  const emitTool = (tool: string, message: Record<string, unknown>, phase: "started" | "completed" | "progress") => {
    const serialized = JSON.stringify(message);
    dependencies.emit({
      event: "tool_event",
      tool,
      phase,
      message: serialized.length <= MAX_EVENT_BYTES ? serialized : JSON.stringify({ truncated: true, preview: serialized.slice(0, MAX_EVENT_BYTES - 64) }),
      runId: dependencies.runId,
    });
  };

  const repository: WorkflowRunRepository = {
    async create(input: { readonly runId: string; readonly definition: WorkflowDefinitionEnvelope }) {
      emitTool("workflow:run_created", { runId: input.runId, definitionHash: input.definition.definitionHash }, "started");
    },
    async updateStatus(runId, status) {
      emitTool("workflow:run_status", { runId, status }, "completed");
    },
  };

  const artifacts: WorkflowArtifactPort = {
    async register(input) {
      const artifactId = `${dependencies.runId}:${input.relativePath}`;
      emitTool("workflow:artifact_registered", { artifactId, ...input }, "completed");
      return { artifactId };
    },
  };

  const events: WorkflowRunEventSink = {
    async append(event) {
      const phase = event.type === "node_started" ? "started" : event.type === "node_failed" ? "failed" : "completed";
      const payload = { sequence: event.sequence, ...event.payload };
      const serialized = JSON.stringify(payload);
      dependencies.emit({
        event: "tool_event",
        tool: `workflow:${event.type}`,
        phase,
        message: serialized.length <= MAX_EVENT_BYTES ? serialized : JSON.stringify({ truncated: true, preview: serialized.slice(0, MAX_EVENT_BYTES - 64) }),
        runId: dependencies.runId,
      });
    },
  };

  return { capability: dependencies.capability, repository, artifacts, events };
}
