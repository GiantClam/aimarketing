import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import {
  getSystemDefaultAdvisorSummary,
  listEnterpriseAdvisorOverrides,
  upsertEnterpriseAdvisorOverride,
} from "@/lib/dify/config"
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

    const [defaults, overrides] = await Promise.all([
      Promise.resolve(getSystemDefaultAdvisorSummary()),
      listEnterpriseAdvisorOverrides(enterpriseId),
    ])

    return NextResponse.json({
      data: {
        defaults,
        overrides,
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
    const advisorType =
      body?.advisorType === "growth"
        ? "growth"
        : body?.advisorType === "brand-strategy"
          ? "brand-strategy"
          : body?.advisorType === "lead-hunter"
            ? "lead-hunter"
            : null
    if (!advisorType) {
      return NextResponse.json({ error: "advisor_type_required" }, { status: 400 })
    }

    await upsertEnterpriseAdvisorOverride(enterpriseId, advisorType, {
      useDefault: Boolean(body?.useDefault),
      enabled: body?.enabled !== false,
      baseUrl: typeof body?.baseUrl === "string" ? body.baseUrl : "",
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : "",
    })

    const [defaults, overrides] = await Promise.all([
      Promise.resolve(getSystemDefaultAdvisorSummary()),
      listEnterpriseAdvisorOverrides(enterpriseId),
    ])

    return NextResponse.json({
      data: {
        defaults,
        overrides,
      },
    })
  } catch (error: any) {
    const status = typeof error?.message === "string" && error.message.includes("required") ? 400 : 500
    return NextResponse.json({ error: error.message || "failed" }, { status })
  }
}
