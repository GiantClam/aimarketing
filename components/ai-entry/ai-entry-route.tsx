"use client"

import { useSearchParams } from "next/navigation"

import { AiEntryUIMessageWorkspace } from "@/components/ai-entry/ai-entry-ui-message-workspace"
import { AiEntryWorkspace } from "@/components/ai-entry/ai-entry-workspace"

type Props = {
  initialConversationId: string | null
}

export function AiEntryRoute({ initialConversationId }: Props) {
  const searchParams = useSearchParams()
  const useUiMessageTimeline = searchParams.get("timeline") !== "legacy"

  if (useUiMessageTimeline) {
    return <AiEntryUIMessageWorkspace initialConversationId={initialConversationId} />
  }

  return <AiEntryWorkspace initialConversationId={initialConversationId} />
}
