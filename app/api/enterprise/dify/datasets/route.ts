import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { getEnterpriseDifyBinding, listRemoteEnterpriseDifyDatasets } from "@/lib/dify/enterprise-knowledge"
import { isEnterpriseAdmin } from "@/lib/enterprise/server"

async function getAdminEnterpriseId(userId: number) {
  const allowed = await isEnterpriseAdmin(userId)
  if (!allowed) {
    return null
  }

  const rows = await db
    .select({ enterpriseId: users.enterpriseId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const enterpriseId = rows[0]?.enterpriseId
  return typeof enterpriseId === "number" && enterpriseId > 0 ? enterpriseId : null
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const enterpriseId = await getAdminEnterpriseId(currentUser.id)
    if (!enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const existing = await getEnterpriseDifyBinding(enterpriseId)
    const baseUrl =
      typeof body?.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl : existing?.baseUrl || ""
    const apiKey = typeof body?.apiKey === "string" && body.apiKey.trim() ? body.apiKey : existing?.apiKey || ""

    const datasets = await listRemoteEnterpriseDifyDatasets(baseUrl, apiKey)
    return NextResponse.json({ data: { datasets } })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}
