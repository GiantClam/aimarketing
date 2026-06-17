import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { requestKnowledgeDocumentReparse } from "@/lib/knowledge/service"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }
    if (currentUser.enterpriseRole !== "admin") {
      return NextResponse.json({ error: "admin_required" }, { status: 403 })
    }

    const { documentId } = await context.params
    const updated = await requestKnowledgeDocumentReparse(
      Number.parseInt(documentId, 10),
      currentUser.enterpriseId,
    )
    return NextResponse.json({ data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_document_reparse_failed"
    const status =
      message === "knowledge_document_not_found"
        ? 404
        : message === "knowledge_source_not_configured" || message === "knowledge_dataset_required"
          ? 400
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
