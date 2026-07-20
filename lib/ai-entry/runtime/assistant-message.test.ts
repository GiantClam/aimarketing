import assert from "node:assert/strict"
import test from "node:test"

import { buildRuntimeAssistantMessage } from "./assistant-message"

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
    "任务已完成，已生成以下文件：\n- 企业 AI 复盘.pptx\n- ppt/index.html",
  )
})

test("runtime completion does not persist an empty success", () => {
  assert.equal(buildRuntimeAssistantMessage("", []), null)
})
