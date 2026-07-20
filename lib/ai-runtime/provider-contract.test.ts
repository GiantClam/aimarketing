import assert from "node:assert/strict"
import test from "node:test"

import { listProviderAdapters } from "@/lib/ai-runtime/provider-registry"

test("provider adapters expose the common execution contract", () => {
  for (const adapter of listProviderAdapters()) {
    assert.equal(typeof adapter.isConfigured, "function", adapter.provider)
    assert.equal(typeof adapter.execute, "function", adapter.provider)
    if (adapter.upstreamCancelSupported === false) {
      assert.equal(typeof adapter.cancel, "function", `${adapter.provider} must explain cancellation support`)
    }
  }
})

