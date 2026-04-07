import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { deleteAiEntryConversation } from "@/lib/ai-entry/repository"
import { shouldLockConsultingAdvisorModel } from "@/lib/ai-entry/model-policy"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const resolved = await params
  const conversationScope = shouldLockConsultingAdvisorModel({
    entryMode: request.nextUrl.searchParams.get("entryMode"),
  })
    ? "consulting"
    : "chat"

  try {
    const success = await deleteAiEntryConversation(
      auth.user.id,
      resolved.conversationId,
      conversationScope,
    )
    return NextResponse.json({ success, conversationId: resolved.conversationId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_conversation_delete_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
