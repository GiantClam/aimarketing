import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { type PermissionMap, buildPermissionMap } from "@/lib/enterprise/constants"
import { isEnterpriseAdmin, upsertPermissions } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const targetUserId = Number(body?.targetUserId)
    const permissions = body?.permissions as Partial<PermissionMap> | undefined

    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 })
    }

    const allowed = await isEnterpriseAdmin(currentUser.id)
    if (!allowed) {
      logAuditEvent(request, "enterprise.permissions.forbidden", { userId: currentUser.id, targetUserId })
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const adminRows = await db
      .select({ enterpriseId: users.enterpriseId })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1)

    const targetRows = await db
      .select({ enterpriseId: users.enterpriseId })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)

    const adminEnterpriseId = adminRows[0]?.enterpriseId
    const target = targetRows[0]

    if (!adminEnterpriseId || !target || target.enterpriseId !== adminEnterpriseId) {
      logAuditEvent(request, "enterprise.permissions.cross_enterprise_blocked", {
        adminEnterpriseId,
        targetUserId,
        userId: currentUser.id,
      })
      return NextResponse.json({ error: "target user must belong to same enterprise" }, { status: 403 })
    }

    const finalPermissions = {
      ...buildPermissionMap(false),
      ...(permissions || {}),
    }

    await upsertPermissions(targetUserId, finalPermissions)
    logAuditEvent(request, "enterprise.permissions.updated", { userId: currentUser.id, targetUserId })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logAuditEvent(request, "enterprise.permissions.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}
