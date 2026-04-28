import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import { applySessionCookie, createUserSession, withSessionDbRetry } from "@/lib/auth/session"
import { getUserAuthPayload, verifyPassword } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    await ensureEnterpriseAuthTables()
    const rateLimit = await checkRateLimit({
      key: `auth:login:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      logAuditEvent(request, "auth.login.rate_limited")
      return createRateLimitResponse("Too many login attempts", rateLimit)
    }

    const body = await request.json()
    const { email, password } = body || {}

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 })
    }

    const rows = await withSessionDbRetry("auth.login.user-select", async () =>
      db
        .select({ id: users.id, password: users.password, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, String(email).trim().toLowerCase()))
        .limit(1),
    )

    if (rows.length === 0) {
      logAuditEvent(request, "auth.login.invalid_user", { email: String(email).trim().toLowerCase() })
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const user = rows[0]
    if (!verifyPassword(String(password), user.password)) {
      logAuditEvent(request, "auth.login.invalid_password", { userId: user.id })
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    if (!user.emailVerified) {
      logAuditEvent(request, "auth.login.email_not_verified", { userId: user.id })
      return NextResponse.json({ error: "email_not_verified" }, { status: 403 })
    }

    const payload = await withSessionDbRetry("auth.login.user-payload", async () => getUserAuthPayload(user.id))
    if (!payload) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (payload.enterpriseStatus === "suspended" || payload.enterpriseStatus === "removed") {
      logAuditEvent(request, "auth.login.enterprise_inactive", { userId: user.id, status: payload.enterpriseStatus })
      return NextResponse.json({ error: "account_inactive" }, { status: 403 })
    }

    if (!payload.enterpriseId) {
      logAuditEvent(request, "auth.login.enterprise_missing", { userId: user.id })
      return NextResponse.json({ error: "User is not bound to any enterprise" }, { status: 403 })
    }

    const { sessionToken, expiresAt } = await createUserSession(user.id, request)
    logAuditEvent(request, "auth.login.success", { userId: user.id, enterpriseId: payload.enterpriseId })
    const response = NextResponse.json({ user: payload })
    return applySessionCookie(response, sessionToken, expiresAt, request)
  } catch (error: any) {
    logAuditEvent(request, "auth.login.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "login failed" }, { status: 500 })
  }
}
