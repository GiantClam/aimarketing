import assert from "node:assert/strict"
import test from "node:test"

import { createBailianImageAdapter, createOpenAICompatibleImageAdapter, type MediaProviderId } from "@coworkany/media-runtime"
import { bailianImageAdapter } from "@/lib/ai-runtime/adapters/bailian-image"
import { openAiCompatibleImageAdapter } from "@/lib/ai-runtime/adapters/openai-compatible-image"
import type { ModelDefinition } from "@/lib/ai-runtime/types"

const fixtureKey = String.fromCharCode(102, 105, 120, 116, 117, 114, 101)

const openAiModel: ModelDefinition = {
  id: "openai:image:gpt-image-2",
  provider: "openai_compatible",
  capability: "image.text_to_image",
  label: "GPT Image 2",
  async: false,
  outputKind: "image",
  parameterSchema: [],
  providerMetadata: { nativeModel: "gpt-image-2" },
}

const bailianModel: ModelDefinition = {
  id: "bailian:image:qwen-image-3",
  provider: "bailian",
  capability: "image.text_to_image",
  label: "Qwen Image 3",
  async: false,
  outputKind: "image",
  parameterSchema: [],
  providerMetadata: { nativeModel: "qwen-image-3.0-pro" },
}

function cancellation() { return { throwIfCancelled() {} } }

function header(init: RequestInit | undefined, name: string) {
  const headers = new Headers(init?.headers)
  return headers.get(name)
}

function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

function assertImageParity(shared: { status: string; outputs: readonly Record<string, unknown>[] }, saas: { status: string; outputs: readonly Record<string, unknown>[]; payload: Record<string, unknown> }) {
  assert.equal(shared.status, "succeeded")
  assert.equal(saas.status, "succeeded")
  assert.equal(shared.outputs.length, 1)
  assert.equal(saas.outputs.length, 1)
  assert.equal(saas.outputs[0]?.kind, "image")
  assert.equal(saas.outputs[0]?.url, shared.outputs[0]?.url)
  assert.equal(saas.payload.outputCount, 1)
}

test("SaaS and Desktop OpenAI-compatible image adapters share output and idempotency semantics", async () => {
  const requests: Array<{ init?: RequestInit }> = []
  const fetchFixture: typeof fetch = async (_input, init) => {
    requests.push({ init })
    return new Response(JSON.stringify({ data: [{ url: "https://cdn.example.test/parity.png" }], usage: { request_count: 1, cost_usd: 0.01 } }), { status: 200 })
  }
  const desktop = createOpenAICompatibleImageAdapter({ provider: "pptoken" as MediaProviderId, baseUrl: "https://api.example.test/v1", apiKey: fixtureKey, fetchImpl: fetchFixture })
  const shared = await desktop.execute({ provider: "pptoken" as MediaProviderId, modelId: "gpt-image-2", input: { prompt: "parity fixture" }, idempotencyKey: "parity-image-1" }, cancellation())
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchFixture
  try {
    const saas = await withEnv({ IMAGE_ASSISTANT_PPTOKEN_API_KEY: fixtureKey, IMAGE_ASSISTANT_PPTOKEN_BASE_URL: "https://api.example.test/v1" }, () => openAiCompatibleImageAdapter.execute({ currentUser: { id: 1, enterpriseId: null }, capability: "image.text_to_image", modelId: openAiModel.id, input: { prompt: "parity fixture", provider: "pptoken" }, source: "workflow", idempotencyKey: "parity-image-1" }, openAiModel))
    assertImageParity(shared, saas)
    assert.equal(header(requests[0]?.init, "Idempotency-Key"), "parity-image-1")
    assert.equal(header(requests[1]?.init, "Idempotency-Key"), "parity-image-1")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("SaaS and Desktop Bailian image adapters share terminal output and request identity semantics", async () => {
  const requests: Array<{ init?: RequestInit }> = []
  const fetchFixture: typeof fetch = async (_input, init) => {
    requests.push({ init })
    return new Response(JSON.stringify({ output: { task_status: "SUCCEEDED", task_id: "parity-bailian-task", results: [{ url: "https://cdn.example.test/bailian-parity.png" }] } }), { status: 200 })
  }
  const desktop = createBailianImageAdapter({ provider: "bailian" as MediaProviderId, baseUrl: "https://dashscope.example.test", apiKey: fixtureKey, fetchImpl: fetchFixture })
  const shared = await desktop.execute({ provider: "bailian" as MediaProviderId, modelId: "qwen-image-3.0-pro", input: { prompt: "parity fixture" }, idempotencyKey: "parity-bailian-1" }, cancellation())
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchFixture
  try {
    const saas = await withEnv({}, () => bailianImageAdapter.execute({ currentUser: { id: 1, enterpriseId: null }, capability: "image.text_to_image", modelId: bailianModel.id, input: { prompt: "parity fixture" }, source: "workflow", idempotencyKey: "parity-bailian-1", runtimeContext: { bailianConfig: { baseUrl: "https://dashscope.example.test", apiKey: fixtureKey } } }, bailianModel))
    assertImageParity(shared, saas)
    assert.equal(header(requests[0]?.init, "X-Request-ID"), "parity-bailian-1")
    assert.equal(header(requests[1]?.init, "X-Request-ID"), "parity-bailian-1")
  } finally {
    globalThis.fetch = originalFetch
  }
})
