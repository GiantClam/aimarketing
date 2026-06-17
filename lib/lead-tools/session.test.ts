import assert from "node:assert/strict"
import test from "node:test"

import { loadPptPreviewSession } from "./session"

type StorageMap = Map<string, string>

function installWindow(storage: StorageMap) {
  const localStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
    removeItem(key: string) {
      storage.delete(key)
    },
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  })
}

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window")
})

test("loadPptPreviewSession migrates legacy generated deck payloads to lean session state", () => {
  const storage = new Map<string, string>()
  installWindow(storage)
  storage.set(
    "lead-tools:ai-ppt-preview-session",
    JSON.stringify({
      request: {
        prompt: "formal ai ppt",
        scenario: "marketing-campaign",
        language: "zh-CN",
      },
      generatedDeck: {
        previewSessionId: "legacy-preview-session",
      },
      selectedVariantKey: "variant-a",
      selectedSlideIndex: 2,
      slideIndexByVariant: {
        "variant-a": 2,
      },
      lastActionAt: "2026-06-11T00:00:00.000Z",
    }),
  )

  const session = loadPptPreviewSession()

  assert.deepEqual(session, {
    request: {
      prompt: "formal ai ppt",
      scenario: "marketing-campaign",
      language: "zh-CN",
    },
    previewSessionId: "legacy-preview-session",
    selectedVariantKey: "variant-a",
    selectedSlideIndex: 2,
    slideIndexByVariant: {
      "variant-a": 2,
    },
    lastActionAt: "2026-06-11T00:00:00.000Z",
  })

  assert.equal(storage.get("lead-tools:ai-ppt-preview-session")?.includes("generatedDeck"), false)
})
