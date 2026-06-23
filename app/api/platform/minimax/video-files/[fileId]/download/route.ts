import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasFeatureAccess } from "@/lib/auth/guards"
import {
  isMiniMaxVideoConfigured,
  retrieveMiniMaxVideoFile,
} from "@/lib/platform/minimax-video"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  const currentUser = await getSessionUser(request).catch(() => null)
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  if (!hasFeatureAccess(currentUser, "video_generation")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!isMiniMaxVideoConfigured()) {
    return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
  }

  const { fileId } = await context.params
  if (!fileId.trim()) {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 })
  }

  const file = await retrieveMiniMaxVideoFile(fileId).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "minimax_video_download_failed" }, { status: 502 })
  })

  if (file instanceof NextResponse) {
    return file
  }

  return NextResponse.redirect(file.downloadUrl)
}
