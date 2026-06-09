import assert from "node:assert/strict"
import test from "node:test"

import {
  getPlatformArtifactPreviewKind,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"

test("artifact preview kind follows mime type", () => {
  assert.equal(getPlatformArtifactPreviewKind({ kind: "file", mimeType: "audio/mpeg" }), "audio")
  assert.equal(getPlatformArtifactPreviewKind({ kind: "file", mimeType: "image/png" }), "image")
  assert.equal(getPlatformArtifactPreviewKind({ kind: "file", mimeType: "video/mp4" }), "video")
  assert.equal(getPlatformArtifactPreviewKind({ kind: "json", mimeType: "application/json" }), "file")
})

test("artifact source url prefers external url", () => {
  const url = resolvePlatformArtifactSourceUrl({
    externalUrl: "https://example.com/file.mp3",
    storageKey: null,
  } as Parameters<typeof resolvePlatformArtifactSourceUrl>[0])

  assert.equal(url, "https://example.com/file.mp3")
})
