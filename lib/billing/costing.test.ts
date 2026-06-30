import assert from "node:assert/strict"
import test from "node:test"

import { creditsFromOfficialCostUsd, estimateGptImage2Credits, estimateTextCredits, estimateVideoGenerationCredits } from "./costing"

test("costing applies 50 percent official cost basis and rounds up credits", () => {
  const estimate = creditsFromOfficialCostUsd({
    featureKey: "image_design_generate",
    officialCostUsd: 0.053,
  })

  assert.equal(estimate.costBasisUsd, 0.0265)
  assert.equal(estimate.credits, 27)
})

test("costing estimates gpt-image-2 medium and high image credits", () => {
  const medium = estimateGptImage2Credits({
    featureKey: "image_design_generate",
    size: "1024x1024",
    quality: "medium",
    provider: "pptoken",
    imageCount: 1,
  })
  const highEdit = estimateGptImage2Credits({
    featureKey: "image_design_mask_edit",
    size: "1024x1024",
    quality: "high",
    provider: "pptoken",
    imageCount: 1,
  })

  assert.equal(medium.credits, 27)
  assert.equal(highEdit.credits, 159)
  assert.equal(highEdit.multiplier, 1.5)
})

test("costing estimates text usage from actual tokens", () => {
  const estimate = estimateTextCredits({
    featureKey: "ai_entry_chat",
    inputTokens: 10_000,
    outputTokens: 20_000,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 15,
    provider: "pptoken",
    model: "google/gemini-2.5-flash",
  })

  assert.equal(estimate.officialCostUsd, 0.35)
  assert.equal(estimate.credits, 175)
})

test("costing applies writer copy multiplier", () => {
  const estimate = estimateTextCredits({
    featureKey: "writer_copy",
    inputTokens: 10_000,
    outputTokens: 20_000,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 15,
    provider: "writer",
    model: "writer-skills",
  })

  assert.equal(estimate.officialCostUsd, 0.35)
  assert.equal(estimate.multiplier, 1.2)
  assert.equal(estimate.credits, 210)
})

test("costing supports writer image and fixed image export features", () => {
  const writerImage = estimateGptImage2Credits({
    featureKey: "writer_image",
    size: "1024x1024",
    quality: "medium",
    provider: "aiberm",
    imageCount: 3,
  })
  const exportCost = creditsFromOfficialCostUsd({
    featureKey: "image_export",
    officialCostUsd: 0.001,
  })

  assert.equal(writerImage.credits, 80)
  assert.equal(exportCost.credits, 1)
})

test("costing estimates video generation by feature, duration, and resolution", () => {
  const textToVideo = estimateVideoGenerationCredits({
    featureId: "text-to-video",
    durationSeconds: 6,
    resolution: "768P",
    provider: "minimax",
    model: "MiniMax-Hailuo-2.3",
  })
  const imageToVideo1080 = estimateVideoGenerationCredits({
    featureId: "image-to-video",
    durationSeconds: 10,
    resolution: "1080P",
    provider: "minimax",
    model: "MiniMax-Hailuo-2.3-Fast",
  })
  const videoEnhance = estimateVideoGenerationCredits({
    featureId: "video-enhance",
    durationSeconds: 5,
    resolution: "720p",
    provider: "runninghub",
  })

  assert.equal(textToVideo.officialCostUsd, 0.48)
  assert.equal(textToVideo.multiplier, 2)
  assert.equal(textToVideo.credits, 480)
  assert.equal(imageToVideo1080.credits, 1200)
  assert.equal(videoEnhance.credits, 200)
})
