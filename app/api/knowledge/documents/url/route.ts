import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { ingestKnowledgeUrl } from "@/lib/knowledge/service"
import type { KnowledgeScope } from "@/lib/knowledge/types"

export const runtime = "nodejs"

function normalizeScope(value: unknown): KnowledgeScope {
  if (
    value === "brand" ||
    value === "product" ||
    value === "case-study" ||
    value === "compliance" ||
    value === "campaign"
  ) {
    return value
  }
  return "general"
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const url = typeof body.url === "string" ? body.url.trim() : ""
    if (!url) {
      return NextResponse.json({ error: "knowledge_url_required" }, { status: 400 })
    }

    const created = await ingestKnowledgeUrl({
      enterpriseId: currentUser.enterpriseId,
      datasetId: typeof body.datasetId === "number" ? body.datasetId : null,
      category: normalizeScope(body.category),
      url,
    })

    return NextResponse.json({ data: created })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_document_url_failed" },
      { status: 500 },
    )
  }
}
