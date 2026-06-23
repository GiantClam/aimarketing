import { getServerSessionUser } from "@/lib/auth/server-session"
import { WorkspaceAgencyAgentGallery } from "@/components/platform/workspace-agency-agent-gallery"
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

  return (
    <WorkspaceAgencyAgentGallery
      locale={displayLocale}
      entries={businessEntries}
      agents={importedAgencyAgents}
      initialSelectedAgentIds={marketplaceSelection?.selectedAgentIds || []}
    />
  )
}
