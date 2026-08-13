import assert from "node:assert/strict"
import test from "node:test"

import { DEFAULT_OPENCODE_RUN_TIMEOUT_MS, resolveOpenCodeRunTimeoutMs } from "./runtime-timeout"

test("OpenCode runtime timeout defaults to one hour", () => {
  assert.equal(resolveOpenCodeRunTimeoutMs(undefined), DEFAULT_OPENCODE_RUN_TIMEOUT_MS)
  assert.equal(resolveOpenCodeRunTimeoutMs("not-a-number"), DEFAULT_OPENCODE_RUN_TIMEOUT_MS)
})

test("OpenCode runtime timeout never falls below the PPT generation floor", () => {
  assert.equal(resolveOpenCodeRunTimeoutMs("300000"), DEFAULT_OPENCODE_RUN_TIMEOUT_MS)
  assert.equal(resolveOpenCodeRunTimeoutMs("7200000"), 7_200_000)
})
