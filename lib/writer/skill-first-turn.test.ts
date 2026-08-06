import assert from "node:assert/strict"
import test from "node:test"

import { validateWriterSkillFirstTurnResult } from "./skills"
import type { WriterSubmitResult } from "./writer-result"

function draftResult(overrides: Partial<WriterSubmitResult> = {}): WriterSubmitResult {
  return {
    schemaVersion: 1,
    outcome: "draft_ready",
    operation: "create",
    platform: "wechat",
    userMessage: "已完成文章。",
    draft: { title: "原始标题", content: "# 原始标题\n\n正文。", baseRevision: 2 },
    research: { requested: false, completed: false, sourceUrls: [] },
    assetIntents: [{ id: "cover", kind: "cover", prompt: "editorial hero", placement: "after_title", aspectRatio: "16:9" }],
    ...overrides,
  }
}

function validate(result: WriterSubmitResult, overrides: Partial<Parameters<typeof validateWriterSkillFirstTurnResult>[0]> = {}) {
  return validateWriterSkillFirstTurnResult({
    platform: "wechat",
    mode: "article",
    platformLabel: "微信公众号",
    activeRevision: 2,
    activeTitle: "原始标题",
    result,
    activatedSkillIds: ["writer-orchestrator", "social-writing-cn", "khazix-writer"],
    resultToolCallCount: 1,
    ...overrides,
  })
}

test("Skill-first validation accepts a WeChat draft with preserved title and cover intent", () => {
  assert.equal(validate(draftResult()).platformId, "wechat")
})

test("Skill-first validation allows adaptive clarification and rejects incidental or unsupported platform switches", () => {
  const clarification = draftResult({
    outcome: "needs_clarification",
    userMessage: "请补充目标受众。",
    draft: null,
    assetIntents: [],
  })
  assert.equal(validate(clarification).platformId, "wechat")
  assert.throws(() => validate(draftResult({ platform: "reddit" })), /platform_mismatch/)
  assert.throws(() => validate(draftResult({ platform: "not-a-platform" })), /platform_mismatch/)
})

test("Skill-first validation rejects missing result evidence, stale revisions, and changed titles", () => {
  assert.throws(() => validate(draftResult(), { resultToolCallCount: 0 }), /submission_count_invalid/)
  assert.throws(() => validate(draftResult({ draft: { title: "原始标题", content: "# 原始标题\n\n正文。", baseRevision: 1 } })), /stale_revision/)
  assert.throws(() => validate(draftResult({ draft: { title: "新标题", content: "# 新标题\n\n正文。", baseRevision: 2 } })), /title_changed/)
})

test("Skill-first validation rejects multiple primaries and platform-incompatible inline assets", () => {
  assert.throws(() => validate(draftResult(), { activatedSkillIds: ["khazix-writer", "khazix-writer"] }), /activation_invalid/)
  assert.throws(() => validate(draftResult({ platform: "reddit", assetIntents: [{ id: "inline-1", kind: "inline", prompt: "diagram", placement: "body", aspectRatio: "4:3" }] }), {
    platform: "reddit",
    platformLabel: "Reddit",
    activeTitle: "",
    activatedSkillIds: ["writer-orchestrator", "social-writing-global", "writer-reddit"],
  }), /inline_asset_not_supported/)
})
