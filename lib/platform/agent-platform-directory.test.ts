import assert from "node:assert/strict"
import test from "node:test"

import { getAiEntryAgentCatalog, getAiEntryAgentGroups } from "@/lib/ai-entry/agent-catalog"
import { buildAgentPlatformDirectoryGroups, resolveAgentPlatformBuiltinHref } from "@/lib/platform/agent-platform-directory"
import type { CustomAgentView } from "@/lib/platform/custom-agents"

test("resolveAgentPlatformBuiltinHref keeps consulting advisors on the consulting entry", () => {
  assert.equal(resolveAgentPlatformBuiltinHref("general"), "/dashboard/ai")
  assert.equal(resolveAgentPlatformBuiltinHref("executive-brand"), "/dashboard/ai?agent=executive-brand&entry=consulting-advisor")
  assert.equal(resolveAgentPlatformBuiltinHref("business-sales-close"), "/dashboard/business?view=sales-close&agent=business-sales-close")
})

test("buildAgentPlatformDirectoryGroups prepends custom agents with the create card first", () => {
  const customAgent = {
    id: 9,
    enterpriseId: 2,
    ownerUserId: 7,
    sourceAgentId: null,
    linkedWorkflowId: null,
    linkedWorkflowTitle: null,
    linkedWorkflowSlug: null,
    name: "Launch Copilot",
    slug: "launch-copilot",
    category: "custom",
    summary: "Helps with launches.",
    systemPrompt: "",
    systemPromptSummary: null,
    goal: null,
    scope: null,
    guardrails: null,
    defaultOutputType: "text",
    runtimeModelOptions: null,
    knowledgeBindings: [],
    knowledgeBindingDetails: [],
    enterpriseKnowledgeDatasetIds: [],
    enterpriseKnowledgeBindingDetails: [],
    knowledgeRetrievalPolicy: null,
    toolBindings: null,
    skillBindings: null,
    mcpBindings: null,
    artifactKinds: [],
    visibility: "private",
    status: "draft",
    metadata: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    executionMode: "direct_agent",
    businessBindings: [],
    workflowBindings: [],
    canEdit: true,
    canManageLifecycle: true,
  } satisfies CustomAgentView

  const groups = buildAgentPlatformDirectoryGroups({
    locale: "zh",
    builtinAgents: getAiEntryAgentCatalog(),
    builtinGroups: getAiEntryAgentGroups(),
    customAgents: [customAgent],
  })

  assert.equal(groups[0]?.id, "custom")
  assert.equal(groups[0]?.cards[0]?.kind, "create")
  assert.equal(groups[0]?.cards[1]?.kind, "custom")
  assert.equal(groups[0]?.cards[1]?.title, "Launch Copilot")
})

test("buildAgentPlatformDirectoryGroups keeps executive advisors eligible for business-menu mounting", () => {
  const groups = buildAgentPlatformDirectoryGroups({
    locale: "zh",
    builtinAgents: getAiEntryAgentCatalog(),
    builtinGroups: getAiEntryAgentGroups(),
    customAgents: [],
  })

  const executiveGroup = groups.find((group) => group.id === "executive")
  const brandAdvisorCard = executiveGroup?.cards.find((card) => card.kind === "builtin" && card.id === "executive-brand")

  assert.equal(brandAdvisorCard?.kind, "builtin")
  assert.equal(brandAdvisorCard?.businessMenuAgentId, "executive-brand")
})

test("buildAgentPlatformDirectoryGroups appends imported registry sections into agent platform", () => {
  const groups = buildAgentPlatformDirectoryGroups({
    locale: "zh",
    builtinAgents: getAiEntryAgentCatalog(),
    builtinGroups: getAiEntryAgentGroups(),
    customAgents: [],
    importedAgents: [
      {
        agentId: "agency-marketing-email-strategist",
        name: "邮件营销策略师",
        summary: "围绕分层、自动化和投递率组织邮件增长系统。",
        sourceCategory: "marketing",
        sourceCategoryLabel: "营销",
        nativeHref: "/dashboard/business?view=marketing&agent=agency-marketing-email-strategist",
      },
    ],
  })

  const importedGroup = groups.find((group) => group.id === "imported:marketing")
  const importedCard = importedGroup?.cards.find((card) => card.kind === "builtin" && card.id === "agency-marketing-email-strategist")

  assert.equal(importedGroup?.label, "营销")
  assert.equal(importedCard?.kind, "builtin")
  assert.equal(importedCard?.businessMenuAgentId, "agency-marketing-email-strategist")
})
