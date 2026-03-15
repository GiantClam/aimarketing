import { WriterWorkspace } from "@/components/writer/writer-workspace"

export default async function WriterPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; mode?: string; language?: string }>
}) {
  const resolvedSearchParams = await searchParams

  return (
    <WriterWorkspace
      initialConversationId={null}
      initialPlatform={resolvedSearchParams.platform}
      initialMode={resolvedSearchParams.mode}
      initialLanguage={resolvedSearchParams.language}
    />
  )
}
