import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

test("streaming executor treats tool-only runs as usable output", async () => {
  let toolResultPayload: unknown = null

  nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === "ai") {
      return {
        generateText: async () => {
          throw new Error("generateText should not be called in this test")
        },
        streamText: () => ({
          fullStream: (async function* () {
            yield {
              type: "tool-call",
              toolName: "preview_ppt_deck",
              toolCallId: "tool-1",
              args: { prompt: "Build PPT" },
            }
            yield {
              type: "tool-result",
              toolName: "preview_ppt_deck",
              toolCallId: "tool-1",
              result: {
                ok: true,
                previewSessionId: "preview-session-1",
                title: "Deck",
              },
            }
          })(),
          text: Promise.resolve(""),
        }),
      }
    }

    if (request === "@/lib/ai-entry/provider-routing") {
      return {
        executeAiEntryWithProviderFailover: async (
          runner: (providerRun: {
            providerId: "pptoken"
            model: "gpt-5.4"
            attempt: number
            providerOrder: ["pptoken"]
            upgradeProbe?: boolean
            provider: { chat: (model: string) => string }
          }) => Promise<unknown>,
        ) => {
          const result = await runner({
            providerId: "pptoken",
            model: "gpt-5.4",
            attempt: 1,
            providerOrder: ["pptoken"],
            provider: {
              chat: (model: string) => model,
            },
          })

          return {
            result,
            providerId: "pptoken",
            model: "gpt-5.4",
            providerOrder: ["pptoken"],
          }
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const mod = await import(`./ai-entry-executor.ts?tool-only-${Date.now()}`)
    const execution = await mod.runAiEntryConsultingStreaming({
      systemPrompt: "system",
      messages: [{ role: "user", content: "Build a PPT" }],
      selectedTools: {},
      stopWhen: undefined,
      onToolResult: (payload: unknown) => {
        toolResultPayload = payload
      },
    })

    assert.deepEqual(toolResultPayload, {
      toolName: "preview_ppt_deck",
      toolCallId: "tool-1",
      result: {
        ok: true,
        previewSessionId: "preview-session-1",
        title: "Deck",
      },
    })
    assert.equal(execution.providerId, "pptoken")
    assert.equal(execution.model, "gpt-5.4")
    assert.equal(execution.result.accumulated, "")
  } finally {
    nodeModule._load = originalLoad
  }
})
