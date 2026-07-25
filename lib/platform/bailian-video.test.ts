import assert from "node:assert/strict"
import test from "node:test"

import { buildBailianVideoCreateBody } from "./bailian-video"
import { buildBailianUrl } from "./bailian"

test("Bailian workspace compatible base resolves video and image API paths at the workspace root", () => {
  assert.equal(
    buildBailianUrl(
      "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "/api/v1/services/aigc/video-generation/video-synthesis",
    ),
    "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
  )
})

test("HappyHorse body maps documented text-to-video parameters", () => {
  assert.deepEqual(
    buildBailianVideoCreateBody(
      { prompt: "A horse running through a neon city.", resolution: "720P", ratio: "9:16", duration: "12" },
      "happyhorse-1.1-t2v",
    ),
    {
      model: "happyhorse-1.1-t2v",
      input: { prompt: "A horse running through a neon city." },
      parameters: { resolution: "720P", ratio: "9:16", duration: 12 },
    },
  )
})

test("HappyHorse body maps first-frame image-to-video media", () => {
  assert.deepEqual(
    buildBailianVideoCreateBody(
      {
        firstFrameUrl: "https://example.com/first.png",
        prompt: "A horse runs through the city.",
        resolution: "1080P",
        duration: 8,
      },
      "happyhorse-1.1-i2v",
    ),
    {
      model: "happyhorse-1.1-i2v",
      input: {
        prompt: "A horse runs through the city.",
        media: [{ type: "first_frame", url: "https://example.com/first.png" }],
      },
      parameters: { resolution: "1080P", ratio: "16:9", duration: 8 },
    },
  )
})

test("HappyHorse body maps reference images and video edit media", () => {
  const referenceBody = buildBailianVideoCreateBody(
    {
      referenceImageUrls: "https://example.com/one.png\nhttps://example.com/two.png",
      prompt: "Keep the character consistent across the scene.",
    },
    "happyhorse-1.1-r2v",
  )
  assert.equal(referenceBody.input && typeof referenceBody.input === "object" ? (referenceBody.input as Record<string, unknown>).media && Array.isArray((referenceBody.input as Record<string, unknown>).media) ? ((referenceBody.input as Record<string, unknown>).media as unknown[]).length : 0 : 0, 2)

  assert.deepEqual(
    buildBailianVideoCreateBody(
      {
        sourceVideoUrl: "https://example.com/source.mp4",
        referenceImageUrls: ["https://example.com/style.png"],
        prompt: "Replace the jacket with the reference style.",
        audioSetting: "origin",
      },
      "happyhorse-1.0-video-edit",
    ),
    {
      model: "happyhorse-1.0-video-edit",
      input: {
        prompt: "Replace the jacket with the reference style.",
        media: [
          { type: "video", url: "https://example.com/source.mp4" },
          { type: "reference_image", url: "https://example.com/style.png" },
        ],
      },
      parameters: { resolution: "1080P", audio_setting: "origin" },
    },
  )
})
