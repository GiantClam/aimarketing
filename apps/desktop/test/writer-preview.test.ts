import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopUIMessage } from "@coworkany/workbench-client";
import { writerImageArtifactsForArticle } from "../src/writer-preview";

test("writer preview retains images linked to the selected historical article", () => {
  const article = createDesktopUIMessage({ id: "article-1", role: "assistant", conversationId: "writer-1", content: "第一篇文章" });
  const imageRun = {
    ...createDesktopUIMessage({ id: "image-run-1", role: "assistant", conversationId: "writer-1", content: "配图已生成" }),
    parts: [
      { type: "data-writerAsset" as const, id: "writer-asset:image-run-1", data: { articleMessageId: "article-1", kind: "image" as const } },
      { type: "data-artifact" as const, id: "artifact:image-run-1", data: { id: "image-1", title: "cover.png", relativePath: "images/cover.png", mimeType: "image/png", byteLength: 12, sha256: "hash" } },
    ],
  };
  const unrelatedImageRun = {
    ...createDesktopUIMessage({ id: "image-run-2", role: "assistant", conversationId: "writer-1", content: "另一篇配图" }),
    parts: [
      { type: "data-writerAsset" as const, id: "writer-asset:image-run-2", data: { articleMessageId: "article-2", kind: "image" as const } },
      { type: "data-artifact" as const, id: "artifact:image-run-2", data: { id: "image-2", title: "other.png", relativePath: "images/other.png", mimeType: "image/png", byteLength: 12, sha256: "hash" } },
    ],
  };
  const legacyImageRequest = createDesktopUIMessage({ id: "legacy-image-request", role: "user", conversationId: "writer-1", content: "基于上一轮文案生成配图，并将图片产物写入当前项目目录。" });
  const legacyImageRun = {
    ...createDesktopUIMessage({ id: "legacy-image-run", role: "assistant", conversationId: "writer-1", content: "配图已生成" }),
    parts: [
      { type: "data-artifact" as const, id: "artifact:legacy-image-run", data: { id: "legacy-image-1", title: "legacy-cover.png", relativePath: "images/legacy-cover.png", mimeType: "image/png", byteLength: 12, sha256: "legacy-hash" } },
    ],
  };

  assert.deepEqual(writerImageArtifactsForArticle([article, imageRun, unrelatedImageRun, legacyImageRequest, legacyImageRun], "article-1").map((artifact) => artifact.id), ["image-1", "legacy-image-1"]);
});
