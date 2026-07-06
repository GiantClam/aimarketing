import { NextRequest, NextResponse } from "next/server"

import { requireAuthenticatedUser } from "@/lib/auth/session"
import { getPptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"

type ToolRouteContext = {
  params: Promise<{ slug: string }>
}

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: NextRequest, context: ToolRouteContext) {
  const { slug } = await context.params

  if (slug !== "ai-ppt-preview") {
    return NextResponse.json({ error: "Tool preview session is not supported for this slug" }, { status: 404 })
  }

  const previewSessionId = request.nextUrl.searchParams.get("previewSessionId")?.trim()
  if (!previewSessionId) {
    return NextResponse.json({ error: "previewSessionId is required" }, { status: 400 })
  }

  try {
    const user = await requireAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    const deck = await getPptPreviewSessionDeck(previewSessionId)
    return NextResponse.json(
      {
        ok: true,
        previewSessionId,
        deck,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (/missing_preview_session/iu.test(message)) {
      return NextResponse.json({ error: "Preview session no longer exists" }, { status: 404 })
    }

    console.error("Lead tool preview session fetch failed:", error)
    return NextResponse.json({ error: "Failed to load preview session" }, { status: 500 })
  }
}
