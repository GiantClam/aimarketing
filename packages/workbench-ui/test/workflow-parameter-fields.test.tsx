import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkbenchWorkflowParameterFields } from "../src/workflow-parameter-fields";

test("renders schema-defined workflow fields with the desktop model picker", () => {
  const markup = renderToStaticMarkup(
    <WorkbenchWorkflowParameterFields
      locale="en"
      node={{
        nodeKey: "writer-1",
        type: "writer",
        nodeVersion: 1,
        title: "Writer",
        positionX: 0,
        positionY: 0,
        config: { selectedProviderId: "openai", selectedModelId: "gpt-5", platform: "generic", mode: "article", language: "auto" },
      }}
      modelOptions={[{ value: "gpt-5", label: "OpenAI / gpt-5" }]}
      onUpdate={() => undefined}
    />,
  );

  assert.match(markup, /Model/);
  assert.match(markup, /OpenAI \/ gpt-5/);
  assert.match(markup, /Platform/);
  assert.match(markup, /Format/);
  assert.match(markup, /Output language/);
  assert.doesNotMatch(markup, />Provider</);
});

test("renders select, number, and toggle controls from the shared node schema", () => {
  const markup = renderToStaticMarkup(
    <WorkbenchWorkflowParameterFields
      locale="en"
      node={{
        nodeKey: "collect-1",
        type: "collect",
        nodeVersion: 1,
        title: "Collect",
        positionX: 0,
        positionY: 0,
        config: { order: "input", includeFailures: false },
      }}
      onUpdate={() => undefined}
    />,
  );

  assert.match(markup, /Order/);
  assert.match(markup, /Include failures/);
  assert.match(markup, /type="checkbox"/);
});

test("keeps workflow parameter labels in the selected locale", () => {
  const markup = renderToStaticMarkup(
    <WorkbenchWorkflowParameterFields
      locale="zh"
      node={{
        nodeKey: "agent-1",
        type: "agent_execute",
        nodeVersion: 1,
        title: "智能体",
        positionX: 0,
        positionY: 0,
        config: { prompt: "hello", selectedProviderId: "local", selectedModelId: "agent/model" },
      }}
      onUpdate={() => undefined}
    />,
  );

  assert.match(markup, />提示词</u);
  assert.match(markup, />提供商</u);
  assert.match(markup, />模型</u);
  assert.doesNotMatch(markup, />Prompt</u);
  assert.doesNotMatch(markup, />Provider</u);
  assert.doesNotMatch(markup, />Model</u);
});

test("localizes workflow select options without changing their persisted values", () => {
  const markup = renderToStaticMarkup(
    <WorkbenchWorkflowParameterFields
      locale="zh"
      node={{
        nodeKey: "foreach-1",
        type: "foreach",
        nodeVersion: 1,
        title: "逐项处理",
        positionX: 0,
        positionY: 0,
        config: { inputPortId: "image.reference", failurePolicy: "continue" },
      }}
      onUpdate={() => undefined}
    />,
  );

  assert.match(markup, />图片引用</u);
  assert.match(markup, />继续</u);
  assert.match(markup, /value="image\.reference"/u);
  assert.match(markup, /value="continue"/u);
});

test("uses the configured model picker for media nodes with a standalone model field", () => {
  const markup = renderToStaticMarkup(
    <WorkbenchWorkflowParameterFields
      locale="en"
      node={{ nodeKey: "ppt-1", type: "ppt_generate", nodeVersion: 1, title: "PPT", positionX: 0, positionY: 0, config: { model: "ppt-model" } }}
      modelOptions={[{ value: "ppt-model", label: "PPT provider / ppt-model" }]}
      onUpdate={() => undefined}
    />,
  );

  assert.match(markup, /PPT provider \/ ppt-model/);
  assert.match(markup, /<select/);
});
