import assert from "node:assert/strict"
import test from "node:test"

import { buildEvidence, redactEvidence } from "./evidence.ts"

test("redacts secrets, authorization values, and user paths recursively", () => {
  const secret = "spike-secret-value"
  const redacted = redactEvidence({
    password: secret,
    nested: {
      authorization: `Basic ${secret}`,
      command: "C:\\Users\\alice\\private\\opencode.exe",
      safe: "你好",
    },
    array: [`token=${secret}`, "/home/alice/private/opencode"],
  }, { secrets: [secret], userRoots: ["C:\\Users\\alice", "/home/alice"] }) as Record<string, unknown>

  assert.equal(redacted.password, "[redacted]")
  assert.doesNotMatch(JSON.stringify(redacted), /spike-secret-value|alice/u)
  assert.match(JSON.stringify(redacted), /你好/u)
})

test("builds a stable evidence envelope with separate transport and model verdicts", () => {
  const evidence = buildEvidence({
    runId: "fixture-run",
    candidate: { kind: "system", version: "1.17.15", executableSha256: "abc" },
    startedAt: "2026-08-11T00:00:00.000Z",
    finishedAt: "2026-08-11T00:00:01.000Z",
    checks: [
      { name: "health", status: "pass", durationMs: 5 },
      { name: "prompt_turn_1", status: "blocked", durationMs: 10, blocker: "provider_credentials_unavailable" },
    ],
  })

  assert.equal(evidence.schemaVersion, 1)
  assert.equal(evidence.spikeId, "opencode-session-system")
  assert.equal(evidence.status, "changes-required")
  assert.ok(Array.isArray(evidence.components))
  assert.ok(Array.isArray(evidence.commands))
  assert.ok(Array.isArray(evidence.assertions))
  assert.ok(Array.isArray(evidence.artifacts))
  assert.ok(Array.isArray(evidence.limitations))
  assert.equal(evidence.verdict.transport, "pass")
  assert.equal(evidence.verdict.modelBacked, "blocked")
  assert.equal(evidence.verdict.overall, "changes-required")
})
