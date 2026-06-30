import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { publishWorkflowAsCustomAgent } from "@/lib/platform/custom-agents"

export const runtime = "nodejs"

function parseWorkflowId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { workflowId } = await params
    const numericWorkflowId = parseWorkflowId(workflowId)
    if (!numericWorkflowId) {
      return NextResponse.json({ error: "invalid_workflow_id" }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown
      summary?: unknown
      systemPrompt?: unknown
      visibility?: unknown
    }

    const data = await publishWorkflowAsCustomAgent({
      workflowId: numericWorkflowId,
      enterpriseId: currentUser.enterpriseId,
      ownerUserId: currentUser.id,
      name: typeof body.name === "string" ? body.name : "",
      summary: typeof body.summary === "string" ? body.summary : null,
      systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : null,
      visibility: body.visibility === "shared" ? "shared" : "private",
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "workflow_publish_as_agent_failed"
    const status =
      message === "invalid_workflow_id" ||
      message === "workflow_definition_not_found" ||
      message === "custom_agent_name_required"
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
