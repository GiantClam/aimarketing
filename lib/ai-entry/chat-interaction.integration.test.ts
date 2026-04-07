import assert from "node:assert/strict"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import test from "node:test"

import { generateText } from "ai"

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

function readRequestJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ""
    req.setEncoding("utf8")
    req.on("data", (chunk) => {
      raw += chunk
    })
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        resolve(parsed)
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function json(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(payload))
}

async function withMockOpenAiServer<T>(
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    helpers: { readJsonBody: () => Promise<Record<string, unknown>> },
  ) => Promise<void>,
  run: (baseUrl: string) => Promise<T>,
) {
  const server = createServer((req, res) => {
    void handler(req, res, {
      readJsonBody: () => readRequestJson(req),
    }).catch((error) => {
      json(res, 500, {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("mock_server_address_unavailable")
  }

  const baseUrl = `http://127.0.0.1:${address.port}/v1`

  try {
    return await run(baseUrl)
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}

test("chat interaction: selected model fallback to default model in real completion call", async () => {
  const unsupportedModel = "aiberm/unsupported-chat-model"
  const defaultModel = "aiberm/default-chat-model"
  const requestedModels: string[] = []

  await withMockOpenAiServer(
    async (req, res, helpers) => {
      if (!req.url) {
        json(res, 404, { error: { message: "not found" } })
        return
      }

      if (req.method === "GET" && req.url.startsWith("/v1/models")) {
        json(res, 200, {
          data: [
            { id: unsupportedModel, name: "Unsupported Chat Model" },
            { id: defaultModel, name: "Default Chat Model" },
          ],
        })
        return
      }

      if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
        const body = await helpers.readJsonBody()
        const model = typeof body.model === "string" ? body.model : ""
        requestedModels.push(model)

        if (model === unsupportedModel) {
          json(res, 501, {
            error: {
              message: "not implemented",
              type: "not_implemented",
            },
          })
          return
        }

        if (model === defaultModel) {
          json(res, 200, {
            id: "chatcmpl-test",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: defaultModel,
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "smoke test passed",
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 3,
              total_tokens: 13,
            },
          })
          return
        }

        json(res, 400, {
          error: {
            message: `unexpected model: ${model}`,
          },
        })
        return
      }

      json(res, 404, {
        error: {
          message: `${req.method || "GET"} ${req.url}`,
        },
      })
    },
    async (baseUrl) => {
      await withProviderEnv(
        {
          AI_ENTRY_AIBERM_API_KEY: "test-key",
          AI_ENTRY_AIBERM_BASE_URL: baseUrl,
          AI_ENTRY_AIBERM_MODEL: defaultModel,
        },
        async () => {
          const execution = await executeAiEntryWithProviderFailover(
            async (providerRun) => {
              const result = await generateText({
                model: providerRun.provider.chat(providerRun.model),
                messages: [{ role: "user", content: "Reply with smoke test passed." }],
              })
              return result.text.trim()
            },
            {
              preferredProviderId: "aiberm",
              preferredModel: unsupportedModel,
            },
          )

          assert.equal(execution.providerId, "aiberm")
          assert.equal(execution.model, defaultModel)
          assert.equal(execution.result, "smoke test passed")
        },
      )
    },
  )

  const unsupportedCalls = requestedModels.filter((item) => item === unsupportedModel).length
  const defaultCalls = requestedModels.filter((item) => item === defaultModel).length
  assert.ok(unsupportedCalls >= 1)
  assert.equal(defaultCalls, 1)
  assert.equal(requestedModels[requestedModels.length - 1], defaultModel)
})

test("chat interaction: consulting mode keeps sonnet model across provider fallback", async () => {
  const lockedModel = "claude-sonnet-4-6"
  const requested: Array<{ provider: string; model: string }> = []

  await withMockOpenAiServer(
    async (req, res, helpers) => {
      if (!req.url) {
        json(res, 404, { error: { message: "not found" } })
        return
      }

      if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
        const body = await helpers.readJsonBody()
        const model = typeof body.model === "string" ? body.model : ""
        const authHeader =
          typeof req.headers.authorization === "string"
            ? req.headers.authorization
            : ""
        const provider = authHeader.includes("aiberm-key")
          ? "aiberm"
          : authHeader.includes("crazy-key")
            ? "crazyroute"
            : "unknown"

        requested.push({ provider, model })

        if (provider === "aiberm") {
          json(res, 501, {
            error: {
              message: "not implemented",
              type: "not_implemented",
            },
          })
          return
        }

        if (provider === "crazyroute" && model === lockedModel) {
          json(res, 200, {
            id: "chatcmpl-test-locked",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: lockedModel,
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "locked sonnet flow passed",
                },
              },
            ],
          })
          return
        }

        json(res, 400, {
          error: {
            message: `unexpected provider/model: ${provider}/${model}`,
          },
        })
        return
      }

      json(res, 404, {
        error: {
          message: `${req.method || "GET"} ${req.url}`,
        },
      })
    },
    async (baseUrl) => {
      await withProviderEnv(
        {
          AI_ENTRY_AIBERM_API_KEY: "aiberm-key",
          AI_ENTRY_AIBERM_BASE_URL: baseUrl,
          AI_ENTRY_AIBERM_MODEL: "openai/gpt-5.4",
          AI_ENTRY_CRAZYROUTE_API_KEY: "crazy-key",
          AI_ENTRY_CRAZYROUTE_BASE_URL: baseUrl,
          AI_ENTRY_CRAZYROUTE_MODEL: "openai/gpt-5.3",
        },
        async () => {
          const execution = await executeAiEntryWithProviderFailover(
            async (providerRun) => {
              const result = await generateText({
                model: providerRun.provider.chat(providerRun.model),
                messages: [{ role: "user", content: "Reply with locked sonnet flow passed." }],
              })
              return result.text.trim()
            },
            {
              preferredProviderId: "aiberm",
              preferredModel: lockedModel,
              forceModelAcrossProviders: true,
              disableSameProviderModelFallback: true,
            },
          )

          assert.equal(execution.providerId, "crazyroute")
          assert.equal(execution.model, lockedModel)
          assert.equal(execution.result, "locked sonnet flow passed")
        },
      )
    },
  )

  assert.ok(requested.length >= 2)
  assert.equal(requested[0]?.provider, "aiberm")
  assert.equal(requested[0]?.model, lockedModel)
  assert.equal(requested.some((item) => item.provider === "crazyroute"), true)
  assert.equal(requested.every((item) => item.model === lockedModel), true)
})


