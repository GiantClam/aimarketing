import assert from "node:assert/strict"
import test from "node:test"

import type { AgentRuntimeEvent } from "@/lib/ai-runtime/contracts"
import { runOpenCodeAgent } from "./opencode-adapter"

const input = {
  runId: "11111111-1111-4111-8111-111111111111",
  conversationId: "42",
  enterpriseId: 1,
  userId: 2,
  agentId: "business-content-growth",
  selectedSkillIds: [],
  systemPrompt: "system",
  messages: [{ role: "user" as const, content: "hello" }],
  attachments: [],
  artifactContext: [],
  workflowContext: null,
  artifactContract: {
    manifestPath: "artifact-manifest.json" as const,
    artifactDir: "artifacts" as const,
    maxArtifacts: 8,
    maxArtifactBytes: 2 * 1024 * 1024,
    maxArtifactTotalBytes: 4 * 1024 * 1024,
    allowedExtensions: [".md"],
  },
  policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: true },
}

const provider = { providerId: "deepseek", modelId: "deepseek-v4-pro", baseUrl: "https://deepseek.example/v1", apiKey: "test-key" }

test("Railway receives the application-selected provider credentials unchanged", async () => {
  const requestProviders: unknown[] = []
  const body = [
    `data: ${JSON.stringify({ event: "done", runId: input.runId })}\n\n`,
  ].join("")

  for await (const event of runOpenCodeAgent(input, {
    runnerUrl: "https://railway.example.com",
    secret: "secret",
    provider,
    session: true,
    fetchImpl: async (url, options) => {
      const payload = JSON.parse(String(options?.body)) as { provider?: unknown }
      requestProviders.push(payload.provider)
      if (String(url).endsWith("/sessions/prepare")) {
        return new Response(JSON.stringify({ prepared: true, sessionReady: true, sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bundleVersion: "runtime-bundle-v2" }), { status: 200 })
      }
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
    },
  })) {
    assert.ok(event)
  }

  assert.deepEqual(requestProviders, [provider, provider])
})

test("Railway session runtime errors are propagated instead of becoming empty responses", async () => {
  const body = `data: ${JSON.stringify({ event: "runtime_error", code: "provider_proxy_route_failed", message: "provider_proxy_route_failed:404", retryable: true, runId: input.runId })}\n\n`
  const events: AgentRuntimeEvent[] = []

  await assert.rejects(
    async () => {
      for await (const event of runOpenCodeAgent(input, {
        runnerUrl: "https://railway.example.com",
        secret: "secret",
        provider,
        session: true,
        fetchImpl: async (url, options) => {
          assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer secret")
          if (String(url).endsWith("/sessions/prepare")) {
            return new Response(JSON.stringify({ prepared: true, sessionReady: true, sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bundleVersion: "runtime-bundle-v2" }), { status: 200 })
          }
          return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
        },
      })) events.push(event)
    },
    /provider_proxy_route_failed:404/,
  )

  assert.deepEqual(events.map((event) => event.event), ["runtime_selected", "runtime_started", "session_ready"])
})

test("Cloudflare Dashi session runtime prepares, queues, and streams the OpenCode turn", async () => {
  const events: AgentRuntimeEvent[] = []
  const sse = [
    { event: "run_queued", runId: input.runId, sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "queued" },
    { event: "text_delta", delta: "Cloudflare Dashi reply.", runId: input.runId },
    { event: "done", runId: input.runId },
  ].map((event) => "data: " + JSON.stringify(event) + "\n\n").join("")
  const fetchImpl = async (url: string | URL | Request, _options?: RequestInit) => {
    const value = String(url)
    if (value.endsWith("/v2/sessions/prepare")) {
      return new Response(JSON.stringify({ prepared: true, sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), { status: 200 })
    }
    if (value.endsWith("/v2/runs")) {
      return new Response(JSON.stringify({ accepted: true, runId: input.runId, sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "queued" }), { status: 202 })
    }
    if (value.endsWith("/event-ticket")) {
      return new Response(JSON.stringify({ eventsUrl: "https://cloudflare.example.com/events", eventToken: "event-token", expiresAt: new Date().toISOString() }), { status: 200 })
    }
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })
  }

  for await (const event of runOpenCodeAgent(
    { ...input, agentId: "executive-presentation-ppt", selectedSkillIds: ["dashiai-ppt"] },
    {
      runnerUrl: "https://cloudflare.example.com",
      secret: "secret",
      backend: "cloudflare-opencode-session",
      provider,
      session: true,
      fetchImpl,
    },
  )) events.push(event)

  assert.deepEqual(events.map((event) => event.event), [
    "runtime_selected",
    "runtime_started",
    "session_ready",
    "run_queued",
    "text_delta",
    "done",
  ])
})
