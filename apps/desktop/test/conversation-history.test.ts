import assert from "node:assert/strict";
import test from "node:test";
import type { WorkbenchMessage } from "@aimarketing/workbench-client";
import { mergeConversationMessages } from "../src/conversation-history";

test("conversation history keeps an optimistic user message when the first load races persistence", () => {
  const userMessage: WorkbenchMessage = {
    id: "message-run-1",
    conversationId: "conversation-1",
    role: "user" as const,
    content: "用户输入的 Agent 任务",
    createdAt: "2026-08-21T15:00:00.000Z",
  };
  const assistantMessage: WorkbenchMessage = {
    id: "assistant-run-1",
    conversationId: "conversation-1",
    role: "assistant" as const,
    content: "Agent 返回结果",
    createdAt: "2026-08-21T15:00:01.000Z",
  };

  const merged = mergeConversationMessages([userMessage], [assistantMessage], "conversation-1");

  assert.deepEqual(merged.map((message) => [message.role, message.content]), [
    ["user", "用户输入的 Agent 任务"],
    ["assistant", "Agent 返回结果"],
  ]);
});

test("conversation history does not leak messages from another conversation", () => {
  const current: WorkbenchMessage[] = [{
    id: "other-message",
    conversationId: "conversation-2",
    role: "user" as const,
    content: "另一个会话",
    createdAt: "2026-08-21T15:00:00.000Z",
  }];

  assert.deepEqual(mergeConversationMessages(current, [], "conversation-1"), []);
});
