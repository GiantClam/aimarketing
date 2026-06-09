import assert from "node:assert/strict"
import test from "node:test"

import { getCapabilityMediaWorkspaceFeatures } from "@/lib/platform/capabilities-media-workspace"

test("media workspace exposes grouped audio and video features", () => {
  const zh = getCapabilityMediaWorkspaceFeatures("zh")
  const ids = zh.features.map((item) => item.id)

  assert.deepEqual(ids, [
    "ai-music",
    "voice-clone",
    "voice-synthesis",
    "ai-video",
    "face-fusion",
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
