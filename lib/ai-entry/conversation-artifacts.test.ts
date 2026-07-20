import assert from "node:assert/strict"
import test from "node:test"

import { buildConversationArtifactParts } from "./conversation-artifacts"

test("maps persisted conversation artifacts to downloadable message parts", () => {
  const parts = buildConversationArtifactParts([
    { artifactId: 531, title: "0-ppt-master.pptx", kind: "pptx" },
    { artifactId: 531, title: "duplicate.pptx", kind: "pptx" },
    { artifactId: 532, title: "1-企业AI营销工作台.pptx", kind: "pptx" },
    { artifactId: 533, title: "quality-check.svg", kind: "svg" },
  ])

  assert.equal(parts.length, 2)
  assert.equal(parts[0]?.artifactType, "pptx")
  assert.equal(parts[0]?.downloadUrl, "/api/platform/artifacts/531/download?download=1")
  assert.equal(parts[1]?.previewUrl, "/api/platform/artifacts/532/download")
})

test("infers a Dashi PPTX from a persisted generic runtime artifact", () => {
  const parts = buildConversationArtifactParts([
    {
      artifactId: 533,
      title: "屿算智能企业介绍",
      kind: "file",
      summary: "屿算智能企业介绍.pptx (application/vnd.openxmlformats-officedocument.presentationml.presentation)",
    },
  ])

  assert.equal(parts[0]?.artifactType, "pptx")
  assert.equal(parts[0]?.fileName, "屿算智能企业介绍.pptx")
})
