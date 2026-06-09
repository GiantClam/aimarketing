import { WorkspaceBusinessPage } from "@/components/platform/workspace-business-page"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import {
  getLocalizedBusinessAgentConfigById,
  listLocalizedBusinessAgentConfigs,
} from "@/lib/platform/business-agents"
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
  const entries = getLocalizedWorkspaceBusinessEntries(uiLocale)
  const agents = listLocalizedBusinessAgentConfigs(uiLocale)
  const requestedView = typeof rawSearchParams?.view === "string" ? rawSearchParams.view : null
  const requestedAgentId = typeof rawSearchParams?.agent === "string" ? rawSearchParams.agent : null
  const agentScopedView = getLocalizedBusinessAgentConfigById(uiLocale, requestedAgentId)?.businessSlug
  const currentSlug = resolveWorkspaceBusinessSlug(requestedView || agentScopedView, entries[0]?.slug || "content-growth")

  return (
    <WorkspaceBusinessPage
      locale={uiLocale}
      currentSlug={currentSlug}
      entries={entries}
      agents={agents}
    />
  )
}
