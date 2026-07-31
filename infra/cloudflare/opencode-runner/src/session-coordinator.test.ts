import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("shared session coordination avoids the deprecated implicit Sandbox shell", async () => {
  const source = await readFile(resolve(import.meta.dirname, "session-coordinator.ts"), "utf8")
  assert.doesNotMatch(source, /enableDefaultSession:\s*true/u)
})

test("session endpoints convert signature failures into 401 responses", async () => {
  const source = await readFile(resolve(import.meta.dirname, "session-coordinator.ts"), "utf8")
  assert.match(source, /authenticateOrReject/u)
  assert.match(source, /if \(rejected\) return rejected/u)
})

test("accepted v2 runs trigger the durable workflow directly", async () => {
  const source = await readFile(resolve(import.meta.dirname, "session-coordinator.ts"), "utf8")
  assert.match(source, /AGENT_RUN_WORKFLOW\.create/u)
  assert.doesNotMatch(source, /AGENT_RUN_QUEUE\.send/u)
})

test("running v2 runs notify the platform before the terminal callback", async () => {
  const source = await readFile(resolve(import.meta.dirname, "session-coordinator.ts"), "utf8")
  assert.match(source, /await this\.notifyPlatform\(running\)/u)
})

test("Dashi execution keeps the sandbox on HTTP transport", async () => {
  const source = await readFile(resolve(import.meta.dirname, "session-coordinator.ts"), "utf8")
  assert.match(source, /transport: runtimeInput\.agentId === "executive-presentation-ppt" \? "http" : "rpc"/u)
})
