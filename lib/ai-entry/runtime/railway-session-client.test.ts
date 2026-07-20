import assert from "node:assert/strict"
import test from "node:test"

import { prepareRailwaySession, streamRailwaySessionRun } from "./railway-session-client"

const input = {
  runId: "11111111-1111-4111-8111-111111111111",
  sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  conversationId: "42",
  enterpriseId: 1,
  userId: 2,
  agentId: "business-content-growth",
  selectedSkillIds: ["executive-consulting"],
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

test("Railway session preparation returns an explicit session_ready marker", async () => {
  const result = await prepareRailwaySession({ runId: input.runId, sessionKey: input.sessionKey, input, provider }, {
    runnerUrl: "https://railway.example.com",
    secret: "secret",
    fetchImpl: async (_url, options) => {
      assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer secret")
      return new Response(JSON.stringify({ prepared: true, sessionReady: true, sessionKey: input.sessionKey, bundleVersion: "runtime-bundle-v1", contextHash: "hash", expiresAt: new Date(Date.now() + 300000).toISOString() }), { status: 200 })
    },
  })
  assert.equal(result.sessionReady, true)
})

test("Railway session client consumes the live SSE stream without async polling", async () => {
  const body = [
    `: ready\n\n`,
    `data: ${JSON.stringify({ event: "text_delta", delta: "hello", runId: input.runId })}\n\n`,
    `data: ${JSON.stringify({ event: "done", runId: input.runId })}\n\n`,
  ].join("")
  const events = []
  for await (const event of streamRailwaySessionRun(input, provider, {
    runnerUrl: "https://railway.example.com",
    secret: "secret",
    fetchImpl: async (_url, options) => {
      assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer secret")
      assert.equal((options?.headers as Record<string, string>)["X-Idempotency-Key"], input.runId)
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
    },
  })) events.push(event)
  assert.deepEqual(events.map((event) => event.event), ["text_delta", "done"])
})

test("Railway session client recovers a disconnected SSE stream from run state", async () => {
  let post = true
  const events = []
  for await (const event of streamRailwaySessionRun(input, provider, {
    runnerUrl: "https://railway.example.com",
    secret: "secret",
    timeoutMs: 2_000,
    fetchImpl: async (url, options) => {
      assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer secret")
      if (post) {
        post = false
        return new Response(`data: ${JSON.stringify({ event: "text_delta", delta: "partial", runId: input.runId })}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } })
      }
      assert.equal(url, `https://railway.example.com/runs/${input.runId}`)
      return new Response(JSON.stringify({ status: "succeeded", events: [
        { event: "text_delta", delta: "partial", runId: input.runId },
        { event: "done", runId: input.runId },
      ] }), { status: 200 })
    },
  })) events.push(event)
  assert.deepEqual(events.map((event) => event.event), ["text_delta", "done"])
})
