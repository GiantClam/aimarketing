import assert from "node:assert/strict"
import test from "node:test"

import { buildOpenCodeProviderOptions, OPENCODE_PROVIDER_TIMEOUT } from "./opencode-provider-config.js"

test("disables OpenCode's five-minute provider timeout for long native turns", () => {
  assert.equal(OPENCODE_PROVIDER_TIMEOUT, false)
  assert.deepEqual(buildOpenCodeProviderOptions({
    providerId: "pptoken",
    modelId: "gpt-5.4",
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
  }), {
    baseURL: "https://example.com/v1",
    apiKey: "test-key",
    timeout: false,
  })
})
