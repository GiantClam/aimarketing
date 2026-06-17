import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getKnowledgeSource, refreshKnowledgeSourceConnection } from "@/lib/knowledge/service"
import type { KnowledgeSource } from "@/lib/knowledge/types"
import { toKnowledgeSourceClientState } from "@/lib/knowledge/service"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const requestSource =
      typeof body.baseUrl === "string" && typeof body.apiKey === "string"
        ? ({
            id: null,
            enterpriseId: currentUser.enterpriseId,
            providerType: "ragflow",
            name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "RAGFlow Enterprise Knowledge",
            baseUrl: body.baseUrl.trim(),
            apiKey: body.apiKey.trim(),
            status: "degraded",
            enabled: body.enabled !== false,
            lastCheckedAt: null,
            lastError: null,
          } satisfies KnowledgeSource)
        : await getKnowledgeSource(currentUser.enterpriseId)
    const shouldPersist = requestSource?.id != null || body.persist === true

    if (!requestSource) {
      return NextResponse.json({ error: "knowledge_source_not_configured" }, { status: 400 })
    }

    const result = await refreshKnowledgeSourceConnection({
      enterpriseId: currentUser.enterpriseId,
      requestSource,
      persist: shouldPersist,
      syncDatasets: shouldPersist,
    })
    return NextResponse.json({
      data: {
        test: result.test,
        source: toKnowledgeSourceClientState(result.source),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_source_test_failed" },
      { status: 500 },
    )
  }
}
