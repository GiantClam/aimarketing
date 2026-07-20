import assert from "node:assert/strict"
import { test } from "node:test"

import * as clientModule from "../../../../lib/ai-entry/runtime/cloudflare-sandbox-client"
import { verifyRunnerSignature } from "./auth"

const clientRuntime = (clientModule as unknown as { default?: typeof clientModule }).default || clientModule

class MemoryStore {
  private values = new Map<string, unknown>()
  async get(key: string) { return this.values.get(key) }
  async put(key: string, value: unknown) { this.values.set(key, value) }
}

const runId = "11111111-1111-4111-8111-111111111111"

test("accepts valid HMAC and rejects nonce replay", async () => {
  const body = JSON.stringify({ runId, input: { runId }, timeoutMs: 1000 })
  const headers = await clientRuntime.createRunnerAuthHeaders({ body, runId, secret: "secret", timestamp: 1000, nonce: "nonce" })
  const request = new Request("https://runner.example.com/runs", { method: "POST", headers, body })
  const store = new MemoryStore()
  await verifyRunnerSignature(request, body, "secret", store, 1000)
  await assert.rejects(() => verifyRunnerSignature(request, body, "secret", store, 1000), /nonce_replayed/)
})

test("rejects stale signatures and body tampering", async () => {
  const body = JSON.stringify({ runId })
  const headers = await clientRuntime.createRunnerAuthHeaders({ body, runId, secret: "secret", timestamp: 1000, nonce: "nonce-stale" })
  const request = new Request("https://runner.example.com/runs", { method: "POST", headers, body })
  await assert.rejects(() => verifyRunnerSignature(request, body, "secret", new MemoryStore(), 1401), /signature_invalid/)
  await assert.rejects(() => verifyRunnerSignature(request, `${body}x`, "secret", new MemoryStore(), 1000), /body_hash_mismatch/)
})
