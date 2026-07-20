import { ContainerProxy } from "@cloudflare/sandbox"
import type { CloudflareSessionQueueMessage } from "../../../../lib/ai-runtime/contracts"
import { isUuid } from "./auth"
import { jsonResponse } from "./sse"
import { runtimeDispatchKey } from "./runtime-envelope"
import { AgentRunCoordinator, type RunnerEnv } from "./run-coordinator"
import { AgentRunWorkflow } from "./run-workflow"
import { PptMasterCanaryContainer, PptMasterContainer } from "./ppt-master-container"
import { SessionCoordinator, type SessionCoordinatorNamespace, type SessionRunnerEnv } from "./session-coordinator"

// Export the SDK class directly, matching the verified Dashi smoke worker.
export { Sandbox } from "@cloudflare/sandbox"
export { ContainerProxy }
export { AgentRunCoordinator, AgentRunWorkflow, PptMasterCanaryContainer, PptMasterContainer, SessionCoordinator }

type Env = RunnerEnv & SessionRunnerEnv & {
  AgentRunCoordinator: DurableObjectNamespace
  PPT_MASTER_CONTAINER: DurableObjectNamespace
  /** Optional Railway backend for editable PPT rendering. */
  PPT_WORKER_RAILWAY_BASE_URL?: string
  PPT_WORKER_RAILWAY_TOKEN?: string
  SessionCoordinator: SessionCoordinatorNamespace
  AGENT_RUN_WORKFLOW: { create(options: { id: string; params: CloudflareSessionQueueMessage }): Promise<unknown> }
}

async function sessionKeyForRun(env: Env, runId: string) {
  const envelope = await env.BACKUP_BUCKET.get(runtimeDispatchKey(runId))
  if (!envelope) return null
  try {
    const value = JSON.parse(await envelope.text()) as { request?: { sessionKey?: unknown } }
    return typeof value.request?.sessionKey === "string" ? value.request.sessionKey : null
  } catch {
    return null
  }
}

async function routeToSession(request: Request, env: Env, sessionKey: string) {
  const id = env.SessionCoordinator.idFromName(sessionKey)
  const stub = env.SessionCoordinator.get(id)
  return stub.fetch(request)
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type,Last-Event-ID,X-Agent-Runner-Timestamp,X-Agent-Runner-Nonce,X-Agent-Runner-Body-SHA256,X-Agent-Runner-Signature,X-Idempotency-Key", "Access-Control-Max-Age": "600" } })
    if (request.method === "GET" && url.pathname === "/health") return jsonResponse({ ok: true, service: "opencode-runner", opencode: "1.17.13", sandbox: "0.12.3", runtime: "v2" })

    if (url.pathname.startsWith("/ppt/")) {
      const containerPath = url.pathname.replace(/^\/ppt/u, "") || "/health"
      if (env.PPT_WORKER_RAILWAY_BASE_URL) {
        const base = env.PPT_WORKER_RAILWAY_BASE_URL.replace(/\/+$/u, "")
        const target = new URL(`${base}${containerPath}${url.search}`)
        const headers = new Headers(request.headers)
        if (env.PPT_WORKER_RAILWAY_TOKEN) headers.set("Authorization", `Bearer ${env.PPT_WORKER_RAILWAY_TOKEN}`)
        return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: request.redirect }))
      }
      const container = env.PPT_MASTER_CONTAINER.getByName("shared-ppt-master")
      const target = new URL(containerPath + url.search, request.url)
      return container.fetch(new Request(target, request))
    }

    // Keep the V1 contract available during the in-place migration. The V2
    // session path is opt-in from the app profile and can be rolled back to
    // this coordinator without changing the public API shape.
    if (request.method === "POST" && (/^\/runs$/.test(url.pathname) || /^\/runs\/[0-9a-f-]{36}\/cancel$/i.test(url.pathname))) {
      const body = await request.clone().text()
      const match = url.pathname.match(/^\/runs\/([0-9a-f-]{36})\/cancel$/i)
      const runId = match?.[1] || (() => {
        try {
          const payload = JSON.parse(body) as { runId?: unknown }
          return typeof payload.runId === "string" ? payload.runId : null
        } catch {
          return null
        }
      })()
      if (!runId || !isUuid(runId)) return jsonResponse({ error: "run_id_invalid" }, 400)
      const id = env.AgentRunCoordinator.idFromName(runId)
      const stub = env.AgentRunCoordinator.get(id)
      return stub.fetch(new Request(request, { body }))
    }

    if (request.method === "POST" && url.pathname === "/v2/runs") {
      const body = await request.clone().text()
      try {
        const payload = JSON.parse(body) as { sessionKey?: unknown }
        if (typeof payload.sessionKey !== "string") return jsonResponse({ error: "session_key_invalid" }, 400)
        return routeToSession(new Request(request, { body }), env, payload.sessionKey)
      } catch { return jsonResponse({ error: "run_request_invalid_json" }, 400) }
    }

    if (request.method === "POST" && url.pathname === "/v2/sessions/prepare") {
      const body = await request.clone().text()
      try {
        const payload = JSON.parse(body) as { sessionKey?: unknown }
        if (typeof payload.sessionKey !== "string") return jsonResponse({ error: "session_key_invalid" }, 400)
        return routeToSession(new Request(request, { body }), env, payload.sessionKey)
      } catch { return jsonResponse({ error: "run_request_invalid_json" }, 400) }
    }

    const match = url.pathname.match(/^\/v2\/runs\/([0-9a-f-]{36})(?:\/(event-ticket|events|cancel))?$/i)
    if (match && isUuid(match[1])) {
      const runId = match[1]
      let sessionKey: string | null = null
      let requestToForward = request
      if (request.method === "POST") {
        const body = await request.clone().text()
        try {
          const payload = JSON.parse(body) as { sessionKey?: unknown }
          sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null
          if (!sessionKey) return jsonResponse({ error: "session_key_invalid" }, 400)
          requestToForward = new Request(request, { body })
        } catch { return jsonResponse({ error: "run_request_invalid_json" }, 400) }
      } else {
        sessionKey = await sessionKeyForRun(env, runId)
      }
      if (!sessionKey) return jsonResponse({ error: "run_session_not_found" }, 404)
      return routeToSession(requestToForward, env, sessionKey)
    }

    return jsonResponse({ error: "not_found" }, 404)
  },

  async queue(batch: MessageBatch<CloudflareSessionQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      try {
        await env.AGENT_RUN_WORKFLOW.create({ id: message.body.runId, params: message.body })
        message.ack()
      } catch (error) {
        console.log(JSON.stringify({ event: "workflow_create_failed", runId: message.body.runId, message: error instanceof Error ? error.message : String(error) }))
        message.retry()
      }
    }
  },
}
