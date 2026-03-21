import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { createImageAssistantSession, listImageAssistantSessions } from "@/lib/image-assistant/repository"

function toSafeImageAssistantError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("Failed query:")) {
    return { status: 503, error: "image_assistant_data_temporarily_unavailable" }
  }
  return { status: 500, error: message || fallback }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") || "30", 10)
    const cursor = req.nextUrl.searchParams.get("cursor")
    const data = await listImageAssistantSessions(auth.user.id, limit, cursor)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("image-assistant.sessions.get.error", error)
    const safe = toSafeImageAssistantError(error, "sessions_list_failed")
    return NextResponse.json({ error: safe.error }, { status: safe.status })
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
    console.error("image-assistant.sessions.post.error", error)
    const safe = toSafeImageAssistantError(error, "session_create_failed")
    return NextResponse.json({ error: safe.error }, { status: safe.status })
  }
}
