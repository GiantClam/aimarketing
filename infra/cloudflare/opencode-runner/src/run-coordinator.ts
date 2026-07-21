import { getSandbox } from "@cloudflare/sandbox"
import type { AgentRuntimeEvent } from "../../../../lib/ai-runtime/contracts"
import { collectRunArtifacts } from "./artifacts"
import { verifyRunnerSignature, type NonceStore } from "./auth"
import { runOpenCode } from "./opencode"
import { parseRunRequest } from "./run-contract"
import { jsonResponse, sseEvent } from "./sse"
import { prepareRunWorkspace } from "./workspace"

export type RunnerEnv = {
  SandboxV2: unknown
  AGENT_RUNNER_HMAC_SECRET: string
}

type DurableObjectLike = {
  storage: NonceStore & { get<T = unknown>(key: string): Promise<T | undefined>; put(key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void> }
}

export class AgentRunCoordinator {
  private activeDestroy: (() => Promise<void>) | null = null
  private cancelled = false

  constructor(private readonly state: DurableObjectLike, private readonly env: RunnerEnv) {}

  private async claim() {
    const claimed = await this.state.storage.get<boolean>("claimed")
    if (claimed) return false
    await this.state.storage.put("claimed", true)
    return true
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const body = await request.text()
    try {
      await verifyRunnerSignature(request, body, this.env.AGENT_RUNNER_HMAC_SECRET, this.state.storage)
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "runner_unauthorized" }, 401)
    }

    if (request.method === "POST" && url.pathname.endsWith("/cancel")) {
      this.cancelled = true
      await this.state.storage.put("cancelled", true)
      if (this.activeDestroy) await this.activeDestroy().catch(() => undefined)
      return jsonResponse({ ok: true })
    }
    if (request.method !== "POST" || !url.pathname.endsWith("/runs")) return jsonResponse({ error: "not_found" }, 404)

    let input
    try { input = parseRunRequest(body) } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "run_request_invalid" }, 400)
    }
    if (!(await this.claim())) return jsonResponse({ error: "run_already_claimed" }, 409)

    const encoder = new TextEncoder()
    const responseStream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let closed = false
        const emit = (event: AgentRuntimeEvent) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(sseEvent(event))) } catch { closed = true }
        }
        const close = () => {
          if (closed) return
          closed = true
          try { controller.close() } catch { /* client disconnected */ }
        }
        const run = async () => {
          let sandbox: Awaited<ReturnType<typeof getSandbox>> | null = null
          let donePending = false
          try {
            console.log(JSON.stringify({ event: "runner_start", runId: input.runId }))
            emit({ event: "runtime_started", runId: input.runId })
            sandbox = getSandbox(this.env.SandboxV2 as Parameters<typeof getSandbox>[0], `run-${input.runId}`, {
              transport: "rpc",
              enableDefaultSession: true,
              sleepAfter: "1m",
            })
            this.activeDestroy = () => sandbox!.destroy()
            const runDir = await prepareRunWorkspace(sandbox, input.input)
            console.log(JSON.stringify({ event: "runner_workspace_ready", runId: input.runId }))
            for await (const event of runOpenCode(sandbox, runDir, input.input, request.signal, input.timeoutMs, input.provider)) {
              console.log(JSON.stringify({ event: "runner_event", runId: input.runId, runtimeEvent: event.event }))
              if (this.cancelled || await this.state.storage.get("cancelled")) break
              if (event.event === "done") {
                donePending = true
                continue
              }
              emit(event)
              if (event.event === "runtime_error") return
            }
            if (!donePending || this.cancelled) {
              emit({ event: "runtime_error", code: "run_cancelled", message: "OpenCode run cancelled.", retryable: true, runId: input.runId })
              return
            }
            const collected = await collectRunArtifacts(sandbox, runDir, {
              ...input.input.artifactContract,
              discoverDashi: input.input.agentId === "executive-presentation-ppt" || (input.input.selectedSkillIds || []).includes("dashiai-ppt"),
            })
            for (const warning of collected.warnings) emit({ event: "runtime_warning", code: warning, message: "An artifact was rejected by the runner contract.", runId: input.runId })
            for (const artifact of collected.artifacts) emit({ event: "artifact_payload", artifact, runId: input.runId })
            emit({ event: "done", runId: input.runId })
          } catch {
            console.log(JSON.stringify({ event: "runner_exception", runId: input.runId }))
            emit({ event: "runtime_error", code: "runner_execution_failed", message: "OpenCode runner execution failed.", retryable: true, runId: input.runId })
          } finally {
            this.activeDestroy = null
            if (sandbox) await sandbox.destroy().catch(() => undefined)
            close()
          }
        }
        request.signal.addEventListener("abort", () => {
          console.log(JSON.stringify({ event: "runner_request_aborted", runId: input.runId }))
          this.cancelled = true
          void this.activeDestroy?.()
        }, { once: true })
        void run()
      },
    })
    return new Response(responseStream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } })
  }
}
