import assert from "node:assert/strict"
import test from "node:test"

import {
  findLatestWorkflowRunRecordForWorkflow,
  resolveWorkflowIdFromTaskRunRecord,
  resolveWorkflowResumeNodeExecution,
  resolveWorkflowResumeNodeKey,
} from "@/lib/workflows/manual-resume"
import {
  normalizeWorkflowNodeStatusesForRunningRun,
  normalizeWorkflowRunStatusFromNodeExecutions,
  type WorkflowRunDetail,
} from "@/lib/workflows/store"

test("resolveWorkflowIdFromTaskRunRecord prefers input payload workflow id", () => {
  assert.equal(
    resolveWorkflowIdFromTaskRunRecord({
      inputPayload: { workflowId: 12 },
      normalizedResult: { workflowId: 15 },
    }),
    12,
  )
})

test("findLatestWorkflowRunRecordForWorkflow returns the newest matching workflow run", () => {
  const run = findLatestWorkflowRunRecordForWorkflow(
    [
      {
        id: 7,
        enterpriseId: 1,
        userId: 1,
        kind: "workflow",
        itemType: "workflow",
        itemSlug: "alpha",
        externalRunId: null,
        externalSystem: null,
        status: "succeeded",
        inputPayload: { workflowId: 2 },
        normalizedResult: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date("2026-06-15T10:00:00Z"),
        updatedAt: new Date("2026-06-15T10:00:00Z"),
      },
      {
        id: 9,
        enterpriseId: 1,
        userId: 1,
        kind: "workflow",
        itemType: "workflow",
        itemSlug: "alpha",
        externalRunId: null,
        externalSystem: null,
        status: "failed",
        inputPayload: { workflowId: 4 },
        normalizedResult: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date("2026-06-15T11:00:00Z"),
        updatedAt: new Date("2026-06-15T11:00:00Z"),
      },
    ],
    4,
  )

  assert.equal(run?.id, 9)
})

test("findLatestWorkflowRunRecordForWorkflow returns active runs so manual clicks stay idempotent", () => {
  const run = findLatestWorkflowRunRecordForWorkflow(
    [
      {
        id: 11,
        enterpriseId: 1,
        userId: 1,
        kind: "workflow",
        itemType: "workflow",
        itemSlug: "alpha",
        externalRunId: null,
        externalSystem: null,
        status: "queued",
        inputPayload: { workflowId: 4 },
        normalizedResult: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date("2026-06-15T11:30:00Z"),
        updatedAt: new Date("2026-06-15T11:30:00Z"),
      },
      {
        id: 9,
        enterpriseId: 1,
        userId: 1,
        kind: "workflow",
        itemType: "workflow",
        itemSlug: "alpha",
        externalRunId: null,
        externalSystem: null,
        status: "failed",
        inputPayload: { workflowId: 4 },
        normalizedResult: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date("2026-06-15T11:00:00Z"),
        updatedAt: new Date("2026-06-15T11:00:00Z"),
      },
    ],
    4,
  )

  assert.equal(run?.id, 11)
})

test("resolveWorkflowResumeNodeKey picks the first failed node in workflow order", () => {
  const detail = {
    run: {} as WorkflowRunDetail["run"],
    workflow: {
      id: 1,
      enterpriseId: 1,
      ownerUserId: 1,
      title: "Test",
      slug: "test",
      status: "draft",
      triggerType: "manual",
      description: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      nodes: [
        { nodeKey: "input-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: {} },
        { nodeKey: "llm-1", type: "llm_generate", title: "LLM", positionX: 0, positionY: 0, config: {} },
        { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
      ],
      edges: [],
    },
    nodeExecutions: [
      {
        id: 1,
        runId: 5,
        workflowId: 1,
        nodeKey: "input-1",
        nodeType: "text_input",
        status: "succeeded",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        runId: 5,
        workflowId: 1,
        nodeKey: "llm-1",
        nodeType: "llm_generate",
        status: "failed",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        runId: 5,
        workflowId: 1,
        nodeKey: "img-1",
        nodeType: "image_generate",
        status: "cancelled",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  } satisfies WorkflowRunDetail

  assert.equal(resolveWorkflowResumeNodeKey(detail), "llm-1")
})

test("resolveWorkflowResumeNodeKey falls back to the first cancelled node when there is no failed node", () => {
  const detail = {
    run: {} as WorkflowRunDetail["run"],
    workflow: {
      id: 1,
      enterpriseId: 1,
      ownerUserId: 1,
      title: "Test",
      slug: "test",
      status: "draft",
      triggerType: "manual",
      description: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      nodes: [
        { nodeKey: "input-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: {} },
        { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
      ],
      edges: [],
    },
    nodeExecutions: [
      {
        id: 1,
        runId: 5,
        workflowId: 1,
        nodeKey: "input-1",
        nodeType: "text_input",
        status: "succeeded",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        runId: 5,
        workflowId: 1,
        nodeKey: "img-1",
        nodeType: "image_generate",
        status: "cancelled",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  } satisfies WorkflowRunDetail

  assert.equal(resolveWorkflowResumeNodeKey(detail), "img-1")
})

test("resolveWorkflowResumeNodeExecution returns the latest execution record for the chosen resume node", () => {
  const detail = {
    run: {} as WorkflowRunDetail["run"],
    workflow: {
      id: 1,
      enterpriseId: 1,
      ownerUserId: 1,
      title: "Test",
      slug: "test",
      status: "draft",
      triggerType: "manual",
      description: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      nodes: [
        { nodeKey: "image-1", type: "image_generate", title: "Image 1", positionX: 0, positionY: 0, config: {} },
        { nodeKey: "image-2", type: "image_generate", title: "Image 2", positionX: 0, positionY: 0, config: {} },
      ],
      edges: [],
    },
    nodeExecutions: [
      {
        id: 1,
        runId: 5,
        workflowId: 1,
        nodeKey: "image-1",
        nodeType: "image_generate",
        status: "failed",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        runId: 5,
        workflowId: 1,
        nodeKey: "image-1",
        nodeType: "image_generate",
        status: "failed",
        providerId: "pptoken",
        modelId: "gpt-image-2",
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  } satisfies WorkflowRunDetail

  const execution = resolveWorkflowResumeNodeExecution(detail)
  assert.equal(execution?.nodeKey, "image-1")
  assert.equal(execution?.id, 2)
  assert.equal(execution?.providerId, "pptoken")
  assert.equal(execution?.modelId, "gpt-image-2")
})

test("resolveWorkflowResumeNodeKey returns null when there is nothing resumable", () => {
  const detail = {
    run: {} as WorkflowRunDetail["run"],
    workflow: {
      id: 1,
      enterpriseId: 1,
      ownerUserId: 1,
      title: "Test",
      slug: "test",
      status: "draft",
      triggerType: "manual",
      description: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      nodes: [{ nodeKey: "input-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: {} }],
      edges: [],
    },
    nodeExecutions: [
      {
        id: 1,
        runId: 5,
        workflowId: 1,
        nodeKey: "input-1",
        nodeType: "text_input",
        status: "succeeded",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  } satisfies WorkflowRunDetail

  assert.equal(resolveWorkflowResumeNodeKey(detail), null)
})


test("normalizeWorkflowRunStatusFromNodeExecutions marks zombie running runs as failed", () => {
  const now = new Date()
  const run = {
    id: 88,
    enterpriseId: 151,
    userId: 96,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "test",
    externalRunId: null,
    externalSystem: null,
    status: "running",
    inputPayload: { workflowId: 2 },
    normalizedResult: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    events: [],
    artifacts: [],
    workItems: [],
    knowledgeSaveJobs: [],
  } satisfies WorkflowRunDetail["run"]

  const nodeExecutions = [
    {
      id: 124,
      runId: 88,
      workflowId: 2,
      nodeKey: "text-input-1",
      nodeType: "text_input",
      status: "succeeded",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 127,
      runId: 88,
      workflowId: 2,
      nodeKey: "image-3",
      nodeType: "image_generate",
      status: "failed",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 129,
      runId: 88,
      workflowId: 2,
      nodeKey: "image-4",
      nodeType: "image_generate",
      status: "cancelled",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: null,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies WorkflowRunDetail["nodeExecutions"]

  const normalized = normalizeWorkflowRunStatusFromNodeExecutions(run, nodeExecutions)

  assert.equal(normalized.status, "failed")
  assert.ok(normalized.finishedAt)
})

test("normalizeWorkflowRunStatusFromNodeExecutions derives running from mixed non-terminal node states", () => {
  const now = new Date()
  const run = {
    id: 91,
    enterpriseId: 151,
    userId: 96,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "test",
    externalRunId: null,
    externalSystem: null,
    status: "failed",
    inputPayload: { workflowId: 2 },
    normalizedResult: null,
    startedAt: null,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
    events: [],
    artifacts: [],
    workItems: [],
    knowledgeSaveJobs: [],
  } satisfies WorkflowRunDetail["run"]

  const nodeExecutions = [
    {
      id: 200,
      runId: 91,
      workflowId: 2,
      nodeKey: "text-input-1",
      nodeType: "text_input",
      status: "succeeded",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 201,
      runId: 91,
      workflowId: 2,
      nodeKey: "image-3",
      nodeType: "image_generate",
      status: "queued",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies WorkflowRunDetail["nodeExecutions"]

  const normalized = normalizeWorkflowRunStatusFromNodeExecutions(run, nodeExecutions)

  assert.equal(normalized.status, "running")
  assert.equal(normalized.finishedAt, null)
})

test("normalizeWorkflowRunStatusFromNodeExecutions derives success once every node succeeds", () => {
  const now = new Date()
  const run = {
    id: 92,
    enterpriseId: 151,
    userId: 96,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "test",
    externalRunId: null,
    externalSystem: null,
    status: "running",
    inputPayload: { workflowId: 2 },
    normalizedResult: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    events: [],
    artifacts: [],
    workItems: [],
    knowledgeSaveJobs: [],
  } satisfies WorkflowRunDetail["run"]

  const nodeExecutions = [
    {
      id: 202,
      runId: 92,
      workflowId: 2,
      nodeKey: "text-input-1",
      nodeType: "text_input",
      status: "succeeded",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 203,
      runId: 92,
      workflowId: 2,
      nodeKey: "image-3",
      nodeType: "image_generate",
      status: "succeeded",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies WorkflowRunDetail["nodeExecutions"]

  const normalized = normalizeWorkflowRunStatusFromNodeExecutions(run, nodeExecutions)

  assert.equal(normalized.status, "succeeded")
  assert.ok(normalized.finishedAt)
})

test("normalizeWorkflowNodeStatusesForRunningRun exposes the next ready queued node as running", () => {
  const now = new Date()
  const nodeExecutions = [
    {
      id: 1,
      runId: 88,
      workflowId: 2,
      nodeKey: "llm-1",
      nodeType: "llm_generate",
      status: "succeeded",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      runId: 88,
      workflowId: 2,
      nodeKey: "image-3",
      nodeType: "image_generate",
      status: "queued",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      runId: 88,
      workflowId: 2,
      nodeKey: "image-4",
      nodeType: "image_generate",
      status: "queued",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies WorkflowRunDetail["nodeExecutions"]

  const normalized = normalizeWorkflowNodeStatusesForRunningRun(
    { status: "running" },
    nodeExecutions,
    [
      { sourceNodeKey: "llm-1", targetNodeKey: "image-3", inputName: "text" },
      { sourceNodeKey: "image-3", targetNodeKey: "image-4", inputName: "images" },
    ],
  )

  assert.equal(normalized.find((execution) => execution.nodeKey === "image-3")?.status, "running")
  assert.equal(normalized.find((execution) => execution.nodeKey === "image-4")?.status, "queued")
})

test("normalizeWorkflowNodeStatusesForRunningRun promotes ready queued branches even when another branch is already running", () => {
  const now = new Date()
  const nodeExecutions = [
    {
      id: 1,
      runId: 88,
      workflowId: 2,
      nodeKey: "llm-1",
      nodeType: "llm_generate",
      status: "succeeded",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      runId: 88,
      workflowId: 2,
      nodeKey: "image-3",
      nodeType: "image_generate",
      status: "running",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      runId: 88,
      workflowId: 2,
      nodeKey: "image-4",
      nodeType: "image_generate",
      status: "queued",
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies WorkflowRunDetail["nodeExecutions"]

  const normalized = normalizeWorkflowNodeStatusesForRunningRun(
    { status: "running" },
    nodeExecutions,
    [
      { sourceNodeKey: "llm-1", targetNodeKey: "image-3", inputName: "text" },
      { sourceNodeKey: "llm-1", targetNodeKey: "image-4", inputName: "text" },
    ],
  )

  assert.equal(normalized.find((execution) => execution.nodeKey === "image-3")?.status, "running")
  assert.equal(normalized.find((execution) => execution.nodeKey === "image-4")?.status, "running")
})
