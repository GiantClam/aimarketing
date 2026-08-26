import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConversationTitleFromPrompt,
  defaultConversationTitle,
  resolveConversationTitleUpdate,
} from "../src/conversation-title";

test("conversation titles normalize the first user message and cap it at 60 characters", () => {
  assert.equal(
    buildConversationTitleFromPrompt("  帮我\n\n制定   一份新品上市计划  ", "zh"),
    "帮我 制定 一份新品上市计划",
  );
  assert.equal(buildConversationTitleFromPrompt("a".repeat(80), "en"), "a".repeat(60));
});

test("conversation titles fall back to the localized new-chat label", () => {
  assert.equal(buildConversationTitleFromPrompt(" \n\t ", "zh"), "新对话");
  assert.equal(buildConversationTitleFromPrompt("", "en"), "New chat");
  assert.equal(defaultConversationTitle("zh"), "新对话");
});

test("only the first message or a generic placeholder can rename a conversation", () => {
  assert.equal(resolveConversationTitleUpdate({
    currentTitle: "新对话",
    userPrompt: "分析本季度营销数据",
    existingMessageCount: 0,
    locale: "zh",
  }), "分析本季度营销数据");
  assert.equal(resolveConversationTitleUpdate({
    currentTitle: "New chat",
    userPrompt: "Summarize campaign performance",
    existingMessageCount: 2,
    locale: "en",
  }), "Summarize campaign performance");
  assert.equal(resolveConversationTitleUpdate({
    currentTitle: "分析本季度营销数据",
    userPrompt: "把结果整理成表格",
    existingMessageCount: 2,
    locale: "zh",
  }), null);
});
