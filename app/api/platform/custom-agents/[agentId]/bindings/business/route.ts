import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { setCustomAgentBusinessBindings } from "@/lib/platform/custom-agents"

export const runtime = "nodejs"

function parseAgentId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (!currentUser.enterpriseId) return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })

    const { agentId } = await params
    const numericAgentId = parseAgentId(agentId)
    if (!numericAgentId) return NextResponse.json({ error: "invalid_agent_id" }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as { bindings?: unknown[] }
    const data = await setCustomAgentBusinessBindings({
      agentId: numericAgentId,
      enterpriseId: currentUser.enterpriseId,
      actorUserId: currentUser.id,
      isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
      bindings: Array.isArray(body.bindings) ? (body.bindings as Array<{ businessSlug: string; displayPriority?: number; enabled?: boolean }>) : [],
    })
    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "custom_agent_business_bindings_failed"
    const status = message === "custom_agent_not_found" ? 404 : message === "forbidden" ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
