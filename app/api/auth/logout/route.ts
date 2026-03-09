import { NextRequest, NextResponse } from "next/server"

import { clearSessionCookie, deleteSessionFromRequest } from "@/lib/auth/session"

export async function POST(request: NextRequest) {
  try {
    await deleteSessionFromRequest(request)
    const response = NextResponse.json({ success: true })
    return clearSessionCookie(response)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "logout failed" }, { status: 500 })
  }
}
