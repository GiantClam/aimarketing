import assert from "node:assert/strict"
import test from "node:test"

import { parseRuntimeProjectSnapshot } from "./project-snapshot"
import { selectPublishableArtifactRecords } from "./artifact-utils"

test("Railway accepts a valid lightweight ppt-master snapshot", () => {
  const snapshot = parseRuntimeProjectSnapshot(JSON.stringify({
    schemaVersion: 1,
    projectKind: "ppt-master",
    state: { title: "Quarterly plan", slideCount: 6 },
  }))
  assert.deepEqual(snapshot?.state, { title: "Quarterly plan", slideCount: 6 })
})

test("Railway rejects malformed and oversized project snapshots", () => {
  assert.equal(parseRuntimeProjectSnapshot(JSON.stringify({ schemaVersion: 2, projectKind: "ppt-master", state: {} })), null)
  assert.equal(parseRuntimeProjectSnapshot(JSON.stringify({ schemaVersion: 1, projectKind: "ppt-master", state: { svg: "x".repeat(128 * 1024) } })), null)
  assert.equal(parseRuntimeProjectSnapshot("not-json"), null)
})

test("ppt master artifact discovery prefers the named deck over result.pptx", () => {
  const selected = selectPublishableArtifactRecords([
    { path: "workspace/.cache/result.pptx", title: "result.pptx", kind: "pptx" },
    { path: "turns/1/artifacts/1-2026年全球经济展望.pptx", title: "1-2026年全球经济展望.pptx", kind: "pptx" },
    { path: "turns/1/artifacts/0-2026年全球经济展望.pptx", title: "0-2026年全球经济展望.pptx", kind: "pptx" },
  ], true)

  assert.deepEqual(selected.map((item) => item.path), ["turns/1/artifacts/1-2026年全球经济展望.pptx"])
})
