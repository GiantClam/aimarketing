import { type NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { messages } from "@/lib/db/schema"
import { difyClient } from "@/lib/integrations/dify-client"

function parseConversationId(conversationId: unknown) {
  const parsed = Number.parseInt(String(conversationId || ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { message, conversationId, knowledgeSource, stream = false } = await request.json()
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }
    if (knowledgeSource !== "industry_kb" && knowledgeSource !== "personal_kb") {
      return NextResponse.json({ error: "knowledgeSource must be industry_kb or personal_kb" }, { status: 400 })
    }

    const normalizedConversationId = parseConversationId(conversationId)

    console.log(`[v0] Processing chat message: ${message.substring(0, 50)}...`)
    console.log(`[v0] Knowledge source: ${knowledgeSource}, User: ${currentUser.id}`)

    const difyResponse = await difyClient.sendMessage({
      query: message,
      userId: currentUser.id,
      conversationId: typeof conversationId === "string" ? conversationId : undefined,
      knowledgeSource,
      stream,
    })

    if (stream) {
      return new Response(difyResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    if (normalizedConversationId) {
      await db.insert(messages).values([
        {
          conversationId: normalizedConversationId,
          role: "user",
          content: message,
          knowledgeSource,
        },
        {
          conversationId: normalizedConversationId,
          role: "assistant",
          content: difyResponse.answer,
          knowledgeSource,
        },
      ])
    }

    return NextResponse.json({
      content: difyResponse.answer,
      message: difyResponse.answer,
      conversationId: difyResponse.conversation_id,
    })
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 })
  }
}
