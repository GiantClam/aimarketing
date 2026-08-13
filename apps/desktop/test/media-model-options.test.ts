import assert from "node:assert/strict"
import test from "node:test"
import { WORKBENCH_MEDIA_FEATURES } from "@aimarketing/workbench-ui"
import { applyConfiguredMediaModels } from "../src/media-model-options"

test("media model fields expose the configured catalog and selected model", () => {
  const feature = WORKBENCH_MEDIA_FEATURES.find((item) => item.id === "voice-synthesis")!
  const resolved = applyConfiguredMediaModels(feature, ["speech-2.8-turbo", "speech-2.8-hd", "speech-2.8-turbo"], "speech-2.8-hd")
  const modelField = resolved.fields.find((field) => field.id === "model")!
  assert.equal(modelField.defaultValue, "speech-2.8-hd")
  assert.deepEqual(modelField.options?.map((option) => option.value), ["speech-2.8-turbo", "speech-2.8-hd"])
})

test("stale media selections fall back to the first configured model", () => {
  const feature = WORKBENCH_MEDIA_FEATURES.find((item) => item.id === "text-to-video")!
  const resolved = applyConfiguredMediaModels(feature, ["configured-video-a", "configured-video-b"], "removed-video")
  const modelField = resolved.fields.find((field) => field.id === "model")!
  assert.equal(modelField.defaultValue, "configured-video-a")
  assert.deepEqual(modelField.options?.map((option) => option.value), ["configured-video-a", "configured-video-b"])
})
