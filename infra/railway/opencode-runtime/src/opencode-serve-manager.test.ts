import assert from "node:assert/strict"
import test from "node:test"

import type { AgentRuntimeInput, OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts.js"
import { OpenCodeServeManager } from "./opencode-serve-manager.js"

const input = (runId: string): AgentRuntimeInput => ({
  runId,
  sessionKey: "writer-session-540",
  conversationId: "540",
  enterpriseId: null,
  userId: 1,
  agentId: "writer",
  systemPrompt: "",
  messages: [],
  attachments: [],
  artifactContext: [],
  workflowContext: null,
  artifactContract: {
    manifestPath: "artifact-manifest.json",
    artifactDir: "artifacts",
    maxArtifacts: 1,
    maxArtifactBytes: 1,
    maxArtifactTotalBytes: 1,
    allowedExtensions: [],
  },
  policy: { allowPlatformTools: false, allowTools: false, allowMcp: false, allowSkillInstall: false, allowNetwork: false },
})

const provider: OpenCodeProviderConfig = {
  providerId: "pptoken",
  modelId: "gpt-5.4",
  baseUrl: "https://example.com/v1",
  apiKey: "test-key",
}

test("a synchronous OpenCode message response releases the persistent session lock", async () => {
  const manager = new OpenCodeServeManager({ runtimeDir: "/tmp/opencode-runtime-test", bundleDir: "/tmp/runtime", bundleVersion: "test", requestTimeoutMs: 5_000 })
  let requestPath = ""
  const testHooks = manager as unknown as {
    start: () => Promise<void>
    request: (path: string, init?: RequestInit, timeoutMs?: number) => Promise<Response>
  }
  testHooks.start = async () => undefined
  testHooks.request = async (path) => {
    requestPath = path
    return new Response(JSON.stringify({ info: { role: "assistant" }, parts: [] }), { status: 200 })
  }

  const first = await manager.prompt(input("run-1"), "native-session", "/tmp/session", provider, "system", "first", () => undefined)
  const second = await manager.prompt(input("run-2"), "native-session", "/tmp/session", provider, "system", "second", () => undefined)

  assert.equal(first, true)
  assert.equal(second, true)
  assert.match(requestPath, /\/session\/native-session\/message\?directory=/u)
})

test("an ambiguous OpenCode response is not replayed as a second model turn", async () => {
  const manager = new OpenCodeServeManager({ runtimeDir: "/tmp/opencode-runtime-test", bundleDir: "/tmp/runtime", bundleVersion: "test", requestTimeoutMs: 5_000 })
  let requestCount = 0
  const testHooks = manager as unknown as {
    start: () => Promise<void>
    request: (path: string, init?: RequestInit, timeoutMs?: number) => Promise<Response>
  }
  testHooks.start = async () => undefined
  testHooks.request = async () => {
    requestCount += 1
    if (requestCount === 1) return new Response(JSON.stringify({ error: "fetch failed" }), { status: 502 })
    return new Response(JSON.stringify({ info: { role: "assistant" }, parts: [] }), { status: 200 })
  }

  const completed = await manager.prompt(input("run-retry"), "native-session", "/tmp/session", provider, "system", "retry", () => undefined)

  assert.equal(completed, false)
  assert.equal(requestCount, 1)
})
