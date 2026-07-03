import fs from "node:fs"
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import {
  buildPptRecommendedTemplateSummaries,
  buildPptPreviewDeckFromPlans,
  buildPptPreviewVariantDescriptors,
  getPptPreviewLayoutSequence,
  getPptPreviewStyleSummary,
  pptPreviewStyles,
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

test("single-template variants can be narrowed to one narrative angle", () => {
  const variants = buildPptPreviewVariantDescriptors({
    prompt: "Hormuz deck",
    scenario: "marketing-campaign",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "broadside",
    narrativeAngle: "executive-brief",
  })

  assert.equal(variants.length, 1)
  assert.equal(variants[0]?.key, "broadside-executive-brief")
  assert.equal(variants[0]?.narrativeAngle, "executive-brief")
  assert.equal(variants[0]?.slotLabel, "A")
})

test("auto-4 recommends structured boardroom templates first for executive review prompts", () => {
  const variants = buildPptPreviewVariantDescriptors({
    prompt: "董事会经营复盘与风险诊断汇报，包含财务预算、关键决策与下一步计划",
    scenario: "sales-deck",
    language: "zh-CN",
  })

  assert.equal(variants.length, 4)
  assert.equal(
    ["ppt169_cangzhuo", "ppt169_brutalist_ai_newspaper_2026", "ppt169_global_ai_capital_2026"].includes(
      variants[0]?.style.key ?? "",
    ),
    true,
  )
  assert.equal(
    ["ppt169_cangzhuo", "ppt169_brutalist_ai_newspaper_2026", "ppt169_global_ai_capital_2026", "ppt169_swiss_grid_systems"].includes(
      variants[1]?.style.key ?? "",
    ),
    true,
  )
  assert.equal(new Set(variants.map((variant) => variant.style.key)).size, 4)
})

test("auto-4 recommends analytical grid templates first for product strategy prompts", () => {
  const variants = buildPptPreviewVariantDescriptors({
    prompt: "SaaS 产品策略分析，包含市场对比、漏斗指标、路线图和 workflow 设计",
    scenario: "product-launch",
    language: "zh-CN",
    researchBrief: {
      topic: "SaaS 产品策略",
      keyFacts: ["现有产品存在转化漏斗断层", "竞品在中型企业更强"],
      numericEvidence: ["试用转付费率 8.2%", "销售周期 47 天"],
    },
  })

  assert.equal(variants.length, 4)
  assert.equal(variants[0]?.templateId, "swiss-grid")
  assert.equal(variants[0]?.style.key, "ppt169_swiss_grid_systems")
  assert.equal(variants[1]?.style.key, "ppt169_building_effective_agents")
})

test("auto-4 recommends expressive poster-like templates first for manifesto prompts", () => {
  const variants = buildPptPreviewVariantDescriptors({
    prompt: "品牌发布宣言海报，强调 big idea、视觉冲击、口号和 keynote 级别的主张表达",
    scenario: "marketing-campaign",
    language: "en-US",
  })

  assert.equal(variants.length, 4)
  assert.equal(variants[0]?.templateId, "editorial-poster")
  assert.equal(variants[0]?.style.key, "ppt169_pritzker_2026")
})

test("recommended template summaries can surface imported ppt-master templates for matching prompts", () => {
  const templates = buildPptRecommendedTemplateSummaries({
    prompt: "学术答辩汇报，包含研究问题、方法、实验结果与结论证明",
    scenario: "training",
    language: "zh-CN",
  })

  assert.equal(templates.length, 4)
  assert.equal(templates.some((item) => item.templateId === "academic-defense"), true)
  assert.equal(templates.some((item) => item.templateId === "global-ai-capital-2026"), true)
})

test("ppt preview styles cover every local ppt-master upstream example directory", () => {
  const examplesDir = path.join(process.cwd(), ".cache", "ppt-master-upstream", "examples")
  const upstreamStyleKeys = fs
    .readdirSync(examplesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ppt169_"))
    .map((entry) => entry.name)
    .sort()

  const importedStyleKeys = new Set(pptPreviewStyles.map((style) => style.key))
  const missing = upstreamStyleKeys.filter((styleKey) => !importedStyleKeys.has(styleKey as (typeof pptPreviewStyles)[number]["key"]))

  assert.deepEqual(missing, [])
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
