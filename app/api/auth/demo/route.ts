import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { applySessionCookie, createUserSession, isDemoLoginEnabled } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { enterprises, users } from "@/lib/db/schema"
import { ensurePermissions, getUserAuthPayload, hashPassword } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    if (!isDemoLoginEnabled()) {
      logAuditEvent(request, "auth.demo.blocked")
      return NextResponse.json({ error: "demo login is disabled" }, { status: 403 })
    }

    let [enterprise] = await db
      .select({ id: enterprises.id, enterpriseCode: enterprises.enterpriseCode })
      .from(enterprises)
      .where(eq(enterprises.enterpriseCode, "experience-enterprise"))
      .limit(1)

    if (!enterprise) {
      ;[enterprise] = await db
        .insert(enterprises)
        .values({
          enterpriseCode: "experience-enterprise",
          name: "体验企业",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: enterprises.id, enterpriseCode: enterprises.enterpriseCode })
    }

    const email = "demo@example.com"
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)

    let userId = existing[0]?.id
    if (!userId) {
      const [created] = await db
        .insert(users)
        .values({
          name: "体验用户",
          email,
          password: hashPassword("demo123456"),
          enterpriseId: enterprise.id,
          enterpriseRole: "admin",
          enterpriseStatus: "active",
          isDemo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: users.id })
      userId = created.id
    } else {
      await db
        .update(users)
        .set({
          name: "体验用户",
          password: hashPassword("demo123456"),
          enterpriseId: enterprise.id,
          enterpriseRole: "admin",
          enterpriseStatus: "active",
          isDemo: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
    }

    await ensurePermissions(userId, true)

    const payload = await getUserAuthPayload(userId)
    if (!payload) {
      return NextResponse.json({ error: "demo user not found" }, { status: 404 })
    }

    const { sessionToken, expiresAt } = await createUserSession(userId, request)
    logAuditEvent(request, "auth.demo.success", { userId, enterpriseId: payload.enterpriseId })
    const response = NextResponse.json({ user: payload })
    return applySessionCookie(response, sessionToken, expiresAt)
  } catch (error: any) {
    logAuditEvent(request, "auth.demo.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "demo login failed" }, { status: 500 })
  }
}
