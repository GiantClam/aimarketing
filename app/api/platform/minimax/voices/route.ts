import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccessWithFallback } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import {
  isMiniMaxAudioConfigured,
  listMiniMaxVoices,
  type MiniMaxVoiceType,
} from "@/lib/platform/minimax-audio"

export const runtime = "nodejs"

function normalizeVoiceType(value: unknown): MiniMaxVoiceType {
  if (value === "system" || value === "voice_cloning" || value === "voice_generation" || value === "all") {
    return value
  }
  return "all"
}

export async function POST(request: NextRequest) {
  const currentUser = await getSessionUser(request).catch(() => null)
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  if (!hasFeatureAccessWithFallback(currentUser, "audio_generation", "video_generation")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!isMiniMaxAudioConfigured()) {
    return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const result = await listMiniMaxVoices(normalizeVoiceType(body.voiceType)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "minimax_get_voice_failed" }, { status: 502 })
  })

  if (result instanceof NextResponse) {
    return result
  }

  return NextResponse.json({
    data: result,
  })
}
