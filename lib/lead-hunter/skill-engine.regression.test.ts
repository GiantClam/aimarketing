import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

process.env.TAVILY_API_KEY = process.env.TAVILY_API_KEY || "test-tavily-key"
process.env.SERPER_API_KEY = process.env.SERPER_API_KEY || "test-serper-key"
process.env.LEAD_HUNTER_SKILL_MODEL = "test-skill-model"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let writerRequestJsonCalls = 0
let generateTextCalls = 0

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/writer/network") {
    return {
      writerRequestJson: async (url: string) => {
        writerRequestJsonCalls += 1
        if (url.includes("google.serper.dev/search")) {
          return {
            ok: true,
            status: 200,
            data: {
              organic: [
                { title: "Acme Corp", snippet: "Acme sells textile products globally.", link: "https://acme.example.com" },
              ],
            },
          }
        }
        if (url.includes("api.tavily.com/search")) {
          return {
            ok: true,
            status: 200,
            data: {
              results: [
                {
                  title: "Acme Contact",
                  url: "https://acme.example.com/contact",
                  content: "Contact information and leadership clues.",
                },
              ],
            },
          }
        }
        return { ok: true, status: 200, data: {} }
      },
    }
  }

  if (request === "@/lib/writer/aiberm") {
    return {
      generateTextWithWriterModel: async () => {
        generateTextCalls += 1
        return "<think>internal</think>Final customer profile summary."
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let runLeadHunterSkillConversation: (input: {
  advisorType: "company-search" | "contact-mining"
  query: string
  preferredLanguage?: "zh" | "en" | "auto" | null
  conversationId?: string | null
  onSseEvent?: (payload: { event: string; data?: Record<string, unknown> }) => void | Promise<void>
}) => Promise<{
  answer: string
  language: "zh" | "en"
  evidence: Array<{ source_url: string }>
}>
let createLeadHunterSkillSseStream: (input: {
  advisorType: "company-search" | "contact-mining"
  query: string
  conversationId?: string | null
}) => { stream: ReadableStream<Uint8Array>; done: Promise<{ answer: string; evidence: Array<{ source_url: string }> }> }

test.before(async () => {
  ;({ runLeadHunterSkillConversation, createLeadHunterSkillSseStream } = await import("./skill-engine"))
})

test.beforeEach(() => {
  writerRequestJsonCalls = 0
  generateTextCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("workflow_finished event does not expose evidence payload", async () => {
  const events: Array<{ event: string; data?: Record<string, unknown> }> = []

  const result = await runLeadHunterSkillConversation({
    advisorType: "company-search",
    query: "Acme Inc company profile",
    conversationId: "conv-1",
    onSseEvent: (payload) => {
      events.push(payload)
    },
  })

  assert.ok(result.answer.includes("Final customer profile summary."))
  assert.ok(result.evidence.length > 0)
  assert.ok(writerRequestJsonCalls > 0)
  assert.equal(generateTextCalls, 1)

  const workflowFinished = events.find((event) => event.event === "workflow_finished")
  assert.ok(workflowFinished)
  assert.equal(workflowFinished?.data?.evidence, undefined)
  assert.equal(workflowFinished?.data?.evidence_count, result.evidence.length)
})

test("stream output keeps workflow_finished compact while done result keeps evidence", async () => {
  const encoder = new TextDecoder("utf-8")
  const streamRunner = createLeadHunterSkillSseStream({
    advisorType: "contact-mining",
    query: "Acme Inc contacts",
    conversationId: "conv-2",
  })

  const reader = streamRunner.stream.getReader()
  let wire = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    wire += encoder.decode(value, { stream: true })
  }
  wire += encoder.decode()

  const doneResult = await streamRunner.done
  assert.ok(doneResult.evidence.length > 0)
  assert.ok(wire.includes('"event":"workflow_finished"'))
  assert.ok(wire.includes('"evidence_count"'))
  assert.ok(!wire.includes('"evidence":'))
})

test("search cache avoids duplicate provider calls for same query", async () => {
  const previousCacheTtl = process.env.LEAD_HUNTER_SEARCH_CACHE_TTL_MS
  const previousMaxQueries = process.env.LEAD_HUNTER_MAX_SEARCH_QUERIES

  process.env.LEAD_HUNTER_SEARCH_CACHE_TTL_MS = "120000"
  process.env.LEAD_HUNTER_MAX_SEARCH_QUERIES = "1"
  const query = `Acme Inc company profile cache-${Date.now()}`

  try {
    await runLeadHunterSkillConversation({
      advisorType: "company-search",
      query,
      conversationId: "conv-cache-1",
    })
    const firstRunCalls = writerRequestJsonCalls
    assert.ok(firstRunCalls >= 1)

    writerRequestJsonCalls = 0
    await runLeadHunterSkillConversation({
      advisorType: "company-search",
      query,
      conversationId: "conv-cache-2",
    })
    assert.equal(writerRequestJsonCalls, 0)
  } finally {
    if (previousCacheTtl === undefined) {
      delete process.env.LEAD_HUNTER_SEARCH_CACHE_TTL_MS
    } else {
      process.env.LEAD_HUNTER_SEARCH_CACHE_TTL_MS = previousCacheTtl
    }
    if (previousMaxQueries === undefined) {
      delete process.env.LEAD_HUNTER_MAX_SEARCH_QUERIES
    } else {
      process.env.LEAD_HUNTER_MAX_SEARCH_QUERIES = previousMaxQueries
    }
  }
})

test("preferred language overrides query language detection", async () => {
  const result = await runLeadHunterSkillConversation({
    advisorType: "company-search",
    query: "SWAG GOLF https://swag.golf/",
    preferredLanguage: "zh",
    conversationId: "conv-lang-1",
  })

  assert.equal(result.language, "zh")
})

test("default language stays Chinese for English company query", async () => {
  const result = await runLeadHunterSkillConversation({
    advisorType: "company-search",
    query: "SWAG GOLF official website and customer profile",
    conversationId: "conv-lang-default-zh",
  })

  assert.equal(result.language, "zh")
})
