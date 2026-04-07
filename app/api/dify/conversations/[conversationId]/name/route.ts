import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { invalidateAdvisorConversationListCacheByScope } from "@/lib/advisor/conversation-list-cache"
import { renameConversation } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { renameLeadHunterConversation } from "@/lib/lead-hunter/repository"
import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const resolved = await params
    const body = await req.json()
    const normalizedLeadHunterType = normalizeLeadHunterAdvisorType(body?.advisorType)
    const resolvedAdvisorType = normalizedLeadHunterType || body?.advisorType
    const auth = await requireAdvisorAccess(req, body?.advisorType)
    if ("response" in auth) {
      return auth.response
    }

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    if (normalizedLeadHunterType) {
      const data = await renameLeadHunterConversation(auth.user.id, normalizedLeadHunterType, resolved.conversationId, body.name)
      if (!data) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
      }
      invalidateAdvisorConversationListCacheByScope(auth.user.id, normalizedLeadHunterType)

      return NextResponse.json({
        id: String(data.id),
        name: data.title,
      })
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, resolvedAdvisorType)
    const config = await getDifyConfigByAdvisorType(resolvedAdvisorType, {
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
    invalidateAdvisorConversationListCacheByScope(auth.user.id, resolvedAdvisorType)
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
