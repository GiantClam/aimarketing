import assert from "node:assert/strict"
import { test } from "node:test"

import {
  selectFinalRuntimeArtifacts,
  validateRuntimeArtifactPayload,
  validateRuntimeArtifactReference,
} from "./artifact-detector"

const limits = {
  maxArtifacts: 8,
  maxArtifactBytes: 100,
  maxArtifactTotalBytes: 120,
  allowedExtensions: [".md", ".json"],
}

test("validates a bounded markdown artifact", () => {
  const contentBase64 = Buffer.from("# answer", "utf8").toString("base64")
  const artifact = validateRuntimeArtifactPayload({ path: "artifacts/answer.md", title: "Answer", kind: "markdown", mimeType: "text/markdown", sizeBytes: 8, contentBase64 }, limits)
  assert.equal(artifact.fileName, "answer.md")
})

test("rejects path traversal and size mismatch", () => {
  const base = { title: "Answer", kind: "markdown", mimeType: "text/markdown", sizeBytes: 1, contentBase64: "eA==" }
  assert.throws(() => validateRuntimeArtifactPayload({ ...base, path: "artifacts/../secret.md" }, limits), /path_invalid/)
  assert.throws(() => validateRuntimeArtifactPayload({ ...base, path: "artifacts/answer.md", sizeBytes: 2 }, limits), /size_mismatch/)
})

test("validates a bounded Cloudflare R2 artifact reference", () => {
  const artifact = validateRuntimeArtifactReference({
    provider: "r2",
    bucket: "ARTIFACT_BUCKET",
    key: "artifacts/sess-1/run-1/final/deck.pptx",
    publicUrl: null,
    fileName: "final/deck.pptx",
    title: "Deck",
    kind: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: 100,
    checksumSha256: "a".repeat(64),
  }, { ...limits, allowedExtensions: [".pptx"] })

  assert.equal(artifact.fileName, "deck.pptx")
  assert.equal(artifact.storageKey, "artifacts/sess-1/run-1/final/deck.pptx")
})

test("rejects non-PPTX/HTML files under the Dashi artifact contract", () => {
  const dashiLimits = { ...limits, allowedExtensions: [".pptx", ".html"] }
  const contentBase64 = Buffer.from("{}", "utf8").toString("base64")

  assert.throws(() => validateRuntimeArtifactPayload({
    path: "artifacts/goal.json",
    title: "Goal",
    kind: "file",
    mimeType: "application/json",
    sizeBytes: 2,
    contentBase64,
  }, dashiLimits), /extension_not_allowed/)
})

test("selects one named final PPTX and hides runtime process files", () => {
  const selected = selectFinalRuntimeArtifacts([
    { fileName: "result.pptx", kind: "pptx", sizeBytes: 10 },
    { fileName: "quality-check.svg", kind: "svg", sizeBytes: 3 },
    { fileName: "ppt/index.html", kind: "html", sizeBytes: 4 },
    { fileName: "final-deck.pptx", kind: "pptx", sizeBytes: 12 },
    { fileName: "deck-copy.pptx", kind: "pptx", sizeBytes: 12 },
  ])

  assert.deepEqual(selected.map((item) => item.fileName), ["final-deck.pptx"])
})

test("uses the PPTX summary filename for persisted conversation artifacts", () => {
  const selected = selectFinalRuntimeArtifacts([
    { artifactId: 1, title: "中间结果", kind: "file", summary: "preview.html (text/html)" },
    { artifactId: 2, title: "最终演示", kind: "pptx", summary: "最终演示.pptx (application/vnd.openxmlformats-officedocument.presentationml.presentation)" },
  ])

  assert.deepEqual(selected.map((item) => item.artifactId), [2])
})
