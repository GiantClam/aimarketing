import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkbenchMessageSurface } from "../src/index";
import { createDesktopUIMessage, type DesktopUIMessage } from "@aimarketing/workbench-client";

test("renders UIMessage roles, streaming process and structured output in one surface", () => {
  const user = createDesktopUIMessage({ id: "user-1", role: "user", conversationId: "conversation-1", content: "生成一张图" });
  const assistant: DesktopUIMessage = {
    ...createDesktopUIMessage({ id: "assistant-1", role: "assistant", conversationId: "conversation-1", runId: "run-1", modelId: "grok" }),
    parts: [
      { type: "reasoning", text: "正在规划", state: "streaming" },
      { type: "text", text: "结果已准备", state: "streaming" },
      { type: "data-status", id: "status:run", data: { status: "running" } },
      { type: "data-artifact", id: "artifact:1", data: { id: "artifact-1", relativePath: "assets/result.png", title: "result.png", mimeType: "image/png", byteLength: 10, sha256: "hash" } },
    ],
  };
  const markup = renderToStaticMarkup(<WorkbenchMessageSurface messages={[user, assistant]} locale="zh" onCopy={() => undefined} onRetry={() => undefined} onArtifactOpen={() => undefined} onArtifactDownload={() => undefined} />);
  assert.match(markup, /data-uimessage-surface="true"/);
  assert.match(markup, /data-message-role="user"/);
  assert.match(markup, /执行过程/);
  assert.match(markup, /结果已准备/);
  assert.match(markup, /result\.png/);
});

test("keeps empty state inside the conversation surface", () => {
  const markup = renderToStaticMarkup(<WorkbenchMessageSurface messages={[]} locale="en" />);
  assert.match(markup, /Start a new conversation/);
});

test("renders source citations, reports and media output slots", () => {
  const message: DesktopUIMessage = {
    ...createDesktopUIMessage({ id: "assistant-rich", role: "assistant", conversationId: "conversation-1" }),
    parts: [
      { type: "source-url", sourceId: "source-1", url: "https://example.com/reference", title: "Reference" },
      { type: "data-report", id: "report-1", data: { title: "Generated report", body: "# Summary" } },
      { type: "data-media", id: "media-1", data: { artifactId: "artifact-1", kind: "image", mimeType: "image/png", title: "Preview", relativePath: "assets/preview.png", previewable: true } },
    ],
  };
  const markup = renderToStaticMarkup(<WorkbenchMessageSurface messages={[message]} locale="en" onMediaOpen={() => undefined} />);
  assert.match(markup, /ai-elements-inline-citation/);
  assert.match(markup, /Generated report/);
  assert.match(markup, /data-language="markdown"/);
  assert.match(markup, /assets\/preview\.png/);
});
