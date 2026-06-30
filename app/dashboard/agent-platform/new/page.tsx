import { WorkspaceCustomAgentStudio } from "@/components/platform/workspace-custom-agent-studio"
import { getRequestLocale } from "@/lib/i18n/request-locale"

export default async function DashboardAgentPlatformCreatePage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"

  return <WorkspaceCustomAgentStudio locale={displayLocale} />
}
