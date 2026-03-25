import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { enterprises, enterpriseJoinRequests, users } from "@/lib/db/schema"
import { isEnterpriseAdmin, listPendingRequests } from "@/lib/enterprise/server"
import { logAuditEvent } from "@/lib/server/audit"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const allowed = await isEnterpriseAdmin(currentUser.id)
    if (!allowed) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const data = await listPendingRequests(currentUser.id)
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const [currentUserRow] = await db
      .select({
        enterpriseId: users.enterpriseId,
        enterpriseRole: users.enterpriseRole,
        enterpriseStatus: users.enterpriseStatus,
      })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1)

    if (!currentUserRow) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    if (currentUserRow.enterpriseRole === "admin") {
      return NextResponse.json({ error: "enterprise_admin_cannot_switch" }, { status: 403 })
    }

    if (!currentUserRow.enterpriseId) {
      return NextResponse.json({ error: "enterprise_not_bound" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const enterpriseCode = String(body?.enterpriseCode || "").trim().toLowerCase()
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : ""

    if (!enterpriseCode) {
      return NextResponse.json({ error: "enterprise_code_required" }, { status: 400 })
    }

    const [targetEnterprise] = await db
      .select({ id: enterprises.id, enterpriseCode: enterprises.enterpriseCode, name: enterprises.name })
      .from(enterprises)
      .where(eq(enterprises.enterpriseCode, enterpriseCode))
      .limit(1)

    if (!targetEnterprise) {
      return NextResponse.json({ error: "enterprise_not_found" }, { status: 404 })
    }

    if (currentUserRow.enterpriseId === targetEnterprise.id && currentUserRow.enterpriseStatus !== "rejected") {
      return NextResponse.json({ error: "enterprise_already_bound" }, { status: 409 })
    }

    await db.delete(enterpriseJoinRequests).where(eq(enterpriseJoinRequests.userId, currentUser.id))
    await db.insert(enterpriseJoinRequests).values({
      userId: currentUser.id,
      enterpriseId: targetEnterprise.id,
      status: "pending",
      note: note || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    logAuditEvent(request, "enterprise.request_switch.created", {
      userId: currentUser.id,
      enterpriseId: targetEnterprise.id,
      enterpriseCode: targetEnterprise.enterpriseCode,
    })

    return NextResponse.json({
      success: true,
      data: {
        requiresApproval: true,
        enterpriseCode: targetEnterprise.enterpriseCode,
        enterpriseName: targetEnterprise.name,
      },
    })
  } catch (error: any) {
    logAuditEvent(request, "enterprise.request_switch.error", {
      message: error?.message || "unknown",
    })
    return NextResponse.json({ error: error?.message || "failed" }, { status: 500 })
  }
}
