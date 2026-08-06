import assert from "node:assert/strict"
import test from "node:test"

import { validateWriterSubmitResult } from "./writer-result"

const draft = {
  schemaVersion: 1 as const,
  outcome: "draft_ready" as const,
  operation: "create" as const,
  platform: "WeChat Official Account",
  userMessage: "文章已完成。",
  draft: { title: "用户标题", content: "# 用户标题\n正文", baseRevision: 4 },
  research: { requested: false, completed: false, sourceUrls: [] },
  assetIntents: [{ id: "cover", kind: "cover" as const, prompt: "编辑化封面", placement: "开头", aspectRatio: "16:9" }],
}

test("structured Writer result accepts a complete draft and asset intent", () => {
  assert.equal(validateWriterSubmitResult(draft).draft?.baseRevision, 4)
})

test("structured Writer result rejects prose fallback, malformed outcome, and duplicate assets", () => {
  assert.throws(() => validateWriterSubmitResult({ ...draft, outcome: "draft_ready", draft: null }), /draft_missing/u)
  assert.throws(() => validateWriterSubmitResult({ ...draft, assetIntents: [draft.assetIntents[0], draft.assetIntents[0]] }), /duplicate_asset/u)
  assert.throws(() => validateWriterSubmitResult({ ...draft, research: { requested: false, completed: true, sourceUrls: [] } }), /research_state_invalid/u)
})
