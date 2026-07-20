import assert from "node:assert/strict"
import { test } from "node:test"

import { validateRuntimeArtifactPayload } from "./artifact-detector"

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
