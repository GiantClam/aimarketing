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

