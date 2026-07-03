import assert from "node:assert/strict"
import test from "node:test"

import { extractPptBriefState, type PptBriefState } from "@/lib/ai-entry/ppt-brief"

import { maybeAutoRunPptPreview, shouldAutoRunPptPreview } from "./ppt-auto-preview"

test("shouldAutoRunPptPreview does not auto-generate editable ppt before template selection", () => {
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

test("maybeAutoRunPptPreview appends template recommendations instead of auto-generating editable ppt", async () => {
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
    previewTool: {
      execute: async () => ({
        ok: true,
        previewSessionId: "preview-session-1",
        title: "AI Marketing Workbench",
        variants: [{ key: "variant-a", name: "Long Table" }],
        recommendedVariantKey: "variant-a",
        recommendedVariantName: "Long Table",
      }),
    },
    origin: "https://example.com",
    isZh: true,
  })

  assert.equal(result.autoPreviewExecuted, false)
  assert.match(result.assistantMessage, /已为这次需求推荐 4 个模板/)
  assert.match(result.assistantMessage, /下一步: 直接回复模板编号或模板名称/)
})

test("maybeAutoRunPptPreview auto-generates editable ppt after the user selects a recommended template", async () => {
  const readyState = extractPptBriefState({
    userMessages: ["请生成一份给客户提案会使用的产品发布 PPT，目标是客户提案与说服，10 页。"],
  })

  const result = await maybeAutoRunPptPreview({
    agentId: "executive-ppt",
    executionContext: "chat",
    latestUserPrompt: "用第2个模板，继续生成可编辑 PPT 预览。",
    assistantMessage: "好的，我按你选的模板继续。",
    briefState: readyState,
    previewAlreadyExecuted: false,
    messageContents: [
      [
        "已为这次需求推荐 4 个模板：",
        "- 1. Long Table (long-table)",
        "- 2. Playful (playful)",
        "- 3. Broadside (broadside)",
        "- 4. Neo Grid Bold (neo-grid-bold)",
        "<!-- ai-entry-ppt-template-recommendations:{\"defaultTemplateId\":\"long-table\",\"templateIds\":[\"long-table\",\"playful\",\"broadside\",\"neo-grid-bold\"]} -->",
      ].join("\n"),
    ],
    previewTool: {
      execute: async (input: unknown) => {
        const record = input as Record<string, unknown>
        assert.equal(record.templateMode, "single-template")
        assert.equal(record.templateId, "playful")
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

test("template recommendations stay dynamic even when the latest user prompt is only a generic continue message", async () => {
  const readyState: PptBriefState = {
    topic: "董事会经营复盘",
    audience: "管理层汇报",
    goal: "经营汇报与决策同步",
    scenario: "sales-deck",
    language: "zh-CN",
    pageCount: 10,
    tone: "简洁、专业、决策导向",
    mustInclude: ["预算", "风险", "关键决策"],
    missingFields: [],
    readyForPreview: true,
    suggestedValues: {
      audience: "管理层汇报",
      goal: "经营汇报与决策同步",
      scenario: "sales-deck",
      language: "zh-CN",
      pageCount: 10,
      tone: "简洁、专业、决策导向",
    },
  }

  const result = await maybeAutoRunPptPreview({
    agentId: "executive-ppt",
    executionContext: "chat",
    latestUserPrompt: "继续，生成可编辑 PPT 预览。",
    assistantMessage: "我已经整理好 brief。",
    briefState: readyState,
    previewAlreadyExecuted: false,
    messageContents: [],
    previewTool: null,
    origin: "https://example.com",
    isZh: true,
  })

  assert.equal(result.autoPreviewExecuted, false)
  assert.match(result.assistantMessage, /新野蛮主义 \(neo-brutalism\)/)
  assert.match(result.assistantMessage, /瑞士网格 \(swiss-grid\)/)
})
