import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMiniMaxVideoCreateBody,
  getMiniMaxVideoConfig,
  isMiniMaxVideoConfigured,
  mapMiniMaxVideoStatus,
  normalizeMiniMaxVideoResolution,
} from "@/lib/platform/minimax-video"

test("minimax video config reuses the shared minimax api key", () => {
  const previousBaseUrl = process.env.LEAD_TOOLS_MINIMAX_BASE_URL
  const previousApiKey = process.env.LEAD_TOOLS_MINIMAX_API_KEY

  delete process.env.LEAD_TOOLS_MINIMAX_BASE_URL
  process.env.LEAD_TOOLS_MINIMAX_API_KEY = "test-minimax-key"

  try {
    const config = getMiniMaxVideoConfig()
    assert.equal(config.baseUrl, "https://api.minimaxi.com/v1")
    assert.equal(config.apiKey, "test-minimax-key")
    assert.equal(isMiniMaxVideoConfigured(config), true)
  } finally {
    if (previousBaseUrl == null) {
      delete process.env.LEAD_TOOLS_MINIMAX_BASE_URL
    } else {
      process.env.LEAD_TOOLS_MINIMAX_BASE_URL = previousBaseUrl
    }

    if (previousApiKey == null) {
      delete process.env.LEAD_TOOLS_MINIMAX_API_KEY
    } else {
      process.env.LEAD_TOOLS_MINIMAX_API_KEY = previousApiKey
    }
  }
})

test("minimax video body maps text-to-video into the official Hailuo payload", () => {
  const body = buildMiniMaxVideoCreateBody({
    featureId: "text-to-video",
    params: {
      prompt: "A sharp enterprise AI marketing launch video.",
      duration: "5",
      resolution: "720p",
    },
  })

  assert.deepEqual(body, {
    model: "MiniMax-Hailuo-2.3",
    prompt: "A sharp enterprise AI marketing launch video.",
    duration: 6,
    resolution: "768P",
    prompt_optimizer: true,
  })
})

test("minimax video body maps image-to-video first frame and 1080p", () => {
  const body = buildMiniMaxVideoCreateBody({
    featureId: "image-to-video",
    params: {
      firstFrameUrl: "https://example.com/frame.png",
      prompt: "Move the camera slowly through the product scene.",
      duration: "10",
      resolution: "1080p",
    },
    defaultModel: "MiniMax-Hailuo-02-Pro",
  })

  assert.equal(body.model, "MiniMax-Hailuo-02-Pro")
  assert.equal(body.duration, 10)
  assert.equal(body.resolution, "1080P")
  assert.equal(body.first_frame_image, "https://example.com/frame.png")
})

test("minimax video body downgrades legacy T2V models to 720P and 6 seconds", () => {
  const body = buildMiniMaxVideoCreateBody({
    featureId: "text-to-video",
    params: {
      model: "T2V-01-Director",
      prompt: "A cinematic product launch.",
      duration: "10",
      resolution: "1080p",
    },
  })

  assert.equal(body.model, "T2V-01-Director")
  assert.equal(body.duration, 6)
  assert.equal(body.resolution, "720P")
})

test("minimax video helpers normalize documented statuses and resolutions", () => {
  assert.equal(mapMiniMaxVideoStatus("Queueing"), "QUEUED")
  assert.equal(mapMiniMaxVideoStatus("Preparing"), "RUNNING")
  assert.equal(mapMiniMaxVideoStatus("Processing"), "RUNNING")
  assert.equal(mapMiniMaxVideoStatus("Success"), "SUCCESS")
  assert.equal(mapMiniMaxVideoStatus("Fail"), "FAILED")
  assert.equal(normalizeMiniMaxVideoResolution("480p"), "768P")
  assert.equal(normalizeMiniMaxVideoResolution("2k"), "768P")
  assert.equal(normalizeMiniMaxVideoResolution("1080p"), "1080P")
})
