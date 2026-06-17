import assert from "node:assert/strict"
import test from "node:test"

import {
  getPptPreviewLayoutSequence,
  getPptPreviewStyleSummary,
  resolveOptionalPptPreviewPageCount,
} from "./ppt-preview-data-fixed"

test("getPptPreviewStyleSummary falls back safely for unknown style keys", () => {
  assert.equal(getPptPreviewStyleSummary(undefined, "zh-CN"), "正式 AI PPT 模板。")
  assert.equal(
    getPptPreviewStyleSummary("ppt169_unknown_template" as never, "en-US"),
    "Formal AI PPT template.",
  )
})

test("optional page count accepts blank input and arbitrary integers within range", () => {
  assert.equal(resolveOptionalPptPreviewPageCount(undefined), null)
  assert.equal(resolveOptionalPptPreviewPageCount(""), null)
  assert.equal(resolveOptionalPptPreviewPageCount(12), 12)
  assert.equal(resolveOptionalPptPreviewPageCount("99"), 20)
})

test("layout sequence expands beyond nine slides while keeping a closing slide", () => {
  assert.deepEqual(getPptPreviewLayoutSequence(11), [
    "cover",
    "agenda",
    "insight",
    "comparison",
    "evidence",
    "stats",
    "chart",
    "process",
    "insight",
    "comparison",
    "timeline",
  ])
})
