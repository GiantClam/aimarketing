import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load
const originalFetch = globalThis.fetch

type AuthResult =
  | { user: { id: number; enterpriseId: number; enterpriseStatus: string } }
  | { response: { status: number; body: unknown } }

type ProviderConfig = {
  apiKey: string
  baseURL: string
  model: string
  headers?: Record<string, string>
}

const authed: AuthResult = {
  user: { id: 7, enterpriseId: 3, enterpriseStatus: "active" },
}

let authResult: AuthResult = authed
let providerConfigResult: ProviderConfig | null = {
  apiKey: "server-secret",
  baseURL: "https://llm.example.com/v1",
  model: "server-model",
}

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          status: init?.status || 200,
          body,
        }),
      },
    }
  }

  if (request === "@/lib/auth/guards") {
    return { requireSessionUser: async () => authResult }
  }

  if (request === "@/lib/ai-entry/provider-routing") {
    return { getAiEntryCurrentProviderConfig: () => providerConfigResult }
  }

  return originalLoad.call(nodeModule, request, parent, isMain)
}

type PostHandler = (
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) => Promise<unknown>

type RouteModule = {
  POST: PostHandler
}

type ProviderModule = {
  normalizeToolChoice: (choice: unknown, shape: "flat" | "nested") => unknown
  resolveAgentProxyProvider: () => unknown
}

let route: RouteModule
let providerModule: ProviderModule

test.before(async () => {
  // The route lives under the catch-all "[...path]" directory; importing it
  // literally (brackets are legal in module specifiers, only Node's --test
  // glob arguments choke on them).
  route = (await import("./[...path]/route")) as unknown as RouteModule
  providerModule = (await import("./provider")) as ProviderModule
})

const envSnapshot: Record<string, string | undefined> = {}

test.beforeEach(() => {
  authResult = authed
  providerConfigResult = {
    apiKey: "server-secret",
    baseURL: "https://llm.example.com/v1",
    model: "server-model",
  }
  globalThis.fetch = originalFetch
  for (const k of ["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL", "DEEPSEEK_THINKING"]) {
    envSnapshot[k] = process.env[k]
    delete process.env[k]
  }
})

test.after(() => {
  nodeModule._load = originalLoad
  globalThis.fetch = originalFetch
  for (const [k, v] of Object.entries(envSnapshot)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

function makeRequest(payload: unknown) {
  return new Request("https://test.local/api/ai/agent-proxy/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
}

const ctx = () => ({ params: Promise.resolve({ path: ["chat", "completions"] }) })

// --- normalizeToolChoice unit tests ---

test("normalizeToolChoice flattens nested -> flat for pptoken-style providers", () => {
  assert.deepEqual(
    providerModule.normalizeToolChoice({ type: "function", function: { name: "AgentOutput" } }, "flat"),
    { type: "function", name: "AgentOutput" },
  )
})

test("normalizeToolChoice nests flat -> nested for DeepSeek-style providers", () => {
  assert.deepEqual(
    providerModule.normalizeToolChoice({ type: "function", name: "AgentOutput" }, "nested"),
    { type: "function", function: { name: "AgentOutput" } },
  )
})

test("normalizeToolChoice leaves already-correct shapes untouched", () => {
  assert.deepEqual(
    providerModule.normalizeToolChoice({ type: "function", name: "AgentOutput" }, "flat"),
    { type: "function", name: "AgentOutput" },
  )
  assert.deepEqual(
    providerModule.normalizeToolChoice({ type: "function", function: { name: "AgentOutput" } }, "nested"),
    { type: "function", function: { name: "AgentOutput" } },
  )
})

test("normalizeToolChoice passes non-named choices through untouched", () => {
  assert.equal(providerModule.normalizeToolChoice("required", "flat"), "required")
  assert.equal(providerModule.normalizeToolChoice("auto", "nested"), "auto")
  assert.equal(providerModule.normalizeToolChoice(undefined, "flat"), undefined)
})

// --- resolveAgentProxyProvider ---

test("resolveAgentProxyProvider prefers DeepSeek when its key is configured", () => {
  process.env.DEEPSEEK_API_KEY = "ds-key"
  process.env.DEEPSEEK_MODEL = "deepseek-v4-flash"
  const provider = providerModule.resolveAgentProxyProvider() as {
    id: string
    model: string
    baseURL: string
    toolChoiceShape: string
    extraBody?: { thinking?: { type: string } }
  }
  assert.equal(provider.id, "deepseek")
  assert.equal(provider.model, "deepseek-v4-flash")
  assert.equal(provider.baseURL, "https://api.deepseek.com")
  assert.equal(provider.toolChoiceShape, "nested")
  assert.deepEqual(provider.extraBody, { thinking: { type: "disabled" } })
})

test("resolveAgentProxyProvider falls back to the AI-entry provider when DeepSeek is unset", () => {
  const provider = providerModule.resolveAgentProxyProvider() as { id: string; toolChoiceShape: string }
  assert.notEqual(provider, null)
  assert.equal(provider.toolChoiceShape, "flat")
})

test("resolveAgentProxyProvider returns null when nothing is configured", () => {
  providerConfigResult = null
  const provider = providerModule.resolveAgentProxyProvider()
  assert.equal(provider, null)
})

// --- POST: auth / validation / passthrough (pptoken path) ---

test("returns 401 when unauthenticated", async () => {
  authResult = { response: { status: 401, body: { error: "Authentication required" } } }
  const result = (await route.POST(makeRequest({ messages: [] }), ctx())) as { status: number }
  assert.equal(result.status, 401)
})

test("returns 503 when no llm provider is configured", async () => {
  providerConfigResult = null
  const result = (await route.POST(
    makeRequest({ messages: [{ role: "user", content: "hi" }] }),
    ctx(),
  )) as { status: number; body: { error: string } }
  assert.equal(result.status, 503)
  assert.equal(result.body.error, "no_llm_provider_configured")
})

test("returns 400 when messages are missing", async () => {
  const result = (await route.POST(makeRequest({ stream: true }), ctx())) as { status: number }
  assert.equal(result.status, 400)
})

test("overrides the client model with the server-configured model (pptoken)", async () => {
  let capturedBody: { model?: string; tool_choice?: unknown } = {}
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string) as {
      model?: string
      tool_choice?: unknown
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof globalThis.fetch

  await route.POST(
    makeRequest({ model: "client-model", messages: [{ role: "user", content: "hi" }] }),
    ctx(),
  )
  assert.equal(capturedBody.model, "server-model")
})

test("flattens nested tool_choice for the pptoken provider", async () => {
  let capturedBody: { tool_choice?: unknown } = {}
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string) as { tool_choice?: unknown }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof globalThis.fetch

  await route.POST(
    makeRequest({
      messages: [{ role: "user", content: "hi" }],
      tool_choice: { type: "function", function: { name: "AgentOutput" } },
    }),
    ctx(),
  )
  assert.deepEqual(capturedBody.tool_choice, { type: "function", name: "AgentOutput" })
})

// --- POST: DeepSeek path ---

test("routes to DeepSeek with nested tool_choice, disabled thinking, and bearer key", async () => {
  process.env.DEEPSEEK_API_KEY = "ds-key"
  process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com"
  process.env.DEEPSEEK_MODEL = "deepseek-v4-flash"

  let capturedUrl = ""
  let capturedAuth = ""
  let capturedBody: Record<string, unknown> = {}
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input)
    capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? ""
    capturedBody = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof globalThis.fetch

  await route.POST(
    makeRequest({
      model: "whatever-browser-sent",
      messages: [{ role: "user", content: "go to workflows" }],
      tool_choice: { type: "function", function: { name: "AgentOutput" } },
    }),
    ctx(),
  )

  assert.equal(capturedUrl, "https://api.deepseek.com/chat/completions")
  assert.equal(capturedAuth, "Bearer ds-key")
  assert.equal(capturedBody.model, "deepseek-v4-flash")
  assert.deepEqual(capturedBody.tool_choice, {
    type: "function",
    function: { name: "AgentOutput" },
  })
  assert.deepEqual(capturedBody.thinking, { type: "disabled" })
})

test("surfaces upstream error status (pptoken)", async () => {
  globalThis.fetch = (async () =>
    new Response("upstream blew up", {
      status: 502,
      headers: { "content-type": "text/plain" },
    })) as typeof globalThis.fetch

  const result = (await route.POST(
    makeRequest({ messages: [{ role: "user", content: "hi" }] }),
    ctx(),
  )) as { status: number; body: { error: string; status: number } }
  assert.equal(result.status, 502)
  assert.equal(result.body.error, "llm_provider_error")
  assert.equal(result.body.status, 502)
})
