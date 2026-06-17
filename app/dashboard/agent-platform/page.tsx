import { getServerSessionUser } from "@/lib/auth/server-session"
import { WorkspaceAgencyAgentGallery } from "@/components/platform/workspace-agency-agent-gallery"
import { WorkspacePlatformPage } from "@/components/platform/workspace-platform-page"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getBusinessMarketplaceSelection } from "@/lib/platform/business-marketplace-selection"
import { listImportedAgencyAgents } from "@/lib/platform/imported-agency-agents"
import { getLocalizedWorkspaceMarketplaceEntries } from "@/lib/platform/workspace-business"

export default async function DashboardAgentPlatformPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const importedAgencyAgents = listImportedAgencyAgents(displayLocale)
  const businessEntries = getLocalizedWorkspaceMarketplaceEntries(displayLocale)
  const marketplaceSelection = currentUser
    ? await getBusinessMarketplaceSelection(currentUser.id).catch(() => null)
    : null

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Enterprise Workspace",
          title: "智能体中台",
          description:
            "按 Registry First 策略先把智能体、入口、绑定关系和可见性组织起来，再逐步衔接插件、MCP 和工作流执行。",
        }
      : {
          eyebrow: "Enterprise Workspace",
          title: "Agent Platform",
          description:
            "Organize agents, entry points, bindings, and visibility first, then deepen plugin, MCP, and workflow execution over time.",
        }

  return (
    <>
      <WorkspacePlatformPage
        locale={displayLocale}
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        items={[]}
        currentUser={Boolean(currentUser)}
        showItems={false}
        fillHeight={false}
      />
      <WorkspaceAgencyAgentGallery
        locale={displayLocale}
        entries={businessEntries}
        agents={importedAgencyAgents}
        initialSelectedAgentIds={marketplaceSelection?.selectedAgentIds || []}
        showHero={false}
      />
    </>
  )
}
