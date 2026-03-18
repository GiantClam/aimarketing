import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import { getConversations } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { listLeadHunterConversations } from "@/lib/lead-hunter/repository"

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
    if (!config) return NextResponse.json({ error: "No configuration" }, { status: 500 })

    const difyRes = await getConversations(config, difyUser, lastId, limit)

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
