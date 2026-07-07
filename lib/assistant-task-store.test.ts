import assert from "node:assert/strict"
import test from "node:test"

import {
  findAiEntryPendingTask,
  removePendingAssistantTask,
  savePendingAssistantTask,
} from "./assistant-task-store"

type StorageMap = Map<string, string>

const STORAGE_KEY = "assistant-async-task-store-v2"

function buildStorage(storage: StorageMap) {
  return {
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
}

function installWindow(localStorageMap: StorageMap, sessionStorageMap: StorageMap) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: buildStorage(localStorageMap),
      sessionStorage: buildStorage(sessionStorageMap),
    },
  })
}

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window")
})

test("findAiEntryPendingTask falls back to session storage data from older tabs", () => {
  const localStorageMap = new Map<string, string>()
  const sessionStorageMap = new Map<string, string>()
  installWindow(localStorageMap, sessionStorageMap)

  sessionStorageMap.set(
    STORAGE_KEY,
    JSON.stringify({
      "task-406": {
        taskId: "task-406",
        scope: "ai_entry",
        conversationId: "406",
        agentId: "executive-ppt",
        createdAt: 1_000,
      },
    }),
  )

  assert.deepEqual(findAiEntryPendingTask({ conversationId: "406", agentId: "executive-ppt" }), {
    taskId: "task-406",
    scope: "ai_entry",
    conversationId: "406",
    agentId: "executive-ppt",
    createdAt: 1_000,
  })
})

test("savePendingAssistantTask writes shared local storage entries and clears session copies", () => {
  const localStorageMap = new Map<string, string>()
  const sessionStorageMap = new Map<string, string>()
  installWindow(localStorageMap, sessionStorageMap)

  sessionStorageMap.set(
    STORAGE_KEY,
    JSON.stringify({
      stale: {
        taskId: "stale",
        scope: "ai_entry",
        conversationId: "405",
        createdAt: 1,
      },
    }),
  )

  savePendingAssistantTask({
    taskId: "task-406",
    scope: "ai_entry",
    conversationId: "406",
    agentId: "executive-ppt",
    createdAt: 2_000,
  })

  assert.equal(sessionStorageMap.has(STORAGE_KEY), false)
  assert.deepEqual(findAiEntryPendingTask({ conversationId: "406", agentId: "executive-ppt" }), {
    taskId: "task-406",
    scope: "ai_entry",
    conversationId: "406",
    agentId: "executive-ppt",
    createdAt: 2_000,
  })

  removePendingAssistantTask("task-406")
  assert.equal(findAiEntryPendingTask({ conversationId: "406", agentId: "executive-ppt" }), null)
  assert.equal(localStorageMap.has(STORAGE_KEY), true)
})
