import { NextRequest, NextResponse } from "next/server"
import { and, eq, ne } from "drizzle-orm"

import { deleteUserSessions, getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { userFeaturePermissions, users } from "@/lib/db/schema"
import { hashPassword, isEnterpriseAdmin } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"

type MemberAction = "suspend" | "reactivate" | "remove" | "reset_password"

function normalizeAction(value: unknown): MemberAction | null {
  if (
    value === "suspend" ||
    value === "reactivate" ||
    value === "remove" ||
    value === "reset_password"
  ) {
    return value
  }
  return null
}

function validateTemporaryPassword(value: unknown) {
  const password = typeof value === "string" ? value.trim() : ""
  if (password.length < 8 || password.length > 128) return null
  return password
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const allowed = await isEnterpriseAdmin(currentUser.id)
    if (!allowed) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const { memberId } = await params
    const targetUserId = Number(memberId)
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const action = normalizeAction(body?.action)
    if (!action) {
      return NextResponse.json({ error: "unsupported_member_action" }, { status: 400 })
    }

    if (targetUserId === currentUser.id && (action === "suspend" || action === "remove")) {
      return NextResponse.json({ error: "cannot_modify_self" }, { status: 400 })
    }

    const [admin] = await db
      .select({ enterpriseId: users.enterpriseId })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1)

    const [target] = await db
      .select({
        id: users.id,
        enterpriseId: users.enterpriseId,
        enterpriseRole: users.enterpriseRole,
        enterpriseStatus: users.enterpriseStatus,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)

    if (!admin?.enterpriseId || !target || target.enterpriseId !== admin.enterpriseId) {
      logAuditEvent(request, "enterprise.member.cross_enterprise_blocked", {
        userId: currentUser.id,
        targetUserId,
      })
      return NextResponse.json({ error: "target user must belong to same enterprise" }, { status: 403 })
    }

    if (target.enterpriseRole === "admin" && (action === "suspend" || action === "remove")) {
      const activeAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.enterpriseId, admin.enterpriseId),
            eq(users.enterpriseRole, "admin"),
            eq(users.enterpriseStatus, "active"),
            ne(users.id, targetUserId),
          ),
        )
        .limit(1)
      if (activeAdmins.length === 0) {
        return NextResponse.json({ error: "cannot_remove_last_admin" }, { status: 400 })
      }
    }

    if (action === "suspend") {
      await db
        .update(users)
        .set({ enterpriseStatus: "suspended", updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
      await db.delete(userSessions).where(eq(userSessions.userId, targetUserId))
    }

    if (action === "reactivate") {
      await db
        .update(users)
        .set({ enterpriseStatus: "active", updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
    }

    if (action === "remove") {
      await db.delete(userSessions).where(eq(userSessions.userId, targetUserId))
      await db.delete(userFeaturePermissions).where(eq(userFeaturePermissions.userId, targetUserId))
      await db
        .update(users)
        .set({
          enterpriseId: null,
          enterpriseRole: "member",
          enterpriseStatus: "removed",
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId))
    }

    if (action === "reset_password") {
      const temporaryPassword = validateTemporaryPassword(body?.temporaryPassword)
      if (!temporaryPassword) {
        return NextResponse.json({ error: "temporary_password_invalid" }, { status: 400 })
      }
      await db
        .update(users)
        .set({ password: hashPassword(temporaryPassword), updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
      await deleteUserSessions(targetUserId)
    }

    logAuditEvent(request, "enterprise.member.updated", {
      userId: currentUser.id,
      targetUserId,
      action,
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logAuditEvent(request, "enterprise.member.update_error", {
      message: error?.message || "unknown",
    })
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}
