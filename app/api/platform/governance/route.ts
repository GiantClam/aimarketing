import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getCustomerGovernanceSnapshot } from "@/lib/platform/customer-governance"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }

    const snapshot = await getCustomerGovernanceSnapshot(currentUser)
    return NextResponse.json({ data: snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : "platform_governance_failed"
    const status = message === "enterprise_context_required" ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
