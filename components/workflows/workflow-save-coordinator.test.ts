import assert from "node:assert/strict"
import test from "node:test"

import { createWorkflowSaveCoordinator } from "./workflow-save-coordinator"

test("workflow save coordinator coalesces duplicate in-flight snapshots", async () => {
  const coordinator = createWorkflowSaveCoordinator<string>()
  const calls: string[] = []
  let release: ((value: string) => void) | null = null

  const first = coordinator.run("snapshot-a", () => {
    calls.push("save-a")
    return new Promise<string>((resolve) => {
      release = resolve
    })
  })
  const second = coordinator.run("snapshot-a", () => {
    calls.push("save-a-duplicate")
    return Promise.resolve("unexpected")
  })

  assert.equal(first, second)
  assert.deepEqual(calls, ["save-a"])

  release?.("saved-a")
  assert.equal(await first, "saved-a")
  assert.equal(await second, "saved-a")
})

test("workflow save coordinator serializes newer snapshots after the active save", async () => {
  const coordinator = createWorkflowSaveCoordinator<string>()
  const calls: string[] = []
  let releaseFirst: ((value: string) => void) | null = null

  const first = coordinator.run("snapshot-a", () => {
    calls.push("save-a")
    return new Promise<string>((resolve) => {
      releaseFirst = resolve
    })
  })
  const second = coordinator.run("snapshot-b", async () => {
    calls.push("save-b")
    return "saved-b"
  })

  assert.deepEqual(calls, ["save-a"])
  releaseFirst?.("saved-a")

  assert.equal(await first, "saved-a")
  assert.equal(await second, "saved-b")
  assert.deepEqual(calls, ["save-a", "save-b"])
})
