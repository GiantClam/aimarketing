import assert from "node:assert/strict"
import test from "node:test"

import { resolveSeedanceVideoEndpoint } from "@/lib/platform/runninghub-video"
import type { RunningHubConfig } from "@/lib/platform/runninghub"

const config: RunningHubConfig = {
  baseUrl: "https://www.runninghub.cn",
  apiKey: "test-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-fast/text-to-video",
  seedanceImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video",
  seedanceMiniTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/text-to-video",
  seedanceMiniImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/image-to-video",
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
