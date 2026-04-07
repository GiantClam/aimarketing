import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listAiEntryMessages } from "@/lib/ai-entry/repository"
import { shouldLockConsultingAdvisorModel } from "@/lib/ai-entry/model-policy"

function parseLimit(input: string | null, fallback: number) {
  const parsed = Number.parseInt(input || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, 500)
}

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const searchParams = request.nextUrl.searchParams
  const conversationId = searchParams.get("conversation_id")?.trim() || ""
  const limit = parseLimit(searchParams.get("limit"), 200)
  const conversationScope = shouldLockConsultingAdvisorModel({
    entryMode: searchParams.get("entryMode"),
  })
    ? "consulting"
    : "chat"

  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id is required" }, { status: 400 })
  }

  try {
    const page = await listAiEntryMessages(
      auth.user.id,
      conversationId,
      limit,
      conversationScope,
    )
    if (!page) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 })
    }

    return NextResponse.json(page)
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_messages_list_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
