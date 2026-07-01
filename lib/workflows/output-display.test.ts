import assert from "node:assert/strict"
import test from "node:test"

import {
  sanitizeWorkflowNodeOutputPayloadForDisplay,
  shouldHideWorkflowNodeOutputTextSection,
} from "@/lib/workflows/output-display"

test("product_store display payload drops legacy text outputs", () => {
  assert.equal(shouldHideWorkflowNodeOutputTextSection("product_store"), true)

  const result = sanitizeWorkflowNodeOutputPayloadForDisplay("product_store", {
    text: ["legacy text output"],
    asset: [{ fileName: "Output.md", mimeType: "text/markdown" }],
  })

  assert.deepEqual(result, {
    asset: [{ fileName: "Output.md", mimeType: "text/markdown" }],
  })
})

test("product_store display payload collapses to null when only text remains", () => {
  const result = sanitizeWorkflowNodeOutputPayloadForDisplay("product_store", {
    text: ["legacy text output"],
  })

  assert.equal(result, null)
})

test("non-store nodes preserve text outputs for display", () => {
  assert.equal(shouldHideWorkflowNodeOutputTextSection("writer"), false)

  const payload = {
    text: ["draft output"],
  }

  assert.deepEqual(sanitizeWorkflowNodeOutputPayloadForDisplay("writer", payload), payload)
})
