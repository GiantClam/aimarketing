import assert from "node:assert/strict"
import test from "node:test"

import {
  canWorkflowNodeConnectValueKind,
  canWorkflowNodeAcceptValueKind,
  getAllowedWorkflowTargetInputKinds,
  getDefaultWorkflowNodeTitle,
  getWorkflowNodeOutputKinds,
  isWorkflowNodeType,
  resolveWorkflowNodeTitle,
  type WorkflowNodeType,
} from "@/lib/workflows/schema"

test("workflow schema exposes the fixed V1 node types", () => {
  const nodeTypes: WorkflowNodeType[] = [
    "upload",
    "text_input",
    "writer",
    "llm_generate",
    "agent_execute",
    "image_generate",
    "video_generate",
    "digital_human",
    "music_generate",
    "voice_synthesis",
    "audio_generate",
    "ppt_generate",
    "knowledge_retrieve",
    "knowledge_write",
    "product_store",
  ]

  assert.equal(nodeTypes.every((type) => isWorkflowNodeType(type)), true)
})

test("video_generate accepts text image and video inputs", () => {
  assert.deepEqual(getAllowedWorkflowTargetInputKinds("video_generate"), [
    "text",
    "image",
    "video",
  ])
})

test("digital_human accepts script image and audio inputs", () => {
  assert.deepEqual(getAllowedWorkflowTargetInputKinds("digital_human"), [
    "text",
    "image",
    "audio",
  ])
})

test("workflow schema exposes strong output kinds for fixed nodes", () => {
  assert.deepEqual(getWorkflowNodeOutputKinds("upload"), ["asset"])
  assert.deepEqual(getWorkflowNodeOutputKinds("text_input"), ["text"])
  assert.deepEqual(getWorkflowNodeOutputKinds("writer"), ["text"])
  assert.deepEqual(getWorkflowNodeOutputKinds("agent_execute"), ["text"])
  assert.deepEqual(getWorkflowNodeOutputKinds("image_generate"), ["image"])
  assert.deepEqual(getWorkflowNodeOutputKinds("digital_human"), ["video"])
  assert.deepEqual(getWorkflowNodeOutputKinds("music_generate"), ["audio"])
  assert.deepEqual(getWorkflowNodeOutputKinds("voice_synthesis"), ["audio"])
  assert.deepEqual(getWorkflowNodeOutputKinds("audio_generate"), ["audio"])
  assert.deepEqual(getWorkflowNodeOutputKinds("ppt_generate"), ["ppt"])
  assert.deepEqual(getWorkflowNodeOutputKinds("knowledge_retrieve"), ["text"])
  assert.deepEqual(getWorkflowNodeOutputKinds("knowledge_write"), ["text", "asset", "image", "video", "audio", "ppt"])
  assert.deepEqual(getWorkflowNodeOutputKinds("product_store"), [])
})

test("input type helpers reject incompatible node connections", () => {
  assert.equal(canWorkflowNodeAcceptValueKind("agent_execute", "text"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("agent_execute", "image"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("agent_execute", "ppt"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("image_generate", "text"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("image_generate", "image"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("image_generate", "asset"), false)
  assert.equal(canWorkflowNodeAcceptValueKind("ppt_generate", "video"), false)
  assert.equal(canWorkflowNodeAcceptValueKind("music_generate", "audio"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("digital_human", "audio"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("digital_human", "image"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("digital_human", "video"), false)
  assert.equal(canWorkflowNodeAcceptValueKind("voice_synthesis", "audio"), false)
  assert.equal(canWorkflowNodeAcceptValueKind("audio_generate", "audio"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("knowledge_retrieve", "text"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("knowledge_retrieve", "asset"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("knowledge_write", "image"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("product_store", "video"), true)
  assert.equal(canWorkflowNodeAcceptValueKind("product_store", "text"), true)
})

test("connection helpers allow upload asset outputs to connect into typed file inputs", () => {
  assert.equal(canWorkflowNodeConnectValueKind("image_generate", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("video_generate", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("digital_human", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("music_generate", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("ppt_generate", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("knowledge_retrieve", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("knowledge_write", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("voice_synthesis", "asset"), false)
  assert.equal(canWorkflowNodeConnectValueKind("writer", "asset"), false)
})

test("default workflow node titles resolve to the active locale while preserving custom names", () => {
  assert.equal(getDefaultWorkflowNodeTitle("upload", "zh"), "上传")
  assert.equal(resolveWorkflowNodeTitle("text_input", "Text Input", "zh"), "文本输入")
  assert.equal(getDefaultWorkflowNodeTitle("writer", "zh"), "文章写作")
  assert.equal(getDefaultWorkflowNodeTitle("llm_generate", "zh"), "大模型")
  assert.equal(getDefaultWorkflowNodeTitle("agent_execute", "zh"), "智能体")
  assert.equal(getDefaultWorkflowNodeTitle("digital_human", "zh"), "口播数字人")
  assert.equal(getDefaultWorkflowNodeTitle("music_generate", "zh"), "音乐生成")
  assert.equal(getDefaultWorkflowNodeTitle("voice_synthesis", "zh"), "语音合成")
  assert.equal(getDefaultWorkflowNodeTitle("knowledge_retrieve", "zh"), "知识检索")
  assert.equal(getDefaultWorkflowNodeTitle("knowledge_write", "en"), "Knowledge Write")
  assert.equal(getDefaultWorkflowNodeTitle("product_store", "zh"), "素材库存储")
  assert.equal(getDefaultWorkflowNodeTitle("product_store", "en"), "Asset Library")
  assert.equal(resolveWorkflowNodeTitle("product_store", "作品库存储", "zh"), "素材库存储")
  assert.equal(resolveWorkflowNodeTitle("product_store", "Work Library", "en"), "Asset Library")
  assert.equal(resolveWorkflowNodeTitle("llm_generate", "文案生成", "zh"), "大模型")
  assert.equal(resolveWorkflowNodeTitle("llm_generate", "文案生成", "en"), "LLM Generate")
  assert.equal(resolveWorkflowNodeTitle("image_generate", "Hero Visual", "zh"), "Hero Visual")
})
