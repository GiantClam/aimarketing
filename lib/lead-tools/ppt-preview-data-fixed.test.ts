import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPptPreviewDeckFromPlans,
  getPptPreviewLayoutSequence,
  getPptPreviewStyleSummary,
  resolveOptionalPptPreviewPageCount,
} from "./ppt-preview-data-fixed"

test("getPptPreviewStyleSummary falls back safely for unknown style keys", () => {
  assert.equal(getPptPreviewStyleSummary(undefined, "zh-CN"), "正式 AI PPT 模板。")
  assert.equal(
    getPptPreviewStyleSummary("ppt169_unknown_template" as never, "en-US"),
    "Formal AI PPT template.",
  )
})

test("optional page count accepts blank input and arbitrary integers within range", () => {
  assert.equal(resolveOptionalPptPreviewPageCount(undefined), null)
  assert.equal(resolveOptionalPptPreviewPageCount(""), null)
  assert.equal(resolveOptionalPptPreviewPageCount(12), 12)
  assert.equal(resolveOptionalPptPreviewPageCount("99"), 20)
})

test("layout sequence expands beyond nine slides while keeping a closing slide", () => {
  assert.deepEqual(getPptPreviewLayoutSequence(11), [
    "cover",
    "agenda",
    "insight",
    "comparison",
    "evidence",
    "stats",
    "chart",
    "process",
    "insight",
    "comparison",
    "timeline",
  ])
})

test("ppt preview deck assigns structured request images to cover and supported content layouts", () => {
  const deck = buildPptPreviewDeckFromPlans(
    {
      prompt: "品牌发布提案",
      scenario: "marketing-campaign",
      language: "zh-CN",
      templateMode: "single-template",
      templateId: "long-table",
      images: [
        { url: "https://example.com/cover.png", title: "封面图", sourceNodeKey: "image-1", role: "cover" },
        { url: "https://example.com/insight.png", title: "洞察图", sourceNodeKey: "image-2", role: "content" },
        { url: "https://example.com/comparison.png", title: "对比图", sourceNodeKey: "image-3", role: "content" },
        { url: "https://example.com/evidence.png", title: "证据图", sourceNodeKey: "image-4", role: "content" },
      ],
    },
    [
      {
        variantKey: "ppt169_brutalist_ai_newspaper_2026",
        styleKey: "ppt169_brutalist_ai_newspaper_2026",
        templateId: "long-table",
        title: "品牌发布提案",
        outline: ["封面", "目录", "洞察", "对比", "证据", "数据", "图表", "流程", "总结"],
        slides: [
          { layout: "cover", kicker: "封面", title: "封面页", body: "封面说明", bullets: ["A"] },
          { layout: "agenda", kicker: "目录", title: "目录页", body: "目录说明", bullets: ["B"] },
          { layout: "insight", kicker: "洞察", title: "洞察页", body: "洞察说明", bullets: ["C"] },
          { layout: "comparison", kicker: "对比", title: "对比页", body: "对比说明", bullets: ["D"] },
          { layout: "evidence", kicker: "证据", title: "证据页", body: "证据说明", bullets: ["E"] },
          { layout: "stats", kicker: "数据", title: "数据页", body: "数据说明", bullets: ["F"] },
          { layout: "chart", kicker: "图表", title: "图表页", body: "图表说明", bullets: ["G"] },
          { layout: "process", kicker: "流程", title: "流程页", body: "流程说明", bullets: ["H"] },
          { layout: "timeline", kicker: "总结", title: "总结页", body: "总结说明", bullets: ["I"] },
        ],
      },
    ],
  )

  const slides = deck.variants[0]?.slides ?? []
  assert.equal(slides[0]?.layout, "cover")
  assert.equal(slides[0]?.image?.url, "https://example.com/cover.png")
  assert.equal(slides[2]?.layout, "insight")
  assert.equal(slides[2]?.image?.url, "https://example.com/insight.png")
  assert.equal(slides[3]?.layout, "comparison")
  assert.equal(slides[3]?.image?.url, "https://example.com/comparison.png")
  assert.equal(slides[4]?.layout, "evidence")
  assert.equal(slides[4]?.image?.url, "https://example.com/evidence.png")
})
