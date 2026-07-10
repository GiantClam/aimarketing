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

test("Effective Agents local fallback does not borrow Swiss Grid styling", () => {
  const deck = buildMockPptPreview({
    prompt: "Build an editable agent platform deck",
    scenario: "product-launch",
    language: "en-US",
    templateMode: "single-template",
    templateId: "ppt169_building_effective_agents",
  })

  const rendered = renderPptPreviewDeckAssets(deck)
  const cover = rendered.variants[0]?.preview?.cover.dataUrl ?? ""
  const svg = Buffer.from(cover.split(",")[1] ?? "", "base64").toString("utf8")

  assert.equal(rendered.variants[0]?.styleKey, "ppt169_building_effective_agents")
  assert.match(svg, /#0F1117/u)
  assert.match(svg, /#D4845A/u)
  assert.doesNotMatch(svg, /#E6FF3D/u)
})
