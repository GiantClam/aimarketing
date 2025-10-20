import { type NextRequest, NextResponse } from "next/server"
import { difyClient } from "@/lib/integrations/dify-client"
import { db } from "@/lib/db"
import { messages } from "@/lib/db/schema"

export async function POST(request: NextRequest) {
  try {
    const { message, conversationId, knowledgeSource, userId, stream = false } = await request.json()

    console.log(`[v0] Processing chat message: ${message.substring(0, 50)}...`)
    console.log(`[v0] Knowledge source: ${knowledgeSource}, User: ${userId}`)

    // 调用 Dify API 获取 AI 回复
    const difyResponse = await difyClient.sendMessage({
      query: message,
      userId,
      conversationId,
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
    } else {
      await db.insert(messages).values([
        {
          conversationId: Number.parseInt(conversationId),
          role: "user",
          content: message,
          knowledgeSource,
        },
        {
          conversationId: Number.parseInt(conversationId),
          role: "assistant",
          content: difyResponse.answer,
          knowledgeSource,
        },
      ])

      return NextResponse.json({
        message: difyResponse.answer,
        conversationId: difyResponse.conversation_id,
      })
    }
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 })
  }
}
