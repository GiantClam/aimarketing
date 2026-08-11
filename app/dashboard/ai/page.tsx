import { AiEntryRoute } from "@/components/ai-entry/ai-entry-route"
import { TooltipProvider } from "@/components/ui/tooltip"

export default function AiEntryPage() {
  return (
    <TooltipProvider>
      <AiEntryRoute initialConversationId={null} />
    </TooltipProvider>
  )
}
