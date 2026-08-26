import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkbenchAgentDirectory } from "../src/index";

test("shared Agent directory exposes search, grouping and local availability reasons", () => {
  const markup = renderToStaticMarkup(<WorkbenchAgentDirectory
    locale="zh"
    title="智能体中心"
    description="查找已安装的本地智能体与 Skills"
    groups={[{
      id: "writing",
      label: "内容创作",
      cards: [
        { id: "writer", title: "Writer", description: "多平台内容生产", meta: "Skill", availability: "ready", primaryAction: { id: "start", label: "开始本地对话" }, secondaryAction: { id: "menu", label: "加入左侧菜单" } },
        { id: "ppt", title: "PPT", description: "演示文稿", meta: "Skill", availability: "needs-config", unavailableReason: "需要配置模型", primaryAction: { id: "start", label: "开始本地对话", disabled: true } },
      ],
    }]}
    onAction={() => undefined}
  />);
  assert.match(markup, /type="search"/);
  assert.match(markup, /内容创作/);
  assert.match(markup, /开始本地对话/);
  assert.match(markup, /需要配置模型/);
  assert.match(markup, /data-availability="needs-config"/);
  assert.match(markup, /agent-card-actions-paired/);
  assert.doesNotMatch(markup, /发布|市场|企业/);
});
