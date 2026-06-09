import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import {
  canManageEnterpriseMcpServiceProfiles,
  createEnterpriseMcpServiceProfile,
  listEnterpriseMcpServiceProfiles,
  updateEnterpriseMcpServiceProfile,
} from "@/lib/platform/mcp-service-profiles"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (currentUser == null) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const locale = normalizeLocale(new URL(request.url).searchParams.get("locale")) || "en"
    const enterpriseId = currentUser.enterpriseId ?? null
    const profiles = enterpriseId ? await listEnterpriseMcpServiceProfiles(locale, enterpriseId) : []

    return NextResponse.json({
      data: {
        canManage: canManageEnterpriseMcpServiceProfiles(currentUser),
        profiles,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_mcp_service_profiles_read_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    const enterpriseId = currentUser?.enterpriseId ?? null
    if (currentUser == null) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (!canManageEnterpriseMcpServiceProfiles(currentUser) || !enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const created = await createEnterpriseMcpServiceProfile({
      enterpriseId,
      title: typeof body?.title === "string" ? body.title : "",
      summary: typeof body?.summary === "string" ? body.summary : "",
      serviceType: typeof body?.serviceType === "string" ? body.serviceType : "",
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
      { error: error instanceof Error ? error.message : "platform_mcp_service_profiles_create_failed" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    const enterpriseId = currentUser?.enterpriseId ?? null
    if (currentUser == null) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (!canManageEnterpriseMcpServiceProfiles(currentUser) || !enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const id = Number(body?.id || 0)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    const updated = await updateEnterpriseMcpServiceProfile({
      enterpriseId,
      id,
      title: typeof body?.title === "string" ? body.title : undefined,
      summary: typeof body?.summary === "string" ? body.summary : undefined,
      serviceType: typeof body?.serviceType === "string" ? body.serviceType : undefined,
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
      { error: error instanceof Error ? error.message : "platform_mcp_service_profiles_update_failed" },
      { status: 500 },
    )
  }
}
