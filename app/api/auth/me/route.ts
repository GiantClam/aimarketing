import { NextRequest, NextResponse } from "next/server"

import { clearSessionCookie, getSessionUser } from "@/lib/auth/session"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error("Auth check error:", error)
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
  }
}

export async function DELETE(_request: NextRequest) {
  const response = NextResponse.json({ message: "Logged out successfully" })
  return clearSessionCookie(response, _request)
}
