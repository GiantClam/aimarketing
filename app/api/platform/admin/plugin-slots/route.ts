import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import {
  canManageEnterprisePluginSlots,
  createEnterprisePluginSlot,
  listEnterprisePluginSlots,
  updateEnterprisePluginSlot,
} from "@/lib/platform/plugin-slots"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (currentUser == null) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const locale = normalizeLocale(new URL(request.url).searchParams.get("locale")) || "en"
    const enterpriseId = currentUser.enterpriseId ?? null
    const plugins = enterpriseId ? await listEnterprisePluginSlots(locale, enterpriseId) : []

    return NextResponse.json({
      data: {
        canManage: canManageEnterprisePluginSlots(currentUser),
        plugins,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_plugin_slots_read_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    const enterpriseId = currentUser?.enterpriseId ?? null
    if (currentUser == null) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (!canManageEnterprisePluginSlots(currentUser) || !enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const created = await createEnterprisePluginSlot({
      enterpriseId,
      title: typeof body?.title === "string" ? body.title : "",
      summary: typeof body?.summary === "string" ? body.summary : "",
      integratesWith: typeof body?.integratesWith === "string" ? body.integratesWith : "",
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
      { error: error instanceof Error ? error.message : "platform_plugin_slots_create_failed" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    const enterpriseId = currentUser?.enterpriseId ?? null
    if (currentUser == null) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (!canManageEnterprisePluginSlots(currentUser) || !enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const id = Number(body?.id || 0)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    const updated = await updateEnterprisePluginSlot({
      enterpriseId,
      id,
      title: typeof body?.title === "string" ? body.title : undefined,
      summary: typeof body?.summary === "string" ? body.summary : undefined,
      integratesWith: typeof body?.integratesWith === "string" ? body.integratesWith : undefined,
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
      { error: error instanceof Error ? error.message : "platform_plugin_slots_update_failed" },
      { status: 500 },
    )
  }
}
