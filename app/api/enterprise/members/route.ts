import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { getPermissionMap, isEnterpriseAdmin } from "@/lib/enterprise/server"

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

    const [admin] = await db
      .select({ enterpriseId: users.enterpriseId })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1)

    if (!admin?.enterpriseId) {
      return NextResponse.json({ data: [] })
    }

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        enterpriseRole: users.enterpriseRole,
        enterpriseStatus: users.enterpriseStatus,
        isDemo: users.isDemo,
      })
      .from(users)
      .where(eq(users.enterpriseId, admin.enterpriseId))

    const rows = await Promise.all(
      members.map(async (member) => ({
        ...member,
        permissions: await getPermissionMap(member.id),
      })),
    )

    return NextResponse.json({ data: rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}
