import { AiEntryRoute } from "@/components/ai-entry/ai-entry-route"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function AiEntryConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const resolvedParams = await params

  return (
    <TooltipProvider>
      <AiEntryRoute initialConversationId={resolvedParams.conversationId} />
    </TooltipProvider>
  )
}
