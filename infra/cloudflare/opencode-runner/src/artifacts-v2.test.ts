import assert from "node:assert/strict"
import { test } from "node:test"

import { publishRuntimeArtifactsV2 } from "./artifacts-v2"

test("publishes native Dashi files when the skill omits the platform manifest", async () => {
  const sessionDir = "/workspace/sessions/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const runId = "11111111-1111-4111-8111-111111111111"
  const pptxPath = `${sessionDir}/turns/${runId}/project/ai-customer-service-review.pptx`
  const puts: Array<{ key: string; bytes: Uint8Array }> = []
  const sandbox = {
    async readFile(path: string) {
      if (path === pptxPath) return new Uint8Array([80, 75, 3, 4])
      return null
    },
    async exec(command: string) {
      if (command.includes("find ")) return { success: true, stdout: `${pptxPath}\n` }
      return { success: false }
    },
  }
  const bucket = {
    async put(key: string, value: Uint8Array) {
      puts.push({ key, bytes: value })
    },
  }

  const result = await publishRuntimeArtifactsV2({
    bucket: bucket as never,
    sandbox,
    sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    runId,
    sessionDir,
    maxArtifacts: 8,
    maxArtifactBytes: 1024,
    maxArtifactTotalBytes: 4096,
    allowedExtensions: ["pptx"],
    allowPptx: true,
  })

  assert.equal(result.artifacts.length, 1)
  assert.equal(result.artifacts[0]?.fileName, "project/ai-customer-service-review.pptx")
  assert.equal(puts[0]?.key, `artifacts/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${runId}/project/ai-customer-service-review.pptx`)
  assert.deepEqual([...puts[0]!.bytes], [80, 75, 3, 4])
})

test("falls back when the platform manifest is present but empty", async () => {
  const sessionDir = "/workspace/sessions/sess-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const runId = "22222222-2222-4222-8222-222222222222"
  const pptxPath = `${sessionDir}/workspace/output/ai-customer-service-review/ai-customer-service-review.pptx`
  let published = false
  const sandbox = {
    async readFile(path: string) {
      if (path.endsWith("artifact-manifest.json")) return { content: "{}" }
      if (path === pptxPath) return new Uint8Array([80, 75, 3, 4])
      return null
    },
    async exec(command: string) {
      if (command.includes("find ")) return { success: true, stdout: `${pptxPath}\n` }
      return { success: false }
    },
  }
  const bucket = {
    async put() { published = true },
  }

  const result = await publishRuntimeArtifactsV2({
    bucket: bucket as never,
    sandbox,
    sessionKey: "sess-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    runId,
    sessionDir,
    maxArtifacts: 8,
    maxArtifactBytes: 1024,
    maxArtifactTotalBytes: 4096,
    allowedExtensions: ["pptx"],
    allowPptx: true,
  })

  assert.equal(result.artifacts.length, 1)
  assert.equal(published, true)
  assert.ok(result.warnings.includes("runtime_artifact_manifest_invalid"))
})

test("discovers native Dashi exports from the container output root", async () => {
  const sessionDir = "/workspace/sessions/sess-cccccccccccccccccccccccccccccccc"
  const runId = "33333333-3333-4333-8333-333333333333"
  const pptxPath = "/workspace/output/ai-customer-service-review/企业AI客服助手试点复盘.pptx"
  const sandbox = {
    async readFile(path: string) {
      if (path === pptxPath) return new Uint8Array([80, 75, 3, 4])
      return null
    },
    async exec(command: string) {
      if (command.includes("find ")) return { success: true, stdout: `${pptxPath}\n` }
      return { success: false }
    },
  }
  const puts: string[] = []
  const bucket = { async put(key: string) { puts.push(key) } }

  const result = await publishRuntimeArtifactsV2({
    bucket: bucket as never,
    sandbox,
    sessionKey: "sess-cccccccccccccccccccccccccccccccc",
    runId,
    sessionDir,
    maxArtifacts: 8,
    maxArtifactBytes: 1024,
    maxArtifactTotalBytes: 4096,
    allowedExtensions: ["pptx"],
    allowPptx: true,
  })

  assert.equal(result.artifacts.length, 1)
  assert.equal(result.artifacts[0]?.fileName, "dashi-output/ai-customer-service-review/企业AI客服助手试点复盘.pptx")
  assert.equal(puts.length, 1)
})

test("prioritizes final PPTX and HTML over manifest JSON when artifact slots are limited", async () => {
  const sessionDir = "/workspace/sessions/sess-dddddddddddddddddddddddddddddddd"
  const runId = "44444444-4444-4444-8444-444444444444"
  const turnDir = `${sessionDir}/turns/${runId}`
  const jsonPath = `${turnDir}/artifacts/brief.json`
  const pptxPath = "/workspace/output/customer-review/deck.pptx"
  const htmlPath = "/workspace/output/customer-review/ppt/index.html"
  const sandbox = {
    async readFile(path: string) {
      if (path.endsWith("artifact-manifest.json")) {
        return JSON.stringify({ artifacts: [{ path: "artifacts/brief.json" }] })
      }
      if (path === jsonPath) return new TextEncoder().encode("{}")
      if (path === pptxPath) return new Uint8Array([80, 75, 3, 4])
      if (path === htmlPath) return new TextEncoder().encode("<html></html>")
      return null
    },
    async exec(command: string) {
      if (command.includes("find ")) return { success: true, stdout: `${jsonPath}\n${htmlPath}\n${pptxPath}\n` }
      return { success: false }
    },
  }
  const puts: string[] = []
  const bucket = { async put(key: string) { puts.push(key) } }

  const result = await publishRuntimeArtifactsV2({
    bucket: bucket as never,
    sandbox,
    sessionKey: "sess-dddddddddddddddddddddddddddddddd",
    runId,
    sessionDir,
    maxArtifacts: 2,
    maxArtifactBytes: 1024,
    maxArtifactTotalBytes: 4096,
    allowedExtensions: ["json", "html", "pptx"],
    allowPptx: true,
  })

  assert.deepEqual(result.artifacts.map((artifact) => artifact.mimeType), [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/html",
  ])
  assert.equal(puts.length, 2)
  assert.ok(result.warnings.includes("runtime_artifact_count_exceeded"))
})

test("rejects a final PPTX reference until the user confirms export", async () => {
  const sessionDir = "/workspace/sessions/sess-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  const runId = "55555555-5555-4555-8555-555555555555"
  const pptxPath = `${sessionDir}/turns/${runId}/artifacts/deck.pptx`
  const sandbox = {
    async readFile(path: string) {
      if (path.endsWith("artifact-manifest.json")) return JSON.stringify([{ path: "artifacts/deck.pptx" }])
      if (path === pptxPath) return new Uint8Array([80, 75, 3, 4])
      return null
    },
    async exec() { return { success: false } },
  }
  const result = await publishRuntimeArtifactsV2({
    bucket: { async put() {} } as never,
    sandbox,
    sessionKey: "sess-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    runId,
    sessionDir,
    maxArtifacts: 8,
    maxArtifactBytes: 1024,
    maxArtifactTotalBytes: 4096,
    allowedExtensions: ["pptx"],
    allowPptx: false,
  })

  assert.equal(result.artifacts.length, 0)
  assert.ok(result.warnings.includes("runtime_artifact_export_confirmation_required"))
})
