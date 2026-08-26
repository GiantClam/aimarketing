import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchMessage } from "@aimarketing/workbench-client";
import { WorkbenchMessageTimeline } from "../src/index";
import { ConversationScrollButton } from "../src/ai-elements/index";

test("conversation scroll button exposes the themed latest-message action", () => {
  const markup = renderToStaticMarkup(<ConversationScrollButton aria-label="滚动到最新消息" title="滚动到最新消息" />);
  assert.match(markup, /data-slot="conversation-scroll-button"/);
  assert.match(markup, /aria-label="滚动到最新消息"/);
  assert.match(markup, /aria-hidden="true"/);
});

test("shared message timeline renders stable ordered timestamps and accessible actions", () => {
  const messages: WorkbenchMessage[] = [{
    id: "message-1",
    conversationId: "conversation-1",
    role: "assistant",
    content: "分析完成",
    createdAt: "2026-08-12T00:00:00Z",
    status: "succeeded",
    parts: [
      { id: "text-1", type: "text", text: "分析完成" },
      { id: "tool-1", type: "tool", tool: "writer", status: "completed", message: "写作完成", sequence: 2, createdAt: "2026-08-12T00:00:02Z" },
      { id: "artifact-1", type: "artifact", artifact: { id: "a1", relativePath: "artifacts/report.md", title: "分析报告", mimeType: "text/markdown", byteLength: 16, sha256: "hash-a" }, sequence: 3, createdAt: "2026-08-12T00:00:03Z" },
    ],
  }];

  const markup = renderToStaticMarkup(<WorkbenchMessageTimeline messages={messages} locale="en" onArtifactOpen={() => undefined} />);
  assert.match(markup, /<time dateTime="2026-08-12T00:00:00Z"/);
  assert.match(markup, /<time dateTime="2026-08-12T00:00:02Z"/);
  assert.match(markup, /data-sequence="2"/);
  assert.match(markup, /data-sequence="3"/);
  assert.ok(markup.indexOf('data-sequence="2"') < markup.indexOf('data-sequence="3"'));
  assert.match(markup, /aria-label="Copy reply"/);
  assert.match(markup, /class="[^"]*ai-elements-message ai-elements-message-assistant wb-ai-message wb-ai-message-assistant/);
  assert.match(markup, /class="ai-elements-message-content wb-ai-message-content[^"]*"/);
  assert.match(markup, /data-slot="message-actions"/);
  assert.match(markup, /aria-label="Open artifact: 分析报告"/);
  assert.match(markup, /data-status="completed"/);
});

test("user timeline messages keep their high-contrast body class", () => {
  const markup = renderToStaticMarkup(<WorkbenchMessageTimeline messages={[{
    id: "user-message-1",
    conversationId: "conversation-1",
    role: "user",
    content: "请生成一份营销方案\n\n- 包含 `关键词`",
    createdAt: "2026-08-12T00:00:00Z",
  }]} locale="zh" />);

  assert.match(markup, /wb-chat-user-body/);
  assert.match(markup, /class="[^"]*ai-elements-message ai-elements-message-user wb-ai-message wb-ai-message-user/);
  assert.doesNotMatch(markup, /assistant-body/);
  assert.match(markup, /wb-chat-user-header/);
});

test("assistant timelines separate streaming process evidence from rich results", () => {
  const markup = renderToStaticMarkup(<WorkbenchMessageTimeline messages={[{
    id: "rich-message-1",
    conversationId: "conversation-1",
    role: "assistant",
    content: "已完成研究并生成报告。",
    createdAt: "2026-08-12T00:00:00Z",
    status: "succeeded",
    parts: [
      { id: "tool-1", type: "tool", tool: "web_search", status: "completed", message: "找到 3 个来源", sequence: 1 },
      { id: "usage-1", type: "usage", usage: { runId: "run-1", model: "deepseek-v4", inputTokens: 120, outputTokens: 80 }, sequence: 2 },
      { id: "text-1", type: "text", text: "已完成研究并生成报告。", sequence: 3 },
      { id: "source-1", type: "source", title: "市场研究", href: "https://example.com/research", excerpt: "关键洞察" , sequence: 4 },
      { id: "report-1", type: "report", title: "执行摘要", body: "**可执行结论**", sequence: 5 },
    ],
  }]} locale="zh" />);

  assert.match(markup, /wb-message-process/);
  assert.match(markup, /执行过程/);
  assert.match(markup, /120 \+ 80/);
  assert.match(markup, /wb-message-results/);
  assert.match(markup, /参考来源/);
  assert.match(markup, /执行摘要/);
});
