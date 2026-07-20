import assert from "node:assert/strict"
import test from "node:test"

import { parseRuntimeProjectSnapshot } from "./project-snapshot"

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
