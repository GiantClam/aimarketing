import assert from "node:assert/strict"
import test from "node:test"

import {
  buildWorkflowImagePromptReferenceEntries,
  buildWorkflowImagePromptReferenceSection,
  buildWorkflowImagePromptReferenceTokens,
  collectWorkflowImagePromptAliasReplacements,
  findDuplicateWorkflowImagePromptAliases,
  isEmbeddableWorkflowImagePromptUrl,
  reconcileWorkflowImagePromptReferences,
  replaceWorkflowImagePromptAliasTokens,
  replaceWorkflowImagePromptAliasTokensBatch,
  resolveWorkflowImagePromptRuntimeReferences,
} from "@/lib/workflows/image-prompt-references"

test("reconcileWorkflowImagePromptReferences preserves aliases for known sources and assigns defaults for new ones", () => {
  const reconciled = reconcileWorkflowImagePromptReferences({
    current: [{ sourceNodeKey: "image-2", alias: "背景图" }],
    sources: [
      { sourceNodeKey: "image-1", sourceTitle: "人物图" },
      { sourceNodeKey: "image-2", sourceTitle: "背景图源" },
    ],
    locale: "zh",
  })

  assert.deepEqual(reconciled, [
    { sourceNodeKey: "image-1", alias: "图1" },
    { sourceNodeKey: "image-2", alias: "背景图" },
  ])
})

test("reconcileWorkflowImagePromptReferences maps generated aliases to source node numbers", () => {
  const reconciled = reconcileWorkflowImagePromptReferences({
    current: [
      { sourceNodeKey: "image-1", alias: "图1" },
      { sourceNodeKey: "image-2", alias: "图2" },
      { sourceNodeKey: "image-3", alias: "图3" },
    ],
    sources: [
      { sourceNodeKey: "image-1", sourceTitle: "人物图" },
      { sourceNodeKey: "image-3", sourceTitle: "背景图" },
    ],
    locale: "zh",
  })

  assert.deepEqual(reconciled, [
    { sourceNodeKey: "image-1", alias: "图1" },
    { sourceNodeKey: "image-3", alias: "图3" },
  ])
})

test("reconcileWorkflowImagePromptReferences keeps customized aliases while generated ones still follow node numbers", () => {
  const reconciled = reconcileWorkflowImagePromptReferences({
    current: [
      { sourceNodeKey: "image-1", alias: "主视觉" },
      { sourceNodeKey: "image-2", alias: "图2" },
      { sourceNodeKey: "image-3", alias: "图3" },
    ],
    sources: [
      { sourceNodeKey: "image-1", sourceTitle: "人物图" },
      { sourceNodeKey: "image-3", sourceTitle: "背景图" },
    ],
    locale: "zh",
  })

  assert.deepEqual(reconciled, [
    { sourceNodeKey: "image-1", alias: "主视觉" },
    { sourceNodeKey: "image-3", alias: "图3" },
  ])
})

test("buildWorkflowImagePromptReferenceEntries includes default aliases and source titles", () => {
  const entries = buildWorkflowImagePromptReferenceEntries({
    current: [],
    sources: [{ sourceNodeKey: "image-3", sourceTitle: "人物图" }],
    locale: "zh",
  })

  assert.deepEqual(entries, [
    {
      sourceNodeKey: "image-3",
      sourceTitle: "人物图",
      defaultAlias: "图3",
      alias: "图3",
    },
  ])
})

test("buildWorkflowImagePromptReferenceTokens supports alias and source node key", () => {
  const tokens = buildWorkflowImagePromptReferenceTokens({
    sourceNodeKey: "image-2",
    alias: "图2",
  })

  assert.deepEqual(tokens, ["{{图2}}", "{{image-2}}"])
})

test("findDuplicateWorkflowImagePromptAliases detects repeated aliases case-insensitively", () => {
  const duplicates = findDuplicateWorkflowImagePromptAliases([
    { sourceNodeKey: "image-1", alias: "Hero" },
    { sourceNodeKey: "image-2", alias: "hero" },
    { sourceNodeKey: "image-3", alias: "Background" },
  ])

  assert.deepEqual([...duplicates], ["Hero", "hero"])
})

test("collectWorkflowImagePromptAliasReplacements only returns aliases that actually changed", () => {
  const replacements = collectWorkflowImagePromptAliasReplacements({
    previous: [
      { sourceNodeKey: "image-1", alias: "图1" },
      { sourceNodeKey: "image-2", alias: "图2" },
    ],
    next: [
      { sourceNodeKey: "image-1", alias: "主视觉" },
      { sourceNodeKey: "image-2", alias: "图2" },
    ],
  })

  assert.deepEqual(replacements, [{ previousAlias: "图1", nextAlias: "主视觉" }])
})

test("replaceWorkflowImagePromptAliasTokens keeps prompt references in sync after rename", () => {
  const nextPrompt = replaceWorkflowImagePromptAliasTokens({
    prompt: "请参考 {{图1}} 与 {{ 图1 }}，不要改动 {{图2}}。",
    previousAlias: "图1",
    nextAlias: "人物参考",
  })

  assert.equal(nextPrompt, "请参考 {{人物参考}} 与 {{人物参考}}，不要改动 {{图2}}。")
})

test("replaceWorkflowImagePromptAliasTokensBatch applies multiple alias renames to one prompt", () => {
  const nextPrompt = replaceWorkflowImagePromptAliasTokensBatch({
    prompt: "请融合 {{图1}} 和 {{图2}} 的结构。",
    replacements: [
      { previousAlias: "图1", nextAlias: "主视觉" },
      { previousAlias: "图2", nextAlias: "背景参考" },
    ],
  })

  assert.equal(nextPrompt, "请融合 {{主视觉}} 和 {{背景参考}} 的结构。")
})

test("buildWorkflowImagePromptReferenceSection maps aliases to input image urls", () => {
  const section = buildWorkflowImagePromptReferenceSection({
    references: [
      { sourceNodeKey: "image-2", alias: "图2" },
      { sourceNodeKey: "image-3", alias: "图3" },
    ],
    inputImages: [{ url: "https://example.com/1.png" }, { url: "https://example.com/2.png" }],
    locale: "zh",
  })

  assert.equal(
    section,
    "图片引用:\n当提示词里出现以下 token 时，请将其视为对应的输入图片。\n- {{图2}}: https://example.com/1.png\n- {{image-2}}: https://example.com/1.png\n- {{图3}}: https://example.com/2.png\n- {{image-3}}: https://example.com/2.png",
  )
})

test("buildWorkflowImagePromptReferenceSection avoids embedding data urls", () => {
  const section = buildWorkflowImagePromptReferenceSection({
    references: [{ sourceNodeKey: "image-3", alias: "图3" }],
    inputImages: [{ url: "data:image/png;base64,abc123" }],
    locale: "zh",
  })

  assert.equal(
    section,
    "图片引用:\n当提示词里出现以下 token 时，请将其视为对应的输入图片。\n- {{图3}}: 对应输入参考图\n- {{image-3}}: 对应输入参考图",
  )
})

test("resolveWorkflowImagePromptRuntimeReferences keeps data url tokens untouched", () => {
  const resolved = resolveWorkflowImagePromptRuntimeReferences({
    prompt: "将{{图2}}中的人物替换为{{图3}}",
    references: [
      { sourceNodeKey: "image-2", alias: "图2" },
      { sourceNodeKey: "image-3", alias: "图3" },
    ],
    inputImages: [
      { url: "https://example.com/1.png" },
      { url: "data:image/png;base64,abc123" },
    ],
  })

  assert.equal(resolved.prompt, "将图2中的人物替换为{{图3}}")
  assert.deepEqual(resolved.referenceUrls, ["https://example.com/1.png"])
})

test("isEmbeddableWorkflowImagePromptUrl rejects data urls", () => {
  assert.equal(isEmbeddableWorkflowImagePromptUrl("https://example.com/1.png"), true)
  assert.equal(isEmbeddableWorkflowImagePromptUrl("data:image/png;base64,abc123"), false)
})
