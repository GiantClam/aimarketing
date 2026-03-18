import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listImageAssistantVersionsPage } from "@/lib/image-assistant/repository"

function parsePositiveInt(value: string | null) {
  const parsed = Number.parseInt(value || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function toSafeImageAssistantError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("Failed query:")) {
    return { status: 503, error: "image_assistant_data_temporarily_unavailable" }
  }
  return { status: 500, error: message || fallback }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const resolved = await params
    const data = await listImageAssistantVersionsPage(auth.user.id, resolved.sessionId, {
      limit: parsePositiveInt(req.nextUrl.searchParams.get("limit")) ?? 6,
      cursor: req.nextUrl.searchParams.get("cursor"),
    })

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("image-assistant.session-versions.get.error", error)
    const safe = toSafeImageAssistantError(error, "session_versions_failed")
    return NextResponse.json({ error: safe.error }, { status: safe.status })
  }
}
