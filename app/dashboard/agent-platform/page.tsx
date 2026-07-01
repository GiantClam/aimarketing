import { WorkspaceAgentPlatformDirectory } from "@/components/platform/workspace-agent-platform-directory"
import { getAiEntryAgentCatalog, getAiEntryAgentGroups } from "@/lib/ai-entry/agent-catalog"
import { requireServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getBusinessMarketplaceSelection } from "@/lib/platform/business-marketplace-selection"
import { listCustomAgentsForUser } from "@/lib/platform/custom-agents"
import { listImportedAgencyAgents } from "@/lib/platform/imported-agency-agents"

export default async function DashboardAgentPlatformPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await requireServerSessionUser("/dashboard/agent-platform")
  const customAgents =
    currentUser.enterpriseId
      ? await listCustomAgentsForUser({
          enterpriseId: currentUser.enterpriseId,
          userId: currentUser.id,
          isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
        }).catch(() => [])
      : []
  const marketplaceSelection = await getBusinessMarketplaceSelection(currentUser.id).catch(() => null)
  const myCustomAgents = customAgents.filter((agent) => agent.ownerUserId === currentUser.id && agent.status !== "archived")
  const importedAgents = listImportedAgencyAgents(displayLocale)

  return (
    <WorkspaceAgentPlatformDirectory
      locale={displayLocale}
      builtinAgents={getAiEntryAgentCatalog()}
      builtinGroups={getAiEntryAgentGroups()}
      customAgents={myCustomAgents}
      importedAgents={importedAgents}
      initialSelectedBusinessMenuAgentIds={marketplaceSelection?.selectedAgentIds || []}
    />
  )
}
