import assert from "node:assert/strict"
import test from "node:test"

import { shouldPreferInlineReferenceImages } from "./reference-preference"

test("shouldPreferInlineReferenceImages returns true when any openai-compatible provider is configured", () => {
  assert.equal(
    shouldPreferInlineReferenceImages({
      hasPptoken: false,
      hasAiberm: true,
      hasCrazyroute: false,
    }),
    true,
  )
  assert.equal(
    shouldPreferInlineReferenceImages({
      hasPptoken: true,
      hasAiberm: false,
      hasCrazyroute: false,
    }),
    true,
  )
})

test("shouldPreferInlineReferenceImages returns false when only google-style file references are available", () => {
  assert.equal(
    shouldPreferInlineReferenceImages({
      hasPptoken: false,
      hasAiberm: false,
      hasCrazyroute: false,
    }),
    false,
  )
})
