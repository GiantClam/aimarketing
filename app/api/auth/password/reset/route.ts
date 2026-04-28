import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import { applySessionCookie, createUserSession, deleteUserSessions } from "@/lib/auth/session"
import { getUserAuthPayload, hashPassword } from "@/lib/enterprise/server"
import { consumePasswordResetToken } from "@/lib/auth/password-reset"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { logAuditEvent } from "@/lib/server/audit"

export const runtime = "nodejs"

function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : ""
}

export async function POST(request: NextRequest) {
  try {
    await ensureEnterpriseAuthTables()

    const rateLimit = await checkRateLimit({
      key: `auth:password:reset:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateLimit.ok) {
      return createRateLimitResponse("Too many password reset attempts", rateLimit)
    }

    const body = await request.json().catch(() => ({}))
    const token = typeof body?.token === "string" ? body.token.trim() : ""
    const newPassword = normalizePassword(body?.newPassword)
    const confirmPassword = normalizePassword(body?.confirmPassword)

    if (!token) {
      return NextResponse.json({ error: "reset_token_required" }, { status: 400 })
    }
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json({ error: "new_password_invalid" }, { status: 400 })
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "passwords_do_not_match" }, { status: 400 })
    }

    const reset = await consumePasswordResetToken(token)
    if (!reset) {
      return NextResponse.json({ error: "reset_token_invalid_or_expired" }, { status: 400 })
    }

    const [updated] = await db
      .update(users)
      .set({
        password: hashPassword(newPassword),
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, reset.userId))
      .returning({ id: users.id })

    if (!updated) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 })
    }

    await deleteUserSessions(reset.userId)
    const payload = await getUserAuthPayload(reset.userId)
    if (!payload) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 })
    }

    const { sessionToken, expiresAt } = await createUserSession(reset.userId, request)
    logAuditEvent(request, "auth.password.reset.success", { userId: reset.userId })
    const response = NextResponse.json({ success: true, user: payload })
    return applySessionCookie(response, sessionToken, expiresAt, request)
  } catch (error: any) {
    logAuditEvent(request, "auth.password.reset.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "password reset failed" }, { status: 500 })
  }
}
