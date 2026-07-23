import assert from "node:assert/strict"
import test from "node:test"

import type { ArtifactPart, MessagePart } from "./message-parts/types"
import { attachConversationArtifacts } from "./conversation-artifact-placement"

function artifact(overrides: Partial<ArtifactPart> = {}): ArtifactPart {
  return {
    type: "artifact",
    id: "artifact:1",
    artifactType: "pptx",
    artifactId: 1,
    title: "final-deck.pptx",
    fileName: "final-deck.pptx",
    previewUrl: "/preview",
    downloadUrl: "/download",
    workHref: null,
    status: "created",
    ...overrides,
  }
}

test("把全局 artifact 挂回包含文件名的原 assistant 消息", () => {
  const messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: number; parts?: MessagePart[] }> = [
    { id: "1", role: "user" as const, content: "生成 PPT", createdAt: 10 },
    { id: "2", role: "assistant" as const, content: "已生成 final-deck.pptx", createdAt: 20 },
    { id: "3", role: "user" as const, content: "补充说明", createdAt: 30 },
    { id: "4", role: "assistant" as const, content: "补充说明已完成", createdAt: 40 },
  ]

  const next = attachConversationArtifacts(messages, [artifact()])

  assert.equal(next.length, messages.length)
  assert.equal(next.find((message) => message.id === "2")?.parts?.[0]?.type, "artifact")
  assert.equal(next.find((message) => message.id === "4")?.parts, undefined)
})

test("同一文件名出现在进度消息和交付消息时，artifact 挂到最近的交付消息", () => {
  const messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: number; parts?: MessagePart[] }> = [
    { id: "1", role: "assistant" as const, content: "正在检查 final-deck.pptx 的导出状态", createdAt: 100 },
    { id: "2", role: "assistant" as const, content: "最新 PPTX 已重新导出：final-deck.pptx", createdAt: 205 },
    { id: "3", role: "assistant" as const, content: "如果需要，我还可以继续修改 final-deck.pptx", createdAt: 1000 },
  ]

  const next = attachConversationArtifacts(messages, [artifact({ createdAt: 200 })])

  assert.equal(next.find((message) => message.id === "2")?.parts?.[0]?.type, "artifact")
  assert.equal(next.find((message) => message.id === "1")?.parts, undefined)
  assert.equal(next.find((message) => message.id === "3")?.parts, undefined)
})

test("没有可匹配消息时，artifact 消息使用稳定时间而不是最新消息时间", () => {
  const messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: number; parts?: MessagePart[] }> = [
    { id: "1", role: "user" as const, content: "生成 PPT", createdAt: 10 },
    { id: "2", role: "assistant" as const, content: "已完成", createdAt: 20 },
    { id: "3", role: "user" as const, content: "后续问题", createdAt: 30 },
  ]

  const next = attachConversationArtifacts(messages, [artifact({ title: "unknown.pptx", fileName: "unknown.pptx", createdAt: 20 })])

  assert.deepEqual(next.map((message) => message.id), ["1", "2", "conversation-artifacts", "3"])
  assert.equal(next.find((message) => message.id === "conversation-artifacts")?.createdAt, 20)

  const withLaterMessage = attachConversationArtifacts(
    [...messages, { id: "4", role: "assistant" as const, content: "后续完成", createdAt: 40 }],
    [artifact({ title: "unknown.pptx", fileName: "unknown.pptx", createdAt: 20 })],
  )
  assert.deepEqual(withLaterMessage.map((message) => message.id), ["1", "2", "conversation-artifacts", "3", "4"])
})
