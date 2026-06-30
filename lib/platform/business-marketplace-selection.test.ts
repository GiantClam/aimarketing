import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}

test("business marketplace selection sanitizer keeps only valid imported agents", async () => {
  const { sanitizeBusinessMarketplaceSelectionInput } = await import("./business-marketplace-selection")

  const selection = sanitizeBusinessMarketplaceSelectionInput({
    selectedAgentIds: [
      "agency-marketing-email-strategist",
      "agency-marketing-email-strategist",
      "agency-engineering-frontend-developer",
      "not-real-agent",
      "",
    ],
  })

  assert.deepEqual(selection.selectedAgentIds, [
    "agency-marketing-email-strategist",
    "agency-engineering-frontend-developer",
  ])
})

test("business marketplace selection sanitizer accepts built-in business agents, executive agents, and custom runtime ids", async () => {
  const { sanitizeBusinessMarketplaceSelectionInput } = await import("./business-marketplace-selection")

  const selection = sanitizeBusinessMarketplaceSelectionInput({
    selectedAgentIds: [
      "business-sales-close",
      "custom-agent:42",
      "executive-brand",
      "custom-agent:not-a-number",
    ],
  })

  assert.deepEqual(selection.selectedAgentIds, [
    "business-sales-close",
    "custom-agent:42",
    "executive-brand",
  ])
})

test("business marketplace selection sanitizer accepts a bare array payload", async () => {
  const { sanitizeBusinessMarketplaceSelectionInput } = await import("./business-marketplace-selection")

  const selection = sanitizeBusinessMarketplaceSelectionInput([
    "agency-sales-deal-strategist",
    "agency-testing-api-tester",
  ])

  assert.deepEqual(selection.selectedAgentIds, [
    "agency-sales-deal-strategist",
    "agency-testing-api-tester",
  ])
})
