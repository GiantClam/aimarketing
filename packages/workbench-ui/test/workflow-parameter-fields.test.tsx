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
