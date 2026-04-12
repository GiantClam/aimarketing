import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

process.env.ADVISOR_RECOVERY_CHECK_MS = "12000"
process.env.ASSISTANT_STALE_TASK_MS = "45000"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

type TaskRow = {
  id: number
  userId: number
  connectionId: number | null
  workflowName: string
  webhookPath: string
  executionId: string | null
  payload: string
  result: string | null
  status: string
  workerId: string | null
  attempts: number
  startedAt: Date | null
  leaseExpiresAt: Date | null
  relatedStorageKey: string | null
  createdAt: Date
  updatedAt: Date
}

let tasksById = new Map<number, TaskRow>()
let claimResultById = new Map<number, unknown>()
let updateStatusCalls: Array<{ taskId: number; data: { status?: string; result?: unknown } }> = []
let recoverMessages: Array<{ query?: string; answer?: string; conversation_id?: string }> = []
let advisorConfigEnabled = true
let sendMessageCallCount = 0
let sendMessagePlan: Array<
  | { kind: "error"; status?: number; body: string }
  | { kind: "success"; body: Record<string, unknown> }
> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/services/tasks") {
    return {
      claimTaskExecution: async (taskId: number) => claimResultById.get(taskId) ?? null,
      createTask: async () => ({ id: 999 }),
      getTaskById: async (taskId: number) => tasksById.get(taskId) ?? null,
      listRecoverableTaskIds: async (limit: number) => Array.from(tasksById.keys()).slice(0, Math.max(1, limit)),
      renewTaskLease: async () => true,
      updateTaskStatus: async (taskId: number, data: { status?: string; result?: unknown }) => {
        updateStatusCalls.push({ taskId, data })
        const current = tasksById.get(taskId)
        if (!current) return
        tasksById.set(taskId, {
          ...current,
          status: data.status || current.status,
          result: data.result !== undefined ? JSON.stringify(data.result) : current.result,
          workerId: ["success", "failed", "approved", "rejected"].includes((data.status || "").trim()) ? null : current.workerId,
          leaseExpiresAt: ["success", "failed", "approved", "rejected"].includes((data.status || "").trim())
            ? null
            : current.leaseExpiresAt,
          updatedAt: new Date(),
        })
      },
    }
  }

  if (request === "@/lib/dify/client") {
    return {
      getMessages: async () => ({
        ok: true,
        json: async () => ({ data: recoverMessages }),
      }),
      sendMessage: async () => {
        sendMessageCallCount += 1
        const next = sendMessagePlan.shift()
        if (!next || next.kind === "success") {
          return {
            ok: true,
            json: async () => (next?.kind === "success" ? next.body : { answer: "ok" }),
          }
        }
        return {
          ok: false,
          status: typeof next.status === "number" ? next.status : 400,
          text: async () => next.body,
        }
      },
    }
  }

  if (request === "@/lib/dify/config") {
    return {
      buildDifyUserIdentity: (email: string, advisorType?: string) => `${email}_${advisorType || "advisor"}`,
      getDifyConfigByAdvisorType: async () => (advisorConfigEnabled ? { baseUrl: "https://example.test/v1", apiKey: "k" } : null),
    }
  }

  if (request === "@/lib/dify/memory-bridge") {
    return {
      buildDifyMemoryBridge: async () => ({ agentType: null, memoryContext: null, soulCard: null, memoryAppliedIds: [] }),
      mergeDifyInputsWithMemoryBridge: (inputs: Record<string, unknown>) => inputs,
    }
  }

  if (request === "@/lib/image-assistant/repository") {
    return {
      createImageAssistantSession: async () => ({}),
      createImageAssistantMessage: async () => ({}),
      getImageAssistantSession: async () => null,
    }
  }

  if (request === "@/lib/lead-hunter/repository") {
    return {
      appendLeadHunterMessage: async () => ({}),
    }
  }

  if (request === "@/lib/lead-hunter/chat") {
    return {
      buildLeadHunterChatPayload: () => ({}),
      formatLeadHunterChatOutput: () => ({ answer: "", events: [], streamedChars: 0 }),
    }
  }

  if (request === "@/lib/lead-hunter/types") {
    return {
      getLeadHunterAgentName: () => "Lead Hunter",
      normalizeLeadHunterAdvisorType: () => null,
    }
  }

  if (request === "@/lib/image-assistant/service") {
    return {
      runImageAssistantConversationTurn: async () => ({}),
    }
  }

  if (request === "@/lib/image-assistant/memory-bridge") {
    return {
      resolveImageAssistantMemoryBridge: async () => null,
    }
  }

  if (request === "@/lib/writer/skills") {
    return {
      runWriterSkillsTurn: async () => ({ answer: "ok", diagnostics: {} }),
    }
  }

  if (request === "@/lib/writer/repository") {
    return {
      appendWriterConversation: async () => ({}),
      updateWriterLatestAssistantMessage: async () => ({}),
    }
  }

  if (request === "@/lib/writer/memory/extractor") {
    return {
      persistWriterImplicitMemoryFromTurn: async () => ({}),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let runAssistantTaskRecoveryPass: (input?: { limit?: number; waitForCompletion?: boolean; completionTimeoutMs?: number }) => Promise<{
  inspected: number
  launched: number
  failed: number
}>

function buildAdvisorTask(input: {
  id: number
  status: "pending" | "running" | "success" | "failed"
  query?: string
  conversationId?: string | null
  updatedAtMsAgo: number
  leaseExpiresInMs?: number | null
}): TaskRow {
  const now = Date.now()
  const leaseExpiresAt =
    typeof input.leaseExpiresInMs === "number" ? new Date(now + input.leaseExpiresInMs) : null

  return {
    id: input.id,
    userId: 60,
    connectionId: null,
    workflowName: "advisor_turn",
    webhookPath: "assistant/async",
    executionId: null,
    payload: JSON.stringify({
      kind: "advisor_turn",
      userId: 60,
      userEmail: "lingchuang.admin@example.com",
      advisorType: "growth",
      query: input.query || "test query",
      conversationId: input.conversationId ?? "c-1",
      memoryContext: null,
      soulCard: null,
      memoryAppliedIds: [],
    }),
    result: null,
    status: input.status,
    workerId: input.status === "running" ? "w-1" : null,
    attempts: 1,
    startedAt: new Date(now - input.updatedAtMsAgo - 1_000),
    leaseExpiresAt,
    relatedStorageKey: null,
    createdAt: new Date(now - input.updatedAtMsAgo - 2_000),
    updatedAt: new Date(now - input.updatedAtMsAgo),
  }
}

test.before(async () => {
  ;({ runAssistantTaskRecoveryPass } = await import("./assistant-async"))
})

test.beforeEach(() => {
  tasksById = new Map()
  claimResultById = new Map()
  updateStatusCalls = []
  recoverMessages = []
  advisorConfigEnabled = true
  sendMessageCallCount = 0
  sendMessagePlan = []
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("does not fail advisor task as stale while lease is still active", async () => {
  const taskId = 1001
  tasksById.set(
    taskId,
    buildAdvisorTask({
      id: taskId,
      status: "running",
      updatedAtMsAgo: 20_000,
      leaseExpiresInMs: 20_000,
    }),
  )
  claimResultById.set(taskId, null)

  const result = await runAssistantTaskRecoveryPass({ limit: 1 })

  assert.equal(result.inspected, 1)
  assert.equal(result.failed, 0)
  assert.equal(result.launched, 0)
  assert.equal(updateStatusCalls.length, 0)
})

test("marks advisor task as stale only after stale window with no lease and no recovery answer", async () => {
  const taskId = 1002
  tasksById.set(
    taskId,
    buildAdvisorTask({
      id: taskId,
      status: "running",
      updatedAtMsAgo: 70_000,
      leaseExpiresInMs: -1_000,
      query: "stale-query",
      conversationId: "dead3d51-5644-447f-ae58-d44842523924",
    }),
  )
  claimResultById.set(taskId, null)
  recoverMessages = []

  const result = await runAssistantTaskRecoveryPass({ limit: 1 })

  assert.equal(result.inspected, 1)
  assert.equal(result.failed, 0)
  assert.equal(updateStatusCalls.length, 1)
  assert.equal(updateStatusCalls[0].taskId, taskId)
  assert.equal(updateStatusCalls[0].data.status, "failed")
  assert.deepEqual(updateStatusCalls[0].data.result, {
    conversation_id: "dead3d51-5644-447f-ae58-d44842523924",
    error: "advisor_task_stale",
  })
})

test("retries transient upstream SSL errors and succeeds without marking task failed", async () => {
  const taskId = 1003
  tasksById.set(
    taskId,
    buildAdvisorTask({
      id: taskId,
      status: "pending",
      updatedAtMsAgo: 1_000,
      leaseExpiresInMs: null,
      query: "retry-query",
      conversationId: "c-retry-1",
    }),
  )
  claimResultById.set(taskId, { id: taskId })
  sendMessagePlan = [
    {
      kind: "error",
      status: 400,
      body: "PluginInvokeError: SSLError: HTTPSConnectionPool(host='dashscope.aliyuncs.com', port=443): Max retries exceeded (SSLEOFError: UNEXPECTED_EOF_WHILE_READING)",
    },
    {
      kind: "success",
      body: {
        answer: "retried answer",
        conversation_id: "c-retry-1",
      },
    },
  ]

  const result = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(result.inspected, 1)
  assert.equal(result.failed, 0)
  assert.equal(sendMessageCallCount, 2)
  const terminal = updateStatusCalls.find((entry) => entry.taskId === taskId && entry.data.status === "success")
  assert.ok(terminal)
  assert.equal((terminal?.data.result as { conversation_id?: string } | undefined)?.conversation_id, "c-retry-1")
  assert.equal((terminal?.data.result as { answer?: string } | undefined)?.answer, "retried answer")
})
