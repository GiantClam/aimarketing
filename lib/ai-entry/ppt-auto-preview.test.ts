import assert from "node:assert/strict"
import test from "node:test"

import { extractPptBriefState } from "@/lib/ai-entry/ppt-brief"

import { maybeAutoRunPptPreview, shouldAutoRunPptPreview } from "./ppt-auto-preview"

test("shouldAutoRunPptPreview requires a selected recommended template for editable PPT chat", () => {
  const readyState = extractPptBriefState({
    userMessages: ["请生成一份给客户提案会使用的产品发布 PPT，目标是客户提案与说服，10 页。"],
  })

  assert.equal(
    shouldAutoRunPptPreview({
      agentId: "executive-ppt",
      executionContext: "chat",
      latestUserPrompt: "继续，直接生成 PPT 预览。",
      briefState: readyState,
      previewAlreadyExecuted: false,
      messageContents: [],
    }),
    false,
  )

  assert.equal(
    shouldAutoRunPptPreview({
      agentId: "executive-presentation-ppt",
      executionContext: "workflow",
      latestUserPrompt: "继续，直接生成 PPT 预览。",
      briefState: readyState,
      previewAlreadyExecuted: false,
      messageContents: [],
    }),
    false,
  )
})

test("maybeAutoRunPptPreview does not choose a template before the user selects one", async () => {
  const readyState = extractPptBriefState({
    userMessages: ["请生成一份给客户提案会使用的产品发布 PPT，目标是客户提案与说服，10 页。"],
  })

  const result = await maybeAutoRunPptPreview({
    agentId: "executive-ppt",
    executionContext: "chat",
    latestUserPrompt: "继续，直接生成 PPT 预览。",
    assistantMessage: "下面是建议的页结构。",
    briefState: readyState,
    previewAlreadyExecuted: false,
    messageContents: [],
    previewTool: { execute: async () => assert.fail("preview must not run before template selection") },
    origin: "https://example.com",
    isZh: true,
  })

  assert.equal(result.autoPreviewExecuted, false)
  assert.equal(result.assistantMessage, "下面是建议的页结构。")
})

test("maybeAutoRunPptPreview removes stale template recommendation blocks when generating preview", async () => {
  const readyState = extractPptBriefState({
    userMessages: ["请生成一份给客户提案会使用的产品发布 PPT，目标是客户提案与说服，10 页。"],
  })

  const result = await maybeAutoRunPptPreview({
    agentId: "executive-ppt",
    executionContext: "chat",
    latestUserPrompt: "使用 ppt169_sugar_rush_memphis 模板，继续生成 PPT 预览。",
    assistantMessage: [
      "下面是建议的页结构。",
      "",
      "已为这次需求推荐 4 个模板：",
      "- 1. Long Table (long-table)",
      "- 2. Playful (playful)",
      "- 3. Broadside (broadside)",
      "- 4. Neo Grid Bold (neo-grid-bold)",
      "<!-- ai-entry-ppt-template-recommendations:{\"defaultTemplateId\":\"long-table\",\"templateIds\":[\"long-table\",\"playful\",\"broadside\",\"neo-grid-bold\"]} -->",
    ].join("\n"),
    briefState: readyState,
    previewAlreadyExecuted: false,
    messageContents: [
      "<!-- ai-entry-ppt-template-recommendations:{\"defaultTemplateId\":\"ppt169_global_ai_capital_2026\",\"templateIds\":[\"ppt169_global_ai_capital_2026\",\"ppt169_sugar_rush_memphis\"]} -->",
    ],
    previewTool: {
      execute: async () => ({
        ok: true,
        previewSessionId: "preview-session-2",
        title: "AI Marketing Workbench",
        variants: [{ key: "variant-a", name: "Long Table" }],
        recommendedVariantKey: "variant-a",
        recommendedVariantName: "Long Table",
      }),
    },
    origin: "https://example.com",
    isZh: true,
  })

  assert.equal(result.autoPreviewExecuted, true)
  assert.equal((result.assistantMessage.match(/已为这次需求推荐 4 个模板：/g) || []).length, 0)
  assert.equal((result.assistantMessage.match(/ai-entry-ppt-template-recommendations:/g) || []).length, 0)
})

test("maybeAutoRunPptPreview auto-generates editable ppt after the user selects a recommended template", async () => {
  const readyState = extractPptBriefState({
    userMessages: ["请生成一份给客户提案会使用的产品发布 PPT，目标是客户提案与说服，10 页。"],
  })

  const result = await maybeAutoRunPptPreview({
    agentId: "executive-ppt",
    executionContext: "chat",
    latestUserPrompt: "用 ppt169_sugar_rush_memphis 模板，继续生成可编辑 PPT 预览。",
    assistantMessage: "好的，我按你选的模板继续。",
    briefState: readyState,
    previewAlreadyExecuted: false,
    messageContents: [
      [
        "已为这次需求推荐 4 个模板：",
        "- 1. Global AI Capital (ppt169_global_ai_capital_2026)",
        "- 2. Sugar Rush Memphis (ppt169_sugar_rush_memphis)",
        "- 3. Building Effective Agents (ppt169_building_effective_agents)",
        "- 4. Academic Defense (academic_defense)",
        "<!-- ai-entry-ppt-template-recommendations:{\"defaultTemplateId\":\"ppt169_global_ai_capital_2026\",\"templateIds\":[\"ppt169_global_ai_capital_2026\",\"ppt169_sugar_rush_memphis\",\"ppt169_building_effective_agents\",\"academic_defense\"]} -->",
      ].join("\n"),
    ],
    previewTool: {
      execute: async (input: unknown) => {
        const record = input as Record<string, unknown>
        assert.equal(record.templateMode, "single-template")
        assert.equal(record.templateId, "ppt169_sugar_rush_memphis")
        return {
          ok: true,
          previewSessionId: "preview-session-1",
          title: "AI Marketing Workbench",
          variants: [{ key: "variant-a", name: "Playful" }],
          recommendedVariantKey: "variant-a",
          recommendedVariantName: "Playful",
        }
      },
    },
    origin: "https://example.com",
    isZh: true,
  })

  assert.equal(result.autoPreviewExecuted, true)
  assert.match(result.assistantMessage, /已生成 PPT 预览/)
  assert.match(result.assistantMessage, /preview-session-1/)
})

test("maybeAutoRunPptPreview does not accept a template that was not offered", async () => {
  const readyState = extractPptBriefState({
    userMessages: ["请生成一份给客户提案会使用的产品发布 PPT，目标是客户提案与说服，10 页。"],
  })

  const result = await maybeAutoRunPptPreview({
    agentId: "executive-ppt",
    executionContext: "chat",
    latestUserPrompt: "确认，使用 academic-defense，直接生成 PPT 预览。",
    assistantMessage: "好的。",
    briefState: readyState,
    previewAlreadyExecuted: false,
    messageContents: [],
    previewTool: { execute: async () => assert.fail("preview must not run for an unoffered template") },
    isZh: true,
  })

  assert.equal(result.autoPreviewExecuted, false)
  assert.equal(result.assistantMessage, "好的。")
})
