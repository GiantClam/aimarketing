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
let aiEntryPreviewToolResult: Record<string, unknown> = {
  ok: true,
  previewSessionId: "preview-session-1",
  variants: [{ key: "variant-a", name: "Variant A" }],
}
let aiEntryPreviewToolCallCount = 0
let aiEntryPreviewToolPlan: Array<
  | { kind: "error"; message: string }
  | { kind: "success"; result: Record<string, unknown> }
> = []
let aiEntryPreviewAppendError: string | null = null
let appendedAiEntryMessages: Array<{ conversationId: string | number | null | undefined; content: string }> = []
let durablePptQueueEnabled = false
let remotePptJobByRequestId: { jobId: string } | null = null
let remotePptSubmitCalls: Array<{ requestId: string; prompt: string; templateMode?: string; templateId?: string }> = []
let remotePptStatus: Record<string, unknown> | Error = { jobId: "remote-job-1", status: "running" }
let persistedRemoteDecks: Array<Record<string, unknown>> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/services/tasks") {
    return {
      claimTaskExecution: async (taskId: number) => claimResultById.get(taskId) ?? null,
      createTask: async () => ({ id: 999 }),
      getTaskById: async (taskId: number) => tasksById.get(taskId) ?? null,
      listRecoverableTaskIds: async (limit: number) => Array.from(tasksById.keys()).slice(0, Math.max(1, limit)),
      renewTaskLease: async () => true,
      updateTaskStatus: async (taskId: number, data: { status?: string; result?: unknown; releaseLease?: boolean }) => {
        updateStatusCalls.push({ taskId, data })
        const current = tasksById.get(taskId)
        if (!current) return
        tasksById.set(taskId, {
          ...current,
          status: data.status || current.status,
          result: data.result !== undefined ? JSON.stringify(data.result) : current.result,
          workerId: ["success", "failed", "approved", "rejected"].includes((data.status || "").trim()) || data.releaseLease
            ? null
            : current.workerId,
          leaseExpiresAt: ["success", "failed", "approved", "rejected"].includes((data.status || "").trim()) || data.releaseLease
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

  if (request === "@/lib/ai-entry/repository") {
    return {
      appendAiEntryMessage: async (input: {
        conversationId: string | number | null | undefined
        content: string
      }) => {
        if (aiEntryPreviewAppendError) {
          throw new Error(aiEntryPreviewAppendError)
        }
        appendedAiEntryMessages.push({
          conversationId: input.conversationId,
          content: input.content,
        })
        return { id: String(input.conversationId || "conv") }
      },
    }
  }

  if (request === "@/lib/ai-entry/ppt-tool-result-message") {
    return {
      buildPptToolResultMessage: () => "PPT preview generated.",
    }
  }

  if (request === "@/lib/ai-entry/ppt-tools") {
    return {
      buildAiEntryPptTools: () => ({
        preview_ppt_deck: {
          execute: async () => {
            aiEntryPreviewToolCallCount += 1
            const next = aiEntryPreviewToolPlan.shift()
            if (next?.kind === "error") {
              throw new Error(next.message)
            }
            if (next?.kind === "success") {
              return next.result
            }
            return aiEntryPreviewToolResult
          },
        },
      }),
    }
  }

  if (request === "@/lib/lead-tools/config") {
    return {
      getLeadToolPptExecutionTransport: () => (durablePptQueueEnabled ? "remote-worker" : "local"),
    }
  }

  if (request === "@/lib/platform/ppt-job-store") {
    return {
      getPptPreviewJobByRequestId: async () => remotePptJobByRequestId,
    }
  }

  if (request === "@/lib/lead-tools/ppt-worker-client") {
    return {
      requestPptWorkerPreviewSubmit: async (input: {
        requestId: string
        prompt: string
        templateMode?: string
        templateId?: string
      }) => {
        remotePptSubmitCalls.push({
          requestId: input.requestId,
          prompt: input.prompt,
          templateMode: input.templateMode,
          templateId: input.templateId,
        })
        remotePptJobByRequestId = { jobId: "remote-job-1" }
        return { jobId: "remote-job-1", status: "queued" }
      },
      requestPptWorkerPreviewStatus: async () => {
        if (remotePptStatus instanceof Error) throw remotePptStatus
        return remotePptStatus
      },
    }
  }

  if (request === "@/lib/lead-tools/ppt-preview-session-store") {
    return {
      storePptPreviewSessionDeck: async (deck: Record<string, unknown>) => {
        persistedRemoteDecks.push(deck)
        return deck
      },
    }
  }

  if (request === "@/lib/lead-tools/runtime") {
    return {
      persistLeadToolPreviewResult: async () => ({ platformRunId: 9, platformArtifactId: 10 }),
    }
  }

  if (request === "@/lib/enterprise/server") {
    return {
      getUserAuthPayload: async (userId: number) => ({
        id: userId,
        email: "lingchuang.admin@example.com",
        name: "Test User",
        isDemo: false,
        enterpriseId: 88,
        enterpriseCode: "ent-88",
        enterpriseName: "Test Enterprise",
        enterpriseRole: "admin",
        enterpriseStatus: "active",
        permissions: {},
      }),
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

function buildAiEntryPptPreviewTask(input: {
  id: number
  status: "pending" | "running" | "success" | "failed"
  updatedAtMsAgo: number
}) {
  const now = Date.now()
  return {
    id: input.id,
    userId: 60,
    connectionId: null,
    workflowName: "ai_entry_ppt_preview",
    webhookPath: "assistant/async",
    executionId: null,
    payload: JSON.stringify({
      kind: "ai_entry_ppt_preview",
      userId: 60,
      conversationId: "chat-conv-1",
      conversationScope: "consulting",
      agentId: "executive-ppt",
      toolCallId: "preview_ppt_deck",
      input: {
        prompt: "请生成董事会汇报 PPT",
        audience: "管理层",
        goal: "经营同步",
      },
      isZh: true,
    }),
    result: null,
    status: input.status,
    workerId: input.status === "running" ? "w-1" : null,
    attempts: 1,
    startedAt: new Date(now - input.updatedAtMsAgo - 1_000),
    leaseExpiresAt: null,
    relatedStorageKey: null,
    createdAt: new Date(now - input.updatedAtMsAgo - 2_000),
    updatedAt: new Date(now - input.updatedAtMsAgo),
  } satisfies TaskRow
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
  aiEntryPreviewToolResult = {
    ok: true,
    previewSessionId: "preview-session-1",
    variants: [{ key: "variant-a", name: "Variant A" }],
  }
  aiEntryPreviewToolCallCount = 0
  aiEntryPreviewToolPlan = []
  aiEntryPreviewAppendError = null
  appendedAiEntryMessages = []
  durablePptQueueEnabled = false
  remotePptJobByRequestId = null
  remotePptSubmitCalls = []
  remotePptStatus = { jobId: "remote-job-1", status: "running" }
  persistedRemoteDecks = []
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

test("completes ai-entry background ppt preview only after assistant message persistence succeeds", async () => {
  const taskId = 1101
  tasksById.set(
    taskId,
    buildAiEntryPptPreviewTask({
      id: taskId,
      status: "pending",
      updatedAtMsAgo: 1_000,
    }),
  )
  claimResultById.set(taskId, { id: taskId })

  const result = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(result.inspected, 1)
  assert.equal(result.failed, 0)
  assert.equal(appendedAiEntryMessages.length, 1)
  assert.equal(appendedAiEntryMessages[0]?.conversationId, "chat-conv-1")
  assert.equal(appendedAiEntryMessages[0]?.content, "PPT preview generated.")
  const terminal = updateStatusCalls.find((entry) => entry.taskId === taskId && entry.data.status === "success")
  assert.ok(terminal)
  assert.equal((terminal?.data.result as { conversation_id?: string } | undefined)?.conversation_id, "chat-conv-1")
})

test("retries ai-entry background ppt preview fetch failures before exposing failure", async () => {
  const taskId = 1103
  tasksById.set(
    taskId,
    buildAiEntryPptPreviewTask({
      id: taskId,
      status: "pending",
      updatedAtMsAgo: 1_000,
    }),
  )
  claimResultById.set(taskId, { id: taskId })
  aiEntryPreviewToolPlan = [
    { kind: "error", message: "fetch failed" },
    {
      kind: "success",
      result: {
        ok: true,
        previewSessionId: "preview-session-after-retry",
        variants: [{ key: "variant-a", name: "Variant A" }],
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
  assert.equal(aiEntryPreviewToolCallCount, 2)
  assert.equal(appendedAiEntryMessages.length, 1)
  assert.equal(appendedAiEntryMessages[0]?.content, "PPT preview generated.")
  assert.equal(appendedAiEntryMessages[0]?.content.includes("生成失败"), false)
  const terminal = updateStatusCalls.find((entry) => entry.taskId === taskId && entry.data.status === "success")
  assert.ok(terminal)
  assert.equal((terminal?.data.result as { error?: string } | undefined)?.error, null)
})

test("fails ai-entry background ppt preview when assistant message persistence fails", async () => {
  const taskId = 1102
  tasksById.set(
    taskId,
    buildAiEntryPptPreviewTask({
      id: taskId,
      status: "pending",
      updatedAtMsAgo: 1_000,
    }),
  )
  claimResultById.set(taskId, { id: taskId })
  aiEntryPreviewAppendError = "db_write_failed"

  const result = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(result.inspected, 1)
  assert.equal(result.failed, 0)
  assert.equal(appendedAiEntryMessages.length, 0)
  const terminal = updateStatusCalls.find((entry) => entry.taskId === taskId && entry.data.status === "failed")
  assert.ok(terminal)
  assert.equal((terminal?.data.result as { error?: string } | undefined)?.error, "db_write_failed")
  assert.equal(
    ((terminal?.data.result as { events?: Array<{ type?: string; status?: string }> } | undefined)?.events || []).at(-1)?.status,
    "failed",
  )
})

test("resumes remote ppt-master jobs from Supabase state without Vercel polling", async () => {
  const taskId = 1104
  durablePptQueueEnabled = true
  tasksById.set(
    taskId,
    buildAiEntryPptPreviewTask({
      id: taskId,
      status: "pending",
      updatedAtMsAgo: 1_000,
    }),
  )
  claimResultById.set(taskId, { id: taskId })

  const submitted = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(submitted.failed, 0)
  assert.equal(remotePptSubmitCalls.length, 1)
  assert.equal(remotePptSubmitCalls[0]?.requestId, `ai-entry-ppt-task-${taskId}`)
  assert.equal(remotePptSubmitCalls[0]?.templateMode, "single-template")
  assert.ok(remotePptSubmitCalls[0]?.templateId)
  const submittedTask = tasksById.get(taskId)
  assert.equal(submittedTask?.status, "running")
  assert.equal(submittedTask?.leaseExpiresAt, null)
  const submittedResult = JSON.parse(submittedTask?.result || "{}") as Record<string, unknown>
  assert.equal(submittedResult.remoteRequestId, `ai-entry-ppt-task-${taskId}`)
  assert.equal(submittedResult.remoteJobId, "remote-job-1")
  assert.equal(appendedAiEntryMessages.length, 0)

  remotePptStatus = {
    jobId: "remote-job-1",
    status: "completed",
    previewSessionId: "remote-preview-session-1",
    generatedAt: "2026-07-10T02:23:16.000Z",
    deck: {
      previewSessionId: "remote-preview-session-1",
      title: "董事会经营同步",
      scenario: "sales-deck",
      language: "zh-CN",
      pageCount: 12,
      resolvedPageCount: 12,
      variants: [
        {
          key: "ppt169_swiss_grid_systems",
          name: "Swiss Grid",
          summary: "Executive deck",
          styleKey: "ppt169_swiss_grid_systems",
          templateId: "ppt169_swiss_grid_systems",
          slides: [{ title: "董事会经营同步" }],
        },
      ],
    },
  }
  tasksById.set(taskId, {
    ...submittedTask!,
    updatedAt: new Date(),
    leaseExpiresAt: null,
  })

  const completed = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(completed.failed, 0)
  assert.equal(remotePptSubmitCalls.length, 1)
  assert.equal(persistedRemoteDecks.length, 1)
  assert.equal(appendedAiEntryMessages.length, 1)
  assert.equal(tasksById.get(taskId)?.status, "success")
  const terminal = JSON.parse(tasksById.get(taskId)?.result || "{}") as Record<string, unknown>
  assert.equal(terminal.previewSessionId, "remote-preview-session-1")
  assert.equal(terminal.remoteJobId, "remote-job-1")
})

test("keeps durable PPT tasks running after transient remote status fetch failures", async () => {
  const taskId = 1106
  durablePptQueueEnabled = true
  tasksById.set(
    taskId,
    buildAiEntryPptPreviewTask({
      id: taskId,
      status: "pending",
      updatedAtMsAgo: 1_000,
    }),
  )
  claimResultById.set(taskId, { id: taskId })

  const submitted = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(submitted.failed, 0)
  assert.equal(tasksById.get(taskId)?.status, "running")
  assert.equal(remotePptSubmitCalls.length, 1)

  remotePptStatus = new Error("fetch failed")
  const retried = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(retried.failed, 0)
  assert.equal(tasksById.get(taskId)?.status, "running")
  assert.equal(appendedAiEntryMessages.length, 0)
  assert.equal(
    (JSON.parse(tasksById.get(taskId)?.result || "{}") as { events?: Array<{ type?: string; status?: string }> }).events?.at(-1)?.type,
    "background_generation_retry",
  )

  remotePptStatus = {
    jobId: "remote-job-1",
    status: "completed",
    previewSessionId: "remote-preview-session-2",
    generatedAt: "2026-07-13T00:00:00.000Z",
    deck: {
      previewSessionId: "remote-preview-session-2",
      title: "恢复后的 PPT",
      scenario: "product-launch",
      language: "zh-CN",
      pageCount: 4,
      resolvedPageCount: 4,
      variants: [{ key: "variant-a", name: "Variant A", slides: [{ title: "恢复后的 PPT" }] }],
    },
  }

  const completed = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(completed.failed, 0)
  assert.equal(tasksById.get(taskId)?.status, "success")
  assert.equal(remotePptSubmitCalls.length, 1)
  assert.equal(appendedAiEntryMessages.length, 1)
})

test("resubmits legacy remote jobs when the worker cannot recover their missing request payload", async () => {
  const taskId = 1105
  durablePptQueueEnabled = true
  remotePptJobByRequestId = { jobId: "legacy-job" }
  remotePptStatus = {
    jobId: "legacy-job",
    status: "failed",
    message: "ppt_worker_job_request_missing",
  }
  tasksById.set(
    taskId,
    buildAiEntryPptPreviewTask({
      id: taskId,
      status: "pending",
      updatedAtMsAgo: 1_000,
    }),
  )
  claimResultById.set(taskId, { id: taskId })

  const recovered = await runAssistantTaskRecoveryPass({
    limit: 1,
    waitForCompletion: true,
    completionTimeoutMs: 10_000,
  })

  assert.equal(recovered.failed, 0)
  assert.equal(remotePptSubmitCalls.length, 1)
  assert.equal(remotePptSubmitCalls[0]?.requestId, `ai-entry-ppt-task-${taskId}`)
  assert.equal(tasksById.get(taskId)?.status, "running")
  const result = JSON.parse(tasksById.get(taskId)?.result || "{}") as Record<string, unknown>
  assert.equal(result.remoteJobId, "remote-job-1")
  assert.equal((result.events as Array<{ type?: string }>).at(-1)?.type, "background_generation_recovered")
})
