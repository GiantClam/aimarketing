import assert from "node:assert/strict"
import test from "node:test"

import {
  isIncompleteWriterRevisionContent,
  isWriterTitleOnlyRevisionRequest,
  reconcileWriterRevisionResult,
} from "./revision-guard"
import type { WriterSubmitResult } from "./writer-result"

const activeDraft = {
  revision: 7,
  title: "原始标题",
  content: "# 原始标题\n\n第一段正文。\n\n![配图](asset://inline-1)\n\n第二段正文。",
  sourceUrls: [],
}

const result: WriterSubmitResult = {
  schemaVersion: 1,
  outcome: "draft_ready",
  operation: "revise",
  platform: "WeChat Official Account",
  userMessage: "标题已翻译。",
  draft: {
    title: "The Original Title",
    content: "# The Original Title\n\n正文被模型错误地省略了。",
    baseRevision: 0,
  },
  research: { requested: false, completed: false, sourceUrls: [] },
  assetIntents: [],
}

test("title-only revision preserves the authoritative active body and revision", () => {
  assert.equal(isWriterTitleOnlyRevisionRequest("将上文文章标题改为英文，正文和图片完全保持不变"), true)
  const reconciled = reconcileWriterRevisionResult({ query: "将上文文章标题改为英文，正文和图片完全保持不变", result, activeDraft })
  assert.equal(reconciled.draft?.title, "The Original Title")
  assert.equal(reconciled.draft?.content, "# The Original Title\n\n第一段正文。\n\n![配图](asset://inline-1)\n\n第二段正文。")
  assert.equal(reconciled.draft?.baseRevision, 7)
})

test("non-title revisions reject application-side placeholder content", () => {
  assert.equal(isIncompleteWriterRevisionContent("# 标题\n\n正文后续保持不变，由应用端保留完整内容"), true)
  assert.throws(
    () => reconcileWriterRevisionResult({
      query: "把这篇文章改得更简洁",
      result: {
        ...result,
        draft: { ...result.draft!, content: "# 标题\n\n正文后续保持不变，由应用端保留完整内容" },
      },
      activeDraft,
    }),
    /writer_result_incomplete_revision/u,
  )
})

test("revisions align a provider's stale base revision to the active draft", () => {
  const reconciled = reconcileWriterRevisionResult({
    query: "请重新写一篇 AI 营销简介",
    result: {
      ...result,
      draft: { ...result.draft!, content: "# 新标题\n\n完整的新正文。", baseRevision: 0 },
    },
    activeDraft,
  })
  assert.equal(reconciled.draft?.baseRevision, activeDraft.revision)
})

test("title-only revision does not silently accept an unchanged title", () => {
  assert.throws(
    () => reconcileWriterRevisionResult({
      query: "将上文文章标题改为英文，正文和图片完全保持不变",
      result: { ...result, draft: { ...result.draft!, title: activeDraft.title } },
      activeDraft,
    }),
    /writer_result_title_change_missing/u,
  )
})
