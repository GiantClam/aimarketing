import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { deleteConversation } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { deleteLeadHunterConversation } from "@/lib/lead-hunter/repository"
import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"

export async function DELETE(
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

    if (normalizedLeadHunterType) {
      const deleted = await deleteLeadHunterConversation(auth.user.id, normalizedLeadHunterType, resolved.conversationId)
      if (!deleted) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, resolvedAdvisorType)
    const config = await getDifyConfigByAdvisorType(resolvedAdvisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })

    if (!config) return NextResponse.json({ error: "No configuration" }, { status: 500 })

    const difyRes = await deleteConversation(config, resolved.conversationId, difyUser)

    if (!difyRes.ok) {
      const errorData = await difyRes.text()
      return NextResponse.json({ error: "Dify API Error", details: errorData }, { status: difyRes.status })
    }

    if (difyRes.status === 204) {
      return NextResponse.json({ success: true })
    }

    const rawText = await difyRes.text()
    if (!rawText.trim()) {
      return NextResponse.json({ success: true })
    }

    try {
      const data = JSON.parse(rawText)
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ success: true, raw: rawText })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
