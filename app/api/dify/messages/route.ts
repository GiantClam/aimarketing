import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { getMessages } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const conversationId = searchParams.get("conversation_id")
  const firstId = searchParams.get("first_id") || undefined
  const limit = parseInt(searchParams.get("limit") || "20", 10)

  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id is required" }, { status: 400 })
  }

  try {
    const advisorType = searchParams.get("advisorType")
    const auth = await requireAdvisorAccess(req, advisorType)
    if ("response" in auth) {
      return auth.response
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, advisorType)
    const config = await getDifyConfigByAdvisorType(advisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })
    if (!config) return NextResponse.json({ error: "No configuration" }, { status: 500 })

    const difyRes = await getMessages(config, conversationId, difyUser, firstId, limit)

    if (!difyRes.ok) {
      const errorData = await difyRes.text()
      return NextResponse.json({ error: "Dify API Error", details: errorData }, { status: difyRes.status })
    }

    const data = await difyRes.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
