import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_ENTRY_PENDING_CONVERSATION_MAX_AGE_MS,
  buildPendingConversationEnvelope,
  readFreshPendingConversationMessages,
} from "./pending-conversation-store"

test("reads fresh pending conversation messages from the current envelope format", () => {
  const envelope = buildPendingConversationEnvelope(
    [
      { role: "user", content: "hello" },
      { role: "assistant", content: "draft" },
    ],
    { now: 1_000 },
  )

  assert.deepEqual(
    readFreshPendingConversationMessages(envelope, { now: 1_500 }),
    envelope.messages,
  )
})

test("drops expired pending conversation envelopes", () => {
  const envelope = buildPendingConversationEnvelope([{ role: "user", content: "hello" }], {
    now: 1_000,
  })

  assert.deepEqual(
    readFreshPendingConversationMessages(envelope, {
      now: 1_000 + AI_ENTRY_PENDING_CONVERSATION_MAX_AGE_MS + 1,
    }),
    [],
  )
})

test("drops legacy array payloads so stale drafts do not resurrect after reload", () => {
  assert.deepEqual(
    readFreshPendingConversationMessages([
      { role: "user", content: "hello" },
      { role: "assistant", content: "running..." },
    ]),
    [],
  )
})

test("drops malformed pending conversation envelopes", () => {
  assert.deepEqual(
    readFreshPendingConversationMessages({
      savedAt: "yesterday",
      messages: [{ role: "assistant", content: "draft" }],
    }),
    [],
  )
})
