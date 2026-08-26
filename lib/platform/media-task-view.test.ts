import assert from "node:assert/strict"
import test from "node:test"

import { serializePlatformMediaTask } from "@/lib/platform/media-task-view"

test("serializes a media run into the workspace task shape with its platform run id", () => {
  const result = serializePlatformMediaTask({
    id: 17,
    itemSlug: "text-to-video",
    status: "succeeded",
    externalSystem: null,
    normalizedResult: {
      provider: "minimax",
      results: [{ url: "https://example.com/video.mp4", outputType: "video/mp4" }],
      extra: { providerTaskId: "upstream-17" },
    },
  })

  assert.equal(result.runId, 17)
  assert.equal(result.taskId, "17")
  assert.equal(result.capabilitySlug, "ai-video")
  assert.equal(result.featureId, "text-to-video")
  assert.equal(result.status, "succeeded")
  assert.equal(result.detailPath, "/api/platform/media/tasks/17?target=ai-video")
  assert.deepEqual(result.results, [
    { url: "https://example.com/video.mp4", outputType: "video/mp4", text: null, title: null },
  ])
})

test("serializes audio feature runs into the shared capabilities workspace", () => {
  const result = serializePlatformMediaTask({
    id: 18,
    itemSlug: "voice-synthesis",
    status: "running",
    externalSystem: "minimax",
    normalizedResult: null,
  })

  assert.equal(result.capabilitySlug, "ai-music")
  assert.equal(result.featureId, "voice-synthesis")
  assert.equal(result.provider, "minimax")
  assert.equal(result.detailPath, "/api/platform/media/tasks/18?target=ai-music")
})
