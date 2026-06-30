import assert from "node:assert/strict"
import test from "node:test"

import { summarizeWorkflowRunGovernance } from "@/lib/workflows/run-governance"

test("summarizeWorkflowRunGovernance surfaces preset, quality gates, and knowledge loop signals", () => {
  const summary = summarizeWorkflowRunGovernance({
    locale: "zh",
    workflow: {
      metadata: {
        qualityGates: ["品牌一致性检查", "合规风险检查", "资产归档检查"],
        enterprisePresets: [
          {
            id: "preset-1",
            name: "SaaS 默认预设",
            industry: "SaaS",
            audience: "CMO",
            brandVoice: "专业克制",
            channelTargets: ["LinkedIn", "官网"],
            reviewRules: ["法务复核", "品牌负责人确认"],
            bannedTerms: ["最强", "第一"],
            allowedKnowledgeDatasetIds: [12, 18],
            notes: "默认走企业官网和 LinkedIn",
            isDefault: true,
          },
        ],
      },
      nodes: [
        { nodeKey: "read-1", type: "knowledge_retrieve", title: "知识检索", config: {} },
        { nodeKey: "compliance-1", type: "agent_execute", title: "合规审计智能体", config: { agentId: "business-compliance-auditor" } },
        { nodeKey: "brand-1", type: "agent_execute", title: "品牌创意智能体", config: { agentId: "business-brand-creative" } },
        { nodeKey: "write-1", type: "knowledge_write", title: "知识写入", config: {} },
        { nodeKey: "store-1", type: "product_store", title: "素材库存储", config: { persistToKnowledgeBase: true } },
      ],
    },
    run: {
      status: "succeeded",
      artifacts: [{ id: 1 }, { id: 2 }],
      workItems: [{ id: 10 }],
      knowledgeSaveJobs: [
        {
          id: 100,
          status: "queued",
          targetType: "knowledge_base",
          requestPayload: { artifactTitle: "Campaign brief" },
        },
      ],
    },
    nodeExecutions: [
      { status: "succeeded", creditsConsumed: 3 },
      { status: "succeeded", creditsConsumed: 4 },
      { status: "failed", creditsConsumed: 1 },
    ],
  })

  assert.equal(summary.totalCreditsConsumed, 8)
  assert.equal(summary.defaultPreset?.name, "SaaS 默认预设")
  assert.deepEqual(summary.reviewRules, ["法务复核", "品牌负责人确认"])
  assert.equal(summary.explicitKnowledgeReadNodes, 1)
  assert.equal(summary.explicitKnowledgeWriteNodes, 1)
  assert.equal(summary.assetToKnowledgeQueueNodes, 1)
  assert.equal(summary.knowledgeSaveJobCount, 1)
  assert.equal(summary.knowledgeSaveJobStatusCounts.queued, 1)
  assert.equal(summary.qualityGates[0]?.status, "tracked")
  assert.equal(summary.qualityGates[1]?.status, "tracked")
  assert.equal(summary.qualityGates[2]?.status, "tracked")
})

test("summarizeWorkflowRunGovernance keeps missing governance signals in attention", () => {
  const summary = summarizeWorkflowRunGovernance({
    locale: "en",
    workflow: {
      metadata: {
        qualityGates: ["Compliance risk check"],
      },
      nodes: [
        { nodeKey: "writer-1", type: "writer", title: "Writer", config: {} },
      ],
    },
    run: {
      status: "failed",
      artifacts: [],
      workItems: [],
      knowledgeSaveJobs: [],
    },
    nodeExecutions: [{ status: "failed", creditsConsumed: 0 }],
  })

  assert.equal(summary.complianceNodeCount, 0)
  assert.equal(summary.qualityGates[0]?.status, "attention")
  assert.deepEqual(summary.qualityGates[0]?.evidence, [])
})
