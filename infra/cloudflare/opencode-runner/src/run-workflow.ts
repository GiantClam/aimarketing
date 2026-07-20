import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import type { CloudflareSessionQueueMessage } from "../../../../lib/ai-runtime/contracts"
import { readRuntimeDispatchEnvelope } from "./runtime-envelope"
import type { SessionRunnerEnv } from "./session-coordinator"

export class AgentRunWorkflow extends WorkflowEntrypoint<SessionRunnerEnv, CloudflareSessionQueueMessage> {
  async run(event: Readonly<WorkflowEvent<CloudflareSessionQueueMessage>>, step: WorkflowStep) {
    return step.do(
      "execute-opencode-turn",
      { timeout: "60 minutes", retries: { limit: 2, delay: "10 seconds", backoff: "exponential" } },
      async () => {
        const request = await readRuntimeDispatchEnvelope(this.env.BACKUP_BUCKET, event.payload.runId)
        if (!request) throw new Error("runtime_dispatch_envelope_missing")
        const namespace = this.env.SessionCoordinator as DurableObjectNamespace
        const stub = namespace.getByName(event.payload.sessionKey)
        const response = await stub.fetch(new Request("https://session.internal/internal/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Workflow-Secret": this.env.AGENT_RUNNER_HMAC_SECRET },
          body: JSON.stringify(request),
        }))
        const result = await response.json().catch(() => ({ error: "runtime_workflow_invalid_response" }))
        if (!response.ok) throw new Error(typeof result === "object" && result && "error" in result ? String((result as { error?: unknown }).error) : "runtime_workflow_execution_failed")
        return { ok: response.ok, status: response.status, runId: event.payload.runId }
      },
    )
  }
}
