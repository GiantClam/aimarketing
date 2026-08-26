import assert from "node:assert/strict"
import test from "node:test"

import { createWebWorkbenchClient } from "@/lib/ai-entry/web-workbench-client"

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })
}

test("web WorkbenchClient adapts SaaS conversations, messages and chat SSE", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.includes("/conversations?")) return jsonResponse({ data: [{ id: "42", name: "Plan", updated_at: 1_700_000_000 }] })
    if (url.endsWith("/conversations")) return jsonResponse({ data: { id: "43", name: "New plan", updated_at: 1_700_000_001 } })
    if (url.includes("/messages?")) return jsonResponse({ data: [{ id: "m1", conversation_id: "42", role: "assistant", content: "Ready", created_at: 1_700_000_002 }] })
    if (url.endsWith("/workflows") && init?.method === "POST") return jsonResponse({ data: { id: 7, title: "Workflow", nodes: [{ nodeKey: "input" }], edges: [], updatedAt: "2026-08-13T00:00:00Z" } })
    if (url.endsWith("/workflows")) return jsonResponse({ data: [{ id: 6, title: "Existing workflow", nodes: [], edges: [], updatedAt: "2026-08-12T00:00:00Z" }] })
    return new Response([
      'data: {"event":"message","answer":"Hello"}\n\n',
      'data: {"event":"tool_call","data":{"toolName":"web_search"}}\n\n',
      'data: {"event":"tool_result","data":{"toolName":"web_search","result":{"ok":true}}}\n\n',
      'data: {"event":"artifact_created","artifact":{"artifactId":"a1","fileName":"brief.md","mimeType":"text/markdown","byteLength":12,"sha256":"abc"}}\n\n',
      'data: {"event":"message_end","provider_model":"provider/fast"}\n\n',
    ].join(""), { headers: { "Content-Type": "text/event-stream" } })
  }
  const navigation = { go: () => undefined, replace: () => undefined, current: () => "/dashboard/ai" }
  const client = createWebWorkbenchClient({ fetch, navigation, createId: () => "run-1" })

  assert.equal((await client.conversations.list())[0]?.title, "Plan")
  assert.equal((await client.conversations.create("New plan")).id, "43")
  assert.equal((await client.conversations.messages("42"))[0]?.content, "Ready")
  assert.equal((await client.workflows.list())[0]?.title, "Existing workflow")
  assert.equal((await client.workflows.save({ title: "Workflow", definition: { nodes: [{ nodeKey: "input" }], edges: [] } })).id, "7")

  const run = await client.runs.start({ conversationId: "42", prompt: "Research", model: "provider/fast", reasoningEffort: "high", skillId: "research" })
  const events: string[] = []
  await new Promise<void>((resolve) => {
    client.runs.subscribe(run.id, (event) => {
      events.push(event.type)
      if (event.type === "status" && event.status === "succeeded") resolve()
    })
  })
  assert.deepEqual(events, ["status", "text", "tool_call", "tool_call", "artifact", "status"])
  const chatCall = calls.find((call) => call.url.endsWith("/chat"))
  assert.deepEqual(JSON.parse(String(chatCall?.init?.body)), { stream: true, conversationId: "42", messages: [{ role: "user", content: "Research" }], modelConfig: { modelId: "provider/fast", reasoningEffort: "high" }, skillConfig: { enabled: true, enabledSkillIds: ["research"] } })
})

test("web WorkbenchClient turns an aborted browser request into a cancelled run", async () => {
  const client = createWebWorkbenchClient({
    navigation: { go: () => undefined, replace: () => undefined, current: () => "/" },
    createId: () => "run-cancel",
    fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })),
  })
  const run = await client.runs.start({ conversationId: "c1", prompt: "stop" })
  const status = await new Promise<string>((resolve) => {
    client.runs.subscribe(run.id, (event) => { if (event.type === "status" && event.status === "cancelled") resolve(event.status) })
    void client.runs.cancel(run.id)
  })
  assert.equal(status, "cancelled")
})

test("web WorkbenchClient tolerates an empty successful conversation create response", async () => {
  const client = createWebWorkbenchClient({
    navigation: { go: () => undefined, replace: () => undefined, current: () => "/" },
    fetch: async () => jsonResponse({}),
  })

  const created = await client.conversations.create("Fallback title")
  assert.equal(created.title, "Fallback title")
  assert.equal(created.id, "undefined")
})
