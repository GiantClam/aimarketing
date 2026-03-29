import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { stopMessage } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ taskId: string }> }
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
      return NextResponse.json({ error: "lead_hunter_stop_not_supported" }, { status: 409 })
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, resolvedAdvisorType)
    const config = await getDifyConfigByAdvisorType(resolvedAdvisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })
    if (!config) return NextResponse.json({ error: "No configuration" }, { status: 500 })

    const difyRes = await stopMessage(config, resolved.taskId, difyUser)

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
