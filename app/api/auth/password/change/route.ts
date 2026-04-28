import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { applySessionCookie, createUserSession, deleteUserSessions, getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureEnterpriseAuthTables, getUserAuthPayload, hashPassword, verifyPassword } from "@/lib/enterprise/server"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { logAuditEvent } from "@/lib/server/audit"

export const runtime = "nodejs"

function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : ""
}

export async function POST(request: NextRequest) {
  try {
    await ensureEnterpriseAuthTables()

    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    if (currentUser.isDemo) {
      return NextResponse.json({ error: "demo_account_password_locked" }, { status: 403 })
    }

    const rateLimit = await checkRateLimit({
      key: `auth:password:change:${getRequestIp(request)}:${currentUser.id}`,
      limit: 8,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateLimit.ok) {
      return createRateLimitResponse("Too many password change attempts", rateLimit)
    }

    const body = await request.json().catch(() => ({}))
    const currentPassword = normalizePassword(body?.currentPassword)
    const newPassword = normalizePassword(body?.newPassword)
    const confirmPassword = normalizePassword(body?.confirmPassword)

    if (!currentPassword) {
      return NextResponse.json({ error: "current_password_required" }, { status: 400 })
    }
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json({ error: "new_password_invalid" }, { status: 400 })
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "passwords_do_not_match" }, { status: 400 })
    }

    const rows = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1)

    const row = rows[0]
    if (!row) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 })
    }

    if (!verifyPassword(currentPassword, row.password)) {
      logAuditEvent(request, "auth.password.change.invalid_current", { userId: currentUser.id })
      return NextResponse.json({ error: "current_password_invalid" }, { status: 400 })
    }

    const [updated] = await db
      .update(users)
      .set({
        password: hashPassword(newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id))
      .returning({ id: users.id })

    if (!updated) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 })
    }

    await deleteUserSessions(currentUser.id)
    const payload = await getUserAuthPayload(currentUser.id)
    if (!payload) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 })
    }

    const { sessionToken, expiresAt } = await createUserSession(currentUser.id, request)
    logAuditEvent(request, "auth.password.change.success", { userId: currentUser.id })
    const response = NextResponse.json({ success: true, user: payload })
    return applySessionCookie(response, sessionToken, expiresAt, request)
  } catch (error: any) {
    logAuditEvent(request, "auth.password.change.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "password change failed" }, { status: 500 })
  }
}
