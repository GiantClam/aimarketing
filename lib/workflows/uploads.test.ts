import assert from "node:assert/strict"
import test from "node:test"

import { resolveUploadNodeOutputs } from "@/lib/workflows/uploads"
import type { PlatformArtifactRecord } from "@/lib/platform/task-run-store"

function buildArtifact(overrides: Partial<PlatformArtifactRecord>): PlatformArtifactRecord {
  return {
    id: 42,
    runId: 7,
    enterpriseId: 1,
    ownerUserId: 1,
    kind: "file",
    title: "brand.png",
    mimeType: "image/png",
    storageKey: "platform-artifacts/1/7/runninghub/brand.png",
    externalUrl: null,
    payload: null,
    createdAt: new Date(),
    ...overrides,
  }
}

test("upload node can mix newly uploaded assets and referenced library assets", async () => {
  const outputs = await resolveUploadNodeOutputs(
    {
      enterpriseId: 1,
      ownerUserId: 1,
      uploadedFiles: [{ fileName: "brand.png", mimeType: "image/png", storageKey: "tmp/brand.png", artifactId: 9 }],
      referencedArtifactIds: [42],
    },
    {
      loadArtifact: async () => buildArtifact({ id: 42 }),
    },
  )

  assert.equal(outputs.assets.length, 2)
  assert.deepEqual(outputs.assets.map((asset) => asset.source), ["upload", "library"])
  assert.equal(outputs.assets[0]?.artifactId, 9)
  assert.equal(outputs.assets[1]?.artifactId, 42)
})

test("upload node rejects cross-enterprise artifact references", async () => {
  await assert.rejects(
    () =>
      resolveUploadNodeOutputs(
        {
          enterpriseId: 1,
          ownerUserId: 1,
          referencedArtifactIds: [99],
        },
        {
          loadArtifact: async () => buildArtifact({ id: 99, enterpriseId: 2 }),
        },
      ),
    /workflow_upload_artifact_not_found/,
  )
})

test("upload node resolves artifact library source urls for downstream nodes", async () => {
  const outputs = await resolveUploadNodeOutputs(
    {
      enterpriseId: 8,
      ownerUserId: 5,
      referencedArtifactIds: [77],
    },
    {
      loadArtifact: async () =>
        buildArtifact({
          id: 77,
          enterpriseId: 8,
          title: "Launch key visual",
          mimeType: "image/jpeg",
          storageKey: null,
          externalUrl: "https://cdn.example.com/key-visual.jpg",
        }),
    },
  )

  assert.equal(outputs.assets[0]?.source, "library")
  assert.equal(outputs.assets[0]?.fileName, "Launch key visual")
  assert.equal(outputs.assets[0]?.url, "https://cdn.example.com/key-visual.jpg")
})
