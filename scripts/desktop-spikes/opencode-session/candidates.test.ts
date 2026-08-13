import assert from "node:assert/strict"
import test from "node:test"

import { classifyCandidatePath, deduplicateCandidates } from "./candidates.ts"

test("classifies private, system, and GUI-only OpenCode candidates", () => {
  assert.equal(classifyCandidatePath("D:\\repo\\scripts\\desktop-spikes\\opencode-session\\.private\\node_modules\\opencode-ai\\bin\\opencode.exe"), "private")
  assert.equal(classifyCandidatePath("C:\\Program Files\\nodejs\\node_modules\\opencode-ai\\bin\\opencode.exe"), "system")
  assert.equal(classifyCandidatePath("C:\\Users\\alice\\AppData\\Local\\Programs\\@opencode-aidesktop\\OpenCode.exe"), "desktop-gui")
})

test("deduplicates equivalent candidate paths case-insensitively on Windows", () => {
  const result = deduplicateCandidates([
    { kind: "system", path: "C:\\Tools\\OpenCode.exe" },
    { kind: "system", path: "c:\\tools\\opencode.exe" },
  ])

  assert.equal(result.length, 1)
})
