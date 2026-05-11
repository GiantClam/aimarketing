import assert from "node:assert/strict"
import test from "node:test"

import {
  createEmptyPayPalWebhookProcessingState,
  processPayPalWebhookEventState,
} from "./paypal"

test("paypal webhook state activates subscription and grants shared credits once", () => {
  let state = createEmptyPayPalWebhookProcessingState()
  const event = {
    id: "WH-1",
    event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
    resource: {
      id: "I-SUBSCRIPTION",
      custom_id: "enterprise:7:creator",
    },
  }

  const first = processPayPalWebhookEventState(state, event)
  state = first.state
  const duplicate = processPayPalWebhookEventState(state, event)

  assert.equal(first.processed, true)
  assert.equal(duplicate.duplicate, true)
  assert.equal(state.subscriptions.get("I-SUBSCRIPTION")?.status, "active")
  assert.equal(state.subscriptions.get("I-SUBSCRIPTION")?.planCode, "creator")
  assert.deepEqual(state.grants, [
    {
      paypalSubscriptionId: "I-SUBSCRIPTION",
      planCode: "creator",
      credits: 10_000,
      idempotencyKey: "paypal-grant:I-SUBSCRIPTION:WH-1",
    },
  ])
})

test("paypal webhook state grants renewal credits on payment sale completed", () => {
  let state = createEmptyPayPalWebhookProcessingState()
  state = processPayPalWebhookEventState(state, {
    id: "WH-ACTIVE",
    event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
    resource: {
      id: "I-SUBSCRIPTION",
      custom_id: "enterprise:7:starter",
    },
  }).state
  state = processPayPalWebhookEventState(state, {
    id: "WH-RENEWAL",
    event_type: "PAYMENT.SALE.COMPLETED",
    resource: {
      billing_agreement_id: "I-SUBSCRIPTION",
    },
  }).state

  assert.equal(state.grants.length, 2)
  assert.equal(state.grants[1]?.credits, 3_000)
  assert.equal(state.grants[1]?.idempotencyKey, "paypal-grant:I-SUBSCRIPTION:WH-RENEWAL")
})

test("paypal webhook state suspends subscription on payment failure", () => {
  let state = createEmptyPayPalWebhookProcessingState()
  state = processPayPalWebhookEventState(state, {
    id: "WH-ACTIVE",
    event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
    resource: {
      id: "I-SUBSCRIPTION",
      custom_id: "enterprise:7:studio",
    },
  }).state
  state = processPayPalWebhookEventState(state, {
    id: "WH-FAILED",
    event_type: "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    resource: {
      id: "I-SUBSCRIPTION",
    },
  }).state

  assert.equal(state.subscriptions.get("I-SUBSCRIPTION")?.status, "suspended")
})
