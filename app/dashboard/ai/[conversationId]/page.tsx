import { AiEntryWorkspace } from "@/components/ai-entry/ai-entry-workspace"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function AiEntryConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const resolvedParams = await params

  return (
    <TooltipProvider>
      <AiEntryWorkspace initialConversationId={resolvedParams.conversationId} />
    </TooltipProvider>
  )
}
