import assert from "node:assert/strict"
import { test } from "node:test"
import type { AgentRuntimeEvent } from "@/lib/ai-runtime/contracts"
import { getCloudflareSessionEventTicket, subscribeCloudflareSessionRun } from "./cloudflare-session-client"

test("retries transient runner connection resets before returning the event ticket", async () => {
  let attempts = 0
  const ticket = await getCloudflareSessionEventTicket({ runId: "22222222-2222-4222-8222-222222222222", sessionKey: "sess-2222222222222222222222222222222222222222" }, {
    runnerUrl: "https://runner.example.com",
    secret: "secret",
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error("fetch failed") as Error & { cause?: { code?: string } }
        error.cause = { code: "ECONNRESET" }
        throw error
      }
      return new Response(JSON.stringify({ eventsUrl: "https://runtime.example.com/events", eventToken: "token", expiresAt: new Date(Date.now() + 300000).toISOString() }), { status: 200 })
    },
  })
  assert.equal(attempts, 2)
  assert.equal(ticket.eventToken, "token")
})

test("gets a scoped event ticket and resumes event stream", async () => {
  const stream = `id: 2\nevent: runtime\ndata: ${JSON.stringify({ event: "text_delta", delta: "hello", runId: "11111111-1111-4111-8111-111111111111" })}\n\n` + `id: 3\nevent: runtime\ndata: ${JSON.stringify({ event: "done", runId: "11111111-1111-4111-8111-111111111111" })}\n\n`
  const ticket = await getCloudflareSessionEventTicket({ runId: "11111111-1111-4111-8111-111111111111", sessionKey: "sess-1111111111111111111111111111111111111111" }, {
    runnerUrl: "https://runner.example.com",
    secret: "secret",
    fetchImpl: async (_url, init) => {
      assert.equal(init?.method, "POST")
      return new Response(JSON.stringify({ eventsUrl: "https://runtime.example.com/events", eventToken: "token", expiresAt: new Date(Date.now() + 300000).toISOString() }), { status: 200 })
    },
  })
  const events: AgentRuntimeEvent[] = []
  for await (const event of subscribeCloudflareSessionRun(ticket, {
    fetchImpl: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token")
      assert.equal(new Headers(init?.headers).get("Last-Event-ID"), "1")
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(stream)); controller.close() } }), { status: 200 })
    },
    lastEventId: "1",
  })) events.push(event)
  assert.deepEqual(events.map((event) => event.event), ["text_delta", "done"])
})
