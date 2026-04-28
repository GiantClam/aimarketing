import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import {
  buildEmailVerificationUrl,
  normalizeVerificationEmail,
  resendEmailVerification,
} from "@/lib/auth/email-verification"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    await ensureEnterpriseAuthTables()

    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === "string" ? normalizeVerificationEmail(body.email) : ""
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      key: `auth:email-verification:resend:${getRequestIp(request)}:${email}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateLimit.ok) {
      return createRateLimitResponse("Too many resend attempts", rateLimit)
    }

    const rows = await db
      .select({ id: users.id, name: users.name, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    const user = rows[0]
    if (user && !user.emailVerified) {
      await resendEmailVerification({
        userId: user.id,
        email,
        name: user.name,
        verificationUrlBuilder: (token) => buildEmailVerificationUrl(request, token),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "resend verification failed" }, { status: 500 })
  }
}
