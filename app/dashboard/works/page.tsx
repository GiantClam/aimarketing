import { WorkspaceWorkLibrary } from "@/components/platform/workspace-work-library"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listPlatformWorkItemsForEnterprise } from "@/lib/platform/task-run-store"

export default async function WorksPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const works =
    currentUser?.enterpriseId != null
      ? await listPlatformWorkItemsForEnterprise(currentUser.enterpriseId)
      : []

  return (
    <WorkspaceWorkLibrary
      locale={displayLocale}
      works={works.map((work) => ({
        id: work.id,
        title: work.title,
        type: work.type,
        sourceArtifactId: work.sourceArtifactId,
        createdAt: work.createdAt instanceof Date ? work.createdAt.toISOString() : null,
      }))}
    />
  )
}
