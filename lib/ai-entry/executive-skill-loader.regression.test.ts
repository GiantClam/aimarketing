import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}

test("default executive diagnostic loads compact runtime brief", async () => {
  const { loadExecutiveSkillForAgent } = await import("./executive-skill-loader")

  const content = await loadExecutiveSkillForAgent("executive-diagnostic")

  assert.match(content, /Executive Diagnostic Runtime Brief/)
  assert.match(content, /Use enterprise knowledge first/)
  assert.ok(
    content.length < 6_000,
    `expected compact default diagnostic prompt, received ${content.length} chars`,
  )
})
