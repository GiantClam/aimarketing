import assert from "node:assert/strict"
import { test } from "node:test"

import { createRunnerAuthHeaders, streamCloudflareOpenCode } from "./cloudflare-sandbox-client"

function sampleInput() {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    conversationId: "42",
    enterpriseId: 1,
    userId: 2,
    agentId: "general",
    provider: { providerId: "deepseek", modelId: "deepseek-v4-pro", baseUrl: "https://deepseek.example/v1", apiKey: "test-key" } as const,
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
}

test("signs runner requests with body hash, nonce, timestamp, and idempotency key", async () => {
  const headers = await createRunnerAuthHeaders({ body: "{}", runId: sampleInput().runId, secret: "secret", timestamp: 123, nonce: "nonce-1" })
  assert.equal(headers["X-Idempotency-Key"], sampleInput().runId)
  assert.equal(headers["X-Agent-Runner-Timestamp"], "123")
  assert.equal(headers["X-Agent-Runner-Nonce"], "nonce-1")
  assert.match(headers["X-Agent-Runner-Body-SHA256"], /^[0-9a-f]{64}$/)
  assert.match(headers["X-Agent-Runner-Signature"], /^[0-9a-f]{64}$/)
})

test("parses split SSE frames and ignores duplicate terminal events", async () => {
  const input = sampleInput()
  const body = [
    `event: runtime\ndata: ${JSON.stringify({ event: "runtime_selected", provider: "opencode", backend: "cloudflare-sandbox-exec", runId: input.runId })}\n\n`,
    `event: runtime\ndata: ${JSON.stringify({ event: "text_delta", delta: "hello", runId: input.runId })}\n\n`,
    `event: runtime\ndata: ${JSON.stringify({ event: "done", runId: input.runId })}\n\n`,
    `event: runtime\ndata: ${JSON.stringify({ event: "done", runId: input.runId })}\n\n`,
  ].join("")
  const bytes = new TextEncoder().encode(body)
  const responseBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 17))
      controller.enqueue(bytes.slice(17))
      controller.close()
    },
  })
  const events = []
  for await (const event of streamCloudflareOpenCode(input, {
    runnerUrl: "https://runner.example.com",
    secret: "secret",
    provider: input.provider,
    fetchImpl: async () => new Response(responseBody, { status: 200 }),
  })) events.push(event)
  assert.deepEqual(events.map((event) => event.event), ["runtime_selected", "text_delta", "done"])
})

test("rejects malformed runner SSE payloads", async () => {
  const input = sampleInput()
  const responseBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("event: runtime\ndata: nope\n\n"))
      controller.close()
    },
  })
  await assert.rejects(async () => {
    for await (const _event of streamCloudflareOpenCode(input, {
      runnerUrl: "https://runner.example.com",
      secret: "secret",
      provider: input.provider,
      fetchImpl: async () => new Response(responseBody, { status: 200 }),
    })) { /* expected failure */ }
  }, /opencode_runner_malformed_sse/)
})

test("recovers the final Railway events after the SSE connection terminates", async () => {
  const input = sampleInput()
  let calls = 0
  const events = []
  for await (const event of streamCloudflareOpenCode(input, {
    railway: true,
    runnerUrl: "https://railway.example.com",
    secret: "secret",
    timeoutMs: 10_000,
    provider: input.provider,
    fetchImpl: async (url) => {
      calls += 1
      if (String(url).endsWith("/runs")) return new Response(": ready\n\n", { status: 200 })
      return new Response(JSON.stringify({
        status: "succeeded",
        events: [
          { event: "text_delta", delta: "recovered", runId: input.runId },
          { event: "done", runId: input.runId },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } })
    },
  })) events.push(event)
  assert.ok(calls >= 2)
  assert.deepEqual(events.map((event) => event.event), ["text_delta", "done"])
})

test("uses Railway asynchronous acceptance and recovers the recorded result", async () => {
  const input = sampleInput()
  const events = []
  let receivedProviderId = ""
  for await (const event of streamCloudflareOpenCode(input, {
    railway: true,
    runnerUrl: "https://railway.example.com",
    secret: "secret",
    timeoutMs: 10_000,
    provider: { providerId: "deepseek", modelId: "deepseek-v4-pro", baseUrl: "https://deepseek.example/v1", apiKey: "test-key" },
    fetchImpl: async (url, options) => {
      if (String(url).endsWith("/runs")) {
        assert.equal((options?.headers as Record<string, string>).Prefer, "respond-async")
        receivedProviderId = String((JSON.parse(String(options?.body)) as { provider?: { providerId?: unknown } }).provider?.providerId || "")
        return new Response(JSON.stringify({ runId: input.runId, status: "running" }), { status: 202 })
      }
      return new Response(JSON.stringify({
        status: "succeeded",
        events: [
          { event: "text_delta", delta: "recovered", runId: input.runId },
          { event: "done", runId: input.runId },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } })
    },
  })) events.push(event)
  assert.equal(receivedProviderId, "deepseek")
  assert.deepEqual(events.map((event) => event.event), ["text_delta", "done"])
})
