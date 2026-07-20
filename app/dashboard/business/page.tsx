import { WorkspaceBusinessPage } from "@/components/platform/workspace-business-page"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import {
  buildBusinessWorkbenchCustomAgents,
  listCustomAgentBoundBusinessSlugs,
} from "@/lib/platform/custom-agent-business-view"
import { getBusinessMarketplaceSelection } from "@/lib/platform/business-marketplace-selection"
import {
  getLocalizedBusinessAgentConfigById,
  listLocalizedBusinessAgentConfigs,
} from "@/lib/platform/business-agents"
import { getLocalizedExecutiveBusinessMenuAgentById } from "@/lib/platform/business-menu-builtin-agents"
import { listCustomAgentsForUser } from "@/lib/platform/custom-agents"
import {
  getImportedAgencyAgentById,
  listImportedAgencyAgentsByIds,
} from "@/lib/platform/imported-agency-agents"
import {
  getLocalizedWorkspaceBusinessEntries,
  resolveWorkspaceBusinessSlug,
} from "@/lib/platform/workspace-business"

export default async function DashboardBusinessWorkbenchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const emptySearchParams: Record<string, string | string[] | undefined> = {}
  const [locale, rawSearchParams] = await Promise.all([
    getRequestLocale(),
    searchParams ?? Promise.resolve(emptySearchParams),
  ])
  const uiLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const marketplaceSelection = currentUser
    ? await getBusinessMarketplaceSelection(currentUser.id).catch(() => null)
    : null
  const customAgents = currentUser?.enterpriseId
    ? await listCustomAgentsForUser({
        enterpriseId: currentUser.enterpriseId,
        userId: currentUser.id,
        isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
      }).catch(() => [])
    : []
  const selectedImportedAgents = listImportedAgencyAgentsByIds(
    uiLocale,
    marketplaceSelection?.selectedAgentIds || [],
  )
  const selectedExecutiveAgents = (marketplaceSelection?.selectedAgentIds || [])
    .map((agentId) => getLocalizedExecutiveBusinessMenuAgentById(uiLocale, agentId))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
  const customAgentBusinessSlugs = listCustomAgentBoundBusinessSlugs(customAgents)
  const entries = getLocalizedWorkspaceBusinessEntries(uiLocale, {
    includeImportedSlugs: [...new Set([
      ...selectedImportedAgents.map((agent) => agent.businessSlug),
      ...customAgentBusinessSlugs,
    ])],
  })
  const agents = [...listLocalizedBusinessAgentConfigs(uiLocale), ...selectedImportedAgents, ...selectedExecutiveAgents]
  const requestedView = typeof rawSearchParams?.view === "string" ? rawSearchParams.view : null
  const requestedAgentId = typeof rawSearchParams?.agent === "string" ? rawSearchParams.agent : null
  const agentScopedView =
    getLocalizedBusinessAgentConfigById(uiLocale, requestedAgentId)?.businessSlug ||
    getLocalizedExecutiveBusinessMenuAgentById(uiLocale, requestedAgentId)?.businessSlug ||
    getImportedAgencyAgentById(uiLocale, requestedAgentId)?.businessSlug
  const resolvedSlug = resolveWorkspaceBusinessSlug(requestedView || agentScopedView, entries[0]?.slug || "content-growth")
  const currentSlug = entries.some((entry) => entry.slug === resolvedSlug)
    ? resolvedSlug
    : (entries[0]?.slug || "content-growth")
  const workbenchCustomAgents = buildBusinessWorkbenchCustomAgents(customAgents, currentSlug, uiLocale)
  const workbenchAgents = [...agents, ...workbenchCustomAgents]

  return (
    <WorkspaceBusinessPage
      locale={uiLocale}
      currentSlug={currentSlug}
      entries={entries}
      agents={workbenchAgents}
    />
  )
}
