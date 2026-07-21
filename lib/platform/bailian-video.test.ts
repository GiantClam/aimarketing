import assert from "node:assert/strict"
import test from "node:test"

import { buildBailianVideoCreateBody } from "./bailian-video"

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
