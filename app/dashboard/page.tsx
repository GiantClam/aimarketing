import { WorkspacePlatformHome } from "@/components/platform/workspace-platform-home"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listVisiblePlatformRegistryEntries } from "@/lib/platform/directory-resolver"

export default async function DashboardPage() {
  const locale = await getRequestLocale()
  const currentUser = await getServerSessionUser().catch(() => null)
  const capabilities = (await listVisiblePlatformRegistryEntries({
    locale,
    itemType: "capability",
    surface: "workspace",
    enterpriseId: currentUser?.enterpriseId,
  })).filter((item) => ["ai-chat", "ai-ppt", "ai-image", "ai-video", "agent-platform"].includes(item.slug))

  return <WorkspacePlatformHome locale={locale} capabilities={capabilities} />
}
