import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let selectRowsQueue: unknown[][] = []
let executeRowsQueue: unknown[][] = []

function nextSelectRows() {
  return Promise.resolve(selectRowsQueue.shift() || [])
}

const dbChain = {
  from() {
    return dbChain
  },
  leftJoin() {
    return dbChain
  },
  where() {
    return dbChain
  },
  groupBy() {
    return dbChain
  },
  orderBy() {
    return dbChain
  },
  limit() {
    return nextSelectRows()
  },
}

const dbUpdateChain = {
  set() {
    return dbUpdateChain
  },
  where() {
    return Promise.resolve([])
  },
}

const fakeDb = {
  select() {
    return dbChain
  },
  update() {
    return dbUpdateChain
  },
  execute() {
    return Promise.resolve({ rows: executeRowsQueue.shift() || [] })
  },
}

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/db") {
    return { db: fakeDb }
  }
  return originalLoad.call(this, request, parent, isMain)
}

test.after(() => {
  nodeModule._load = originalLoad
})

test("generic AI entry title filters exclude agent-scoped conversations", async () => {
  const { getAiEntryConversationTitleFilters } = await import("./repository")

  assert.deepEqual(
    getAiEntryConversationTitleFilters("chat", null),
    {
      titlePrefix: "[ai-entry] ",
      excludeAgentPrefix: "[ai-entry] [agent:",
    },
  )
})

test("agent AI entry title filters only include the requested agent scope", async () => {
  const { getAiEntryConversationTitleFilters } = await import("./repository")

  assert.deepEqual(
    getAiEntryConversationTitleFilters("chat", "executive-ppt"),
    {
      titlePrefix: "[ai-entry] [agent:executive-ppt] ",
      excludeAgentPrefix: null,
    },
  )
})

test("agent conversations use the first user prompt as title on first turn", async () => {
  const { resolveAiEntryConversationTitleUpdate } = await import("./repository")

  assert.equal(
    resolveAiEntryConversationTitleUpdate({
      currentTitle: "[ai-entry] [agent:executive-growth] 增长顾问",
      userPrompt: "请分析增长问题",
      existingMessageCount: 0,
      scope: "chat",
      agentId: "executive-growth",
    }),
    "[ai-entry] [agent:executive-growth] 请分析增长问题",
  )
})

test("non-agent conversations still retitle from first prompt", async () => {
  const { resolveAiEntryConversationTitleUpdate } = await import("./repository")

  assert.equal(
    resolveAiEntryConversationTitleUpdate({
      currentTitle: "[ai-entry] New chat",
      userPrompt: "帮我起草一封邮件给客户",
      existingMessageCount: 0,
      scope: "chat",
      agentId: null,
    }),
    "[ai-entry] 帮我起草一封邮件给客户",
  )
})

test("AI entry message history preserves database timestamps", async () => {
  const { listAiEntryMessages } = await import("./repository")
  const conversationCreatedAt = new Date("2024-01-01T00:00:00.000Z")
  const userCreatedAt = new Date("2024-01-02T03:04:05.000Z")
  const assistantCreatedAt = new Date("2024-01-02T03:04:09.000Z")

  selectRowsQueue = [
    [
      {
        id: 42,
        title: "[ai-entry] [agent:business-recruitment-specialist] Hiring plan",
        currentModelId: "gpt-5",
        createdAt: conversationCreatedAt,
      },
    ],
  ]
  executeRowsQueue = [[
    { id: 100, role: "user", content: "Need a recruiter scorecard", createdAt: userCreatedAt },
    { id: 101, role: "assistant", content: "Here is a scorecard", createdAt: assistantCreatedAt },
  ], [], [], []]

  const page = await listAiEntryMessages(
    7,
    "42",
    200,
    "chat",
    "business-recruitment-specialist",
  )

  assert.ok(page)
  assert.deepEqual(
    page.data.map((message) => message.created_at),
    [
      Math.floor(userCreatedAt.getTime() / 1000),
      Math.floor(assistantCreatedAt.getTime() / 1000),
    ],
  )
  assert.deepEqual(page.conversation_state, {
    ppt: {
      latestPreview: null,
      latestExport: null,
      phase: "idle",
    },
  })
  assert.deepEqual(page.task_runs, [])
  assert.equal(page.pending_task, null)
})

test("AI entry message history returns structured conversation state", async () => {
  const { listAiEntryMessages } = await import("./repository")

  selectRowsQueue = [
    [
      {
        id: 42,
        title: "[ai-entry] [agent:executive-ppt] PPT plan",
        currentModelId: "gpt-5",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ],
  ]
  executeRowsQueue = [[
    {
      id: 101,
      role: "assistant",
      content:
        "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-b\",\"variantKeys\":[\"variant-a\",\"variant-b\"]} -->",
      createdAt: new Date("2024-01-02T03:04:09.000Z"),
    },
    {
      id: 102,
      role: "assistant",
      content:
        "已生成 PPT 成品：\n<!-- ai-entry-ppt-export-context:{\"previewSessionId\":\"preview-session-1\",\"selectedVariantKey\":\"variant-b\",\"artifactId\":118} -->",
      createdAt: new Date("2024-01-02T03:05:09.000Z"),
    },
  ], [], []]

  const page = await listAiEntryMessages(
    7,
    "42",
    200,
    "chat",
    "executive-ppt",
  )

  assert.ok(page)
  assert.deepEqual(page.conversation_state, {
    ppt: {
      latestPreview: {
        previewSessionId: "preview-session-1",
        defaultVariantKey: "variant-b",
        variantKeys: ["variant-a", "variant-b"],
      },
      latestExport: {
        previewSessionId: "preview-session-1",
        selectedVariantKey: "variant-b",
        artifactId: 118,
      },
      phase: "exported",
    },
  })
  assert.deepEqual(page.task_runs, [])
  assert.equal(page.pending_task, null)
})

test("AI entry message history returns latest pending PPT background task", async () => {
  const { listAiEntryMessages } = await import("./repository")

  selectRowsQueue = [[
    {
      id: 42,
      title: "[ai-entry] [agent:executive-ppt] PPT plan",
      currentModelId: "gpt-5",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  ]]
  executeRowsQueue = [[
    {
      id: 101,
      role: "assistant",
      content: "已开始生成 PPT 预览，当前进入后台处理。",
      createdAt: new Date("2024-01-02T03:04:09.000Z"),
    },
  ], [
    {
      id: 1074,
      status: "running",
      payload: JSON.stringify({
        kind: "ai_entry_ppt_preview",
        conversationId: "42",
        agentId: "executive-ppt",
      }),
      result: JSON.stringify({
        stage: "variant_generating",
        stageLabel: "正在生成预览方向",
        progressCurrent: 2,
        progressTotal: 5,
        events: [
          {
            type: "background_generation_running",
            label: "正在生成预览",
            status: "running",
            at: 1_704_164_709,
          },
        ],
      }),
      createdAt: new Date("2024-01-02T03:05:09.000Z"),
      updatedAt: new Date("2024-01-02T03:05:19.000Z"),
      startedAt: new Date("2024-01-02T03:05:10.000Z"),
    },
  ], [
    {
      id: 1074,
      status: "running",
      payload: JSON.stringify({
        kind: "ai_entry_ppt_preview",
        conversationId: "42",
        agentId: "executive-ppt",
      }),
      result: JSON.stringify({
        stage: "variant_generating",
        stageLabel: "正在生成预览方向",
        progressCurrent: 2,
        progressTotal: 5,
      }),
      createdAt: new Date("2024-01-02T03:05:09.000Z"),
      updatedAt: new Date("2024-01-02T03:05:19.000Z"),
      startedAt: new Date("2024-01-02T03:05:10.000Z"),
    },
  ]]

  const page = await listAiEntryMessages(7, "42", 200, "chat", "executive-ppt")

  assert.ok(page)
  assert.equal(page.task_runs.length, 1)
  assert.equal(page.task_runs[0]?.task_id, "1074")
  assert.equal(page.task_runs[0]?.stage, "variant_generating")
  assert.equal(page.pending_task?.task_id, "1074")
  assert.equal(page.pending_task?.status, "running")
})

test("AI entry message history falls back to direct conversation lookup when agent prefix no longer matches", async () => {
  const { listAiEntryMessages } = await import("./repository")

  selectRowsQueue = [
    [],
    [
      {
        id: 42,
        title: "[ai-entry] Legacy PPT plan",
        currentModelId: "gpt-5",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ],
  ]
  executeRowsQueue = [[
    {
      id: 101,
      role: "assistant",
      content: "已生成 PPT 预览。",
      createdAt: new Date("2024-01-02T03:04:09.000Z"),
    },
  ], [], [], []]

  const page = await listAiEntryMessages(7, "42", 200, "chat", "executive-ppt")

  assert.ok(page)
  assert.equal(page?.conversation?.id, "42")
  assert.equal(page?.data.length, 1)
  assert.equal(page?.data[0]?.content, "已生成 PPT 预览。")
})

test("AI entry message history falls back to pending preview task lookup without agent filter", async () => {
  const { listAiEntryMessages } = await import("./repository")

  selectRowsQueue = [[
    {
      id: 42,
      title: "[ai-entry] Legacy PPT plan",
      currentModelId: "gpt-5",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  ]]
  executeRowsQueue = [[
    {
      id: 101,
      role: "assistant",
      content: "已开始生成 PPT 预览，当前进入后台处理。",
      createdAt: new Date("2024-01-02T03:04:09.000Z"),
    },
  ], [], [], [
    {
      id: 1074,
      status: "running",
      payload: JSON.stringify({
        kind: "ai_entry_ppt_preview",
        conversationId: "42",
        agentId: "legacy-executive-ppt",
      }),
      result: JSON.stringify({
        stage: "brief_validating",
        stageLabel: "已排队，准备校验需求",
        progressCurrent: 0,
        progressTotal: 5,
      }),
      createdAt: new Date("2024-01-02T03:05:09.000Z"),
      updatedAt: new Date("2024-01-02T03:05:09.000Z"),
      startedAt: null,
    },
  ]]

  const page = await listAiEntryMessages(7, "42", 200, "chat", "executive-ppt")

  assert.ok(page)
  assert.equal(page?.pending_task?.task_id, "1074")
  assert.equal(page?.pending_task?.agent_id, "legacy-executive-ppt")
  assert.equal(page?.pending_task?.stage, "brief_validating")
})

test("AI entry message history recovers a finished preview task from persisted queued task context", async () => {
  const { listAiEntryMessages } = await import("./repository")

  selectRowsQueue = [[
    {
      id: 42,
      title: "[ai-entry] [agent:executive-ppt] PPT plan",
      currentModelId: "gpt-5",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  ]]
  executeRowsQueue = [[
    {
      id: 101,
      role: "assistant",
      content: [
        "预览正在后台生成中，请稍候片刻 ☕",
        "",
        "已切换为后台生成：",
        "- 任务 ID: 901",
        "- 状态: 系统会持续轮询，完成后自动回填预览结果。",
      ].join("\n"),
      createdAt: new Date("2024-01-02T03:04:09.000Z"),
    },
  ], [
    {
      id: 901,
      status: "failed",
      payload: JSON.stringify({
        kind: "ai_entry_ppt_preview",
        conversationId: "42",
        agentId: "executive-ppt",
      }),
      result: JSON.stringify({
        stage: "variant_generating",
        stageLabel: "预览生成失败",
        progressCurrent: 2,
        progressTotal: 5,
        error: "ppt_preview_failed",
      }),
      createdAt: new Date("2024-01-02T03:05:09.000Z"),
      updatedAt: new Date("2024-01-02T03:05:29.000Z"),
      startedAt: new Date("2024-01-02T03:05:10.000Z"),
    },
  ], [], [], [
    {
      id: 901,
      status: "failed",
      payload: JSON.stringify({
        kind: "ai_entry_ppt_preview",
        conversationId: "42",
        agentId: "executive-ppt",
      }),
      result: JSON.stringify({
        stage: "variant_generating",
        stageLabel: "预览生成失败",
        progressCurrent: 2,
        progressTotal: 5,
        error: "ppt_preview_failed",
      }),
      createdAt: new Date("2024-01-02T03:05:09.000Z"),
      updatedAt: new Date("2024-01-02T03:05:29.000Z"),
      startedAt: new Date("2024-01-02T03:05:10.000Z"),
    },
  ]]

  const page = await listAiEntryMessages(7, "42", 200, "chat", "executive-ppt")

  assert.ok(page)
  assert.equal(page?.task_runs[0]?.task_id, "901")
  assert.equal(page?.task_runs[0]?.status, "failed")
  assert.equal(page?.pending_task?.task_id, "901")
  assert.equal(page?.pending_task?.status, "failed")
})

test("AI entry conversation history uses latest message time as updated_at", async () => {
  const { listAiEntryConversations } = await import("./repository")
  const createdAt = new Date("2024-01-01T00:00:00.000Z")
  const latestMessageCreatedAt = new Date("2024-01-05T08:30:00.000Z")

  selectRowsQueue = [
    [
      {
        id: 42,
        title: "[ai-entry] [agent:business-recruitment-specialist] Hiring plan",
        currentModelId: "gpt-5",
        createdAt,
        latestMessageCreatedAt,
      },
    ],
  ]
  executeRowsQueue = [
    [{ conversationId: 42, assistantMessageId: 101 }],
    [],
  ]

  const page = await listAiEntryConversations(
    7,
    20,
    null,
    "chat",
    "business-recruitment-specialist",
  )

  assert.equal(page.data[0]?.created_at, Math.floor(createdAt.getTime() / 1000))
  assert.equal(page.data[0]?.updated_at, Math.floor(latestMessageCreatedAt.getTime() / 1000))
  assert.equal(page.data[0]?.name, "Hiring plan")
  assert.equal(page.data[0]?.has_unread, true)
})

test("AI entry conversation history includes unread and running task indicators", async () => {
  const { listAiEntryConversations } = await import("./repository")

  selectRowsQueue = [[
    {
      id: 42,
      title: "[ai-entry] [agent:executive-ppt] PPT plan",
      currentModelId: "gpt-5",
      metadata: {
        aiEntryUnreadState: {
          lastReadAssistantMessageId: 100,
        },
      },
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      latestMessageCreatedAt: new Date("2024-01-05T08:30:00.000Z"),
    },
  ]]
  executeRowsQueue = [
    [
      { conversationId: 42, assistantMessageId: 101 },
      { conversationId: 42, assistantMessageId: 103 },
    ],
    [{
      conversationId: "42",
      runningTaskCount: 2,
      lastTaskEventAt: new Date("2024-01-05T08:31:00.000Z"),
    }],
  ]

  const page = await listAiEntryConversations(7, 20, null, "chat", "executive-ppt")

  assert.equal(page.data[0]?.has_unread, true)
  assert.equal(page.data[0]?.unread_count, 2)
  assert.equal(page.data[0]?.has_running_ppt_task, true)
  assert.equal(page.data[0]?.running_ppt_task_count, 2)
  assert.equal(
    page.data[0]?.last_task_event_at,
    Math.floor(new Date("2024-01-05T08:31:00.000Z").getTime() / 1000),
  )
})
