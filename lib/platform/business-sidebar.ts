import { buildDashboardBusinessHref, type LocalizedWorkspaceBusinessEntry } from "@/lib/platform/workspace-business"

type BusinessSidebarAgent = {
  agentId: string
  name: string
}

export type BusinessSidebarEntry = LocalizedWorkspaceBusinessEntry & {
  agents: BusinessSidebarAgent[]
}

export type BusinessSidebarAgentItem = {
  agentId: string
  name: string
  href: string
  active: boolean
  highlighted: boolean
}

export type BusinessSidebarEntryItem = {
  slug: string
  title: string
  href: string
  active: boolean
  highlighted: boolean
  visibleAgents: BusinessSidebarAgentItem[]
}

export function buildBusinessSidebarItems({
  entries,
  pathname,
  currentBusinessView,
  currentBusinessAgentId,
  selectedMarketplaceAgentIdSet,
}: {
  entries: BusinessSidebarEntry[]
  pathname: string
  currentBusinessView: string | null
  currentBusinessAgentId: string | null
  selectedMarketplaceAgentIdSet: Set<string>
}) {
  return entries.map((entry) => {
    const active = pathname === "/dashboard/business" && currentBusinessView === entry.slug
    const highlightedAgents = entry.agents.filter((agent) =>
      selectedMarketplaceAgentIdSet.has(agent.agentId),
    )
    const agentsToRender = active ? entry.agents : highlightedAgents
    const visibleAgents = agentsToRender.map((agent, index) => ({
      agentId: agent.agentId,
      name: agent.name,
      href: buildDashboardBusinessHref(entry.slug, { agentId: agent.agentId }),
      active:
        active &&
        (currentBusinessAgentId
          ? currentBusinessAgentId === agent.agentId
          : index === 0),
      highlighted: selectedMarketplaceAgentIdSet.has(agent.agentId),
    }))

    return {
      slug: entry.slug,
      title: entry.title,
      href: buildDashboardBusinessHref(entry.slug, {
        agentId: entry.agents[0]?.agentId || null,
      }),
      active,
      highlighted: highlightedAgents.length > 0,
      visibleAgents,
    }
  })
}
