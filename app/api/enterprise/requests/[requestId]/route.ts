import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { enterpriseJoinRequests, users } from "@/lib/db/schema"
import { buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"
import { isEnterpriseAdmin, upsertPermissions } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const resolved = await params
    const requestId = Number(resolved.requestId)
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return NextResponse.json({ error: "invalid requestId" }, { status: 400 })
    }

    const body = await request.json()
    const action = body?.action as "approve" | "reject"
    const note = body?.note as string | undefined
    const permissions = body?.permissions as Partial<PermissionMap> | undefined

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 })
    }

    const allowed = await isEnterpriseAdmin(currentUser.id)
    if (!allowed) {
      logAuditEvent(request, "enterprise.request_review.forbidden", { userId: currentUser.id, requestId })
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const requestRows = await db
      .select({
        id: enterpriseJoinRequests.id,
        userId: enterpriseJoinRequests.userId,
        enterpriseId: enterpriseJoinRequests.enterpriseId,
        status: enterpriseJoinRequests.status,
      })
      .from(enterpriseJoinRequests)
      .where(eq(enterpriseJoinRequests.id, requestId))
      .limit(1)

    if (requestRows.length === 0) {
      logAuditEvent(request, "enterprise.request_review.missing", { userId: currentUser.id, requestId })
      return NextResponse.json({ error: "request not found" }, { status: 404 })
    }

    const joinRequest = requestRows[0]
    if (joinRequest.status !== "pending") {
      logAuditEvent(request, "enterprise.request_review.already_reviewed", { userId: currentUser.id, requestId })
      return NextResponse.json({ error: "request already reviewed" }, { status: 409 })
    }

    const adminRows = await db
      .select({ enterpriseId: users.enterpriseId })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1)

    const adminEnterpriseId = adminRows[0]?.enterpriseId
    if (!adminEnterpriseId || adminEnterpriseId !== joinRequest.enterpriseId) {
      logAuditEvent(request, "enterprise.request_review.cross_enterprise_blocked", {
        adminEnterpriseId,
        requestEnterpriseId: joinRequest.enterpriseId,
        requestId,
        userId: currentUser.id,
      })
      return NextResponse.json({ error: "admin cannot review request from other enterprise" }, { status: 403 })
    }

    await db
      .update(enterpriseJoinRequests)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        reviewedBy: currentUser.id,
        reviewedAt: new Date(),
        note: note || null,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseJoinRequests.id, requestId))

    await db
      .update(users)
      .set({
        enterpriseStatus: action === "approve" ? "active" : "rejected",
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, joinRequest.userId), eq(users.enterpriseId, joinRequest.enterpriseId)))

    if (action === "approve") {
      const targetPermissions = {
        ...buildPermissionMap(false),
        ...(permissions || {}),
      }
      await upsertPermissions(joinRequest.userId, targetPermissions)
    } else {
      await upsertPermissions(joinRequest.userId, buildPermissionMap(false))
    }

    logAuditEvent(request, "enterprise.request_review.completed", {
      action,
      requestId,
      reviewedUserId: joinRequest.userId,
      userId: currentUser.id,
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logAuditEvent(request, "enterprise.request_review.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}
