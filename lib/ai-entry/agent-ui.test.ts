import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveAiEntryAgentDescription,
  getAiEntryQuickPrompts,
  resolveAiEntryAgentName,
  resolveAiEntryRequestedAgentId,
  resolveAiEntryWorkspaceKicker,
  resolveAiEntryWorkspacePlaceholder,
  resolveAiEntryWorkspaceSubtitle,
  resolveAiEntryWorkspaceTitle,
} from "./agent-ui"

test("resolveAiEntryRequestedAgentId prefers forced then selected then route", () => {
  assert.equal(
    resolveAiEntryRequestedAgentId({
      forcedAgentId: "executive-brand",
      selectedAgentId: "executive-growth",
      routeAgentId: "executive-diagnostic",
    }),
    "executive-brand",
  )

  assert.equal(
    resolveAiEntryRequestedAgentId({
      forcedAgentId: null,
      selectedAgentId: "executive-growth",
      routeAgentId: "executive-diagnostic",
    }),
    "executive-growth",
  )

  assert.equal(
    resolveAiEntryRequestedAgentId({
      forcedAgentId: null,
      selectedAgentId: null,
      routeAgentId: "executive-diagnostic",
    }),
    "executive-diagnostic",
  )
})

test("resolveAiEntryAgentName returns localized built-in agent names", () => {
  assert.equal(resolveAiEntryAgentName("executive-growth", "zh"), "增长顾问")
  assert.equal(resolveAiEntryAgentName("executive-growth", "en"), "Growth Advisor (Executive)")
  assert.equal(resolveAiEntryAgentName("missing-agent", "zh"), null)
})

test("resolveAiEntryWorkspaceTitle prefers agent name over generic title", () => {
  assert.equal(
    resolveAiEntryWorkspaceTitle({
      agentId: "executive-ppt",
      locale: "zh",
      isConsultingEntry: false,
      defaultTitle: "AI 对话",
    }),
    "可编辑 PPT 助手",
  )
})

test("resolveAiEntryAgentDescription returns localized agent descriptions", () => {
  assert.match(
    resolveAiEntryAgentDescription("executive-ppt", "zh") || "",
    /可下载、可编辑的 PPTX/,
  )
})

test("resolveAiEntryWorkspaceSubtitle prefers agent description", () => {
  assert.match(
    resolveAiEntryWorkspaceSubtitle({
      agentId: "executive-ppt",
      locale: "zh",
      isConsultingEntry: false,
      defaultSubtitle: "你说需求，我来生成第一版方案",
    }),
    /可下载、可编辑的 PPTX/,
  )
})

test("resolveAiEntryWorkspaceKicker switches to agent workspace label", () => {
  assert.equal(
    resolveAiEntryWorkspaceKicker({
      agentId: "executive-ppt",
      locale: "zh",
      defaultKicker: "AI 工作台",
    }),
    "Agent 工作台",
  )
})

test("resolveAiEntryWorkspacePlaceholder becomes agent-aware", () => {
  assert.equal(
    resolveAiEntryWorkspacePlaceholder({
      agentId: "executive-ppt",
      agentName: "可编辑 PPT 助手",
      locale: "zh",
      defaultPlaceholder: "输入你的问题...",
    }),
    "请输入你希望可编辑 PPT 助手完成的任务...",
  )
})

test("getAiEntryQuickPrompts returns growth-specific prompts", () => {
  const prompts = getAiEntryQuickPrompts({
    agentId: "executive-growth",
    locale: "zh",
  })

  assert.equal(prompts.length, 3)
  assert.match(prompts[0] || "", /增长瓶颈|30 天实验排期/)
})

test("getAiEntryQuickPrompts falls back to generic prompts", () => {
  const prompts = getAiEntryQuickPrompts({
    agentId: "unknown-agent",
    locale: "en",
  })

  assert.equal(prompts.length, 3)
  assert.match(prompts[0] || "", /conclusions, steps, and deliverables/i)
})
