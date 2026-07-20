import assert from "node:assert/strict"
import test from "node:test"

import { getProviderAdapter } from "@/lib/ai-runtime/provider-registry"
import type { ModelDefinition } from "@/lib/ai-runtime/types"
import { openAiCompatibleImageAdapter } from "./openai-compatible-image"

const model: ModelDefinition = {
  id: "openai:image:gpt-image-2",
  provider: "openai_compatible",
  capability: "image.text_to_image",
  label: "GPT Image 2",
  async: false,
  outputKind: "image",
  parameterSchema: [],
  providerMetadata: { nativeModel: "gpt-image-2" },
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

test("registry resolves OpenAI Compatible image adapter for the image model", async () => {
  assert.equal(model.provider, "openai_compatible")
  await withEnv({ WORKFLOW_OPENAI_IMAGE_ADAPTER_V1: "1" }, async () => {
    assert.equal(getProviderAdapter("openai_compatible", "image.text_to_image"), openAiCompatibleImageAdapter)
  })
  assert.equal(openAiCompatibleImageAdapter.upstreamCancelSupported, false)
})

test("adapter maps multiple helper images to safe image outputs and forwards idempotency", async () => {
  const originalFetch = globalThis.fetch
  let request: RequestInit | null = null
  globalThis.fetch = (async (_url, init) => {
    request = init || null
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ url: "https://cdn.example.test/one.png" }, { b64_json: "aW1hZ2U=" }],
      }),
    } as Response
  }) as typeof fetch

  try {
    const result = await withEnv(
      {
        IMAGE_ASSISTANT_PPTOKEN_API_KEY: "test-secret",
        IMAGE_ASSISTANT_PPTOKEN_BASE_URL: "https://api.example.test/v1",
      },
      () =>
        openAiCompatibleImageAdapter.execute(
          {
            currentUser: { id: 1, enterpriseId: 2 },
            capability: "image.text_to_image",
            modelId: model.id,
            input: { prompt: "A safe test prompt", provider: "pptoken", candidateCount: 2 },
            source: "workflow",
            idempotencyKey: "attempt-1",
          },
          model,
        ),
    )

    assert.equal(result.status, "succeeded")
    assert.equal(result.outputs.length, 2)
    assert.equal(result.outputs[0]?.kind, "image")
    assert.equal(result.payload.outputCount, 2)
    // TypeScript cannot observe assignments made inside the mocked fetch
    // closure and narrows the captured variable to `null` here. Re-read the
    // capture through an explicit union before inspecting its headers.
    const capturedRequest = request as RequestInit | null
    const idempotencyHeader = capturedRequest?.headers instanceof Headers
      ? capturedRequest.headers.get("Idempotency-Key")
      : (capturedRequest?.headers as Record<string, string> | undefined)?.["Idempotency-Key"]
    assert.equal(idempotencyHeader, "attempt-1")
    assert.equal("input" in result.payload, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("adapter exposes explicit unsupported upstream cancellation", async () => {
  const result = await openAiCompatibleImageAdapter.cancel?.(
    {
      currentUser: { id: 1, enterpriseId: 2 },
      modelId: model.id,
      providerTaskId: "provider-task",
      reason: "user_cancelled",
    },
    model,
  )
  assert.deepEqual(result, { status: "not_supported" })
})

test("adapter fails closed when the selected compatible provider is not configured", async () => {
  await assert.rejects(
    withEnv(
      {
        IMAGE_ASSISTANT_PPTOKEN_API_KEY: undefined,
        IMAGE_ASSISTANT_AIBERM_API_KEY: undefined,
        IMAGE_ASSISTANT_CRAZYROUTE_API_KEY: undefined,
      },
      () =>
        openAiCompatibleImageAdapter.execute(
          {
            currentUser: { id: 1, enterpriseId: 2 },
            capability: "image.text_to_image",
            modelId: model.id,
            input: { prompt: "test", provider: "pptoken" },
            source: "workflow",
          },
          model,
        ),
    ),
    /provider_not_configured/,
  )
})

test("adapter only falls back when provider is omitted", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ b64_json: "aW1hZ2U=" }] }),
  }) as Response) as typeof fetch
  try {
    const result = await withEnv(
      {
        IMAGE_ASSISTANT_PPTOKEN_API_KEY: "test-secret",
        IMAGE_ASSISTANT_PPTOKEN_BASE_URL: "https://api.example.test/v1",
      },
      () => openAiCompatibleImageAdapter.execute({
        currentUser: { id: 1, enterpriseId: 2 },
        capability: "image.text_to_image",
        modelId: model.id,
        input: { prompt: "test" },
        source: "workflow",
      }, model),
    )
    assert.equal(result.status, "succeeded")
    await assert.rejects(
      withEnv(
        { IMAGE_ASSISTANT_PPTOKEN_API_KEY: undefined },
        () => openAiCompatibleImageAdapter.execute({
          currentUser: { id: 1, enterpriseId: 2 },
          capability: "image.text_to_image",
          modelId: model.id,
          input: { prompt: "test", provider: "pptoken" },
          source: "workflow",
        }, model),
      ),
      /provider_not_configured/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
