import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { disableCustomAgent } from "@/lib/platform/custom-agents"

export const runtime = "nodejs"

function parseAgentId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function POST(
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

    const data = await disableCustomAgent({
      agentId: numericAgentId,
      enterpriseId: currentUser.enterpriseId,
      actorUserId: currentUser.id,
      isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
    })
    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "custom_agent_disable_failed"
    const status = message === "custom_agent_not_found" ? 404 : message === "forbidden" ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
