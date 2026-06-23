import assert from "node:assert/strict"
import test from "node:test"

import {
  getCapabilityMediaWorkspaceFeatures,
  resolveCapabilityMediaWorkspaceVideoFields,
} from "@/lib/platform/capabilities-media-workspace"

test("media workspace exposes grouped audio and video features", () => {
  const zh = getCapabilityMediaWorkspaceFeatures("zh")
  const ids = zh.features.map((item) => item.id)

  assert.deepEqual(ids, [
    "ai-music",
    "voice-clone",
    "voice-synthesis",
    "text-to-video",
    "image-to-video",
    "digital-human",
    "video-enhance",
  ])
  assert.equal(zh.groups.length, 2)
  assert.equal(zh.groups[0]?.title, "音频处理")
  assert.equal(zh.groups[1]?.title, "视频处理")
})

test("media workspace localizes feature titles and form labels", () => {
  const en = getCapabilityMediaWorkspaceFeatures("en")
  const voiceClone = en.features.find((item) => item.id === "voice-clone")
  const voiceSynthesis = en.features.find((item) => item.id === "voice-synthesis")
  const aiMusic = en.features.find((item) => item.id === "ai-music")

  assert.equal(voiceClone?.title, "Voice Clone")
  assert.equal(voiceClone?.fields[0]?.label, "New voice ID")
  assert.equal(voiceSynthesis?.fields[1]?.label, "Voice")
  assert.equal(aiMusic?.fields[1]?.label, "Lyrics source")
})

test("video workspace copy and feature set stay scoped to the four shipped video flows", () => {
  const en = getCapabilityMediaWorkspaceFeatures("en")
  const videoGroup = en.groups.find((item) => item.id === "video-processing")
  const videoFeatures = en.features.filter((item) => item.capabilitySlug === "ai-video")

  assert.equal(
    videoGroup?.description,
    "Handle text-to-video, image-to-video, digital human, and video enhancement tasks in one video workspace.",
  )
  assert.deepEqual(
    videoFeatures.map((item) => item.id),
    ["text-to-video", "image-to-video", "digital-human", "video-enhance"],
  )
})

test("video workspace model schema switches with the selected registry model", () => {
  const minimaxFields = resolveCapabilityMediaWorkspaceVideoFields(
    "en",
    "text-to-video",
    "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
  )
  const runningHubFields = resolveCapabilityMediaWorkspaceVideoFields(
    "en",
    "text-to-video",
    "runninghub:video:seedance-text-to-video",
  )

  assert.equal(minimaxFields[0]?.id, "model")
  assert.equal(minimaxFields.some((field) => field.id === "ratio"), false)
  assert.equal(runningHubFields.some((field) => field.id === "ratio"), true)
  assert.equal(runningHubFields.some((field) => field.id === "generateAudio"), true)
})
