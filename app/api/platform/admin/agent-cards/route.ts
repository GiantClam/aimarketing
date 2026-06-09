import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import {
  canManageEnterpriseAgentCards,
  createEnterpriseAgentCard,
  listEnterpriseAgentCards,
  updateEnterpriseAgentCard,
} from "@/lib/platform/agent-cards"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (currentUser == null) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const locale = normalizeLocale(new URL(request.url).searchParams.get("locale")) || "en"
    const enterpriseId = currentUser.enterpriseId ?? null
    const cards = enterpriseId ? await listEnterpriseAgentCards(locale, enterpriseId) : []

    return NextResponse.json({
      data: {
        canManage: canManageEnterpriseAgentCards(currentUser),
        cards,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_agent_cards_read_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    const enterpriseId = currentUser?.enterpriseId ?? null
    if (currentUser == null) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!canManageEnterpriseAgentCards(currentUser) || !enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const created = await createEnterpriseAgentCard({
      enterpriseId,
      title: typeof body?.title === "string" ? body.title : "",
      summary: typeof body?.summary === "string" ? body.summary : "",
      focus: typeof body?.focus === "string" ? body.focus : "",
      status: body?.status,
      publicVisible: typeof body?.publicVisible === "boolean" ? body.publicVisible : undefined,
      workspaceVisible: typeof body?.workspaceVisible === "boolean" ? body.workspaceVisible : undefined,
      bindingTarget: typeof body?.bindingTarget === "string" ? body.bindingTarget : undefined,
      bindingMode: body?.bindingMode,
      notes: typeof body?.notes === "string" ? body.notes : undefined,
    })

    return NextResponse.json({ success: true, data: created })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_agent_cards_create_failed" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    const enterpriseId = currentUser?.enterpriseId ?? null
    if (currentUser == null) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!canManageEnterpriseAgentCards(currentUser) || !enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const id = Number(body?.id || 0)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    const updated = await updateEnterpriseAgentCard({
      enterpriseId,
      id,
      title: typeof body?.title === "string" ? body.title : undefined,
      summary: typeof body?.summary === "string" ? body.summary : undefined,
      focus: typeof body?.focus === "string" ? body.focus : undefined,
      status: body?.status,
      publicVisible: typeof body?.publicVisible === "boolean" ? body.publicVisible : undefined,
      workspaceVisible: typeof body?.workspaceVisible === "boolean" ? body.workspaceVisible : undefined,
      bindingTarget: typeof body?.bindingTarget === "string" ? body.bindingTarget : undefined,
      bindingMode: body?.bindingMode,
      notes: typeof body?.notes === "string" ? body.notes : undefined,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_agent_cards_update_failed" },
      { status: 500 },
    )
  }
}
