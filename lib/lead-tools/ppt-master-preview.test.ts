import assert from "node:assert/strict"
import test from "node:test"

import { renderPptPreviewDeckAssets } from "@/lib/lead-tools/ppt-master-preview"
import { buildMockPptPreview } from "@/lib/lead-tools/ppt-preview-data-fixed"

test("renderPptPreviewDeckAssets materializes mock deck assets for every preview variant", () => {
  const deck = buildMockPptPreview({
    prompt: "Create a marketing campaign preview deck",
    scenario: "marketing-campaign",
    language: "en-US",
  })

  const rendered = renderPptPreviewDeckAssets(deck)

  assert.equal(rendered.previewEngine, "ppt-master-svg")
  assert.equal(rendered.variants.length, deck.variants.length)

  for (const variant of rendered.variants) {
    assert.ok(variant.preview)
    assert.equal(variant.preview?.format, "svg")
    assert.equal(variant.preview?.themeId, variant.styleKey)
    assert.equal(variant.preview?.slides.length, variant.slides.length)
    assert.match(variant.preview?.cover.dataUrl ?? "", /^data:image\/svg\+xml;base64,/)
  }
})
