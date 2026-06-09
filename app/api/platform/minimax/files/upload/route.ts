import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import {
  createMiniMaxAudioUpload,
  isMiniMaxAudioConfigured,
  type MiniMaxVoicePurpose,
} from "@/lib/platform/minimax-audio"

export const runtime = "nodejs"

function normalizePurpose(value: unknown): MiniMaxVoicePurpose | null {
  return value === "voice_clone" || value === "prompt_audio" ? value : null
}

export async function POST(request: NextRequest) {
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

  const formData = await request.formData().catch(() => null)
  const purpose = normalizePurpose(formData?.get("purpose"))
  const file = formData?.get("file")

  if (!purpose) {
    return NextResponse.json({ error: "invalid_upload_purpose" }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "upload_file_required" }, { status: 400 })
  }

  const result = await createMiniMaxAudioUpload(purpose, file).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "minimax_upload_failed" }, { status: 502 })
  })

  if (result instanceof NextResponse) {
    return result
  }

  return NextResponse.json({
    data: result,
  })
}
