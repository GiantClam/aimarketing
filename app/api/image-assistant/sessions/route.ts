import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { createImageAssistantSession, listImageAssistantSessions } from "@/lib/image-assistant/repository"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") || "30", 10)
    const data = await listImageAssistantSessions(auth.user.id, limit)
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => ({}))
    const session = await createImageAssistantSession({
      userId: auth.user.id,
      enterpriseId: auth.user.enterpriseId,
      title: typeof body?.title === "string" ? body.title : "未命名设计",
    })

    return NextResponse.json({ data: session })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
