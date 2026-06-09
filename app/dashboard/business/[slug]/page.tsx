import { notFound, redirect } from "next/navigation"

import {
  getLocalizedWorkspaceBusinessEntryBySlug,
  buildDashboardBusinessHref,
  type WorkspaceBusinessSlug,
} from "@/lib/platform/workspace-business"

export default async function DashboardBusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const emptySearchParams: Record<string, string | string[] | undefined> = {}
  const [{ slug }, rawSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(emptySearchParams),
  ])
  const entry = getLocalizedWorkspaceBusinessEntryBySlug(
    "zh",
    slug as WorkspaceBusinessSlug,
  )

  if (!entry) {
    notFound()
  }

  const requestedAgentId = typeof rawSearchParams?.agent === "string" ? rawSearchParams.agent : null
  redirect(buildDashboardBusinessHref(entry.slug, { agentId: requestedAgentId }))
}
