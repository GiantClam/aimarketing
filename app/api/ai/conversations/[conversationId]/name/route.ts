import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { renameAiEntryConversation } from "@/lib/ai-entry/repository"
import { shouldLockConsultingAdvisorModel } from "@/lib/ai-entry/model-policy"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown
    entryMode?: unknown
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }
  const conversationScope = shouldLockConsultingAdvisorModel({
    entryMode: body.entryMode,
  })
    ? "consulting"
    : "chat"

  const resolved = await params

  try {
    const conversation = await renameAiEntryConversation(
      auth.user.id,
      resolved.conversationId,
      body.name,
      conversationScope,
    )
    return NextResponse.json({
      success: Boolean(conversation),
      conversation,
      name: body.name,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ai_entry_conversation_rename_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
