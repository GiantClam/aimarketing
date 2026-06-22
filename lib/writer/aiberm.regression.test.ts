import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

const requestUrls: string[] = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/writer/network") {
    return {
      writerRequestJson: async (url: string, init?: RequestInit) => {
        requestUrls.push(url)
        if (url.startsWith("https://aiberm.example/v1")) {
          return {
            status: 429,
            ok: false,
            data: { error: { message: "aiberm quota exceeded" } },
            text: '{"error":{"message":"aiberm quota exceeded"}}',
          }
        }

        if (url.startsWith("https://crazyroute.example/v1")) {
          return {
            status: 429,
            ok: false,
            data: { error: { message: "crazyroute quota exceeded" } },
            text: '{"error":{"message":"crazyroute quota exceeded"}}',
          }
        }

        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {}
        if (Array.isArray(body.tools) && body.tools.length > 0) {
          return {
            status: 200,
            ok: true,
            data: {
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        function: {
                          name: "extract_writer_brief",
                          arguments: JSON.stringify({ topic: "pptoken fallback" }),
                        },
                      },
                    ],
                  },
                },
              ],
            },
            text: "",
          }
        }

        return {
          status: 200,
          ok: true,
          data: {
            choices: [
              {
                message: {
                  content: "pptoken fallback succeeded",
                },
              },
            ],
          },
          text: "",
        }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let generateTextWithWriterModel: typeof import("./aiberm").generateTextWithWriterModel
let generateStructuredObjectWithWriterModel: typeof import("./aiberm").generateStructuredObjectWithWriterModel

test.before(async () => {
  process.env.AIBERM_API_KEY = "aiberm-key"
  process.env.AIBERM_BASE_URL = "https://aiberm.example/v1"
  process.env.CRAZYROUTE_API_KEY = "crazyroute-key"
  process.env.CRAZYROUTE_BASE_URL = "https://crazyroute.example/v1"
  process.env.PPTOKEN_API_KEY = "pptoken-key"
  process.env.PPTOKEN_BASE_URL = "https://pptoken.example/v1"

  const mod = await import("./aiberm")
  generateTextWithWriterModel = mod.generateTextWithWriterModel
  generateStructuredObjectWithWriterModel = mod.generateStructuredObjectWithWriterModel
})

test.beforeEach(() => {
  requestUrls.length = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("writer text falls back to pptoken after aiberm and crazyroute fail", async () => {
  const result = await generateTextWithWriterModel("system", "user", "gpt-5.4")

  assert.equal(result, "pptoken fallback succeeded")
  assert.deepEqual(requestUrls, [
    "https://aiberm.example/v1/chat/completions",
    "https://crazyroute.example/v1/chat/completions",
    "https://pptoken.example/v1/chat/completions",
  ])
})

test("writer structured fallback reaches pptoken after upstream quota errors", async () => {
  const result = await generateStructuredObjectWithWriterModel({
    systemPrompt: "system",
    userPrompt: "user",
    model: "gpt-5.4",
    toolName: "extract_writer_brief",
    jsonSchema: { type: "object" },
  })

  assert.deepEqual(result, { topic: "pptoken fallback" })
  assert.deepEqual(requestUrls, [
    "https://aiberm.example/v1/chat/completions",
    "https://crazyroute.example/v1/chat/completions",
    "https://pptoken.example/v1/chat/completions",
  ])
})
