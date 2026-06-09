import { WorkspaceAgentExpertDemo } from "@/components/platform/workspace-agent-expert-demo"
import { getRequestLocale } from "@/lib/i18n/request-locale"

export default async function DashboardSalesCloseExpertPage() {
  const locale = await getRequestLocale()

  return <WorkspaceAgentExpertDemo locale={locale === "zh" ? "zh" : "en"} />
}
