import assert from "node:assert/strict"
import test from "node:test"

import { getLeadToolPptPreviewRuntime } from "./config"

test("ai-ppt-preview defaults to frontend-slides preview runtime", () => {
  const originalPreviewRuntime = process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
  const originalGlobalRuntime = process.env.LEAD_TOOLS_PREVIEW_RUNTIME

  try {
    delete process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
    delete process.env.LEAD_TOOLS_PREVIEW_RUNTIME

    assert.equal(getLeadToolPptPreviewRuntime("ai-ppt-preview"), "frontend-slides-agent")
  } finally {
    if (originalPreviewRuntime === undefined) {
      delete process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
    } else {
      process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME = originalPreviewRuntime
    }

    if (originalGlobalRuntime === undefined) {
      delete process.env.LEAD_TOOLS_PREVIEW_RUNTIME
    } else {
      process.env.LEAD_TOOLS_PREVIEW_RUNTIME = originalGlobalRuntime
    }
  }
})
