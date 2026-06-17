import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  getWorkflowDefinition,
  updateWorkflowDefinition,
  type WorkflowDefinitionStatus,
  type WorkflowDefinitionTriggerType,
} from "@/lib/workflows/store"
import type { WorkflowDefinitionEdge, WorkflowDefinitionNode } from "@/lib/workflows/schema"

export const runtime = "nodejs"

type WorkflowUpdateBody = {
  title?: string | null
  description?: string | null
  status?: WorkflowDefinitionStatus | null
  triggerType?: WorkflowDefinitionTriggerType | null
  metadata?: Record<string, unknown> | null
  nodes?: WorkflowDefinitionNode[]
  edges?: WorkflowDefinitionEdge[]
}

function parseWorkflowId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function GET(
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

    const data = await getWorkflowDefinition(numericWorkflowId, currentUser.enterpriseId)
    if (!data) {
      return NextResponse.json({ error: "workflow_definition_not_found" }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_get_failed" },
      { status: 500 },
    )
  }
}

export async function PATCH(
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

    const body = (await request.json().catch(() => ({}))) as WorkflowUpdateBody

    const data = await updateWorkflowDefinition({
      workflowId: numericWorkflowId,
      enterpriseId: currentUser.enterpriseId,
      title: typeof body.title === "string" ? body.title : undefined,
      description: body.description,
      status: body.status ?? undefined,
      triggerType: body.triggerType ?? undefined,
      metadata: body.metadata,
      nodes: Array.isArray(body.nodes) ? body.nodes : undefined,
      edges: Array.isArray(body.edges) ? body.edges : undefined,
    })

    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "workflow_update_failed"
    const status =
      message === "workflow_definition_not_found"
        ? 404
        : message.startsWith("invalid_") || message === "duplicate_workflow_node_key"
          ? 400
          : 500

    return NextResponse.json({ error: message }, { status })
  }
}
