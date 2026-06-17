import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getKnowledgeSource, saveRagflowKnowledgeSource, toKnowledgeSourceClientState } from "@/lib/knowledge/service"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const source = await getKnowledgeSource(currentUser.enterpriseId)
    return NextResponse.json({ data: toKnowledgeSourceClientState(source) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_source_read_failed" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }
    if (currentUser.enterpriseRole !== "admin") {
      return NextResponse.json({ error: "admin_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : ""
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    if (!baseUrl) {
      return NextResponse.json({ error: "knowledge_source_base_url_required" }, { status: 400 })
    }

    const result = await saveRagflowKnowledgeSource({
      enterpriseId: currentUser.enterpriseId,
      name: typeof body.name === "string" ? body.name : null,
      baseUrl,
      apiKey,
      enabled: body.enabled !== false,
    })

    return NextResponse.json({
      data: {
        ...result,
        source: toKnowledgeSourceClientState(result.source),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_source_save_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
