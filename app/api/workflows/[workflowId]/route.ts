import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  deleteWorkflowDefinition,
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

async function measureWorkflowRouteStep<T>(label: string, operation: () => Promise<T>) {
  const startedAt = Date.now()
  try {
    return await operation()
  } finally {
    console.info("workflow.route.timing", {
      label,
      durationMs: Date.now() - startedAt,
    })
  }
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
  const requestStartedAt = Date.now()
  try {
    const currentUser = await measureWorkflowRouteStep("patch.session-user", () => getSessionUser(request).catch(() => null))
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
    if (typeof currentUser.enterpriseId !== "number") {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }
    const enterpriseId = currentUser.enterpriseId

    const body = (await measureWorkflowRouteStep("patch.request-json", () => request.json().catch(() => ({})))) as WorkflowUpdateBody

    const data = await measureWorkflowRouteStep("patch.update-workflow-definition", () =>
      updateWorkflowDefinition({
        workflowId: numericWorkflowId,
        enterpriseId,
        title: typeof body.title === "string" ? body.title : undefined,
        description: body.description,
        status: body.status ?? undefined,
        triggerType: body.triggerType ?? undefined,
        metadata: body.metadata,
        nodes: Array.isArray(body.nodes) ? body.nodes : undefined,
        edges: Array.isArray(body.edges) ? body.edges : undefined,
      }),
    )

    console.info("workflow.route.timing", {
      label: "patch.total",
      durationMs: Date.now() - requestStartedAt,
      workflowId: numericWorkflowId,
      nodeCount: Array.isArray(body.nodes) ? body.nodes.length : null,
      edgeCount: Array.isArray(body.edges) ? body.edges.length : null,
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

export async function DELETE(
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

    await deleteWorkflowDefinition(numericWorkflowId, currentUser.enterpriseId)
    return NextResponse.json({ data: { id: numericWorkflowId, deleted: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "workflow_delete_failed"
    const status = message === "workflow_definition_not_found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
