import assert from "node:assert/strict"
import test from "node:test"

import { getModelDefinition } from "@/lib/ai-runtime/model-registry"
import { buildRuntimeFieldsForModel } from "@/lib/ai-runtime/ui"

test("video runtime fields localize labels and options for Chinese", () => {
  const model = getModelDefinition("bailian:video:happyhorse-1.1-t2v")
  assert.ok(model)

  const fields = buildRuntimeFieldsForModel(model, "zh")
  assert.deepEqual(
    fields.map((field) => ({ id: field.id, label: field.label, options: field.options?.map((option) => option.label) })),
    [
      { id: "prompt", label: "提示词", options: undefined },
      { id: "resolution", label: "分辨率", options: ["720P", "1080P"] },
      { id: "ratio", label: "画面比例", options: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"] },
      { id: "duration", label: "时长", options: undefined },
      { id: "watermark", label: "水印", options: ["开启", "关闭"] },
      { id: "seed", label: "随机种子", options: undefined },
    ],
  )
})

test("video runtime fields preserve English labels and options", () => {
  const model = getModelDefinition("bailian:video:happyhorse-1.0-video-edit")
  assert.ok(model)

  const fields = buildRuntimeFieldsForModel(model, "en")
  assert.equal(fields.find((field) => field.id === "sourceVideoUrl")?.label, "Source video URL")
  assert.deepEqual(fields.find((field) => field.id === "audioSetting")?.options?.map((option) => option.label), ["Auto", "Original"])
})
