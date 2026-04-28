import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import {
  buildPasswordResetUrl,
  sendPasswordResetEmail,
} from "@/lib/auth/password-reset"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { logAuditEvent } from "@/lib/server/audit"

export const runtime = "nodejs"

function getRequestUserAgent(request: NextRequest) {
  return request.headers.get("user-agent")?.slice(0, 1000) || null
}

export async function POST(request: NextRequest) {
  try {
    await ensureEnterpriseAuthTables()

    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      key: `auth:password:forgot:${getRequestIp(request)}:${email}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateLimit.ok) {
      return createRateLimitResponse("Too many password reset requests", rateLimit)
    }

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    const user = rows[0]
    if (user) {
      try {
        await sendPasswordResetEmail({
          userId: user.id,
          email,
          name: user.name,
          requestedIp: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          resetUrlBuilder: (token) => buildPasswordResetUrl(request.url, token),
        })
        logAuditEvent(request, "auth.password.forgot.sent", { userId: user.id })
      } catch (error: any) {
        logAuditEvent(request, "auth.password.forgot.send_failed", {
          userId: user.id,
          message: error?.message || "unknown",
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logAuditEvent(request, "auth.password.forgot.error", { message: error?.message || "unknown" })
    return NextResponse.json({ success: true })
  }
}
