import { DurableObject } from "cloudflare:workers"
import { getSandbox } from "@cloudflare/sandbox"
import type { AgentRuntimeEvent, CloudflareSessionRunRequest, RuntimeCheckpointRef } from "../../../../lib/ai-runtime/contracts"
import { verifyRunnerSignature, type NonceStore } from "./auth"
import { createEventTicket, verifyEventTicket, allowedEventOrigin } from "./event-ticket"
import { publishRuntimeArtifactsV2 } from "./artifacts-v2"
import { isPptxExportAuthorized } from "../../../../lib/ai-runtime/ppt-export-confirmation"
import { OpenCodeServerSession } from "./opencode-server"
import { parseSessionRunRequest } from "./run-contract"
import { runtimeDispatchKey, writeRuntimeDispatchEnvelope } from "./runtime-envelope"
import { createSessionWorkspaceBackup, prepareSessionWorkspace } from "./workspace-v2"
import { createRuntimeCallbackHeaders } from "../../../../lib/ai-entry/runtime/callback-signature"

export type SessionRunnerEnv = {
  Sandbox: unknown
  SessionCoordinator: SessionCoordinatorNamespace
  AGENT_RUN_QUEUE: Queue<unknown>
  BACKUP_BUCKET: R2Bucket
  ARTIFACT_BUCKET: R2Bucket
  SHARED_AGENT_SKILL_BUNDLE_BUCKET: R2Bucket
  AGENT_RUNNER_HMAC_SECRET: string
  OPENCODE_EVENT_TICKET_SECRET: string
  OPENCODE_EVENT_ALLOWED_ORIGINS: string
  SHARED_AGENT_SESSION_SLEEP_AFTER?: string
  ENVIRONMENT?: string
  PLATFORM_CALLBACK_URL?: string
  PLATFORM_CALLBACK_URL_OVERRIDE?: string
  PLATFORM_CALLBACK_SECRET?: string
}

type SessionCoordinatorStub = { fetch(request: Request): Promise<Response> }
export type SessionCoordinatorNamespace = {
  idFromName(name: string): unknown
  get(id: unknown): SessionCoordinatorStub
  getByName(name: string): SessionCoordinatorStub
}

type StoredEvent = { id: number; event: AgentRuntimeEvent }
type StoredRun = { runId: string; sessionKey: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out"; updatedAt: string; checkpoint: RuntimeCheckpointRef | null; error?: string }

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function readRunId(url: URL) {
  const match = url.pathname.match(/^\/v2\/runs\/([0-9a-f-]{36})/i)
  return match?.[1] || ""
}

function sharedSessionSleepAfter(value: string | undefined) {
  const normalized = value?.trim() || "15m"
  const match = normalized.match(/^([5-9]|[12][0-9]|30)m$/u)
  return match ? normalized : "15m"
}

function sharedSelectionForbidden(agentId: string | null) {
  return agentId === "executive-ppt" || agentId === "executive-presentation-ppt"
}

export class SessionCoordinator extends DurableObject<SessionRunnerEnv> {
  private readonly runtime = new OpenCodeServerSession()
  private sandbox: ReturnType<typeof getSandbox> | null = null

  constructor(ctx: DurableObjectState, env: SessionRunnerEnv) {
    super(ctx, env)
  }

  private async events(runId: string) {
    return (await this.ctx.storage.get<StoredEvent[]>(`events:${runId}`)) || []
  }

  private async emit(runId: string, event: AgentRuntimeEvent) {
    const existing = await this.events(runId)
    const next = [...existing, { id: (existing.at(-1)?.id || 0) + 1, event }].slice(-500)
    await this.ctx.storage.put(`events:${runId}`, next)
  }

  private async setRun(run: StoredRun) {
    await this.ctx.storage.put(`run:${run.runId}`, run)
  }

  private async notifyPlatform(run: StoredRun) {
    const url = (this.env.PLATFORM_CALLBACK_URL_OVERRIDE || this.env.PLATFORM_CALLBACK_URL)?.trim()
    const secret = this.env.PLATFORM_CALLBACK_SECRET?.trim()
    if (!url || !secret) return
    const body = JSON.stringify({ version: 1, runId: run.runId, sessionKey: run.sessionKey, status: run.status, events: await this.events(run.runId), checkpoint: run.checkpoint })
    await fetch(url, { method: "POST", headers: await createRuntimeCallbackHeaders({ body, secret }), body }).catch((error) => {
      console.log(JSON.stringify({ event: "platform_callback_failed", runId: run.runId, message: error instanceof Error ? error.message : String(error) }))
    })
  }

  private async getRun(runId: string) {
    return (await this.ctx.storage.get<StoredRun>(`run:${runId}`)) || null
  }

  private async releaseSandbox() {
    const sandbox = this.sandbox
    this.sandbox = null
    await sandbox?.destroy().catch(() => undefined)
  }

  private async authenticate(request: Request, body: string) {
    const nonceStore: NonceStore = {
      get: async (key) => {
        const value = await this.ctx.storage.get<{ value?: unknown; expiresAt?: number }>(key)
        return value && (!value.expiresAt || value.expiresAt > Date.now()) ? value.value : undefined
      },
      put: async (key, value, options) => {
        await this.ctx.storage.put(key, { value, expiresAt: Date.now() + ((options?.expirationTtl || 330) * 1000) })
      },
    }
    return verifyRunnerSignature(request, body, this.env.AGENT_RUNNER_HMAC_SECRET, nonceStore)
  }

  private async acceptRun(request: Request, body: string) {
    await this.authenticate(request, body)
    const input = parseSessionRunRequest(body)
    const existing = await this.getRun(input.runId)
    if (existing) return existing.sessionKey === input.sessionKey ? json({ accepted: true, runId: input.runId, sessionKey: input.sessionKey, status: existing.status }) : json({ error: "run_payload_conflict" }, 409)
    await writeRuntimeDispatchEnvelope(this.env.BACKUP_BUCKET, input)
    const run: StoredRun = { runId: input.runId, sessionKey: input.sessionKey, status: "queued", updatedAt: new Date().toISOString(), checkpoint: input.input.checkpoint }
    await this.setRun(run)
    await this.emit(input.runId, { event: "run_queued", runId: input.runId, sessionKey: input.sessionKey, status: "queued" })
    await this.env.AGENT_RUN_QUEUE.send({ version: 2, runId: input.runId, sessionKey: input.sessionKey, dispatchKey: runtimeDispatchKey(input.runId), requestedAt: new Date().toISOString() })
    return json({ accepted: true, runId: input.runId, sessionKey: input.sessionKey, status: "queued" }, 202)
  }

  private async prepareSession(request: Request, body: string) {
    await this.authenticate(request, body)
    const requestInput = parseSessionRunRequest(body)
    const runtimeInput = requestInput.input
    if (runtimeInput.sharedSkillSetSelection) {
      if (sharedSelectionForbidden(runtimeInput.agentId)) return json({ error: "runtime_shared_selection_forbidden" }, 409)
      if (runtimeInput.sharedSkillSetSelection.agentId !== runtimeInput.agentId) return json({ error: "runtime_shared_selection_agent_mismatch" }, 409)
      const storedAgentId = await this.ctx.storage.get<string>("sharedAgentId")
      if (storedAgentId && storedAgentId !== runtimeInput.agentId) return json({ error: "runtime_session_agent_mismatch" }, 409)
      await this.ctx.storage.put("sharedAgentId", runtimeInput.agentId)
    } else if (await this.ctx.storage.get<string>("sharedAgentId")) {
      // A session initialized for a governed shared Agent cannot be reused as
      // a generic Chat session. The session key normally prevents this, while
      // this guard keeps the isolation invariant true for malformed requests.
      return json({ error: "runtime_session_agent_mismatch" }, 409)
    }
    const checkpoint = runtimeInput.checkpoint || (await this.ctx.storage.get<RuntimeCheckpointRef>("latestCheckpoint")) || null
    const sandbox = getSandbox(this.env.Sandbox as Parameters<typeof getSandbox>[0], requestInput.sessionKey, {
      // Workflow -> Durable Object -> Sandbox RPC can lose its Cap'n Web
      // session during the first default-session operation. Dashi executes a
      // self-contained CLI turn, so use the HTTP transport for that path.
      transport: runtimeInput.agentId === "executive-presentation-ppt" ? "http" : "rpc",
      enableDefaultSession: false,
      sleepAfter: sharedSessionSleepAfter(this.env.SHARED_AGENT_SESSION_SLEEP_AFTER),
      keepAlive: false,
    })
    this.sandbox = sandbox
    const preparedWorkspace = await withTimeout(
      prepareSessionWorkspace(sandbox, { ...runtimeInput, checkpoint }, checkpoint, this.env.SHARED_AGENT_SKILL_BUNDLE_BUCKET),
      180_000,
      "shared_session_prepare_timeout",
    )
    const sessionDir = preparedWorkspace.sessionDir
    const sessionId = await withTimeout(this.runtime.ensure(
      sandbox,
      { ...runtimeInput, checkpoint },
      sessionDir,
      (await this.ctx.storage.get<string>("opencodeSessionId")) || null,
      requestInput.provider,
    ), 180_000, "shared_opencode_prepare_timeout")
    await this.ctx.storage.put("opencodeSessionId", sessionId)
    await this.ctx.storage.put("sandboxId", requestInput.sessionKey)
    // Prewarming has no user turn to create a checkpoint. Persist the
    // OpenCode HOME/session database now so a later sleeping-container restore
    // never reuses a session ID whose local state disappeared.
    const backup = await createSessionWorkspaceBackup(sandbox, sessionDir, {
      localBucket: this.env.ENVIRONMENT !== "production",
      runId: requestInput.runId,
    })
    await this.ctx.storage.put("latestCheckpoint", {
      sequence: 0,
      stage: "session-prepared",
      backupId: backup.id,
      backupDir: backup.dir,
      resumePayload: { localBucket: backup.localBucket === true },
    } satisfies RuntimeCheckpointRef)
    return json({ prepared: true, sessionKey: requestInput.sessionKey, ...(preparedWorkspace.sharedSkillSet ? { sharedSkillSet: preparedWorkspace.sharedSkillSet } : {}) })
  }

  private async executeRun(input: CloudflareSessionRunRequest) {
    const current = await this.getRun(input.runId)
    if (current?.status === "succeeded") return current
    if (current?.status === "cancelled") return current
    const latestCheckpoint = await this.ctx.storage.get<RuntimeCheckpointRef>("latestCheckpoint")
    const checkpoint = input.input.checkpoint || latestCheckpoint || null
    const runtimeInput = { ...input.input, checkpoint }
    if (runtimeInput.sharedSkillSetSelection) {
      if (sharedSelectionForbidden(runtimeInput.agentId)) throw new Error("runtime_shared_selection_forbidden")
      if (runtimeInput.sharedSkillSetSelection.agentId !== runtimeInput.agentId) throw new Error("runtime_shared_selection_agent_mismatch")
      const storedAgentId = await this.ctx.storage.get<string>("sharedAgentId")
      if (storedAgentId && storedAgentId !== runtimeInput.agentId) throw new Error("runtime_session_agent_mismatch")
      await this.ctx.storage.put("sharedAgentId", runtimeInput.agentId)
    }
    const existingRun: StoredRun = current || { runId: input.runId, sessionKey: input.sessionKey, status: "queued", updatedAt: new Date().toISOString(), checkpoint }
    await this.setRun({ ...existingRun, status: "running", updatedAt: new Date().toISOString() })
    await this.emit(input.runId, { event: "runtime_started", runId: input.runId })
    const stage = async (tool: string, phase: "started" | "completed", message?: string) => {
      await this.emit(input.runId, { event: "tool_event", tool, phase, ...(message ? { message } : {}), runId: input.runId })
    }
    const sessionKey = input.sessionKey
    await stage("sandbox_acquire", "started")
    const sandbox = getSandbox(this.env.Sandbox as Parameters<typeof getSandbox>[0], sessionKey, {
      transport: "rpc",
      // Every turn uses absolute workspace paths and an explicit OpenCode
      // server/process. The deprecated implicit shell can exit after a backup
      // and make later artifact discovery fail the entire shared run.
      enableDefaultSession: false,
      sleepAfter: runtimeInput.sharedSkillSetSelection ? sharedSessionSleepAfter(this.env.SHARED_AGENT_SESSION_SLEEP_AFTER) : "10m",
      keepAlive: false,
    })
    this.sandbox = sandbox
    await stage("sandbox_acquire", "completed")
    await stage("sandbox_workspace_prepare", "started")
    const preparedWorkspace = await withTimeout(prepareSessionWorkspace(sandbox, runtimeInput, checkpoint, runtimeInput.sharedSkillSetSelection ? this.env.SHARED_AGENT_SKILL_BUNDLE_BUCKET : undefined), 180_000, "sandbox_workspace_prepare_timeout")
    const sessionDir = preparedWorkspace.sessionDir
    await stage("sandbox_workspace_prepare", "completed")
    await stage("opencode_boot", "started")
    const sessionId = await withTimeout(this.runtime.ensure(
      sandbox,
      runtimeInput,
      sessionDir,
      (await this.ctx.storage.get<string>("opencodeSessionId")) || null,
      input.provider,
    ), 180_000, "opencode_boot_timeout")
    await stage("opencode_boot", "completed")
    await this.ctx.storage.put("opencodeSessionId", sessionId)
    await this.ctx.storage.put("sandboxId", sessionKey)
    if (runtimeInput.sharedSkillSetSelection) await this.emit(input.runId, { event: "agent_resolved", agentId: runtimeInput.sharedSkillSetSelection.agentId, runId: input.runId })
    for await (const event of this.runtime.executeTurn(runtimeInput)) {
      if ((await this.getRun(input.runId))?.status === "cancelled") {
        await this.releaseSandbox()
        return this.getRun(input.runId)
      }
      await this.emit(input.runId, event)
      if (event.event === "runtime_error") throw new Error(event.message)
    }
    const backup = await createSessionWorkspaceBackup(sandbox, sessionDir, { localBucket: this.env.ENVIRONMENT !== "production", runId: input.runId })
    const nextCheckpoint: RuntimeCheckpointRef = { sequence: (checkpoint?.sequence || 0) + 1, stage: "turn-complete", backupId: backup.id, backupDir: backup.dir, resumePayload: { localBucket: backup.localBucket === true } }
    await this.ctx.storage.put(`checkpoint:${input.runId}`, nextCheckpoint)
    await this.ctx.storage.put("latestCheckpoint", nextCheckpoint)
    await this.emit(input.runId, { event: "checkpoint_saved", checkpoint: nextCheckpoint, runId: input.runId })
    const artifacts = await publishRuntimeArtifactsV2({ bucket: this.env.ARTIFACT_BUCKET, sandbox, sessionKey, runId: input.runId, sessionDir, maxArtifacts: runtimeInput.artifactContract.maxArtifacts, maxArtifactBytes: runtimeInput.artifactContract.maxArtifactBytes, maxArtifactTotalBytes: runtimeInput.artifactContract.maxArtifactTotalBytes, allowedExtensions: runtimeInput.artifactContract.allowedExtensions, allowPptx: isPptxExportAuthorized(runtimeInput) })
    for (const warning of artifacts.warnings) await this.emit(input.runId, { event: "runtime_warning", code: warning, message: "An artifact was rejected or could not be published.", runId: input.runId })
    for (const artifact of artifacts.artifacts) await this.emit(input.runId, { event: "artifact_reference", artifact, runId: input.runId })
    await this.emit(input.runId, { event: "done", runId: input.runId })
    const complete: StoredRun = { ...existingRun, status: "succeeded", updatedAt: new Date().toISOString(), checkpoint: nextCheckpoint }
    await this.setRun(complete)
    await this.notifyPlatform(complete)
    if (!runtimeInput.sharedSkillSetSelection) await this.releaseSandbox()
    return complete
  }

  private async executeInternal(request: Request) {
    if (request.headers.get("X-Workflow-Secret") !== this.env.AGENT_RUNNER_HMAC_SECRET) return json({ error: "workflow_unauthorized" }, 401)
    const input = await request.json() as CloudflareSessionRunRequest
    try { return json(await this.executeRun(input)) } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1024) : "runtime_execution_failed"
      await this.emit(input.runId, { event: "runtime_error", code: "runtime_execution_failed", message, retryable: true, runId: input.runId })
      const failed: StoredRun = { runId: input.runId, sessionKey: input.sessionKey, status: "failed", updatedAt: new Date().toISOString(), checkpoint: input.input.checkpoint, error: message }
      await this.setRun(failed)
      await this.notifyPlatform(failed)
      await this.releaseSandbox()
      return json(failed, 500)
    }
  }

  private async eventTicket(request: Request, runId: string, body: string) {
    await this.authenticate(request, body)
    const token = await createEventTicket({ runId, secret: this.env.OPENCODE_EVENT_TICKET_SECRET, ttlSeconds: 3_600 })
    return json({ eventsUrl: `${new URL(request.url).origin}/v2/runs/${runId}/events`, eventToken: token, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
  }

  private async eventStream(request: Request, runId: string) {
    if (!await verifyEventTicket(request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "", { runId, secret: this.env.OPENCODE_EVENT_TICKET_SECRET })) return json({ error: "event_ticket_invalid" }, 401)
    const origin = allowedEventOrigin(request, this.env.OPENCODE_EVENT_ALLOWED_ORIGINS)
    if (request.headers.get("Origin") && !origin) return json({ error: "event_origin_not_allowed" }, 403)
    const encoder = new TextEncoder()
    const lastId = Number.parseInt(request.headers.get("Last-Event-ID") || "0", 10) || 0
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let cursor = lastId
        let closed = false
        const close = () => { if (!closed) { closed = true; try { controller.close() } catch { /* subscriber disconnected */ } } }
        const pump = async () => {
          const deadline = Date.now() + 3_600_000
          while (!closed && Date.now() < deadline) {
            const stored = await this.events(runId)
            for (const item of stored.filter((event) => event.id > cursor)) {
              cursor = item.id
              controller.enqueue(encoder.encode(`id: ${item.id}\nevent: runtime\ndata: ${JSON.stringify(item.event)}\n\n`))
            }
            const run = await this.getRun(runId)
            if (run && ["succeeded", "failed", "cancelled", "timed_out"].includes(run.status) && cursor >= ((await this.events(runId)).at(-1)?.id || 0)) break
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          close()
        }
        request.signal.addEventListener("abort", close, { once: true })
        void pump()
      },
    })
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) } })
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const runId = readRunId(url)
    if (request.method === "POST" && url.pathname === "/v2/sessions/prepare") return this.prepareSession(request, await request.text())
    if (request.method === "POST" && url.pathname === "/v2/runs") return this.acceptRun(request, await request.text())
    if (request.method === "POST" && url.pathname.endsWith("/event-ticket") && runId) return this.eventTicket(request, runId, await request.text())
    if (request.method === "GET" && url.pathname.endsWith("/events") && runId) return this.eventStream(request, runId)
    if (request.method === "POST" && url.pathname.endsWith("/cancel") && runId) {
      const body = await request.text()
      await this.authenticate(request, body)
      await this.ctx.storage.put(`run:${runId}`, { ...(await this.getRun(runId)), runId, status: "cancelled", updatedAt: new Date().toISOString() })
      await this.runtime.abort().catch(() => undefined)
      // A cancelled turn must explicitly release its session container; otherwise a
      // stuck CLI keeps the RPC runtime occupied and later retries fail during
      // sandbox.mkdir/createSession.
      await this.releaseSandbox()
      await this.emit(runId, { event: "runtime_error", code: "run_cancelled", message: "OpenCode run cancelled.", retryable: false, runId })
      const cancelled = await this.getRun(runId)
      if (cancelled) await this.notifyPlatform(cancelled)
      return json({ ok: true, runId, status: "cancelled" })
    }
    if (request.method === "GET" && url.pathname.startsWith("/v2/runs/") && runId) return json(await this.getRun(runId) || { error: "run_not_found" }, (await this.getRun(runId)) ? 200 : 404)
    if (request.method === "POST" && url.pathname === "/internal/execute") return this.executeInternal(request)
    return json({ error: "not_found" }, 404)
  }
}
