import { NextRequest, NextResponse } from "next/server"

import { applySessionCookie, createUserSession } from "@/lib/auth/session"
import { consumeEmailVerificationToken } from "@/lib/auth/email-verification"
import { getUserAuthPayload, ensureEnterpriseAuthTables } from "@/lib/enterprise/server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    await ensureEnterpriseAuthTables()

    const body = await request.json().catch(() => ({}))
    const token = typeof body?.token === "string" ? body.token.trim() : ""
    if (!token) {
      return NextResponse.json({ error: "verification_token_required" }, { status: 400 })
    }

    const verification = await consumeEmailVerificationToken(token)
    if (!verification) {
      return NextResponse.json({ error: "verification_token_invalid_or_expired" }, { status: 400 })
    }

    const payload = await getUserAuthPayload(verification.userId)
    if (!payload) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 })
    }

    const { sessionToken, expiresAt } = await createUserSession(verification.userId, request)
    const response = NextResponse.json({ success: true, user: payload })
    return applySessionCookie(response, sessionToken, expiresAt, request)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "verification failed" }, { status: 500 })
  }
}
