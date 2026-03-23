import { NextRequest, NextResponse } from "next/server"

import { clearSessionCookie, deleteSessionFromRequest } from "@/lib/auth/session"

export async function POST(request: NextRequest) {
  try {
    try {
      await deleteSessionFromRequest(request)
    } catch (error) {
      console.warn("auth.logout.delete-session-failed", error)
    }
    const response = NextResponse.json({ success: true })
    return clearSessionCookie(response, request)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "logout failed" }, { status: 500 })
  }
}
