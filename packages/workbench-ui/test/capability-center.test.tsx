import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkbenchCapabilityCenter } from "../src/index";

test("shared capability center renders online groups, readiness and launcher tabs", () => {
  const markup = renderToStaticMarkup(<WorkbenchCapabilityCenter
    eyebrow="Media Workspace"
    title="能力中心"
    description="统一管理音频与视频能力"
    groups={[
      { id: "audio", title: "音频处理", description: "音频能力", kind: "audio", features: [{ id: "voice", title: "声音克隆", summary: "克隆参考音色", kind: "audio" }] },
      { id: "video", title: "视频处理", description: "视频能力", kind: "video", features: [{ id: "video", title: "文生视频", summary: "生成视频", kind: "video", disabled: true, disabledReason: "需要配置 Provider" }] },
    ]}
    openFeatureIds={["voice"]}
    activeFeatureId="voice"
    onFeatureOpen={() => undefined}
    onFeatureActivate={() => undefined}
    onFeatureClose={() => undefined}
    workspaceLabel="多 Tab 工作区"
    launchersLabel="能力入口"
    openFirstLabel="选择一个能力"
    openTabsLabel={(count) => `${count} 个已打开标签`}
    allTasksLabel="全部任务"
    onOpenTasks={() => undefined}
  ><div data-testid="host-workspace">HOST</div></WorkbenchCapabilityCenter>);
  assert.match(markup, /data-cloud-surface="capability-center"/);
  assert.match(markup, /声音克隆/);
  assert.match(markup, /需要配置 Provider/);
  assert.match(markup, /launcher-tab active/);
  assert.match(markup, /data-testid="host-workspace"/);
  assert.match(markup, /全部任务/);
});

test("shared capability center omits host task navigation when unsupported", () => {
  const markup = renderToStaticMarkup(<WorkbenchCapabilityCenter
    eyebrow="Capabilities"
    title="Capabilities"
    description="Local"
    groups={[]}
    openFeatureIds={[]}
    activeFeatureId={null}
    onFeatureOpen={() => undefined}
    onFeatureActivate={() => undefined}
    onFeatureClose={() => undefined}
    workspaceLabel="Workspace"
    launchersLabel="Launchers"
    openFirstLabel="Choose a feature"
    openTabsLabel={(count) => `${count} open`}
  />);
  assert.doesNotMatch(markup, /launcher-all-tasks/);
});
