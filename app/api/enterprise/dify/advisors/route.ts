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

type EnterpriseAdvisorType = "brand-strategy" | "growth" | "lead-hunter"

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

function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim()
  if (!trimmed) return ""
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}

function serializeOverride(override: {
  id: number
  enterpriseId: number
  advisorType: string
  baseUrl: string
  apiKey: string
  enabled: boolean
}) {
  return {
    id: override.id,
    enterpriseId: override.enterpriseId,
    advisorType: override.advisorType as EnterpriseAdvisorType,
    baseUrl: override.baseUrl,
    enabled: override.enabled,
    hasApiKey: Boolean(override.apiKey.trim()),
    apiKeyMasked: maskApiKey(override.apiKey),
  }
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
        overrides: overrides.map(serializeOverride),
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
        overrides: overrides.map(serializeOverride),
      },
    })
  } catch (error: any) {
    const status = typeof error?.message === "string" && error.message.includes("required") ? 400 : 500
    return NextResponse.json({ error: error.message || "failed" }, { status })
  }
}
