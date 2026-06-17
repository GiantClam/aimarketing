import { WorkspaceWorkLibrary } from "@/components/platform/workspace-work-library"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listEnterpriseWorkLibraryCandidates } from "@/lib/platform/works"

export default async function WorksPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const works =
    currentUser?.enterpriseId != null
      ? await listEnterpriseWorkLibraryCandidates(currentUser.enterpriseId)
      : []

  return <WorkspaceWorkLibrary locale={displayLocale} works={works} />
}
