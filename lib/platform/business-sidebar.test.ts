import assert from "node:assert/strict"
import test from "node:test"

import { buildBusinessSidebarItems } from "@/lib/platform/business-sidebar"

const entries = [
  {
    slug: "content-growth",
    iconKey: "content" as const,
    title: "内容增长",
    summary: "",
    description: "",
    outcomes: [],
    href: "/dashboard/business?view=content-growth",
    workflowSlugs: [],
    relatedLinks: [],
    agents: [
      { agentId: "core-agent", name: "核心 Agent" },
      { agentId: "selected-agent", name: "已添加 Agent" },
    ],
  },
  {
    slug: "brand-creative",
    iconKey: "creative" as const,
    title: "品牌创意",
    summary: "",
    description: "",
    outcomes: [],
    href: "/dashboard/business?view=brand-creative",
    workflowSlugs: [],
    relatedLinks: [],
    agents: [{ agentId: "creative-agent", name: "创意 Agent" }],
  },
]

test("business sidebar keeps selected agents highlighted even when their entry is inactive", () => {
  const items = buildBusinessSidebarItems({
    entries,
    pathname: "/dashboard/agent-platform",
    currentBusinessView: null,
    currentBusinessAgentId: null,
    selectedMarketplaceAgentIdSet: new Set(["selected-agent"]),
  })

  assert.equal(items[0]?.highlighted, true)
  assert.deepEqual(
    items[0]?.visibleAgents.map((agent) => ({
      agentId: agent.agentId,
      highlighted: agent.highlighted,
    })),
    [{ agentId: "selected-agent", highlighted: true }],
  )
  assert.deepEqual(items[1]?.visibleAgents, [])
})

test("business sidebar shows all agents for the active entry and preserves selected highlighting", () => {
  const items = buildBusinessSidebarItems({
    entries,
    pathname: "/dashboard/business",
    currentBusinessView: "content-growth",
    currentBusinessAgentId: "selected-agent",
    selectedMarketplaceAgentIdSet: new Set(["selected-agent"]),
  })

  assert.equal(items[0]?.active, true)
  assert.deepEqual(
    items[0]?.visibleAgents.map((agent) => ({
      agentId: agent.agentId,
      active: agent.active,
      highlighted: agent.highlighted,
    })),
    [
      { agentId: "core-agent", active: false, highlighted: false },
      { agentId: "selected-agent", active: true, highlighted: true },
    ],
  )
})
