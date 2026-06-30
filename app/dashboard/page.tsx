import { WorkspacePlatformHome } from "@/components/platform/workspace-platform-home"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listVisiblePlatformRegistryEntries } from "@/lib/platform/directory-resolver"
import { listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function DashboardPage() {
  const locale = await getRequestLocale()
  const currentUser = await getServerSessionUser().catch(() => null)
  const [capabilities, workflowTemplates] = await Promise.all([
    listVisiblePlatformRegistryEntries({
      locale,
      itemType: "capability",
      surface: "workspace",
      enterpriseId: currentUser?.enterpriseId,
    }).then((items) => items.filter((item) => ["ai-chat", "ai-ppt", "ai-image", "ai-video", "agent-platform"].includes(item.slug))),
    currentUser?.enterpriseId
      ? listPlatformRegistryEntryExecutionStates({
          locale,
          itemType: "workflow",
          surface: "workspace",
          enterpriseId: currentUser.enterpriseId,
          currentUser,
        })
      : Promise.resolve([]),
  ])

  return <WorkspacePlatformHome locale={locale} capabilities={capabilities} workflowTemplates={workflowTemplates} />
}
