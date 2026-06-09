import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import {
  buildAttachmentContentDisposition,
  isMiniMaxAudioConfigured,
  resolveMiniMaxDownloadedFile,
} from "@/lib/platform/minimax-audio"

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

  if (!isMiniMaxAudioConfigured()) {
    return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
  }

  const { fileId } = await context.params
  if (!fileId.trim()) {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 })
  }

  const downloaded = await resolveMiniMaxDownloadedFile(fileId).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "minimax_file_download_failed" }, { status: 502 })
  })

  if (downloaded instanceof NextResponse) {
    return downloaded
  }

  const requestedFileName = new URL(request.url).searchParams.get("filename")?.trim()
  const fileName = requestedFileName || downloaded.fileName || `minimax-audio-${fileId}.mp3`
  const headers = new Headers()
  headers.set("Content-Type", downloaded.contentType || "audio/mpeg")
  headers.set("Content-Disposition", buildAttachmentContentDisposition(fileName))
  headers.set("Cache-Control", "private, no-store")

  return new NextResponse(Buffer.from(downloaded.bytes), {
    status: 200,
    headers,
  })
}
