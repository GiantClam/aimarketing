import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { listKnowledgeDocumentsSnapshot } from "@/lib/knowledge/service"
import type { KnowledgeDocumentStatus, KnowledgeScope } from "@/lib/knowledge/types"

export const runtime = "nodejs"

function normalizeStatus(value: string | null): KnowledgeDocumentStatus | null {
  if (
    value === "uploaded" ||
    value === "parsing" ||
    value === "ready" ||
    value === "failed" ||
    value === "reparsing" ||
    value === "disabled"
  ) {
    return value
  }
  return null
}

function normalizeScope(value: string | null): KnowledgeScope | null {
  if (
    value === "general" ||
    value === "brand" ||
    value === "product" ||
    value === "case-study" ||
    value === "compliance" ||
    value === "campaign"
  ) {
    return value
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const category = searchParams.get("category")
    const q = searchParams.get("q")

    const documents = await listKnowledgeDocumentsSnapshot(currentUser.enterpriseId, {
      status: normalizeStatus(status),
      category: normalizeScope(category),
      q: q || null,
    })

    return NextResponse.json({ data: { items: documents } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_documents_failed" },
      { status: 500 },
    )
  }
}
