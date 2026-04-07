import { AiEntryWorkspace } from "@/components/ai-entry/ai-entry-workspace"
import { TooltipProvider } from "@/components/ui/tooltip"

export default function AiEntryPage() {
  return (
    <TooltipProvider>
      <AiEntryWorkspace initialConversationId={null} />
    </TooltipProvider>
  )
}
