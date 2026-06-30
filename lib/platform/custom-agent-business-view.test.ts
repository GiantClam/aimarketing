import assert from "node:assert/strict"
import test from "node:test"

import {
  buildBusinessWorkbenchCustomAgents,
  buildSelectedCustomBusinessMenuAgents,
  listCustomAgentBoundBusinessSlugs,
  listBusinessScopedCustomAgents,
} from "@/lib/platform/custom-agent-business-view"
import type { CustomAgentView } from "@/lib/platform/custom-agents"

function buildAgent(overrides: Partial<CustomAgentView>): CustomAgentView {
  return {
    id: 1,
    enterpriseId: 7,
    ownerUserId: 9,
    sourceAgentId: null,
    linkedWorkflowId: null,
    linkedWorkflowTitle: null,
    linkedWorkflowSlug: null,
    name: "Agent",
    slug: "agent",
    category: "custom",
    summary: "Summary",
    systemPrompt: "System prompt",
    systemPromptSummary: null,
    goal: null,
    scope: null,
    guardrails: null,
    defaultOutputType: "brief",
    runtimeModelOptions: null,
    knowledgeBindings: [],
    knowledgeBindingDetails: [],
    enterpriseKnowledgeDatasetIds: [],
    enterpriseKnowledgeBindingDetails: [],
    knowledgeRetrievalPolicy: null,
    toolBindings: null,
    skillBindings: null,
    mcpBindings: null,
    artifactKinds: ["brief"],
    visibility: "private",
    status: "draft",
    metadata: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-06-29T00:00:00.000Z"),
    updatedAt: new Date("2026-06-29T00:00:00.000Z"),
    executionMode: "direct_agent",
    businessBindings: [],
    workflowBindings: [],
    canEdit: true,
    canManageLifecycle: true,
    ...overrides,
  }
}

test("listBusinessScopedCustomAgents filters by enabled business binding and sorts by priority", () => {
  const result = listBusinessScopedCustomAgents(
    [
      buildAgent({
        id: 11,
        name: "Later agent",
        slug: "later-agent",
        updatedAt: new Date("2026-06-29T02:00:00.000Z"),
        businessBindings: [{ id: 1, businessSlug: "content-growth", displayPriority: 40, enabled: true }],
      }),
      buildAgent({
        id: 12,
        name: "Top agent",
        slug: "top-agent",
        linkedWorkflowId: 88,
        linkedWorkflowTitle: "Proposal workflow",
        executionMode: "workflow_backed",
        status: "published",
        visibility: "shared",
        artifactKinds: ["brief", "report"],
        workflowBindings: [
          {
            id: 5,
            workflowId: 88,
            workflowTitle: "Proposal workflow",
            workflowSlug: "sales-proposal",
            nodeRole: "strategy",
            inputSchema: null,
            outputSchema: null,
            knowledgeSourceIds: [],
            retrievalMode: null,
            enabled: true,
          },
        ],
        updatedAt: new Date("2026-06-29T01:00:00.000Z"),
        businessBindings: [
          { id: 2, businessSlug: "content-growth", displayPriority: 10, enabled: true },
          { id: 3, businessSlug: "sales-close", displayPriority: 5, enabled: true },
        ],
      }),
      buildAgent({
        id: 13,
        name: "Disabled binding",
        slug: "disabled-binding",
        businessBindings: [{ id: 4, businessSlug: "content-growth", displayPriority: 1, enabled: false }],
      }),
    ],
    "content-growth",
  )

  assert.deepEqual(
    result.map((agent) => ({ id: agent.id, name: agent.name })),
    [
      { id: 12, name: "Top agent" },
      { id: 11, name: "Later agent" },
    ],
  )
  assert.equal(result[0]?.linkedWorkflowId, 88)
  assert.deepEqual(result[0]?.workflowLabels, ["Proposal workflow"])
})

test("buildBusinessWorkbenchCustomAgents includes published direct and workflow-backed agents", () => {
  const result = buildBusinessWorkbenchCustomAgents(
    [
      buildAgent({
        id: 21,
        name: "Direct agent",
        slug: "direct-agent",
        status: "published",
        businessBindings: [{ id: 7, businessSlug: "content-growth", displayPriority: 20, enabled: true }],
      }),
      buildAgent({
        id: 22,
        name: "Workflow agent",
        slug: "workflow-agent",
        status: "published",
        goal: "提升发布节奏",
        executionMode: "workflow_backed",
        linkedWorkflowId: 501,
        linkedWorkflowTitle: "Campaign launch",
        workflowBindings: [
          {
            id: 8,
            workflowId: 501,
            workflowTitle: "Campaign launch",
            workflowSlug: "campaign-launch",
            nodeRole: "strategy",
            inputSchema: null,
            outputSchema: null,
            knowledgeSourceIds: [],
            retrievalMode: null,
            enabled: true,
          },
        ],
        businessBindings: [{ id: 9, businessSlug: "content-growth", displayPriority: 10, enabled: true }],
      }),
      buildAgent({
        id: 23,
        name: "Draft agent",
        slug: "draft-agent",
        status: "draft",
        businessBindings: [{ id: 10, businessSlug: "content-growth", displayPriority: 1, enabled: true }],
      }),
    ],
    "content-growth",
    "zh",
  )

  assert.deepEqual(
    result.map((agent) => ({
      id: agent.agentId,
      mode: agent.executionMode,
      workflowId: agent.linkedWorkflowId ?? null,
    })),
    [
      { id: "custom-agent:22", mode: "workflow_backed", workflowId: 501 },
      { id: "custom-agent:21", mode: "direct_agent", workflowId: null },
    ],
  )
  assert.match(result[0]?.samplePrompts[0] || "", /可执行方案/)
})

test("buildSelectedCustomBusinessMenuAgents expands selected published agents across enabled bindings", () => {
  const result = buildSelectedCustomBusinessMenuAgents(
    [
      buildAgent({
        id: 31,
        name: "Shared operator",
        slug: "shared-operator",
        status: "published",
        summary: "Handles cross-functional work.",
        businessBindings: [
          { id: 11, businessSlug: "content-growth", displayPriority: 20, enabled: true },
          { id: 12, businessSlug: "engineering", displayPriority: 10, enabled: true },
        ],
      }),
      buildAgent({
        id: 32,
        name: "Draft operator",
        slug: "draft-operator",
        status: "draft",
        businessBindings: [{ id: 13, businessSlug: "content-growth", displayPriority: 5, enabled: true }],
      }),
    ],
    "en",
    ["custom-agent:31", "custom-agent:32"],
  )

  assert.deepEqual(
    result.map((agent) => ({ agentId: agent.agentId, businessSlug: agent.businessSlug })),
    [
      { agentId: "custom-agent:31", businessSlug: "engineering" },
      { agentId: "custom-agent:31", businessSlug: "content-growth" },
    ],
  )
})

test("listCustomAgentBoundBusinessSlugs returns enabled business slugs once", () => {
  const result = listCustomAgentBoundBusinessSlugs([
    buildAgent({
      businessBindings: [
        { id: 21, businessSlug: "content-growth", displayPriority: 10, enabled: true },
        { id: 22, businessSlug: "content-growth", displayPriority: 30, enabled: true },
        { id: 23, businessSlug: "engineering", displayPriority: 20, enabled: true },
        { id: 24, businessSlug: "sales", displayPriority: 40, enabled: false },
      ],
    }),
  ])

  assert.deepEqual(result, ["content-growth", "engineering"])
})
