import { WorkspaceTaskCenter } from "@/components/platform/workspace-task-center"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listPlatformTaskRunsForEnterprise } from "@/lib/platform/task-run-store"

export default async function TasksPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const runs =
    currentUser?.enterpriseId != null
      ? await listPlatformTaskRunsForEnterprise(currentUser.enterpriseId)
      : []

  return (
    <WorkspaceTaskCenter
      locale={displayLocale}
      runs={runs.map((run) => ({
        id: run.id,
        kind: run.kind,
        itemSlug: run.itemSlug,
        status: run.status,
        externalSystem: run.externalSystem,
        createdAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : null,
        updatedAt: run.updatedAt instanceof Date ? run.updatedAt.toISOString() : null,
      }))}
    />
  )
}
