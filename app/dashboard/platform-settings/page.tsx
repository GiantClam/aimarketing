import { redirect } from "next/navigation"

import { WorkspacePlatformGovernance } from "@/components/platform/workspace-platform-governance"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getPlatformGovernanceSnapshot } from "@/lib/platform/governance"

export default async function DashboardPlatformSettingsPage() {
  const [locale, currentUser] = await Promise.all([getRequestLocale(), getServerSessionUser()])
  if (!currentUser) {
    redirect("/login?next=%2Fdashboard%2Fplatform-settings")
  }
  const snapshot = await getPlatformGovernanceSnapshot({
    locale,
    currentUser,
  })

  return <WorkspacePlatformGovernance locale={locale} snapshot={snapshot} />
}
