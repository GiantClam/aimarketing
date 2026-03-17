import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { setSelectedVersionCandidate } from "@/lib/image-assistant/repository"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const resolved = await params
    const body = await req.json().catch(() => ({}))
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : ""
    if (!sessionId || !candidateId) {
      return NextResponse.json({ error: "sessionId and candidateId are required" }, { status: 400 })
    }

    const success = await setSelectedVersionCandidate({
      userId: auth.user.id,
      sessionId,
      versionId: resolved.versionId,
      candidateId,
    })
    if (!success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "candidate_select_failed" }, { status: 500 })
  }
}
