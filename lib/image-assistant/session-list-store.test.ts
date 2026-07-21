import assert from "node:assert/strict"
import test from "node:test"

import type { ImageAssistantConversationSummary } from "@/lib/image-assistant/types"

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] || null,
    get length() {
      return values.size
    },
  }
}

function buildSummary(id: string): ImageAssistantConversationSummary {
  return {
    id,
    name: `Session ${id}`,
    status: "active",
    current_mode: "chat",
    cover_asset_url: null,
    current_version_id: null,
    current_canvas_document_id: null,
    created_at: 1,
    updated_at: 1,
  }
}

test("image assistant conversation cache is isolated by user", async () => {
  const sessionStorage = createStorage()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage, localStorage: sessionStorage },
  })

  const store = await import("./session-list-store")
  const userOneSession = buildSummary("101")
  const userTwoSession = buildSummary("202")

  store.upsertImageAssistantConversationSummary(1, userOneSession)
  store.upsertImageAssistantConversationSummary(2, userTwoSession)

  assert.deepEqual(store.getImageAssistantConversationListCache(1)?.items.map((item) => item.id), ["101"])
  assert.deepEqual(store.getImageAssistantConversationListCache(2)?.items.map((item) => item.id), ["202"])
})

test("deleting an image assistant session removes it from the user cache", async () => {
  const sessionStorage = createStorage()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage, localStorage: sessionStorage },
  })

  const store = await import("./session-list-store")
  store.upsertImageAssistantConversationSummary(7, buildSummary("301"))
  store.upsertImageAssistantConversationSummary(7, buildSummary("302"))

  store.removeImageAssistantConversationSummary(7, "301")

  assert.deepEqual(store.getImageAssistantConversationListCache(7)?.items.map((item) => item.id), ["302"])
})
