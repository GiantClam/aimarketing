import { redirect } from "next/navigation"

import { WorkspacePlatformGovernance } from "@/components/platform/workspace-platform-governance"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getCustomerGovernanceSnapshot } from "@/lib/platform/customer-governance"
import { getPlatformGovernanceSnapshot } from "@/lib/platform/governance"

export default async function DashboardPlatformSettingsPage() {
  const [locale, currentUser] = await Promise.all([getRequestLocale(), getServerSessionUser()])
  if (!currentUser) {
    redirect("/login?next=%2Fdashboard%2Fplatform-settings")
  }
  const [snapshot, customerSnapshot] = await Promise.all([
    getPlatformGovernanceSnapshot({
      locale,
      currentUser,
    }),
    getCustomerGovernanceSnapshot(currentUser).catch(() => null),
  ])

  return (
    <WorkspacePlatformGovernance
      locale={locale}
      snapshot={snapshot}
      customerSnapshot={customerSnapshot}
      currentUserId={currentUser.id}
      canViewEnterpriseGovernance={Boolean(currentUser.enterpriseId)}
      canManageEnterpriseGovernance={currentUser.enterpriseRole === "admin"}
    />
  )
}
