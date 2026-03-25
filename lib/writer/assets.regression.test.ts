import assert from "node:assert/strict"
import test from "node:test"

import {
  buildWriterAssetBlueprints,
  buildPendingWriterAssets,
  extractWriterAssetsFromMarkdown,
  resolveWriterAssetMarkdown,
  type WriterAsset,
} from "./assets"

const LONG_WECHAT_DRAFT = `
# AI 销售自动化为什么会先改变获客效率

很多团队在讨论 AI 销售自动化时，先想到的是工具堆叠，但真正决定结果的往往是流程设计、线索质量、团队协作和反馈速度。
如果文章只讲概念，读者很快就会失去耐心；如果内容能把趋势、方法和案例都讲清楚，图文阅读体验会明显更强。

## 趋势判断

AI 销售自动化正在从单点功能走向端到端流程。企业更关心从触达到转化的整体效率，而不是某一个孤立模型的能力。
AI 销售自动化正在从单点功能走向端到端流程。企业更关心从触达到转化的整体效率，而不是某一个孤立模型的能力。
AI 销售自动化正在从单点功能走向端到端流程。企业更关心从触达到转化的整体效率，而不是某一个孤立模型的能力。
AI 销售自动化正在从单点功能走向端到端流程。企业更关心从触达到转化的整体效率，而不是某一个孤立模型的能力。

## 落地框架

真正能跑起来的团队，会先定义线索分层、自动化节点、人工接管边界和数据回流方式，再决定模型选型和渠道编排。
真正能跑起来的团队，会先定义线索分层、自动化节点、人工接管边界和数据回流方式，再决定模型选型和渠道编排。
真正能跑起来的团队，会先定义线索分层、自动化节点、人工接管边界和数据回流方式，再决定模型选型和渠道编排。
真正能跑起来的团队，会先定义线索分层、自动化节点、人工接管边界和数据回流方式，再决定模型选型和渠道编排。

## 客户案例

一个制造业团队在引入自动化分发和跟进策略后，把销售前置筛选时间压缩到了原来的三分之一，同时把高意向线索响应速度大幅提升。
一个制造业团队在引入自动化分发和跟进策略后，把销售前置筛选时间压缩到了原来的三分之一，同时把高意向线索响应速度大幅提升。
一个制造业团队在引入自动化分发和跟进策略后，把销售前置筛选时间压缩到了原来的三分之一，同时把高意向线索响应速度大幅提升。
一个制造业团队在引入自动化分发和跟进策略后，把销售前置筛选时间压缩到了原来的三分之一，同时把高意向线索响应速度大幅提升。
`.trim()

test("writer asset blueprints are planned from article structure and stay unique", () => {
  const blueprints = buildWriterAssetBlueprints(LONG_WECHAT_DRAFT, "wechat", "article")

  assert.equal(blueprints[0]?.id, "cover")
  assert.ok(blueprints.length >= 2)
  assert.equal(blueprints[1]?.id, "inline-1")
  assert.match(blueprints[1]?.prompt || "", /Distinctiveness requirement/)
  assert.match(blueprints[1]?.prompt || "", /Section focus:/)
  if (blueprints[2]) {
    assert.notEqual(blueprints[1]?.prompt, blueprints[2]?.prompt)
    assert.match(blueprints[2]?.prompt || "", /Section focus:/)
  }
})

test("resolved markdown stores managed asset blocks and can round-trip assets", () => {
  const blueprints = buildWriterAssetBlueprints(LONG_WECHAT_DRAFT, "wechat", "article")
  const assets: WriterAsset[] = blueprints.map((asset, index) => ({
    ...asset,
    url: `https://cdn.example.com/${asset.id}-${index + 1}.png`,
    status: "ready",
    provider: "gemini",
  }))

  const resolved = resolveWriterAssetMarkdown(LONG_WECHAT_DRAFT, assets, "wechat", "article")
  const extracted = extractWriterAssetsFromMarkdown(resolved, "wechat", "article")

  assert.match(resolved, /writer-asset-slot:start:cover/)
  blueprints.forEach((asset) => {
    assert.match(resolved, new RegExp(`writer-asset-slot:start:${asset.id}`))
  })
  assert.equal((resolved.match(/writer-asset-slot:start:/g) || []).length, blueprints.length)
  assert.deepEqual(
    extracted.map((asset) => ({ id: asset.id, url: asset.url })),
    assets.map((asset) => ({ id: asset.id, url: asset.url })),
  )
})

test("thread mode keeps image planning to a single cover asset", () => {
  const blueprints = buildWriterAssetBlueprints(
    "# X Thread\n\n### Segment 1\nPoint one.\n\n### Segment 2\nPoint two.",
    "x",
    "thread",
  )

  assert.equal(blueprints.length, 1)
  assert.equal(blueprints[0]?.id, "cover")
})

test("short unstructured drafts avoid forcing an early inline image", () => {
  const blueprints = buildWriterAssetBlueprints(
    [
      "# Product launch update",
      "",
      "We shipped the first version and it is now being validated by pilot customers. The opening paragraph should stay clean.",
      "",
      "The second paragraph adds context, but this draft is still short and should not be forced into an extra inline image.",
    ].join("\n"),
    "wechat",
    "article",
  )

  assert.equal(blueprints.length, 1)
  assert.equal(blueprints[0]?.id, "cover")
})

test("long unstructured drafts place inline images after the opening paragraph", () => {
  const opening = "The opening paragraph introduces the central narrative and should stay uninterrupted. ".repeat(120)
  const bodyOne = "Execution details and supporting evidence are discussed in this middle section. ".repeat(120)
  const bodyTwo = "The final section focuses on rollout priorities and measurable outcomes. ".repeat(120)
  const blueprints = buildWriterAssetBlueprints(
    ["# Growth operating model", "", opening, "", bodyOne, "", bodyTwo].join("\n"),
    "wechat",
    "article",
  )

  assert.ok(blueprints.length >= 2)
  assert.equal(blueprints[1]?.id, "inline-1")
  assert.ok((blueprints[1]?.insertionLine || 0) > 2)
})

test("empty managed slot comments are normalized back into renderable pending asset blocks", () => {
  const markdownWithEmptySlots = [
    "# Title",
    "",
    "Intro paragraph.",
    "",
    "<!-- writer-asset-slot:start:cover -->",
    "<!-- writer-asset-slot:end:cover -->",
    "",
    "## Section",
    "",
    "Body paragraph.",
    "",
    "<!-- writer-asset-slot:start:inline-1 -->",
    "<!-- writer-asset-slot:end:inline-1 -->",
  ].join("\n")

  const pendingAssets = buildPendingWriterAssets(markdownWithEmptySlots, "wechat", "article")
  const resolved = resolveWriterAssetMarkdown(markdownWithEmptySlots, pendingAssets, "wechat", "article")
  const extracted = extractWriterAssetsFromMarkdown(resolved, "wechat", "article")

  assert.match(resolved, /!\[Cover\]\(writer-asset:\/\/cover\)/)
  assert.match(resolved, /!\[Inline Image 1\]\(writer-asset:\/\/inline-1\)/)
  assert.deepEqual(
    extracted.map((asset) => ({ id: asset.id, status: asset.status, url: asset.url })),
    pendingAssets.map((asset) => ({ id: asset.id, status: "loading", url: "" })),
  )
})

test("raw writer asset tokens are normalized to managed placeholder blocks without leaking token-only lines", () => {
  const markdownWithRawTokens = [
    "# 标题",
    "",
    "writer-asset://cover",
    "",
    "这里是正文段落。",
    "",
    "- writer-asset://inline-1",
    "",
    "收尾段落。",
  ].join("\n")

  const pendingAssets = buildPendingWriterAssets(markdownWithRawTokens, "wechat", "article")
  const resolved = resolveWriterAssetMarkdown(markdownWithRawTokens, pendingAssets, "wechat", "article")
  const extracted = extractWriterAssetsFromMarkdown(resolved, "wechat", "article")

  assert.doesNotMatch(resolved, /^\s*(?:[-*+]\s+)?writer-asset:\/\/[a-z0-9-]+\s*$/gim)
  assert.match(resolved, /!\[Cover\]\(writer-asset:\/\/cover\)/)
  assert.match(resolved, /!\[Inline Image 1\]\(writer-asset:\/\/inline-1\)/)
  assert.deepEqual(
    extracted.map((asset) => ({ id: asset.id, status: asset.status, url: asset.url })),
    pendingAssets.map((asset) => ({ id: asset.id, status: "loading", url: "" })),
  )
})

test("managed slot-only markdown still resolves into placeholder image lines", () => {
  const managedOnlyMarkdown = ["<!-- writer-asset-slot:start:cover -->", "<!-- writer-asset-slot:end:cover -->"].join("\n")

  const resolved = resolveWriterAssetMarkdown(managedOnlyMarkdown, [], "wechat", "article")
  const extracted = extractWriterAssetsFromMarkdown(resolved, "wechat", "article")

  assert.match(resolved, /!\[Cover\]\(writer-asset:\/\/cover\)/)
  assert.equal(extracted[0]?.id, "cover")
  assert.equal(extracted[0]?.status, "loading")
})

test("managed blocks with existing image URLs are replaced by placeholders during pending regeneration", () => {
  const markdownWithExistingImages = [
    "<!-- writer-asset-slot:start:cover -->",
    "![Cover](https://cdn.example.com/cover-old.png)",
    "<!-- writer-asset-slot:end:cover -->",
    "",
    "## Section",
    "",
    "Body paragraph.",
    "",
    "<!-- writer-asset-slot:start:inline-1 -->",
    "![Inline Image 1](https://cdn.example.com/inline-1-old.png)",
    "<!-- writer-asset-slot:end:inline-1 -->",
  ].join("\n")

  const pendingAssets: WriterAsset[] = [
    {
      id: "cover",
      label: "Cover",
      title: "Cover image",
      prompt: "cover prompt",
      url: "",
      status: "loading",
      provider: "loading",
    },
    {
      id: "inline-1",
      label: "Inline Image 1",
      title: "Inline image 1",
      prompt: "inline prompt",
      url: "",
      status: "loading",
      provider: "loading",
    },
  ]

  const resolved = resolveWriterAssetMarkdown(markdownWithExistingImages, pendingAssets, "wechat", "article")
  const extracted = extractWriterAssetsFromMarkdown(resolved, "wechat", "article")

  assert.match(resolved, /!\[Cover\]\(writer-asset:\/\/cover\)/)
  assert.match(resolved, /!\[Inline Image 1\]\(writer-asset:\/\/inline-1\)/)
  assert.doesNotMatch(resolved, /https:\/\/cdn\.example\.com\/cover-old\.png/)
  assert.doesNotMatch(resolved, /https:\/\/cdn\.example\.com\/inline-1-old\.png/)
  assert.deepEqual(
    extracted.map((asset) => ({ id: asset.id, status: asset.status, url: asset.url })),
    pendingAssets.map((asset) => ({ id: asset.id, status: "loading", url: "" })),
  )
})

test("extra generated assets are not appended to article tail when no slot exists", () => {
  const markdown = [
    "# Growth memo",
    "",
    "Short introduction paragraph for a concise draft.",
    "",
    "Another short paragraph.",
  ].join("\n")
  const assets: WriterAsset[] = [
    {
      id: "cover",
      label: "Cover",
      title: "Cover image",
      prompt: "cover prompt",
      url: "https://cdn.example.com/cover.png",
      status: "ready",
      provider: "gemini",
    },
    {
      id: "inline-1",
      label: "Inline Image 1",
      title: "Inline image 1",
      prompt: "inline prompt",
      url: "https://cdn.example.com/inline-1.png",
      status: "ready",
      provider: "gemini",
    },
  ]

  const resolved = resolveWriterAssetMarkdown(markdown, assets, "wechat", "article")
  assert.match(resolved, /writer-asset-slot:start:cover/)
  assert.match(resolved, /https:\/\/cdn\.example\.com\/cover\.png/)
  assert.doesNotMatch(resolved, /writer-asset-slot:start:inline-1/)
  assert.doesNotMatch(resolved, /https:\/\/cdn\.example\.com\/inline-1\.png/)
})
