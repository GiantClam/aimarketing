import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWriterSessionContext, isWriterTitleOnlyRevisionRequest, reconcilePendingWriterMessages, reconcileWriterRevisionResult, validateWriterResultInvariants } from "../src";

test("recognizes title-only revisions and preserves the active body", () => {
  assert.equal(isWriterTitleOnlyRevisionRequest("只改标题，正文保持不变"), true);
  const result = reconcileWriterRevisionResult({ query: "只改标题，正文保持不变", activeDraft: { revision: 2, title: "旧标题", content: "# 旧标题\n\n正文" }, result: { outcome: "draft_ready", draft: { title: "新标题", content: "新标题", baseRevision: null } } });
  assert.equal(result.draft?.content, "# 新标题\n\n正文");
  assert.equal(result.draft?.baseRevision, 2);
});

test("rejects incomplete revision output", () => {
  assert.throws(() => reconcileWriterRevisionResult({ query: "重写正文", activeDraft: { revision: 1, title: "标题", content: "正文" }, result: { outcome: "draft_ready", draft: { title: "标题", content: "正文后续保持不变", baseRevision: null } } }), /writer_result_incomplete_revision/);
});

test("normalizes writer result invariants without a host schema dependency", () => {
  const result = validateWriterResultInvariants({
    outcome: "needs_clarification" as const,
    draft: { title: "标题", content: "正文", baseRevision: null },
    research: { requested: true, completed: true },
    assetIntents: [{ id: "cover" }],
  });
  assert.equal(result.outcome, "draft_ready");
  assert.throws(() => validateWriterResultInvariants({ outcome: "draft_ready" as const, draft: null, research: { requested: false, completed: false }, assetIntents: [] }), /writer_result_draft_missing/);
  assert.throws(() => validateWriterResultInvariants({ outcome: "draft_ready" as const, draft: { title: "标题", content: "正文", baseRevision: null }, research: { requested: false, completed: true }, assetIntents: [] }), /writer_result_research_state_invalid/);
  assert.throws(() => validateWriterResultInvariants({ outcome: "draft_ready" as const, draft: { title: "标题", content: "正文", baseRevision: null }, research: { requested: false, completed: false }, assetIntents: [{ id: "cover" }, { id: "cover" }] }), /writer_result_duplicate_asset:cover/);
});

test("builds a bounded immutable writer session context", () => {
  const context = buildWriterSessionContext({ conversationId: "conversation-1", platform: "wechat", currentTurn: "  请写文章  ", activeDraft: { revision: 3, title: "标题", content: "正文", sourceUrls: ["https://example.test"] }, recentTurns: [{ role: "user", content: "一" }, { role: "assistant", content: "二" }, { role: "user", content: "三" }], recentTurnLimit: 2, taskStatus: "running" });
  assert.deepEqual(context, {
    schemaVersion: 1,
    conversationId: "conversation-1",
    platform: "wechat",
    currentTurn: "请写文章",
    activeDraft: { revision: 3, title: "标题", content: "正文", sourceUrls: ["https://example.test"] },
    recentTurns: [{ role: "assistant", content: "二" }, { role: "user", content: "三" }],
    taskStatus: "running",
    recovery: false,
  });
});

test("reconciles an optimistic turn by inferring its preceding user prompt", () => {
  const current = [{ id: "user-1", role: "user" as const, content: "请改写" }, { id: "assistant-1", role: "assistant" as const, content: "正在生成" }];
  const server = [{ id: "user-2", role: "user" as const, content: "请改写" }, { id: "assistant-2", role: "assistant" as const, content: "旧回复" }];
  assert.deepEqual(reconcilePendingWriterMessages(server, current, { prompt: "", generatingContent: "正在生成" }), [server[0], current[1]]);
});
