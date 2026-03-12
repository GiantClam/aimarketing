import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprises, enterpriseJoinRequests, userFeaturePermissions, users } from "@/lib/db/schema"
import { applySessionCookie, createUserSession } from "@/lib/auth/session"
import { ensurePermissions, generateEnterpriseCode, getUserAuthPayload, hashPassword } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit({
      key: `auth:register:${getRequestIp(request)}`,
      limit: 6,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      logAuditEvent(request, "auth.register.rate_limited")
      return createRateLimitResponse("Too many registration attempts", rateLimit)
    }

    const body = await request.json()
    const {
      name,
      email,
      password,
      enterpriseAction,
      enterpriseName,
      enterpriseCode,
      joinNote,
    } = body || {}

    if (!name || !email || !password) {
      return NextResponse.json({ error: "name, email, password are required" }, { status: 400 })
    }
    const normalizedEmail = String(email).trim().toLowerCase()

    if (enterpriseAction !== "create" && enterpriseAction !== "join") {
      return NextResponse.json({ error: "enterpriseAction must be create or join" }, { status: 400 })
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1)
    if (existing.length > 0) {
      logAuditEvent(request, "auth.register.duplicate_email", { email: normalizedEmail })
      return NextResponse.json({ error: "Email already exists" }, { status: 409 })
    }

    if (enterpriseAction === "create") {
      if (!enterpriseName?.trim()) {
        return NextResponse.json({ error: "enterpriseName is required" }, { status: 400 })
      }

      let code = generateEnterpriseCode(String(enterpriseName))
      for (let i = 0; i < 3; i += 1) {
        const codeExists = await db
          .select({ id: enterprises.id })
          .from(enterprises)
          .where(eq(enterprises.enterpriseCode, code))
          .limit(1)
        if (codeExists.length === 0) break
        code = generateEnterpriseCode(String(enterpriseName))
      }

      const [enterprise] = await db
        .insert(enterprises)
        .values({
          enterpriseCode: code,
          name: String(enterpriseName).trim(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      let userId: number | null = null
      try {
        const [user] = await db
          .insert(users)
          .values({
            name: String(name).trim(),
            email: normalizedEmail,
            password: hashPassword(String(password)),
            enterpriseId: enterprise.id,
            enterpriseRole: "admin",
            enterpriseStatus: "active",
            isDemo: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning()

        userId = user.id
        await db.update(enterprises).set({ createdBy: user.id, updatedAt: new Date() }).where(eq(enterprises.id, enterprise.id))
        await ensurePermissions(user.id, true)

        const payload = await getUserAuthPayload(user.id)
        if (!payload) {
          throw new Error("Failed to build user payload")
        }

        const { sessionToken, expiresAt } = await createUserSession(user.id, request)
        logAuditEvent(request, "auth.register.enterprise_created", {
          userId: user.id,
          enterpriseId: enterprise.id,
        })
        const response = NextResponse.json({ user: payload, requiresApproval: false })
        return applySessionCookie(response, sessionToken, expiresAt)
      } catch (error) {
        if (userId) {
          await db.delete(userFeaturePermissions).where(eq(userFeaturePermissions.userId, userId))
          await db.delete(users).where(eq(users.id, userId))
        }
        await db.delete(enterprises).where(eq(enterprises.id, enterprise.id))
        throw error
      }
    }

    if (!enterpriseCode?.trim()) {
      return NextResponse.json({ error: "enterpriseCode is required" }, { status: 400 })
    }
    const normalizedEnterpriseCode = String(enterpriseCode).trim().toLowerCase()

    const [targetEnterprise] = await db
      .select({ id: enterprises.id, enterpriseCode: enterprises.enterpriseCode })
      .from(enterprises)
      .where(eq(enterprises.enterpriseCode, normalizedEnterpriseCode))
      .limit(1)

    if (!targetEnterprise) {
      logAuditEvent(request, "auth.register.enterprise_not_found", { enterpriseCode: normalizedEnterpriseCode })
      return NextResponse.json({ error: "Enterprise not found" }, { status: 404 })
    }

    let createdUserId: number | null = null
    try {
      const [user] = await db
        .insert(users)
        .values({
          name: String(name).trim(),
          email: normalizedEmail,
          password: hashPassword(String(password)),
          enterpriseId: targetEnterprise.id,
          enterpriseRole: "member",
          enterpriseStatus: "pending",
          isDemo: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      createdUserId = user.id

      await db.insert(enterpriseJoinRequests).values({
        userId: user.id,
        enterpriseId: targetEnterprise.id,
        status: "pending",
        note: joinNote ? String(joinNote) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await ensurePermissions(user.id, false)

      const payload = await getUserAuthPayload(user.id)
      if (!payload) {
        throw new Error("Failed to build user payload")
      }

      const { sessionToken, expiresAt } = await createUserSession(user.id, request)
      logAuditEvent(request, "auth.register.join_requested", {
        userId: user.id,
        enterpriseId: targetEnterprise.id,
      })
      const response = NextResponse.json({ user: payload, requiresApproval: true })
      return applySessionCookie(response, sessionToken, expiresAt)
    } catch (error) {
      if (createdUserId) {
        await db.delete(userFeaturePermissions).where(eq(userFeaturePermissions.userId, createdUserId))
        await db.delete(enterpriseJoinRequests).where(eq(enterpriseJoinRequests.userId, createdUserId))
        await db.delete(users).where(eq(users.id, createdUserId))
      }
      throw error
    }
  } catch (error: any) {
    logAuditEvent(request, "auth.register.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "register failed" }, { status: 500 })
  }
}
