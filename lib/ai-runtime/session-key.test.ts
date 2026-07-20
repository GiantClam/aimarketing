import test from "node:test"
import assert from "node:assert/strict"
import { buildAgentRuntimeSessionKey, isAgentRuntimeSessionKey } from "./session-key"

test("builds a stable non-PII session key", async () => {
  const input = { enterpriseId: 42, userId: 7, conversationId: "conv-1", agentId: "brand-advisor" }
  const first = await buildAgentRuntimeSessionKey(input)
  const second = await buildAgentRuntimeSessionKey(input)
  assert.equal(first, second)
  assert.match(first, /^sess-[0-9a-f]{40}$/)
  assert.equal(first.includes("brand-advisor"), false)
  assert.equal(isAgentRuntimeSessionKey(first), true)
})

test("separates users, conversations and agent profiles", async () => {
  const base = { enterpriseId: 42, userId: 7, conversationId: "conv-1", agentId: "general" }
  const variants = await Promise.all([
    buildAgentRuntimeSessionKey(base),
    buildAgentRuntimeSessionKey({ ...base, userId: 8 }),
    buildAgentRuntimeSessionKey({ ...base, conversationId: "conv-2" }),
    buildAgentRuntimeSessionKey({ ...base, agentId: "growth-advisor" }),
  ])
  assert.equal(new Set(variants).size, variants.length)
})
