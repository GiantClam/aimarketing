"use client"

export type PendingAssistantTask = {
  taskId: string
  scope: "writer" | "image" | "advisor"
  conversationId?: string | null
  sessionId?: string | null
  advisorType?: string | null
  prompt?: string
  taskType?: string | null
  createdAt: number
}

const STORAGE_KEY = "assistant-async-task-store-v1"

function canUseStorage() {
  return typeof window !== "undefined"
}

function readStore() {
  if (!canUseStorage()) return {} as Record<string, PendingAssistantTask>

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, PendingAssistantTask>
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, PendingAssistantTask>) {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
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

export function findAdvisorPendingTask(input: { advisorType: string; conversationId?: string | null }) {
  const tasks = Object.values(readStore())
    .filter((task) => task.scope === "advisor" && task.advisorType === input.advisorType)
    .sort((a, b) => b.createdAt - a.createdAt)

  if (input.conversationId) {
    return tasks.find((task) => task.conversationId === input.conversationId) || null
  }

  return tasks.find((task) => !task.conversationId) || null
}
