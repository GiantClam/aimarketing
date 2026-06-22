import assert from "node:assert/strict"
import test from "node:test"

import { executeAiEntryWithProviderFailover } from "./provider-routing"

const PROVIDER_ENV_KEYS = [
  "AI_ENTRY_PPTOKEN_API_KEY",
  "AI_ENTRY_PPTOKEN_BASE_URL",
  "AI_ENTRY_PPTOKEN_MODEL",
  "AI_ENTRY_OPENROUTER_API_KEY",
  "AI_ENTRY_OPENROUTER_BASE_URL",
  "AI_ENTRY_OPENROUTER_MODEL",
  "AI_ENTRY_OPENROUTER_REFERER",
  "AI_ENTRY_OPENROUTER_TITLE",
  "AI_ENTRY_AIBERM_API_KEY",
  "AI_ENTRY_AIBERM_BASE_URL",
  "AI_ENTRY_AIBERM_MODEL",
  "AI_ENTRY_CRAZYROUTE_API_KEY",
  "AI_ENTRY_CRAZYROUTE_BASE_URL",
  "AI_ENTRY_CRAZYROUTE_MODEL",
  "AI_ENTRY_NORMAL_DEFAULT_MODEL",
  "PPTOKEN_API_KEY",
  "PPTOKEN_BASE_URL",
  "PPTOKEN_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_MODEL",
  "AIBERM_API_KEY",
  "AIBERM_BASE_URL",
  "CRAZYROUTE_API_KEY",
  "CRAZYROUTER_API_KEY",
  "CRAZYROUTE_BASE_URL",
  "CRAZYROUTER_BASE_URL",
] as const

function resetRoutingState() {
  ;(globalThis as { __aiEntryProviderRoutingStateV1__?: unknown }).__aiEntryProviderRoutingStateV1__ =
    undefined
}

async function withProviderEnv<T>(
  overrides: Partial<Record<(typeof PROVIDER_ENV_KEYS)[number], string>>,
  run: () => Promise<T>,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of PROVIDER_ENV_KEYS) {
    previous.set(key, process.env[key])
    process.env[key] = ""
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value
  }

  resetRoutingState()
  try {
    return await run()
  } finally {
    for (const key of PROVIDER_ENV_KEYS) {
      const oldValue = previous.get(key)
      if (typeof oldValue === "string") {
        process.env[key] = oldValue
      } else {
        delete process.env[key]
      }
    }
    resetRoutingState()
  }
}

function isEquivalentGpt53CodexModel(modelId: string) {
  const normalized = modelId.toLowerCase().replace(/[^a-z0-9]+/g, "")
  return normalized.includes("gpt53codex")
}

async function withMockFetch<T>(
  mock: typeof fetch,
  run: () => Promise<T>,
) {
  const globalScope = globalThis as typeof globalThis & { fetch?: typeof fetch }
  const previous = globalScope.fetch
  globalScope.fetch = mock
  try {
    return await run()
  } finally {
    globalScope.fetch = previous
  }
}

test("selected model fallback: unsupported selected model retries same provider default model", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "aiberm/default-chat-model",
    },
    async () => {
      const attempts: string[] = []

      const result = await executeAiEntryWithProviderFailover(
        async (params) => {
          attempts.push(`${params.providerId}:${params.model}`)
          if (params.model === "aiberm/unsupported-chat-model") {
            throw new Error("not implemented")
          }
          return "ok"
        },
        {
          preferredProviderId: "aiberm",
          preferredModel: "aiberm/unsupported-chat-model",
          forcePreferredProvider: true,
        },
      )

      assert.equal(result.providerId, "aiberm")
      assert.equal(result.model, "aiberm/default-chat-model")
      assert.deepEqual(attempts, [
        "aiberm:aiberm/unsupported-chat-model",
        "aiberm:aiberm/default-chat-model",
      ])
    },
  )
})

test("selected model no extra retry when selected model equals configured default", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "aiberm/default-chat-model",
    },
    async () => {
      const attempts: string[] = []

      const result = await executeAiEntryWithProviderFailover(
        async (params) => {
          attempts.push(`${params.providerId}:${params.model}`)
          return "ok"
        },
        {
          preferredProviderId: "aiberm",
          preferredModel: "aiberm/default-chat-model",
          forcePreferredProvider: true,
        },
      )

      assert.equal(result.providerId, "aiberm")
      assert.equal(result.model, "aiberm/default-chat-model")
      assert.deepEqual(attempts, ["aiberm:aiberm/default-chat-model"])
    },
  )
})

test("fallback chain: selected model -> same provider default -> next provider default", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "aiberm/default-chat-model",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "crazy/default-chat-model",
    },
    async () => {
      const attempts: string[] = []

      const result = await executeAiEntryWithProviderFailover(
        async (params) => {
          attempts.push(`${params.providerId}:${params.model}`)
          if (params.providerId === "aiberm") {
            throw new Error("not implemented")
          }
          return "ok"
        },
        {
          preferredProviderId: "aiberm",
          preferredModel: "aiberm/unsupported-chat-model",
          forcePreferredProvider: false,
        },
      )

      assert.equal(result.providerId, "crazyroute")
      assert.equal(result.model, "crazy/default-chat-model")
      assert.deepEqual(attempts, [
        "aiberm:aiberm/unsupported-chat-model",
        "aiberm:aiberm/default-chat-model",
        "crazyroute:crazy/default-chat-model",
      ])
      assert.deepEqual(result.providerOrder, ["aiberm", "crazyroute"])
    },
  )
})

test("provider order: system defaults no longer auto-inject openrouter", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_PPTOKEN_API_KEY: "test-key-p",
      AI_ENTRY_PPTOKEN_BASE_URL: "https://pptoken.example/v1",
      AI_ENTRY_PPTOKEN_MODEL: "pptoken/default-chat-model",
      AI_ENTRY_OPENROUTER_API_KEY: "test-key-o",
      AI_ENTRY_OPENROUTER_BASE_URL: "https://openrouter.example/v1",
      AI_ENTRY_OPENROUTER_MODEL: "openrouter/default-chat-model",
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "aiberm/default-chat-model",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "crazy/default-chat-model",
    },
    async () => {
      const attempts: string[] = []

      const result = await executeAiEntryWithProviderFailover(async (params) => {
        attempts.push(`${params.providerId}:${params.model}`)
        return params.providerOrder
      })

      assert.equal(result.providerId, "pptoken")
      assert.deepEqual(result.result, ["pptoken", "aiberm", "crazyroute"])
      assert.deepEqual(attempts, ["pptoken:pptoken/default-chat-model"])
    },
  )
})

test("provider order: non-openai system defaults keep only configured fallback providers", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_OPENROUTER_API_KEY: "test-key-o",
      AI_ENTRY_OPENROUTER_BASE_URL: "https://openrouter.example/v1",
      AI_ENTRY_OPENROUTER_MODEL: "openrouter/default-chat-model",
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "aiberm/default-chat-model",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "crazy/default-chat-model",
    },
    async () => {
      const attempts: string[] = []

      const result = await executeAiEntryWithProviderFailover(
        async (params) => {
          attempts.push(`${params.providerId}:${params.model}`)
          return params.providerOrder
        },
        {
          preferredModel: "anthropic/claude-sonnet-4.6",
        },
      )

      assert.equal(result.providerId, "aiberm")
      assert.deepEqual(result.result, ["aiberm", "crazyroute"])
      assert.deepEqual(attempts, ["aiberm:aiberm/default-chat-model"])
    },
  )
})

test("explicit preferred provider ignores degraded routing start state", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_PPTOKEN_API_KEY: "test-key-p",
      AI_ENTRY_PPTOKEN_BASE_URL: "https://pptoken.example/v1",
      AI_ENTRY_PPTOKEN_MODEL: "gpt-5.4",
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "gpt-5.4",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "gpt-5.4",
    },
    async () => {
      const routingState = globalThis as {
        __aiEntryProviderRoutingStateV1__?: {
          activeIndex: number
          degradedAccessCount: number
        }
      }
      routingState.__aiEntryProviderRoutingStateV1__ = {
        activeIndex: 1,
        degradedAccessCount: 99,
      }

      const attempts: string[] = []
      const result = await executeAiEntryWithProviderFailover(
        async (params) => {
          attempts.push(`${params.providerId}:${params.model}`)
          return "ok"
        },
        {
          preferredProviderId: "pptoken",
          preferredModel: "gpt-5.5",
        },
      )

      assert.equal(result.providerId, "pptoken")
      assert.equal(result.model, "gpt-5.5")
      assert.deepEqual(attempts, ["pptoken:gpt-5.5"])
    },
  )
})

test("provider fallback: pptoken degrades to aiberm then crazyroute", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_PPTOKEN_API_KEY: "test-key-p",
      AI_ENTRY_PPTOKEN_BASE_URL: "https://pptoken.example/v1",
      AI_ENTRY_PPTOKEN_MODEL: "pptoken/default-chat-model",
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "aiberm/default-chat-model",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "crazy/default-chat-model",
    },
    async () => {
      const attempts: string[] = []

      const result = await executeAiEntryWithProviderFailover(async (params) => {
        attempts.push(`${params.providerId}:${params.model}`)
        if (params.providerId === "pptoken" || params.providerId === "aiberm") {
          throw new Error("provider temporarily unavailable")
        }
        return "ok"
      })

      assert.equal(result.providerId, "crazyroute")
      assert.equal(result.result, "ok")
      assert.deepEqual(attempts, [
        "pptoken:pptoken/default-chat-model",
        "aiberm:aiberm/default-chat-model",
        "crazyroute:crazy/default-chat-model",
      ])
    },
  )
})

test("provider order: non-openai models skip pptoken and use aiberm then crazyroute", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_NORMAL_DEFAULT_MODEL: "google/gemini-3-flash-preview",
      AI_ENTRY_PPTOKEN_API_KEY: "test-key-p",
      AI_ENTRY_PPTOKEN_BASE_URL: "https://pptoken.example/v1",
      AI_ENTRY_PPTOKEN_MODEL: "openai/gpt-5.4-mini",
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "google/gemini-3-flash-preview",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "google/gemini-3-flash-preview",
    },
    async () => {
      const attempts: string[] = []

      const result = await executeAiEntryWithProviderFailover(async (params) => {
        attempts.push(`${params.providerId}:${params.model}`)
        return params.providerOrder
      })

      assert.equal(result.providerId, "aiberm")
      assert.deepEqual(result.result, ["aiberm", "crazyroute"])
      assert.deepEqual(attempts, ["aiberm:google/gemini-3-flash-preview"])
      assert.equal(attempts.some((item) => item.startsWith("pptoken:")), false)
    },
  )
})

test("force model across providers: gpt-image-2 matches equivalent provider model ids", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_PPTOKEN_API_KEY: "test-key-p",
      AI_ENTRY_PPTOKEN_BASE_URL: "https://pptoken.example/v1",
      AI_ENTRY_PPTOKEN_MODEL: "gpt-image-2",
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "gpt-image-2",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "gpt-image-2",
    },
    async () => {
      await withMockFetch(
        (async (input) => {
          const rawUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url

          if (rawUrl.includes("pptoken.example")) {
            return new Response(JSON.stringify({ data: [{ id: "openai/gpt-image-2" }] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          }
          if (rawUrl.includes("aiberm.example")) {
            return new Response(JSON.stringify({ data: [{ id: "gpt-image-2" }] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          }
          if (rawUrl.includes("crazy.example")) {
            return new Response(JSON.stringify({ data: [{ id: "OpenAI/GPT Image 2" }] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          }
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }) as typeof fetch,
        async () => {
          const attempts: string[] = []
          const result = await executeAiEntryWithProviderFailover(
            async (params) => {
              attempts.push(`${params.providerId}:${params.model}`)
              if (params.providerId !== "crazyroute") {
                throw new Error("provider unavailable")
              }
              return "ok"
            },
            {
              preferredProviderId: "pptoken",
              preferredModel: "openai/gpt-image-2",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
              directProviderFailoverOnError: true,
            },
          )

          assert.equal(result.providerId, "crazyroute")
          assert.deepEqual(attempts, [
            "pptoken:openai/gpt-image-2",
            "aiberm:gpt-image-2",
            "crazyroute:OpenAI/GPT Image 2",
          ])
        },
      )
    },
  )
})

test("force model across providers: non-openai models stay on aiberm/crazyroute only", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "google/gemini-3-flash-preview",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "google/gemini-3-flash-preview",
      AI_ENTRY_PPTOKEN_API_KEY: "test-key-p",
      AI_ENTRY_PPTOKEN_BASE_URL: "https://pptoken.example/v1",
      AI_ENTRY_PPTOKEN_MODEL: "openai/gpt-5.4-mini",
    },
    async () => {
      await withMockFetch(
        (async (input) => {
          const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
          if (rawUrl.includes("crazy.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "google/gemini-3-flash-preview" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("aiberm.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "gemini-3-flash-preview" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }) as typeof fetch,
        async () => {
          const attempts: string[] = []

          const result = await executeAiEntryWithProviderFailover(
            async (params) => {
              attempts.push(`${params.providerId}:${params.model}`)
              if (params.providerId === "aiberm") {
                throw new Error("not implemented")
              }
              if (params.providerId === "crazyroute") {
                assert.equal(params.model.toLowerCase().includes("gemini"), true)
                return "ok"
              }
              throw new Error(`unexpected provider:${params.providerId}`)
            },
            {
              preferredProviderId: "aiberm",
              preferredModel: "google/gemini-3-flash-preview",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
              directProviderFailoverOnError: true,
            },
          )

          assert.equal(result.providerId, "crazyroute")
          assert.equal(attempts.some((item) => item.startsWith("pptoken:")), false)
          assert.deepEqual(
            attempts.map((item) => item.split(":")[0]),
            ["aiberm", "crazyroute"],
          )
        },
      )
    },
  )
})

test("force model across providers: aiberm prefers catalog runtime id for sonnet 4.6", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "claude-sonnet-4.5",
    },
    async () => {
      await withMockFetch(
        (async () =>
          new Response(
            JSON.stringify({
              data: [
                { id: "anthropic/claude-sonnet-4.6" },
                { id: "claude-sonnet-4-6" },
                { id: "claude-sonnet-4.6-thinking" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )) as typeof fetch,
        async () => {
          const attempts: string[] = []

          const result = await executeAiEntryWithProviderFailover(
            async (params) => {
              attempts.push(`${params.providerId}:${params.model}`)
              return "ok"
            },
            {
              preferredProviderId: "aiberm",
              preferredModel: "claude-sonnet-4.6",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
            },
          )

          assert.equal(result.providerId, "aiberm")
          assert.equal(result.model, "claude-sonnet-4-6")
          assert.deepEqual(attempts, ["aiberm:claude-sonnet-4-6"])
        },
      )
    },
  )
})

test("consulting model fallback: aiberm keeps gpt-5.3-codex across providers", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.4",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "openai/gpt-5.3",
    },
    async () => {
      await withMockFetch(
        (async (input) => {
          const rawUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url

          if (rawUrl.includes("aiberm.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "openai/gpt-5.3-codex" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("crazy.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "openai/gpt-5.3-codex" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }) as typeof fetch,
        async () => {
          const attempts: string[] = []
          const result = await executeAiEntryWithProviderFailover(
            async (params) => {
              attempts.push(`${params.providerId}:${params.model}`)
              if (params.providerId === "aiberm") {
                throw new Error("not implemented")
              }
              if (params.providerId === "crazyroute") {
                return "ok"
              }
              throw new Error(`unexpected provider:${params.providerId}`)
            },
            {
              preferredProviderId: "aiberm",
              preferredModel: "openai/gpt-5.3-codex",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
            },
          )

          assert.equal(result.providerId, "crazyroute")
          const [firstProvider, firstModel] = attempts[0]?.split(":") || []
          assert.equal(firstProvider, "aiberm")
          assert.equal(isEquivalentGpt53CodexModel(firstModel || ""), true)
        },
      )
    },
  )
})

test("direct provider failover: skip same-provider model retries on error", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.4",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "openai/gpt-5.3",
    },
    async () => {
      await withMockFetch(
        (async (input) => {
          const rawUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url

          if (rawUrl.includes("aiberm.example")) {
            return new Response(
              JSON.stringify({
                data: [
                  { id: "anthropic/claude-sonnet-4.6" },
                  { id: "openai/gpt-5.3-codex" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("crazy.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "openai/gpt-5.3-codex" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }) as typeof fetch,
        async () => {
          const attempts: string[] = []
          const result = await executeAiEntryWithProviderFailover(
            async (params) => {
              attempts.push(`${params.providerId}:${params.model}`)
              if (params.providerId === "aiberm") {
                throw new Error("not implemented")
              }
              if (params.providerId === "crazyroute") {
                return "ok"
              }
              throw new Error(`unexpected provider:${params.providerId}`)
            },
            {
              preferredProviderId: "aiberm",
              preferredModel: "openai/gpt-5.3-codex",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
              directProviderFailoverOnError: true,
            },
          )

          assert.equal(result.providerId, "crazyroute")
          assert.deepEqual(
            attempts.map((item) => item.split(":")[0]),
            ["aiberm", "crazyroute"],
          )
          assert.equal(
            attempts.every((item) => isEquivalentGpt53CodexModel(item.split(":")[1] || "")),
            true,
          )
        },
      )
    },
  )
})

test("policy errors skip same-provider model variants and switch provider", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.4",
      AI_ENTRY_CRAZYROUTE_API_KEY: "test-key-c",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "openai/gpt-5.4",
    },
    async () => {
      await withMockFetch(
        (async (input) => {
          const rawUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url

          if (rawUrl.includes("aiberm.example")) {
            return new Response(
              JSON.stringify({
                data: [
                  { id: "openai/gpt-5.3-codex" },
                  { id: "gpt-5-3-codex" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("crazy.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "openai/gpt-5.3-codex" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }) as typeof fetch,
        async () => {
      const attempts: string[] = []
      const result = await executeAiEntryWithProviderFailover(async (params) => {
        attempts.push(`${params.providerId}:${params.model}`)
        if (params.providerId === "aiberm") {
          const policyError = new Error(
            "The request is prohibited due to a violation of provider Terms Of Service.",
          ) as Error & { statusCode?: number }
          policyError.statusCode = 403
          throw policyError
        }
        if (params.providerId === "crazyroute") {
          assert.equal(isEquivalentGpt53CodexModel(params.model), true)
          return "wrapped_ok"
        }
        throw new Error(`unexpected provider:${params.providerId}`)
      }, {
        preferredProviderId: "aiberm",
        preferredModel: "openai/gpt-5.3-codex",
        forceModelAcrossProviders: true,
        disableSameProviderModelFallback: true,
      })

      assert.equal(result.providerId, "crazyroute")
      assert.equal(result.result, "wrapped_ok")
      assert.equal(attempts[0]?.startsWith("aiberm:"), true)
      assert.equal(attempts[1]?.startsWith("crazyroute:"), true)
        },
      )
    },
  )
})

test("explicit provider configs allow enterprise runtime without env providers", async () => {
  const attempts: string[] = []

  const result = await executeAiEntryWithProviderFailover(
    async (params) => {
      attempts.push(`${params.providerId}:${params.model}`)
      return "ok"
    },
    {
      preferredProviderId: "enterprise-qwen-official",
      preferredModel: "qwen-max",
      providerConfigs: [
        {
          id: "enterprise-qwen-official",
          apiKey: "enterprise-secret",
          baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          model: "qwen-max",
        },
      ],
      forcePreferredProvider: true,
    },
  )

  assert.equal(result.providerId, "enterprise-qwen-official")
  assert.equal(result.model, "qwen-max")
  assert.deepEqual(result.providerOrder, ["enterprise-qwen-official"])
  assert.deepEqual(attempts, ["enterprise-qwen-official:qwen-max"])
})

test("explicit provider configs still allow manually configured openrouter runtimes", async () => {
  const attempts: string[] = []

  const result = await executeAiEntryWithProviderFailover(
    async (params) => {
      attempts.push(`${params.providerId}:${params.model}`)
      return "ok"
    },
    {
      preferredProviderId: "openrouter",
      preferredModel: "claude-sonnet-4.6",
      providerConfigs: [
        {
          id: "openrouter",
          apiKey: "manual-openrouter-secret",
          baseURL: "https://openrouter.ai/api/v1",
          model: "claude-sonnet-4.6",
        },
      ],
      forcePreferredProvider: true,
    },
  )

  assert.equal(result.providerId, "openrouter")
  assert.equal(result.model, "claude-sonnet-4.6")
  assert.deepEqual(result.providerOrder, ["openrouter"])
  assert.deepEqual(attempts, ["openrouter:claude-sonnet-4.6"])
})
