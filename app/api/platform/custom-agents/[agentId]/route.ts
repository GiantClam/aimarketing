import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getCustomAgentForUser, updateCustomAgent } from "@/lib/platform/custom-agents"

export const runtime = "nodejs"

function parseAgentId(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { agentId } = await params
    const numericAgentId = parseAgentId(agentId)
    if (!numericAgentId) {
      return NextResponse.json({ error: "invalid_agent_id" }, { status: 400 })
    }

    const data = await getCustomAgentForUser({
      agentId: numericAgentId,
      enterpriseId: currentUser.enterpriseId,
      userId: currentUser.id,
      isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
    })
    if (!data) {
      return NextResponse.json({ error: "custom_agent_not_found" }, { status: 404 })
    }
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "custom_agent_get_failed" },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { agentId } = await params
    const numericAgentId = parseAgentId(agentId)
    if (!numericAgentId) {
      return NextResponse.json({ error: "invalid_agent_id" }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const data = await updateCustomAgent({
      agentId: numericAgentId,
      enterpriseId: currentUser.enterpriseId,
      actorUserId: currentUser.id,
      isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
      linkedWorkflowId:
        typeof body.linkedWorkflowId === "number" || body.linkedWorkflowId === null
          ? (body.linkedWorkflowId as number | null)
          : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      summary: typeof body.summary === "string" || body.summary === null ? (body.summary as string | null) : undefined,
      systemPrompt:
        typeof body.systemPrompt === "string" || body.systemPrompt === null
          ? (body.systemPrompt as string | null)
          : undefined,
      systemPromptSummary:
        typeof body.systemPromptSummary === "string" || body.systemPromptSummary === null
          ? (body.systemPromptSummary as string | null)
          : undefined,
      goal: typeof body.goal === "string" || body.goal === null ? (body.goal as string | null) : undefined,
      scope: typeof body.scope === "string" || body.scope === null ? (body.scope as string | null) : undefined,
      guardrails:
        typeof body.guardrails === "string" || body.guardrails === null
          ? (body.guardrails as string | null)
          : undefined,
      defaultOutputType:
        typeof body.defaultOutputType === "string" || body.defaultOutputType === null
          ? (body.defaultOutputType as string | null)
          : undefined,
      runtimeModelOptions:
        body.runtimeModelOptions === null
          ? null
          : body.runtimeModelOptions && typeof body.runtimeModelOptions === "object" && !Array.isArray(body.runtimeModelOptions)
            ? (body.runtimeModelOptions as Record<string, unknown>)
            : undefined,
      knowledgeBindings:
        body.knowledgeBindings === null
          ? null
          : Array.isArray(body.knowledgeBindings)
            ? (body.knowledgeBindings as number[])
            : undefined,
      knowledgeRetrievalPolicy:
        body.knowledgeRetrievalPolicy === null
          ? null
          : body.knowledgeRetrievalPolicy &&
              typeof body.knowledgeRetrievalPolicy === "object" &&
              !Array.isArray(body.knowledgeRetrievalPolicy)
            ? (body.knowledgeRetrievalPolicy as Record<string, unknown>)
            : undefined,
      toolBindings:
        body.toolBindings === null
          ? null
          : body.toolBindings && typeof body.toolBindings === "object" && !Array.isArray(body.toolBindings)
            ? (body.toolBindings as Record<string, unknown>)
            : undefined,
      skillBindings:
        body.skillBindings === null
          ? null
          : body.skillBindings && typeof body.skillBindings === "object" && !Array.isArray(body.skillBindings)
            ? (body.skillBindings as Record<string, unknown>)
            : undefined,
      mcpBindings:
        body.mcpBindings === null
          ? null
          : body.mcpBindings && typeof body.mcpBindings === "object" && !Array.isArray(body.mcpBindings)
            ? (body.mcpBindings as Record<string, unknown>)
            : undefined,
      artifactKinds:
        body.artifactKinds === null ? null : Array.isArray(body.artifactKinds) ? (body.artifactKinds as string[]) : undefined,
      visibility:
        body.visibility === "shared" ? "shared" : body.visibility === "private" ? "private" : undefined,
      metadata:
        body.metadata === null
          ? null
          : body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined,
    })

    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "custom_agent_update_failed"
    const status =
      message === "invalid_agent_id" ||
      message === "workflow_definition_not_found" ||
      message === "invalid_personal_knowledge_binding"
        ? 400
        : message === "custom_agent_not_found"
          ? 404
          : message === "forbidden"
            ? 403
            : 500
    return NextResponse.json({ error: message }, { status })
  }
}
