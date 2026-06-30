import assert from "node:assert/strict"
import test from "node:test"

import { summarizePlatformWorkflowGovernance } from "@/lib/platform/workflow-governance-summary"

test("summarizePlatformWorkflowGovernance aggregates workflow coverage and recent run outcomes", () => {
  const summary = summarizePlatformWorkflowGovernance({
    locale: "en",
    workflows: [
      {
        id: 11,
        enterpriseId: 1,
        ownerUserId: 2,
        title: "SEO Engine",
        slug: "seo-engine",
        status: "live",
        triggerType: "manual",
        description: null,
        metadata: {
          qualityGates: ["Brand consistency", "Asset archive"],
          enterprisePresets: [
            {
              id: "preset-1",
              name: "Default",
              reviewRules: ["Legal review"],
              isDefault: true,
            },
          ],
        },
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-20T00:00:00.000Z"),
        nodes: [
          { nodeKey: "read", type: "knowledge_retrieve", title: "Read", positionX: 0, positionY: 0, config: {} },
          { nodeKey: "write", type: "knowledge_write", title: "Write", positionX: 1, positionY: 1, config: {} },
          { nodeKey: "store", type: "product_store", title: "Store", positionX: 2, positionY: 2, config: { persistToKnowledgeBase: true } },
        ],
        edges: [],
      },
      {
        id: 12,
        enterpriseId: 1,
        ownerUserId: 2,
        title: "Brand Factory",
        slug: "brand-factory",
        status: "draft",
        triggerType: "manual",
        description: null,
        metadata: null,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-20T00:00:00.000Z"),
        nodes: [],
        edges: [],
      },
    ],
    recentRuns: [
      {
        id: 101,
        status: "succeeded",
        itemSlug: "seo-engine",
        normalizedResult: {
          workflowId: 11,
          persistedArtifactIds: [1, 2],
          persistedWorkItemIds: [9],
          persistedKnowledgeSaveJobIds: [20],
        },
        startedAt: new Date("2026-06-29T00:00:00.000Z"),
        finishedAt: new Date("2026-06-29T00:05:00.000Z"),
      },
      {
        id: 102,
        status: "failed",
        itemSlug: "seo-engine",
        normalizedResult: {
          workflowId: 11,
        },
        startedAt: new Date("2026-06-29T01:00:00.000Z"),
        finishedAt: new Date("2026-06-29T01:10:00.000Z"),
      },
      {
        id: 103,
        status: "running",
        itemSlug: "brand-factory",
        normalizedResult: {
          workflowId: 12,
          persistedArtifactIds: [5],
        },
        startedAt: new Date("2026-06-29T02:00:00.000Z"),
        finishedAt: null,
      },
    ],
    nodeExecutionsByRunId: new Map([
      [
        101,
        [
          { id: 1, runId: 101, workflowId: 11, nodeKey: "n1", nodeType: "agent_execute", status: "succeeded", providerId: null, modelId: null, taskRunId: null, outputPayload: null, errorMessage: null, creditsConsumed: 3, startedAt: null, finishedAt: null, createdAt: new Date(), updatedAt: new Date() },
          { id: 2, runId: 101, workflowId: 11, nodeKey: "n2", nodeType: "writer", status: "succeeded", providerId: null, modelId: null, taskRunId: null, outputPayload: null, errorMessage: null, creditsConsumed: 2, startedAt: null, finishedAt: null, createdAt: new Date(), updatedAt: new Date() },
        ],
      ],
      [
        102,
        [
          { id: 3, runId: 102, workflowId: 11, nodeKey: "n1", nodeType: "agent_execute", status: "failed", providerId: null, modelId: null, taskRunId: null, outputPayload: null, errorMessage: "boom", creditsConsumed: 1, startedAt: null, finishedAt: null, createdAt: new Date(), updatedAt: new Date() },
        ],
      ],
      [
        103,
        [
          { id: 4, runId: 103, workflowId: 12, nodeKey: "n1", nodeType: "agent_execute", status: "running", providerId: null, modelId: null, taskRunId: null, outputPayload: null, errorMessage: null, creditsConsumed: 4, startedAt: null, finishedAt: null, createdAt: new Date(), updatedAt: new Date() },
        ],
      ],
    ]),
  })

  assert.equal(summary.totalWorkflowCount, 2)
  assert.equal(summary.liveWorkflowCount, 1)
  assert.equal(summary.workflowsWithQualityGates, 1)
  assert.equal(summary.workflowsWithReviewRules, 1)
  assert.equal(summary.workflowsWithKnowledgeLoop, 1)
  assert.equal(summary.recentRunCount, 3)
  assert.equal(summary.recentSucceededRunCount, 1)
  assert.equal(summary.recentFailedRunCount, 1)
  assert.equal(summary.recentActiveRunCount, 1)
  assert.equal(summary.recentSuccessRate, 0.5)
  assert.equal(summary.recentCreditsConsumed, 10)
  assert.equal(summary.recentArtifactCount, 3)
  assert.equal(summary.recentWorkItemCount, 1)
  assert.equal(summary.recentKnowledgeSaveJobCount, 1)
  assert.equal(summary.topWorkflows[0]?.workflowId, 11)
  assert.equal(summary.topWorkflows[0]?.successRate, 0.5)
})
