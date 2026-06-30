import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  canManageCustomAgents,
  createCustomAgent,
  listCustomAgentsForUser,
} from "@/lib/platform/custom-agents"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!currentUser.enterpriseId || !canManageCustomAgents(currentUser)) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const items = await listCustomAgentsForUser({
      enterpriseId: currentUser.enterpriseId,
      userId: currentUser.id,
      isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
    })
    return NextResponse.json({ data: { items } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "custom_agents_list_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!currentUser.enterpriseId || !canManageCustomAgents(currentUser)) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const created = await createCustomAgent({
      enterpriseId: currentUser.enterpriseId,
      ownerUserId: currentUser.id,
      sourceAgentId: typeof body.sourceAgentId === "string" ? body.sourceAgentId : null,
      linkedWorkflowId: typeof body.linkedWorkflowId === "number" ? body.linkedWorkflowId : null,
      name: typeof body.name === "string" ? body.name : "",
      summary: typeof body.summary === "string" ? body.summary : null,
      systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : null,
      systemPromptSummary: typeof body.systemPromptSummary === "string" ? body.systemPromptSummary : null,
      goal: typeof body.goal === "string" ? body.goal : null,
      scope: typeof body.scope === "string" ? body.scope : null,
      guardrails: typeof body.guardrails === "string" ? body.guardrails : null,
      defaultOutputType: typeof body.defaultOutputType === "string" ? body.defaultOutputType : null,
      runtimeModelOptions:
        body.runtimeModelOptions && typeof body.runtimeModelOptions === "object" && !Array.isArray(body.runtimeModelOptions)
          ? (body.runtimeModelOptions as Record<string, unknown>)
          : null,
      knowledgeBindings: Array.isArray(body.knowledgeBindings) ? (body.knowledgeBindings as number[]) : null,
      knowledgeRetrievalPolicy:
        body.knowledgeRetrievalPolicy &&
        typeof body.knowledgeRetrievalPolicy === "object" &&
        !Array.isArray(body.knowledgeRetrievalPolicy)
          ? (body.knowledgeRetrievalPolicy as Record<string, unknown>)
          : null,
      toolBindings: body.toolBindings && typeof body.toolBindings === "object" && !Array.isArray(body.toolBindings)
        ? (body.toolBindings as Record<string, unknown>)
        : null,
      skillBindings:
        body.skillBindings && typeof body.skillBindings === "object" && !Array.isArray(body.skillBindings)
          ? (body.skillBindings as Record<string, unknown>)
          : null,
      mcpBindings: body.mcpBindings && typeof body.mcpBindings === "object" && !Array.isArray(body.mcpBindings)
        ? (body.mcpBindings as Record<string, unknown>)
        : null,
      artifactKinds: Array.isArray(body.artifactKinds) ? (body.artifactKinds as string[]) : null,
      visibility: body.visibility === "shared" ? "shared" : "private",
      status: body.status === "published" ? "published" : "draft",
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null,
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "custom_agent_create_failed"
    const status =
      message === "custom_agent_name_required" ||
      message === "invalid_personal_knowledge_binding" ||
      message === "workflow_definition_not_found"
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
