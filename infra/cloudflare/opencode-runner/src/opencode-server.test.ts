import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("recreates the OpenCode client when a restored session receives a new Sandbox handle", async () => {
  const source = await readFile(resolve(import.meta.dirname, "opencode-server.ts"), "utf8")
  assert.match(source, /this\.sandbox !== sandbox/u)
  assert.match(source, /this\.result!\.server\.close\(\)/u)
  assert.match(source, /providerRuntimeKey\(provider\.providerId\)/u)
})
