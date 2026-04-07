import assert from "node:assert/strict"
import test from "node:test"

import { getAiEntryModelCatalog } from "./model-catalog"

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
  "AI_ENTRY_MODEL_RECENT_DAYS",
  "AIBERM_API_KEY",
  "AIBERM_BASE_URL",
  "CRAZYROUTE_API_KEY",
  "CRAZYROUTER_API_KEY",
  "CRAZYROUTE_BASE_URL",
  "CRAZYROUTER_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
] as const

function resetCatalogState() {
  ;(globalThis as { __aiEntryModelCatalogCacheV2__?: unknown }).__aiEntryModelCatalogCacheV2__ =
    undefined
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

  resetCatalogState()
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
    resetCatalogState()
  }
}

test("model catalog selects configured default model when /models omits it", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "aiberm/image-model", name: "Image Model" },
            { id: "aiberm/audio-model", name: "Audio Model" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog()
        assert.equal(catalog.providerId, "aiberm")
        assert.equal(catalog.selectedModelId, "openai/gpt-5.3")
        assert.equal(catalog.models[0]?.id, "openai/gpt-5.3")
        assert.equal(catalog.models.length, 1)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog does not duplicate configured default model when already present", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "openai/gpt-5.3", name: "GPT 5.3" },
            { id: "openai/gpt-5.4", name: "GPT 5.4" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog()
        assert.equal(catalog.selectedModelId, "openai/gpt-5.3")
        assert.equal(
          catalog.models.filter((item) => item.id === "openai/gpt-5.3").length,
          1,
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog keeps high-tier model families and prioritized order", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "meta/llama-4-maverick", name: "Llama Maverick" },
            { id: "openai/gpt-5.4", name: "GPT 5.4" },
            { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5" },
            { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
            { id: "openai/text-embedding-3-large", name: "Embedding 3 Large" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: null })
        assert.deepEqual(
          catalog.modelGroups.map((group) => group.family),
          ["anthropic", "openai", "gemini"],
        )
        assert.equal(
          catalog.models.some((item) => item.id === "openai/text-embedding-3-large"),
          false,
        )
        assert.equal(
          catalog.models.some((item) => item.id === "meta/llama-4-maverick"),
          false,
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog recent-year filter excludes old models when created is present", async () => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const oldSeconds = nowSeconds - 800 * 24 * 60 * 60

  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "openai/gpt-5.4", name: "GPT 5.4", created: nowSeconds },
            { id: "openai/gpt-5.3", name: "GPT 5.3", created: oldSeconds },
            { id: "anthropic/claude-4.5", name: "Claude 4.5" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: 365 })
        assert.equal(catalog.models.some((item) => item.id === "openai/gpt-5.3"), false)
        assert.equal(catalog.models.some((item) => item.id === "openai/gpt-5.4"), true)
        assert.equal(catalog.models.some((item) => item.id === "anthropic/claude-4.5"), true)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog strict recent filter excludes models without created timestamp", async () => {
  const nowSeconds = Math.floor(Date.now() / 1000)

  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "openai/gpt-5.4", name: "GPT 5.4", created: nowSeconds },
            { id: "anthropic/claude-4.5", name: "Claude 4.5" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: 365, recentStrict: true })
        assert.equal(catalog.models.some((item) => item.id === "openai/gpt-5.4"), true)
        assert.equal(catalog.models.some((item) => item.id === "anthropic/claude-4.5"), false)
        assert.equal(catalog.recentStrict, true)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog falls back to unfiltered high-tier chat models when recent filter is empty in non-strict mode", async () => {
  const oldSeconds = Math.floor(Date.now() / 1000) - 800 * 24 * 60 * 60

  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.4",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "openai/gpt-5.4", name: "GPT 5.4", created: oldSeconds },
            { id: "anthropic/claude-4.5", name: "Claude 4.5", created: oldSeconds },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: 365, recentStrict: false })
        assert.equal(catalog.models.length, 2)
        assert.deepEqual(
          catalog.modelGroups.map((group) => group.family),
          ["anthropic", "openai"],
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog filters out non-target provider families under high-tier policy", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "qwen/qwen-max", name: "Qwen Max" },
            { id: "minimax/minimax-m1", name: "MiniMax M1" },
            { id: "zhipu/glm-4.5", name: "GLM 4.5" },
            { id: "moonshotai/kimi-k2", name: "Kimi K2" },
            { id: "openai/gpt-5.3", name: "GPT 5.3" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: null })
        assert.deepEqual(
          catalog.modelGroups.map((group) => group.family),
          ["openai"],
        )
        assert.equal(catalog.models.some((item) => item.id === "openai/gpt-5.3"), true)
        assert.equal(catalog.models.some((item) => item.id === "qwen/qwen-max"), false)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog infers target families from bare ids and keeps only high-tier versions", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "gpt-5.4-mini",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "gpt-5.4-mini", owned_by: "custom" },
            { id: "claude-opus-4-6", owned_by: "custom" },
            { id: "gemini-3-flash", owned_by: "custom" },
            { id: "qwen3-vl-plus", owned_by: "custom" },
            { id: "minimax-m2.7", owned_by: "custom" },
            { id: "glm-4.5-air", owned_by: "custom" },
            { id: "kimi-k2", owned_by: "custom" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: null })
        assert.deepEqual(
          catalog.modelGroups.map((group) => group.family),
          ["anthropic", "openai", "gemini"],
        )
        assert.equal(catalog.models.some((item) => item.id === "gpt-5.4-mini"), true)
        assert.equal(catalog.models.some((item) => item.id === "claude-opus-4-6"), true)
        assert.equal(catalog.models.some((item) => item.id === "gemini-3-flash"), true)
        assert.equal(catalog.models.some((item) => item.id === "qwen3-vl-plus"), false)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog keeps canonical bare id when provider and separator variants coexist", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "gpt-5.4-mini",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "gpt-5.4-mini", owned_by: "custom" },
            { id: "openai/gpt-5-4-mini", owned_by: "custom" },
            { id: "anthropic/claude-sonnet-4.6", owned_by: "custom" },
            { id: "claude-sonnet-4.6", owned_by: "custom" },
            { id: "claude-sonnet-4-6", owned_by: "custom" },
            { id: "openai/gpt-5.4-nano", owned_by: "custom" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: null })
        assert.equal(catalog.models.some((item) => item.id === "gpt-5.4-mini"), true)
        assert.equal(
          catalog.models.some((item) => item.id === "openai/gpt-5-4-mini"),
          false,
        )
        assert.equal(catalog.models.some((item) => item.id === "claude-sonnet-4-6"), true)
        assert.equal(
          catalog.models.some((item) => item.id === "claude-sonnet-4.6"),
          false,
        )
        assert.equal(
          catalog.models.some((item) => item.id === "anthropic/claude-sonnet-4.6"),
          false,
        )
        assert.equal(
          catalog.models.some((item) => item.id === "openai/gpt-5.4-nano"),
          true,
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog dedupes provider and separator variants generically across high-tier families", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "test-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "gpt-5-3",
    },
    async () => {
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "openai/gpt-5.3", owned_by: "custom" },
            { id: "gpt-5-3", owned_by: "custom" },
            { id: "google/gemini-3.0-pro", owned_by: "custom" },
            { id: "gemini-3-0-pro", owned_by: "custom" },
            { id: "anthropic/claude-opus-4.5", owned_by: "custom" },
            { id: "claude-opus-4-5", owned_by: "custom" },
          ],
        }),
      })) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: null })

        assert.equal(catalog.models.some((item) => item.id === "gpt-5-3"), true)
        assert.equal(catalog.models.some((item) => item.id === "openai/gpt-5.3"), false)

        assert.equal(catalog.models.some((item) => item.id === "gemini-3-0-pro"), true)
        assert.equal(
          catalog.models.some((item) => item.id === "google/gemini-3.0-pro"),
          false,
        )

        assert.equal(catalog.models.some((item) => item.id === "claude-opus-4-5"), true)
        assert.equal(
          catalog.models.some((item) => item.id === "anthropic/claude-opus-4.5"),
          false,
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog falls back to crazyroute when aiberm is unavailable", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "aiberm-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
      AI_ENTRY_CRAZYROUTE_API_KEY: "crazy-key",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "claude-sonnet-4-6",
    },
    async () => {
      const calls: string[] = []
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async (
        input: RequestInfo | URL,
      ) => {
        const url = String(input)
        calls.push(url)

        if (url.startsWith("https://aiberm.example/v1/models")) {
          return {
            ok: false,
            status: 503,
            text: async () => "aiberm unavailable",
            json: async () => ({}),
          } as Response
        }

        if (url.startsWith("https://crazy.example/v1/models")) {
          return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({
              data: [{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }],
            }),
          } as Response
        }

        return {
          ok: false,
          status: 404,
          text: async () => "not found",
          json: async () => ({}),
        } as Response
      }) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: null })
        assert.equal(catalog.providerId, "crazyroute")
        assert.equal(catalog.models.some((item) => item.id === "claude-sonnet-4-6"), true)
        assert.equal(calls[0]?.includes("https://aiberm.example/v1/models"), true)
        assert.equal(calls.some((item) => item.includes("https://crazy.example/v1/models")), true)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})

test("model catalog falls back to openrouter when aiberm and crazyroute are unavailable", async () => {
  await withProviderEnv(
    {
      AI_ENTRY_AIBERM_API_KEY: "aiberm-key",
      AI_ENTRY_AIBERM_BASE_URL: "https://aiberm.example/v1",
      AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.3",
      AI_ENTRY_CRAZYROUTE_API_KEY: "crazy-key",
      AI_ENTRY_CRAZYROUTE_BASE_URL: "https://crazy.example/v1",
      AI_ENTRY_CRAZYROUTE_MODEL: "claude-sonnet-4-6",
      AI_ENTRY_OPENROUTER_API_KEY: "openrouter-key",
      AI_ENTRY_OPENROUTER_BASE_URL: "https://openrouter.example/v1",
      AI_ENTRY_OPENROUTER_MODEL: "openai/gpt-5.4-mini",
    },
    async () => {
      const calls: string[] = []
      const originalFetch = globalThis.fetch
      ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async (
        input: RequestInfo | URL,
      ) => {
        const url = String(input)
        calls.push(url)

        if (url.startsWith("https://aiberm.example/v1/models")) {
          return {
            ok: false,
            status: 503,
            text: async () => "aiberm unavailable",
            json: async () => ({}),
          } as Response
        }

        if (url.startsWith("https://crazy.example/v1/models")) {
          return {
            ok: false,
            status: 502,
            text: async () => "crazyroute unavailable",
            json: async () => ({}),
          } as Response
        }

        if (url.startsWith("https://openrouter.example/v1/models")) {
          return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({
              data: [{ id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini" }],
            }),
          } as Response
        }

        return {
          ok: false,
          status: 404,
          text: async () => "not found",
          json: async () => ({}),
        } as Response
      }) as typeof fetch

      try {
        const catalog = await getAiEntryModelCatalog({ onlyRecentDays: null })
        assert.equal(catalog.providerId, "openrouter")
        assert.equal(catalog.models.some((item) => item.id === "openai/gpt-5.4-mini"), true)

        const modelCalls = calls.filter((item) => item.endsWith("/models"))
        assert.deepEqual(modelCalls, [
          "https://aiberm.example/v1/models",
          "https://crazy.example/v1/models",
          "https://openrouter.example/v1/models",
        ])
      } finally {
        globalThis.fetch = originalFetch
      }
    },
  )
})
