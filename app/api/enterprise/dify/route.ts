import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import {
  getEnterpriseDifyBinding,
  type EnterpriseDifyDatasetInput,
  upsertEnterpriseDifyBinding,
} from "@/lib/dify/enterprise-knowledge"
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

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const enterpriseId = await getAdminEnterpriseId(currentUser.id)
    if (!enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const binding = await getEnterpriseDifyBinding(enterpriseId)
    return NextResponse.json({
      data: {
        binding,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const enterpriseId = await getAdminEnterpriseId(currentUser.id)
    if (!enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : ""
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey : ""
    const enabled = Boolean(body?.enabled)
    const datasets = Array.isArray(body?.datasets) ? body.datasets : []

    const normalizedDatasets: EnterpriseDifyDatasetInput[] = datasets.map((dataset: any) => ({
      datasetId: String(dataset?.datasetId || ""),
      datasetName: String(dataset?.datasetName || ""),
      scope: dataset?.scope,
      priority: Number(dataset?.priority || 100),
      enabled: Boolean(dataset?.enabled),
    }))

    const binding = await upsertEnterpriseDifyBinding(enterpriseId, {
      baseUrl,
      apiKey,
      enabled,
      datasets: normalizedDatasets,
    })

    return NextResponse.json({
      data: {
        binding,
      },
    })
  } catch (error: any) {
    const status = typeof error?.message === "string" && error.message.includes("required") ? 400 : 500
    return NextResponse.json({ error: error.message || "failed" }, { status })
  }
}
