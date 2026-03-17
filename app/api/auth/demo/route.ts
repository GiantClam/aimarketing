import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import {
  applyDemoSessionCookie,
  applySessionCookie,
  createDemoAuthPayload,
  createUserSession,
  isDemoLoginEnabled,
  withSessionDbRetry,
} from "@/lib/auth/session"
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

    try {
      let [enterprise] = await withSessionDbRetry("auth.demo.enterprise-select", async () =>
        db
          .select({ id: enterprises.id, enterpriseCode: enterprises.enterpriseCode })
          .from(enterprises)
          .where(eq(enterprises.enterpriseCode, "experience-enterprise"))
          .limit(1),
      )

      if (!enterprise) {
        ;[enterprise] = await withSessionDbRetry("auth.demo.enterprise-insert", async () =>
          db
            .insert(enterprises)
            .values({
              enterpriseCode: "experience-enterprise",
              name: "体验企业",
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning({ id: enterprises.id, enterpriseCode: enterprises.enterpriseCode }),
        )
      }

      const email = "demo@example.com"
      const existing = await withSessionDbRetry("auth.demo.user-select", async () =>
        db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
      )

      let userId = existing[0]?.id
      if (!userId) {
        const [created] = await withSessionDbRetry("auth.demo.user-insert", async () =>
          db
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
            .returning({ id: users.id }),
        )
        userId = created.id
      } else {
        await withSessionDbRetry("auth.demo.user-update", async () =>
          db
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
            .where(eq(users.id, userId)),
        )
      }

      await withSessionDbRetry("auth.demo.ensure-permissions", async () => ensurePermissions(userId, true))

      const payload = await withSessionDbRetry("auth.demo.user-payload", async () => getUserAuthPayload(userId))
      if (!payload) {
        return NextResponse.json({ error: "demo user not found" }, { status: 404 })
      }

      const { sessionToken, expiresAt } = await createUserSession(userId, request)
      logAuditEvent(request, "auth.demo.success", { userId, enterpriseId: payload.enterpriseId })
      const response = NextResponse.json({ user: payload })
      return applySessionCookie(response, sessionToken, expiresAt)
    } catch (dbError: any) {
      const payload = createDemoAuthPayload()
      logAuditEvent(request, "auth.demo.fallback", { message: dbError?.message || "unknown" })
      const response = NextResponse.json({ user: payload, fallback: "stateless_demo" })
      return applyDemoSessionCookie(response)
    }
  } catch (error: any) {
    logAuditEvent(request, "auth.demo.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "demo login failed" }, { status: 500 })
  }
}
