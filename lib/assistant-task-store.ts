"use client"

import {
  readStorageJson,
  writeStorageRecordStore,
} from "@/lib/browser-storage"

export type PendingAssistantTask = {
  taskId: string
  scope: "writer" | "image" | "advisor" | "ai_entry"
  conversationId?: string | null
  sessionId?: string | null
  advisorType?: string | null
  agentId?: string | null
  prompt?: string
  taskType?: string | null
  createdAt: number
}

const LEGACY_STORAGE_KEY = "assistant-async-task-store-v1"
const STORAGE_KEY = "assistant-async-task-store-v2"
const MAX_PENDING_TASKS = 32

function canUseStorage() {
  return typeof window !== "undefined"
}

function readStoreFromArea(area: "local" | "session") {
  return readStorageJson<Record<string, PendingAssistantTask>>(area, STORAGE_KEY) || {}
}

function readStore() {
  if (!canUseStorage()) return {} as Record<string, PendingAssistantTask>
  const localStore = readStoreFromArea("local")
  if (Object.keys(localStore).length > 0) {
    return localStore
  }

  const sessionStore = readStoreFromArea("session")
  return sessionStore
}

function writeStore(store: Record<string, PendingAssistantTask>) {
  if (!canUseStorage()) return
  void writeStorageRecordStore("local", STORAGE_KEY, store, {
    maxEntries: MAX_PENDING_TASKS,
    legacyKeys: [
      { area: "local", key: LEGACY_STORAGE_KEY },
      { area: "session", key: LEGACY_STORAGE_KEY },
      { area: "session", key: STORAGE_KEY },
    ],
  })
}

export function isPendingAssistantTaskStoreStorageKey(key: string | null) {
  return key === STORAGE_KEY || key === LEGACY_STORAGE_KEY
}

export function savePendingAssistantTask(task: PendingAssistantTask) {
  const store = readStore()
  store[task.taskId] = task
  writeStore(store)
}

export function updatePendingAssistantTask(taskId: string, patch: Partial<PendingAssistantTask>) {
  const store = readStore()
  const current = store[taskId]
  if (!current) return
  store[taskId] = { ...current, ...patch }
  writeStore(store)
}

export function removePendingAssistantTask(taskId: string) {
  const store = readStore()
  delete store[taskId]
  writeStore(store)
}

export function findWriterPendingTask(conversationId: string | null) {
  if (!conversationId) return null
  const tasks = Object.values(readStore())
    .filter((task) => task.scope === "writer" && task.conversationId === conversationId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return tasks[0] || null
}

export function findImagePendingTask(sessionId: string | null) {
  if (!sessionId) return null
  const tasks = Object.values(readStore())
    .filter((task) => task.scope === "image" && task.sessionId === sessionId)
    .sort((a, b) => b.createdAt - a.createdAt)
  return tasks[0] || null
}

export function findLatestImagePendingTask() {
  const tasks = Object.values(readStore())
    .filter((task) => task.scope === "image")
    .sort((a, b) => b.createdAt - a.createdAt)
  return tasks[0] || null
}

export function findAdvisorPendingTask(input: { advisorType: string; conversationId?: string | null }) {
  const tasks = Object.values(readStore())
    .filter((task) => task.scope === "advisor" && task.advisorType === input.advisorType)
    .sort((a, b) => b.createdAt - a.createdAt)

  if (input.conversationId) {
    return tasks.find((task) => task.conversationId === input.conversationId) || null
  }

  return tasks.find((task) => !task.conversationId) || null
}

export function findAiEntryPendingTask(input: {
  conversationId?: string | null
  agentId?: string | null
}) {
  const tasks = Object.values(readStore())
    .filter((task) => task.scope === "ai_entry")
    .sort((a, b) => b.createdAt - a.createdAt)

  if (input.conversationId) {
    const byConversation = tasks.filter((task) => task.conversationId === input.conversationId)
    if (input.agentId) {
      return byConversation.find((task) => task.agentId === input.agentId) || byConversation[0] || null
    }
    return byConversation[0] || null
  }

  if (input.agentId) {
    return tasks.find((task) => task.agentId === input.agentId && !task.conversationId) || null
  }

  return tasks.find((task) => !task.conversationId) || null
}
