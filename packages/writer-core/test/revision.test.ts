import { test } from "node:test";
import assert from "node:assert/strict";
import { isWriterTitleOnlyRevisionRequest, reconcileWriterRevisionResult } from "../src";

test("recognizes title-only revisions and preserves the active body", () => {
  assert.equal(isWriterTitleOnlyRevisionRequest("只改标题，正文保持不变"), true);
  const result = reconcileWriterRevisionResult({ query: "只改标题，正文保持不变", activeDraft: { revision: 2, title: "旧标题", content: "# 旧标题\n\n正文" }, result: { outcome: "draft_ready", draft: { title: "新标题", content: "新标题", baseRevision: null } } });
  assert.equal(result.draft?.content, "# 新标题\n\n正文");
  assert.equal(result.draft?.baseRevision, 2);
});

test("rejects incomplete revision output", () => {
  assert.throws(() => reconcileWriterRevisionResult({ query: "重写正文", activeDraft: { revision: 1, title: "标题", content: "正文" }, result: { outcome: "draft_ready", draft: { title: "标题", content: "正文后续保持不变", baseRevision: null } } }), /writer_result_incomplete_revision/);
});
