import assert from "node:assert/strict"
import test from "node:test"

import { resolveClickConnectInputName, workflowValueKindToInputName } from "./connect"

test("workflowValueKindToInputName maps every value kind to its edge input name", () => {
  assert.equal(workflowValueKindToInputName("text"), "text")
  assert.equal(workflowValueKindToInputName("asset"), "assets")
  assert.equal(workflowValueKindToInputName("image"), "images")
  assert.equal(workflowValueKindToInputName("video"), "videos")
  assert.equal(workflowValueKindToInputName("audio"), "audios")
  assert.equal(workflowValueKindToInputName("ppt"), "presentations")
})

test("resolveClickConnectInputName resolves compatible source->target pairs", () => {
  // Default guided pipeline: text -> script -> TTS -> digital human.
  assert.equal(resolveClickConnectInputName("text_input", "llm_generate"), "text")
  assert.equal(resolveClickConnectInputName("llm_generate", "voice_synthesis"), "text")
  assert.equal(resolveClickConnectInputName("voice_synthesis", "digital_human"), "audios")
  // Text feeds image generation.
  assert.equal(resolveClickConnectInputName("llm_generate", "image_generate"), "text")
  // Upload (asset) feeds the asset library.
  assert.equal(resolveClickConnectInputName("upload", "product_store"), "assets")
  // Text should be materialized as a file before entering the asset library.
  assert.equal(resolveClickConnectInputName("llm_generate", "file_create"), "text")
  assert.equal(resolveClickConnectInputName("file_create", "product_store"), "assets")
  // Image feeds digital human (avatar).
  assert.equal(resolveClickConnectInputName("image_generate", "digital_human"), "images")
})

test("resolveClickConnectInputName returns null for incompatible pairs", () => {
  // product_store emits nothing.
  assert.equal(resolveClickConnectInputName("product_store", "llm_generate"), null)
  // upload accepts no inputs.
  assert.equal(resolveClickConnectInputName("text_input", "upload"), null)
})
