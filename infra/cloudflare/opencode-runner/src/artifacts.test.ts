import assert from "node:assert/strict"
import { test } from "node:test"

import { collectRunArtifacts } from "./artifacts"

test("discovers nested Dashi artifacts when the V1 manifest is absent", async () => {
  const runDir = "/workspace/runs/11111111-1111-4111-8111-111111111111"
  const htmlPath = "/workspace/output/enterprise-ai-cs/ppt/index.html"
  const sandbox = {
    async readFile(path: string) {
      if (path.endsWith("artifact-manifest.json")) throw new Error("missing")
      if (path === htmlPath) return new TextEncoder().encode("<html>ok</html>")
      return null
    },
    async exec(command: string) {
      if (command.startsWith("find ")) return { stdout: `${htmlPath}\n` }
      return { success: false }
    },
  }
  const result = await collectRunArtifacts(sandbox, runDir, {
    maxArtifacts: 8,
    maxArtifactBytes: 1024,
    maxArtifactTotalBytes: 4096,
    allowedExtensions: ["html"],
    discoverDashi: true,
  })
  assert.equal(result.artifacts.length, 1)
  assert.equal(result.artifacts[0]?.path, "artifacts/dashi-output/enterprise-ai-cs/ppt/index.html")
  assert.equal(result.artifacts[0]?.mimeType, "text/html")
  assert.ok(result.warnings.includes("runtime_artifact_manifest_missing"))
})

test("accepts nested manifest paths for editable PPT artifacts", async () => {
  const runDir = "/workspace/runs/22222222-2222-4222-8222-222222222222"
  const pptxPath = `${runDir}/artifacts/project/deck.pptx`
  const sandbox = {
    async readFile(path: string) {
      if (path.endsWith("artifact-manifest.json")) return JSON.stringify({ artifacts: [{ path: "artifacts/project/deck.pptx" }] })
      if (path === pptxPath) return new Uint8Array([80, 75, 3, 4])
      return null
    },
    async exec() { return { success: false } },
  }
  const result = await collectRunArtifacts(sandbox, runDir, {
    maxArtifacts: 8,
    maxArtifactBytes: 1024,
    maxArtifactTotalBytes: 4096,
    allowedExtensions: ["pptx"],
  })
  assert.equal(result.artifacts.length, 1)
  assert.equal(result.artifacts[0]?.path, "artifacts/project/deck.pptx")
})
