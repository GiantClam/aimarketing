import assert from "node:assert/strict"
import test from "node:test"

import {
  shouldDeferSyntheticTaskRunMessages,
  shouldReuseLoadedConversation,
} from "./conversation-view-state"

test("reuses the loaded conversation when the same target route already has messages", () => {
  assert.equal(
    shouldReuseLoadedConversation({
      targetConversationId: "429",
      latestConversationId: "429",
      hasMessages: true,
      pendingFirstConversationRoute: false,
    }),
    true,
  )
})

test("does not reuse loaded state when navigating to a different conversation", () => {
  assert.equal(
    shouldReuseLoadedConversation({
      targetConversationId: "430",
      latestConversationId: "429",
      hasMessages: true,
      pendingFirstConversationRoute: false,
    }),
    false,
  )
})

test("reuses pending first-route state for the same target conversation when messages already exist", () => {
  assert.equal(
    shouldReuseLoadedConversation({
      targetConversationId: "429",
      latestConversationId: "429",
      hasMessages: true,
      pendingFirstConversationRoute: true,
    }),
    true,
  )
})

test("defers synthetic task-run-only messages while the conversation history is still loading", () => {
  assert.equal(
    shouldDeferSyntheticTaskRunMessages({
      isConversationLoading: true,
      messageCount: 0,
    }),
    true,
  )
})

test("allows synthetic task-run messages once conversation history exists", () => {
  assert.equal(
    shouldDeferSyntheticTaskRunMessages({
      isConversationLoading: true,
      messageCount: 2,
    }),
    false,
  )
})
