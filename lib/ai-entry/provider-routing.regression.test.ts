import assert from "node:assert/strict"
import test from "node:test"

import { executeAiEntryWithProviderFailover } from "./provider-routing"

const PROVIDER_ENV_KEYS = [
  "AI_ENTRY_AIBERM_API_KEY",
  "AI_ENTRY_AIBERM_BASE_URL",
  "AI_ENTRY_AIBERM_MODEL",
  "AI_ENTRY_CRAZYROUTE_API_KEY",
  "AI_ENTRY_CRAZYROUTE_BASE_URL",
  "AI_ENTRY_CRAZYROUTE_MODEL",
  "AI_ENTRY_OPENROUTER_API_KEY",
  "AI_ENTRY_OPENROUTER_BASE_URL",
  "AI_ENTRY_OPENROUTER_MODEL",
  "AIBERM_API_KEY",
  "AIBERM_BASE_URL",
  "CRAZYROUTE_API_KEY",
  "CRAZYROUTER_API_KEY",
  "CRAZYROUTE_BASE_URL",
  "CRAZYROUTER_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
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

function isEquivalentSonnet46Model(modelId: string) {
  const normalized = modelId.toLowerCase().replace(/[^a-z0-9]+/g, "")
  return normalized.includes("claudesonnet46")
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

test("force model across providers: fuzzy match model id for openrouter", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.4",
      AI_ENTRY_OPENROUTER_API_KEY: "test-key-o",
      AI_ENTRY_OPENROUTER_BASE_URL: "https://openrouter.example/v1",
      AI_ENTRY_OPENROUTER_MODEL: "openai/gpt-5.3",
    },
    async () => {
      await withMockFetch(
        (async (input) => {
          const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
          if (rawUrl.includes("openrouter.example")) {
            return new Response(
              JSON.stringify({
                data: [
                  { id: "anthropic/claude-sonnet-4.6" },
                  { id: "openai/gpt-5.3" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("aiberm.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "claude-sonnet-4-6" }],
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
              if (params.providerId === "openrouter") {
                assert.equal(params.model.includes("/"), true)
                assert.equal(isEquivalentSonnet46Model(params.model), true)
                return "ok"
              }
              throw new Error(`unexpected provider:${params.providerId}`)
            },
            {
              preferredProviderId: "aiberm",
              preferredModel: "claude-sonnet-4-6",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
            },
          )

          assert.equal(result.providerId, "openrouter")
          assert.equal(isEquivalentSonnet46Model(result.model), true)
          assert.equal(attempts.some((item) => item.startsWith("openrouter:")), true)
        },
      )
    },
  )
})

test("consulting sonnet fallback: aiberm prefers anthropic/claude-sonnet-4.6", async () => {
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
                data: [{ id: "claude-sonnet-4-6" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("crazy.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "claude-sonnet-4-6" }],
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
              preferredModel: "claude-sonnet-4-6",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
            },
          )

          assert.equal(result.providerId, "crazyroute")
          assert.equal(attempts[0], "aiberm:anthropic/claude-sonnet-4.6")
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
                  { id: "claude-sonnet-4-6" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("crazy.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "claude-sonnet-4-6" }],
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
              preferredModel: "claude-sonnet-4-6",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
              directProviderFailoverOnError: true,
            },
          )

          assert.equal(result.providerId, "crazyroute")
          assert.deepEqual(attempts, [
            "aiberm:anthropic/claude-sonnet-4.6",
            "crazyroute:claude-sonnet-4-6",
          ])
        },
      )
    },
  )
})

test("policy errors skip same-provider model variants and switch provider", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_OPENROUTER_API_KEY: "test-key-o",
      AI_ENTRY_OPENROUTER_BASE_URL: "https://openrouter.example/v1",
      AI_ENTRY_OPENROUTER_MODEL: "openai/gpt-5.3",
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

          if (rawUrl.includes("openrouter.example")) {
            return new Response(
              JSON.stringify({
                data: [
                  { id: "anthropic/claude-sonnet-4.6" },
                  { id: "claude-sonnet-4.6" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          }

          if (rawUrl.includes("crazy.example")) {
            return new Response(
              JSON.stringify({
                data: [{ id: "claude-sonnet-4-6" }],
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
              if (params.providerId === "openrouter") {
                const policyError = new Error(
                  "The request is prohibited due to a violation of provider Terms Of Service.",
                ) as Error & { statusCode?: number }
                policyError.statusCode = 403
                throw policyError
              }
              if (params.providerId === "crazyroute") {
                assert.equal(isEquivalentSonnet46Model(params.model), true)
                return "ok"
              }
              throw new Error(`unexpected provider:${params.providerId}`)
            },
            {
              preferredProviderId: "openrouter",
              preferredModel: "claude-sonnet-4-6",
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
            },
          )

          assert.equal(result.providerId, "crazyroute")
          assert.equal(result.result, "ok")
          assert.equal(
            attempts.filter((item) => item.startsWith("openrouter:")).length,
            1,
          )
        },
      )
    },
  )
})

test("wrap-around failover: starts from openrouter and wraps back to aiberm", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key-a",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.4",
      AI_ENTRY_OPENROUTER_API_KEY: "test-key-o",
      AI_ENTRY_OPENROUTER_BASE_URL: "https://openrouter.example/v1",
      AI_ENTRY_OPENROUTER_MODEL: "anthropic/claude-sonnet-4.6",
    },
    async () => {
      const warmup = await executeAiEntryWithProviderFailover(async (params) => {
        if (params.providerId === "aiberm") {
          throw new Error("warmup_not_implemented")
        }
        if (params.providerId === "openrouter") {
          return "warmup_ok"
        }
        throw new Error(`unexpected provider:${params.providerId}`)
      })
      assert.equal(warmup.providerId, "openrouter")

      const attempts: string[] = []
      const result = await executeAiEntryWithProviderFailover(async (params) => {
        attempts.push(`${params.providerId}:${params.model}`)
        if (params.providerId === "openrouter") {
          const policyError = new Error(
            "The request is prohibited due to a violation of provider Terms Of Service.",
          ) as Error & { statusCode?: number }
          policyError.statusCode = 403
          throw policyError
        }
        if (params.providerId === "aiberm") {
          return "wrapped_ok"
        }
        throw new Error(`unexpected provider:${params.providerId}`)
      })

      assert.equal(result.providerId, "aiberm")
      assert.equal(result.result, "wrapped_ok")
      assert.equal(attempts[0]?.startsWith("openrouter:"), true)
      assert.equal(attempts[1]?.startsWith("aiberm:"), true)
    },
  )
})

