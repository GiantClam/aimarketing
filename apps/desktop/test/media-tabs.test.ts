import assert from "node:assert/strict";
import test from "node:test";
import { closeDesktopMediaTab, createDesktopMediaTab, openDesktopMediaTab } from "../src/media-tabs";

const textToVideo = {
  id: "text-to-video" as const,
  group: "video" as const,
  title: "文生视频",
  summary: "",
  submitLabel: "生成视频",
  fields: [{ id: "prompt", label: "提示词", type: "textarea" as const, defaultValue: "默认提示" }],
};

const imageToVideo = {
  id: "image-to-video" as const,
  group: "video" as const,
  title: "图生视频",
  summary: "",
  submitLabel: "生成视频",
  fields: [{ id: "firstFrameUrl", label: "首帧", type: "url" as const }],
};

test("media workspace tabs keep independent feature parameters", () => {
  const first = createDesktopMediaTab(textToVideo);
  const tabs = openDesktopMediaTab([{ ...first, values: { prompt: "文生视频提示" } }], imageToVideo);
  const second = tabs.find((tab) => tab.id === "image-to-video");

  assert.equal(tabs.find((tab) => tab.id === "text-to-video")?.values.prompt, "文生视频提示");
  assert.deepEqual(second?.values, { firstFrameUrl: "" });
});

test("closing the active media tab activates the latest remaining tab", () => {
  const tabs = openDesktopMediaTab([createDesktopMediaTab(textToVideo)], imageToVideo);
  const next = closeDesktopMediaTab(tabs, "image-to-video", "image-to-video");

  assert.deepEqual(next.tabs.map((tab) => tab.id), ["text-to-video"]);
  assert.equal(next.activeTabId, "text-to-video");
});

test("closing a background media tab preserves the active feature", () => {
  const tabs = openDesktopMediaTab([createDesktopMediaTab(textToVideo)], imageToVideo);
  const next = closeDesktopMediaTab(tabs, "image-to-video", "text-to-video");

  assert.equal(next.activeTabId, "image-to-video");
});

test("closing the final media tab leaves the workspace empty", () => {
  const next = closeDesktopMediaTab([createDesktopMediaTab(textToVideo)], "text-to-video", "text-to-video");

  assert.deepEqual(next.tabs, []);
  assert.equal(next.activeTabId, null);
});
