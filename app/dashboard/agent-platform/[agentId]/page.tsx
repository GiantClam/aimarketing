import { notFound } from "next/navigation"

import { WorkspaceCustomAgentStudio } from "@/components/platform/workspace-custom-agent-studio"
import { getRequestLocale } from "@/lib/i18n/request-locale"

function parseAgentId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export default async function DashboardAgentPlatformDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>
}) {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const { agentId } = await params
  const numericAgentId = parseAgentId(agentId)
  if (!numericAgentId) notFound()

  return <WorkspaceCustomAgentStudio locale={displayLocale} initialSelectedAgentId={numericAgentId} />
}
