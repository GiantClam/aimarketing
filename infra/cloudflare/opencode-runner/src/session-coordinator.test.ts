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
