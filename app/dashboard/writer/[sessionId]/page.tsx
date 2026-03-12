import { DashboardLayout } from "@/components/dashboard-layout"
import { WriterWorkspace } from "@/components/writer/writer-workspace"

export default async function WriterSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ platform?: string; mode?: string }>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams

  return (
    <DashboardLayout>
      <WriterWorkspace
        initialConversationId={resolvedParams.sessionId}
        initialPlatform={resolvedSearchParams.platform}
        initialMode={resolvedSearchParams.mode}
      />
    </DashboardLayout>
  )
}
