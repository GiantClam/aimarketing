import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMiniMaxH3MultimodalVideoPayload,
  resolveRunningHubVideoFeatureId,
  resolveSeedanceVideoEndpoint,
} from "@/lib/platform/runninghub-video"
import type { RunningHubConfig } from "@/lib/platform/runninghub"

const config: RunningHubConfig = {
  baseUrl: "https://www.runninghub.cn",
  apiKey: "test-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-fast/text-to-video",
  seedanceImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video",
  seedanceProTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0/text-to-video",
  seedanceProImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0/image-to-video",
  seedanceMiniTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/text-to-video",
  seedanceMiniImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/image-to-video",
  minimaxH3MultimodalToVideoEndpoint: "/openapi/v2/minimax/hailuo-h3/multimodal-to-video",
  digitalHumanWorkflowId: null,
  videoEnhanceWorkflowId: null,
  image: {
    configured: false,
    endpoint: null,
  },
  video: {
    configured: true,
    endpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-fast/text-to-video",
  },
}

test("seedance endpoint resolver keeps fast and mini model routes separate", () => {
  assert.equal(
    resolveSeedanceVideoEndpoint({
      featureId: "text-to-video",
      params: {
        modelId: "runninghub:video:seedance-text-to-video",
        model: "seedance-text-to-video",
      },
      config,
    }),
    "/openapi/v2/rhart-video/sparkvideo-2.0-fast/text-to-video",
  )

  assert.equal(
    resolveSeedanceVideoEndpoint({
      featureId: "text-to-video",
      params: {
        modelId: "runninghub:video:seedance-mini-text-to-video",
        model: "seedance-mini-text-to-video",
      },
      config,
    }),
    "/openapi/v2/rhart-video/sparkvideo-2.0-mini/text-to-video",
  )

  assert.equal(
    resolveSeedanceVideoEndpoint({
      featureId: "image-to-video",
      params: {
        modelId: "runninghub:video:seedance-mini-image-to-video",
      },
      config,
    }),
    "/openapi/v2/rhart-video/sparkvideo-2.0-mini/image-to-video",
  )
})

test("seedance endpoint resolver routes pro models to the standard RunningHub API", () => {
  assert.equal(
    resolveSeedanceVideoEndpoint({
      featureId: "text-to-video",
      params: { modelId: "runninghub:video:seedance-pro-text-to-video" },
      config,
    }),
    "/openapi/v2/rhart-video/sparkvideo-2.0/text-to-video",
  )

  assert.equal(
    resolveSeedanceVideoEndpoint({
      featureId: "image-to-video",
      params: { nativeModel: "seedance-pro-image-to-video" },
      config,
    }),
    "/openapi/v2/rhart-video/sparkvideo-2.0/image-to-video",
  )
})

test("MiniMax-H3 payload supports text, image, and reference media inputs", () => {
  assert.deepEqual(
    buildMiniMaxH3MultimodalVideoPayload("image-to-video", {
      prompt: "让主体自然移动",
      firstFrameUrl: "https://example.com/first.png",
      imageUrls: "https://example.com/second.png\nhttps://example.com/first.png",
      duration: "20",
      ratio: "16:9",
    }),
    {
      prompt: "让主体自然移动",
      imageUrls: ["https://example.com/second.png", "https://example.com/first.png"],
      resolution: "2K",
      duration: "15",
      ratio: "16:9",
    },
  )

  assert.deepEqual(
    buildMiniMaxH3MultimodalVideoPayload("reference-to-video", {
      prompt: "参考素材生成连贯视频",
      referenceImageUrls: ["https://example.com/subject.png"],
      sourceVideoUrl: "https://example.com/reference.mp4",
      audioUrl: "https://example.com/reference.wav",
      duration: 8,
    }),
    {
      prompt: "参考素材生成连贯视频",
      imageUrls: ["https://example.com/subject.png"],
      videoUrls: ["https://example.com/reference.mp4"],
      audioUrls: ["https://example.com/reference.wav"],
      resolution: "2K",
      duration: "8",
      ratio: "adaptive",
    },
  )
})

test("RunningHub resolves the MiniMax-H3 reference feature", () => {
  assert.equal(resolveRunningHubVideoFeatureId("reference-to-video"), "reference-to-video")
})
