import assert from "node:assert/strict"
import test from "node:test"

import { isPublishedR2ArtifactUrl } from "./r2-artifact-url"

test("accepts platform artifact and R2 URLs", () => {
  assert.equal(isPublishedR2ArtifactUrl("/api/platform/artifacts/635/download"), true)
  assert.equal(isPublishedR2ArtifactUrl("https://s.aimarketingsite.com/platform-artifacts/1/deck.png"), true)
  assert.equal(isPublishedR2ArtifactUrl("https://bucket.account.r2.cloudflarestorage.com/artifacts/deck.png?X-Amz-Signature=x"), true)
})

test("rejects container-local, data, and arbitrary external image URLs", () => {
  assert.equal(isPublishedR2ArtifactUrl("/opt/dashiai-ppt/assets/skill/theme-style-grid.png"), false)
  assert.equal(isPublishedR2ArtifactUrl("data:image/png;base64,abc"), false)
  assert.equal(isPublishedR2ArtifactUrl("https://example.com/theme-style-grid.png"), false)
  assert.equal(isPublishedR2ArtifactUrl("/workspace/artifacts/theme-style-grid.png"), false)
})
