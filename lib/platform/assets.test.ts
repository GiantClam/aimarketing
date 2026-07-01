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

let mapArtifactToEnterpriseUnifiedAssetLibraryItem: typeof import("./assets").mapArtifactToEnterpriseUnifiedAssetLibraryItem

test.before(async () => {
  const mod = await import("./assets")
  mapArtifactToEnterpriseUnifiedAssetLibraryItem = mod.mapArtifactToEnterpriseUnifiedAssetLibraryItem
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("asset library items mark workflow text payloads as accessible", () => {
  const item = mapArtifactToEnterpriseUnifiedAssetLibraryItem({
    id: 145,
    runId: 17,
    enterpriseId: 3,
    ownerUserId: 7,
    kind: "text",
    title: "Content Repurpose text output 1",
    mimeType: "text/plain",
    storageKey: null,
    externalUrl: null,
    payload: {
      source: "workflow",
      text: "hello world",
    },
    createdAt: new Date("2026-06-30T14:00:00.000Z"),
  })

  assert.equal(item.hasAccessibleContent, true)
  assert.equal(item.status, "ready")
  assert.equal(item.inlinePreviewText, "hello world")
  assert.equal(item.previewUrl, "/api/platform/artifacts/145/download")
  assert.equal(item.downloadUrl, "/api/platform/artifacts/145/download?download=1")
})

test("asset library items mark orphaned upload records as inaccessible", () => {
  const item = mapArtifactToEnterpriseUnifiedAssetLibraryItem({
    id: 136,
    runId: 9,
    enterpriseId: 3,
    ownerUserId: 7,
    kind: "file",
    title: "legacy.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    storageKey: null,
    externalUrl: null,
    payload: {
      source: "upload",
    },
    createdAt: new Date("2026-06-23T09:42:00.000Z"),
  })

  assert.equal(item.hasAccessibleContent, false)
  assert.equal(item.status, "unavailable")
  assert.equal(item.inlinePreviewText, null)
})

test("text-like uploaded files use platform proxy urls for preview and download", () => {
  const item = mapArtifactToEnterpriseUnifiedAssetLibraryItem({
    id: 178,
    runId: 96,
    enterpriseId: 3,
    ownerUserId: 7,
    kind: "file",
    title: "1782812442684-_ppt-.md",
    mimeType: "text/markdown",
    storageKey: "workflow-inputs/96/1782812442684-_ppt-.md",
    externalUrl: null,
    payload: {
      source: "workflow",
    },
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
  })

  assert.equal(item.previewUrl, "/api/platform/artifacts/178/download")
  assert.equal(item.downloadUrl, "/api/platform/artifacts/178/download?download=1")
})
