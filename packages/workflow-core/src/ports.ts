import type { WorkflowDefinitionEnvelope } from "./definition";

export interface WorkflowCapabilityPort {
  execute(input: { readonly executorId: string; readonly nodeKey: string; readonly config: Record<string, unknown>; readonly inputs: Record<string, unknown>; readonly iteration?: { readonly key: string; readonly index: number; readonly item: unknown } }, signal: AbortSignal): Promise<Record<string, unknown>>;
  /**
   * Query and finish a persisted provider task. The shared executor never
   * falls back to `execute` when recovery data exists, preventing duplicate
   * external submissions after an interrupted run.
   */
  resume?(input: { readonly executorId: string; readonly nodeKey: string; readonly config: Record<string, unknown>; readonly inputs: Record<string, unknown>; readonly providerTaskId: string; readonly metadata?: Readonly<Record<string, unknown>> }, signal: AbortSignal): Promise<Record<string, unknown>>;
}

export interface WorkflowArtifactPort {
  register(input: { readonly relativePath: string; readonly mimeType: string; readonly byteLength: number; readonly sha256: string }): Promise<{ readonly artifactId: string }>;
}

export interface WorkflowRunEventSink {
  append(event: { readonly runId: string; readonly sequence: number; readonly type: string; readonly payload: Record<string, unknown> }): Promise<void>;
}

export interface WorkflowRunRepository {
  create(input: { readonly runId: string; readonly definition: WorkflowDefinitionEnvelope }): Promise<void>;
  updateStatus(runId: string, status: "running" | "succeeded" | "failed" | "cancelled" | "interrupted"): Promise<void>;
}

export interface WorkflowClock { now(): number; }
