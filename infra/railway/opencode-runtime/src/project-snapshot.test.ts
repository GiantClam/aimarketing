import assert from "node:assert/strict"
import test from "node:test"

import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { buildFallbackRuntimeProjectSnapshot, parseRuntimeProjectSnapshot, readRuntimeProjectSnapshot } from "./project-snapshot"
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

test("project snapshot reader skips invalid candidates and finds project-local state", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "opencode-project-snapshot-"))
  const projectDir = join(runDir, "workspace", "projects", "ppt169_demo")
  await mkdir(projectDir, { recursive: true })
  await writeFile(join(runDir, "project-state.json"), JSON.stringify({ schemaVersion: 1, projectKind: "ppt-master", state: { svg: "x".repeat(128 * 1024) } }))
  const expected = { schemaVersion: 1, projectKind: "ppt-master", state: { projectPath: "projects/ppt169_demo" } }
  await writeFile(join(projectDir, "project-state.json"), JSON.stringify(expected))

  assert.deepEqual(await readRuntimeProjectSnapshot(runDir), expected)
})

test("missing model snapshot falls back to bounded project source files", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "opencode-project-snapshot-fallback-"))
  const projectDir = join(runDir, "workspace", "projects", "ppt169_demo")
  await mkdir(join(projectDir, "sources"), { recursive: true })
  await writeFile(join(projectDir, "design_spec.md"), "# Demo deck")
  await writeFile(join(projectDir, "sources", "brief.md"), "Use the existing narrative")

  const snapshot = await buildFallbackRuntimeProjectSnapshot(runDir)
  assert.deepEqual(snapshot?.state, {
    source: "runtime-workspace",
    projectPath: "projects/ppt169_demo",
    files: [
      { path: "projects/ppt169_demo/design_spec.md", content: "# Demo deck" },
      { path: "projects/ppt169_demo/sources/brief.md", content: "Use the existing narrative" },
    ],
  })
})

test("transient run layout falls back to projects beside the run workspace", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "opencode-project-snapshot-run-layout-"))
  const projectDir = join(runDir, "projects", "deck")
  await mkdir(projectDir, { recursive: true })
  await writeFile(join(projectDir, "design_spec.md"), "# Deck\n")
  const snapshot = await readRuntimeProjectSnapshot(runDir)
  assert.equal(snapshot?.state && "projectPath" in snapshot.state ? snapshot.state.projectPath : null, "projects/deck")
})
