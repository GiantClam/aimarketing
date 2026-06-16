import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { updateCustomerGovernanceSettings } from "@/lib/platform/customer-governance"

export const runtime = "nodejs"

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const settings = await updateCustomerGovernanceSettings({
      currentUser,
      patch: {
        ssoDomain: typeof body.ssoDomain === "string" ? body.ssoDomain : null,
        seatRequestNote: typeof body.seatRequestNote === "string" ? body.seatRequestNote : null,
        runtimeIntakeMode: body.runtimeIntakeMode === "admin_review" ? "admin_review" : "workspace_default",
        modelConfig: body.modelConfig,
      },
    })

    return NextResponse.json({ data: settings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "platform_governance_settings_failed"
    const status =
      message === "authentication_required"
        ? 401
        : message === "enterprise_context_required"
          ? 403
          : message === "admin_required"
            ? 403
            : 500
    return NextResponse.json({ error: message }, { status })
  }
}
