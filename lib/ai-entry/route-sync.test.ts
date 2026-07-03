import assert from "node:assert/strict"
import test from "node:test"

import { resolveAiEntryTargetConversationId } from "./route-sync"

test("uses route conversation id when switching to an existing conversation", () => {
  const target = resolveAiEntryTargetConversationId({
    initialConversationId: "298",
    localConversationId: null,
    pendingFirstConversationRoute: false,
  })

  assert.equal(target, "298")
})

test("prefers route reset when starting a new conversation from an old one", () => {
  const target = resolveAiEntryTargetConversationId({
    initialConversationId: null,
    localConversationId: "298",
    pendingFirstConversationRoute: false,
  })

  assert.equal(target, null)
})

test("uses locally created conversation id while first route sync is pending", () => {
  const target = resolveAiEntryTargetConversationId({
    initialConversationId: null,
    localConversationId: "412",
    pendingFirstConversationRoute: true,
  })

  assert.equal(target, "412")
})
