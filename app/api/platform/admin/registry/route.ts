import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import {
  canManagePlatformRegistry,
  type PlatformBindingMode,
  type PlatformRegistryItemType,
  upsertPlatformRegistryControlEntry,
} from "@/lib/platform/control-plane"
import { listPlatformRegistryAdminEntries } from "@/lib/platform/directory-resolver"
import { listPlatformRegistryAdminExecutionStates } from "@/lib/platform/registry-entry-execution"

function normalizeItemType(value: string | null): PlatformRegistryItemType | null {
  if (value === "capability" || value === "agent" || value === "plugin" || value === "workflow") return value
  if (value === "mcp_service" || value === "mcp-services" || value === "mcp") return "mcp_service"
  return null
}

function normalizeBindingMode(value: unknown): PlatformBindingMode | undefined {
  if (value === "existing_runtime" || value === "deferred" || value === "external_runtime") {
    return value
  }
  return undefined
}

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (currentUser == null) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const itemType = normalizeItemType(searchParams.get("type"))
    if (!itemType) {
      return NextResponse.json({ error: "invalid_type" }, { status: 400 })
    }

    const locale = normalizeLocale(searchParams.get("locale")) || "en"
    const entries = await listPlatformRegistryAdminEntries({
      locale,
      itemType,
      enterpriseId: currentUser.enterpriseId ?? null,
    })
    const executions = await listPlatformRegistryAdminExecutionStates({
      locale,
      itemType,
      enterpriseId: currentUser.enterpriseId ?? null,
      currentUser,
    })

    return NextResponse.json({
      data: {
        canManage: canManagePlatformRegistry(currentUser),
        itemType,
        entries,
        executions,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_registry_read_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (currentUser == null) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const enterpriseId = currentUser.enterpriseId ?? null
    if (!canManagePlatformRegistry(currentUser) || !enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const itemType = normalizeItemType(typeof body?.itemType === "string" ? body.itemType : null)
    const slug = typeof body?.slug === "string" ? body.slug.trim() : ""

    if (!itemType || !slug) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    }

    const saved = await upsertPlatformRegistryControlEntry({
      enterpriseId,
      itemType,
      slug,
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
      publicVisible: typeof body?.publicVisible === "boolean" ? body.publicVisible : undefined,
      workspaceVisible: typeof body?.workspaceVisible === "boolean" ? body.workspaceVisible : undefined,
      bindingTarget: typeof body?.bindingTarget === "string" ? body.bindingTarget : undefined,
      bindingMode: normalizeBindingMode(body?.bindingMode),
      notes: typeof body?.notes === "string" ? body.notes : undefined,
    })

    return NextResponse.json({ success: true, data: saved })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "platform_registry_save_failed" },
      { status: 500 },
    )
  }
}
