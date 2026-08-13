import assert from "node:assert/strict"
import test from "node:test"

import { buildRuntimeAssistantArtifactParts, buildRuntimeAssistantMessage } from "./assistant-message"

test("runtime completion maps artifacts into parts of the same assistant turn", () => {
  assert.deepEqual(buildRuntimeAssistantArtifactParts([{
    artifactId: 7,
    kind: "pptx",
    title: "deck",
    fileName: "deck.pptx",
    publicUrl: "/download/deck",
  }]), [{
    type: "artifact",
    id: "runtime-artifact:7",
    artifactType: "pptx",
    artifactId: 7,
    title: "deck",
    fileName: "deck.pptx",
    previewUrl: null,
    downloadUrl: "/download/deck",
    workHref: null,
    status: "created",
  }])
})

test("runtime completion keeps model text when it is available", () => {
  assert.equal(
    buildRuntimeAssistantMessage("  已完成演示文稿。  ", [{ title: "deck.pptx" }]),
    "已完成演示文稿。",
  )
})

test("runtime completion synthesizes a durable message for artifact-only runs", () => {
  assert.equal(
    buildRuntimeAssistantMessage("", [
      { title: "企业 AI 复盘.pptx" },
      { fileName: "ppt/index.html" },
    ]),
    "任务已完成，已生成以下文件：\n- 企业 AI 复盘.pptx",
  )
})

test("runtime completion does not persist an empty success", () => {
  assert.equal(buildRuntimeAssistantMessage("", []), null)
})
