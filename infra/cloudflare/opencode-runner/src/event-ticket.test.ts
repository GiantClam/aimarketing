import test from "node:test"
import assert from "node:assert/strict"
import { allowedEventOrigin, createEventTicket, verifyEventTicket } from "./event-ticket"

test("event tickets are scoped and expire", async () => {
  const token = await createEventTicket({ runId: "11111111-1111-4111-8111-111111111111", secret: "secret", nowSeconds: 100, ttlSeconds: 5 })
  assert.equal(await verifyEventTicket(token, { runId: "11111111-1111-4111-8111-111111111111", secret: "secret", nowSeconds: 104 }), true)
  assert.equal(await verifyEventTicket(token, { runId: "22222222-2222-4222-8222-222222222222", secret: "secret", nowSeconds: 104 }), false)
  assert.equal(await verifyEventTicket(token, { runId: "11111111-1111-4111-8111-111111111111", secret: "secret", nowSeconds: 105 }), false)
})

test("event origin allows only configured exact origins", () => {
  const request = new Request("https://runtime.example/v2/runs/run/events", { headers: { Origin: "http://localhost:3000" } })
  assert.equal(allowedEventOrigin(request, "https://app.example,http://localhost:3000"), "http://localhost:3000")
  assert.equal(allowedEventOrigin(new Request(request, { headers: { Origin: "https://attacker.example" } }), "https://app.example,http://localhost:3000"), null)
})
