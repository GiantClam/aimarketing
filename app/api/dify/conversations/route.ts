import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { getConversations } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { createLeadHunterConversation, listLeadHunterConversations } from "@/lib/lead-hunter/repository"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const lastId = searchParams.get("last_id") || undefined
  const limit = parseInt(searchParams.get("limit") || "20", 10)

  try {
    const advisorType = searchParams.get("advisorType")
    const auth = await requireAdvisorAccess(req, advisorType)
    if ("response" in auth) {
      return auth.response
    }

    if (advisorType === "lead-hunter") {
      const data = await listLeadHunterConversations(auth.user.id, lastId, limit)
      return NextResponse.json(data)
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, advisorType)
    const config = await getDifyConfigByAdvisorType(advisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })
    if (!config) {
      return NextResponse.json({
        data: [],
        has_more: false,
        limit,
        source: "unavailable",
      })
    }

    const difyRes = await getConversations(config, difyUser, lastId, limit)

    if (!difyRes.ok) {
      if (difyRes.status === 401 || difyRes.status === 503) {
        return NextResponse.json({
          data: [],
          has_more: false,
          limit,
          source: "credential_blocked",
        })
      }
      const errorData = await difyRes.text()
      return NextResponse.json({ error: "Dify API Error", details: errorData }, { status: difyRes.status })
    }

    const data = await difyRes.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const advisorType = body?.advisorType
    const auth = await requireAdvisorAccess(req, advisorType)
    if ("response" in auth) {
      return auth.response
    }

    if (advisorType !== "lead-hunter") {
      return NextResponse.json(
        { error: "advisor_session_creation_requires_first_message" },
        { status: 409 },
      )
    }

    const title = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "新建会话"
    const conversation = await createLeadHunterConversation(auth.user.id, title)

    return NextResponse.json({
      data: {
        id: String(conversation.id),
        name: conversation.title,
        status: "normal",
        created_at: Math.floor((conversation.createdAt?.getTime?.() || Date.now()) / 1000),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "conversation_create_failed" }, { status: 500 })
  }
}
