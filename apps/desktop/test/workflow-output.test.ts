import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkflowOutput } from "../src/workflow-output";

test("workflow output normalizes text and every supported media kind", () => {
  const items = normalizeWorkflowOutput({
    text: "完成了文本输出",
    image: [{ localPath: "C:/artifacts/cover.png", mimeType: "image/png", fileName: "cover.png" }],
    video: [{ url: "https://files.example/video.mp4", mimeType: "video/mp4" }],
    audio: [{ relativePath: "artifacts/voice.mp3", mimeType: "audio/mpeg" }],
    ppt: [{ localPath: "C:/artifacts/deck.pptx", fileName: "deck.pptx" }],
  });

  assert.deepEqual(items.map((item) => item.kind), ["text", "image", "video", "audio", "ppt"]);
  assert.equal(items[0].text, "完成了文本输出");
  assert.equal(items[1].localPath, "C:/artifacts/cover.png");
  assert.equal(items[2].url, "https://files.example/video.mp4");
  assert.equal(items[3].relativePath, "artifacts/voice.mp3");
  assert.equal(items[4].fileName, "deck.pptx");
});

test("workflow output keeps multiple values and ignores empty values", () => {
  const items = normalizeWorkflowOutput({
    image: [null, { url: "https://files.example/a.png" }, { url: "https://files.example/b.png" }],
    text: ["第一段", "第二段"],
  });

  assert.equal(items.length, 4);
  assert.deepEqual(items.filter((item) => item.kind === "image").map((item) => item.url), ["https://files.example/a.png", "https://files.example/b.png"]);
  assert.deepEqual(items.filter((item) => item.kind === "text").map((item) => item.text), ["第一段", "第二段"]);
});

test("workflow output accepts provider plural media fields", () => {
  const items = normalizeWorkflowOutput({
    images: [{ localPath: "C:/artifacts/generated.png", mimeType: "image/png" }],
    videos: [{ relativePath: "artifacts/generated.mp4", mimeType: "video/mp4" }],
    audios: [{ relativePath: "artifacts/generated.mp3", mimeType: "audio/mpeg" }],
    assets: [{ relativePath: "artifacts/generated.bin", mimeType: "application/octet-stream" }],
  });

  assert.deepEqual(items.map((item) => item.kind), ["image", "video", "audio", "asset"]);
  assert.equal(items[0].localPath, "C:/artifacts/generated.png");
  assert.equal(items[1].relativePath, "artifacts/generated.mp4");
  assert.equal(items[2].relativePath, "artifacts/generated.mp3");
  assert.equal(items[3].relativePath, "artifacts/generated.bin");
});
