import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { renameConversation } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const resolved = await params
    const body = await req.json()
    const auth = await requireAdvisorAccess(req, body?.advisorType)
    if ("response" in auth) {
      return auth.response
    }

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, body.advisorType)
    const config = await getDifyConfigByAdvisorType(body.advisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })

    if (!config) return NextResponse.json({ error: "No configuration" }, { status: 500 })

    const difyRes = await renameConversation(config, resolved.conversationId, body.name, difyUser)

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
