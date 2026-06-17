import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  createWorkflowDefinition,
  listWorkflowDefinitionsForEnterprise,
  type WorkflowDefinitionStatus,
  type WorkflowDefinitionTriggerType,
} from "@/lib/workflows/store"
import type { WorkflowDefinitionEdge, WorkflowDefinitionNode } from "@/lib/workflows/schema"

export const runtime = "nodejs"

type WorkflowCreateBody = {
  title?: string
  description?: string | null
  status?: WorkflowDefinitionStatus | null
  triggerType?: WorkflowDefinitionTriggerType | null
  metadata?: Record<string, unknown> | null
  nodes?: WorkflowDefinitionNode[]
  edges?: WorkflowDefinitionEdge[]
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const data = await listWorkflowDefinitionsForEnterprise(currentUser.enterpriseId)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_list_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as WorkflowCreateBody
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) {
      return NextResponse.json({ error: "workflow_title_required" }, { status: 400 })
    }

    const data = await createWorkflowDefinition({
      enterpriseId: currentUser.enterpriseId,
      ownerUserId: currentUser.id,
      title,
      description: body.description ?? null,
      status: body.status ?? undefined,
      triggerType: body.triggerType ?? undefined,
      metadata: body.metadata ?? null,
      nodes: Array.isArray(body.nodes) ? body.nodes : [],
      edges: Array.isArray(body.edges) ? body.edges : [],
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "workflow_create_failed"
    const status = message.startsWith("invalid_") || message === "duplicate_workflow_node_key" ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
