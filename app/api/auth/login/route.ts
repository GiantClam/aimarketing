import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { ensureDemoBillingCreditFloor } from "@/lib/billing/default-free-plan"
import { users } from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import {
  applyDemoSessionCookie,
  applySessionCookie,
  createDemoAuthPayload,
  createUserSession,
  isDemoLoginEnabled,
  isSessionDbUnavailableError,
  withSessionDbRetry,
} from "@/lib/auth/session"
import { getUserAuthPayload, verifyPassword } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"

const DEMO_LOGIN_EMAIL = "demo@example.com"
const DEMO_LOGIN_PASSWORD = "demo123456"

function isDemoCredentialLogin(email: unknown, password: unknown) {
  return String(email || "").trim().toLowerCase() === DEMO_LOGIN_EMAIL && String(password || "") === DEMO_LOGIN_PASSWORD
}

function buildDemoLoginResponse(request: NextRequest) {
  const payload = createDemoAuthPayload()
  logAuditEvent(request, "auth.login.demo_db_fallback", { email: DEMO_LOGIN_EMAIL })
  const response = NextResponse.json({ user: payload, fallback: "stateless_demo_login" })
  return applyDemoSessionCookie(response, undefined, request)
}

export async function POST(request: NextRequest) {
  let email: unknown
  let password: unknown

  try {
    const body = await request.json()
    ;({ email, password } = body || {})

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 })
    }

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

    const rows = await withSessionDbRetry("auth.login.user-select", async () =>
      db
        .select({ id: users.id, password: users.password, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, String(email).trim().toLowerCase()))
        .limit(1),
    )

    if (rows.length === 0) {
      if (isDemoLoginEnabled() && isDemoCredentialLogin(email, password)) {
        return buildDemoLoginResponse(request)
      }

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

    await ensureDemoBillingCreditFloor(payload)

    const { sessionToken, expiresAt } = await createUserSession(user.id, request)
    logAuditEvent(request, "auth.login.success", { userId: user.id, enterpriseId: payload.enterpriseId })
    const response = NextResponse.json({ user: payload })
    return applySessionCookie(response, sessionToken, expiresAt, request)
  } catch (error: any) {
    if (isSessionDbUnavailableError(error)) {
      if (isDemoLoginEnabled() && isDemoCredentialLogin(email, password)) {
        return buildDemoLoginResponse(request)
      }

      logAuditEvent(request, "auth.login.db_unavailable", { message: error?.message || "unknown" })
      return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
    }

    logAuditEvent(request, "auth.login.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "login failed" }, { status: 500 })
  }
}
