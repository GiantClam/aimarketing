import assert from "node:assert/strict"
import test from "node:test"

import {
  appendWorkflowStoredTitleOrdinal,
  collectWorkflowPersistenceTargets,
  collectWorkflowPersistedSourceNodeKeys,
  ensureUniqueWorkflowStoredTitle,
  persistFinalWorkflowOutputs,
} from "@/lib/workflows/run-persistence"
import { createInMemoryPlatformTaskRunStore } from "@/lib/platform/task-run-store"
import type { WorkflowDefinitionEdge, WorkflowDefinitionNode } from "@/lib/workflows/schema"

test("collectWorkflowPersistedSourceNodeKeys only persists nodes explicitly connected to product_store", () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Prompt", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "video-1", type: "video_generate", title: "Video", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-1", type: "product_store", title: "Asset Library", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "img-1", inputName: "text" },
    { sourceNodeKey: "img-1", targetNodeKey: "video-1", inputName: "image" },
    { sourceNodeKey: "video-1", targetNodeKey: "store-1", inputName: "video" },
  ]

  assert.deepEqual(collectWorkflowPersistedSourceNodeKeys({ nodes, edges }), ["video-1"])
})

test("collectWorkflowPersistedSourceNodeKeys dedupes multiple edges into one storage node", () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "llm-1", type: "llm_generate", title: "LLM", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-1", type: "product_store", title: "Asset Library", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-2", type: "product_store", title: "Asset Library 2", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "img-1", targetNodeKey: "store-1", inputName: "image" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2", inputName: "image" },
  ]

  assert.deepEqual(collectWorkflowPersistedSourceNodeKeys({ nodes, edges }), ["img-1"])
})

test("collectWorkflowPersistenceTargets keeps one target per product store node", () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-1", type: "product_store", title: "Asset Library", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-2", type: "product_store", title: "Asset Library 2", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "img-1", targetNodeKey: "store-1", inputName: "image" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2", inputName: "image" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2", inputName: "assets" },
  ]

  assert.deepEqual(collectWorkflowPersistenceTargets({ nodes, edges }), [
    { sourceNodeKey: "img-1", targetNodeKey: "store-1" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2" },
  ])
})

test("appendWorkflowStoredTitleOrdinal preserves file extensions", () => {
  assert.equal(appendWorkflowStoredTitleOrdinal("campaign.png", 1), "campaign.png")
  assert.equal(appendWorkflowStoredTitleOrdinal("campaign.png", 2), "campaign 2.png")
  assert.equal(appendWorkflowStoredTitleOrdinal("campaign", 3), "campaign 3")
})

test("ensureUniqueWorkflowStoredTitle increments on existing names", () => {
  const reserved = new Set(["campaign.png", "campaign 2.png"].map((value) => value.toLowerCase()))
  assert.equal(ensureUniqueWorkflowStoredTitle("campaign.png", reserved), "campaign 3.png")
  assert.equal(ensureUniqueWorkflowStoredTitle("fresh-name", reserved), "fresh-name")
})

test("persistFinalWorkflowOutputs can fan out artifacts into work library and knowledge queue", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 1,
    userId: 7,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "campaign-launch",
  })
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "writer-1", type: "writer", title: "Writer", positionX: 0, positionY: 0, config: {} },
    {
      nodeKey: "store-1",
      type: "product_store",
      title: "Asset Library",
      positionX: 0,
      positionY: 0,
      config: {
        storedFileName: "Launch brief.md",
        persistToWorkLibrary: true,
        persistToKnowledgeBase: true,
      },
    },
  ]

  const persisted = await persistFinalWorkflowOutputs({
    runId: run.id,
    workflowId: 18,
    workflowSlug: "campaign-launch",
    workflowTitle: "Campaign Launch",
    workflowUpdatedAt: new Date("2026-06-29T12:00:00.000Z"),
    enterpriseId: 1,
    ownerUserId: 7,
    nodeStates: {
      "writer-1": {
        nodeKey: "writer-1",
        status: "succeeded",
        attemptCount: 1,
        output: {
          text: ["Launch copy"],
        },
        startedAt: new Date("2026-06-29T12:01:00.000Z"),
        finishedAt: new Date("2026-06-29T12:01:10.000Z"),
        creditsConsumed: 3,
      },
    },
    workflowNodes: nodes,
    persistenceTargets: [{ sourceNodeKey: "writer-1", targetNodeKey: "store-1" }],
    store,
  })

  assert.equal(persisted.artifactIds.length, 1)
  assert.equal(persisted.workItemIds.length, 1)
  assert.equal(persisted.knowledgeSaveJobIds.length, 1)

  const hydratedRun = await store.getPlatformTaskRun(run.id)
  assert.ok(hydratedRun)
  assert.equal(hydratedRun?.artifacts.length, 1)
  assert.equal(hydratedRun?.workItems.length, 1)
  assert.equal(hydratedRun?.knowledgeSaveJobs.length, 1)
  assert.equal(hydratedRun?.workItems[0]?.metadata?.workflowSlug, "campaign-launch")
  assert.equal(hydratedRun?.knowledgeSaveJobs[0]?.requestPayload?.source, "workflow")
})

test("persistFinalWorkflowOutputs routes knowledge_write nodes into the manual knowledge queue", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 1,
    userId: 7,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "knowledge-loop",
  })

  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "write-1", type: "knowledge_write", title: "Knowledge write", positionX: 0, positionY: 0, config: {} },
  ]

  const persisted = await persistFinalWorkflowOutputs({
    runId: run.id,
    workflowId: 29,
    workflowSlug: "knowledge-loop",
    workflowTitle: "Knowledge Loop",
    workflowUpdatedAt: new Date("2026-06-30T08:00:00.000Z"),
    enterpriseId: 1,
    ownerUserId: 7,
    nodeStates: {
      "write-1": {
        nodeKey: "write-1",
        status: "succeeded",
        attemptCount: 1,
        output: {
          text: ["Approved summary"],
        },
        metadata: {
          persistenceTarget: "knowledge_write",
          manualConfirmationRequired: true,
          knowledgeDocumentTitle: "Workflow recap",
          knowledgeDraftContent: "# Workflow recap\n\nApproved summary",
          datasetId: 88,
          datasetScope: "enterprise",
          knowledgeCategory: "campaign",
          targetType: "knowledge_base",
        },
        startedAt: new Date("2026-06-30T08:01:00.000Z"),
        finishedAt: new Date("2026-06-30T08:01:05.000Z"),
        creditsConsumed: 1,
      },
    },
    workflowNodes: nodes,
    persistenceTargets: [],
    store,
  })

  assert.equal(persisted.artifactIds.length, 1)
  assert.equal(persisted.workItemIds.length, 0)
  assert.equal(persisted.knowledgeSaveJobIds.length, 1)

  const hydratedRun = await store.getPlatformTaskRun(run.id)
  assert.ok(hydratedRun)
  assert.equal(hydratedRun?.artifacts.length, 1)
  assert.equal(hydratedRun?.artifacts[0]?.title, "Workflow recap")
  assert.equal(hydratedRun?.knowledgeSaveJobs.length, 1)
  assert.equal(hydratedRun?.knowledgeSaveJobs[0]?.status, "queued")
  assert.equal(hydratedRun?.knowledgeSaveJobs[0]?.requestPayload?.persistedFrom, "knowledge_write")
  assert.equal(hydratedRun?.knowledgeSaveJobs[0]?.requestPayload?.manualConfirmationRequired, true)
  assert.equal(hydratedRun?.knowledgeSaveJobs[0]?.requestPayload?.datasetId, 88)
})
