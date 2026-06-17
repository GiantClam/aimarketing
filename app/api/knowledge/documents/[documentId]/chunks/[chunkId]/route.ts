import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { saveKnowledgeDocumentChunkEdit } from "@/lib/knowledge/service"

export const runtime = "nodejs"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ documentId: string; chunkId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }
    if (currentUser.enterpriseRole !== "admin") {
      return NextResponse.json({ error: "admin_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const content = typeof body.content === "string" ? body.content : ""
    const excerpt = typeof body.excerpt === "string" ? body.excerpt : null
    const { documentId, chunkId } = await context.params

    const chunk = await saveKnowledgeDocumentChunkEdit({
      documentId: Number.parseInt(documentId, 10),
      chunkId: Number.parseInt(chunkId, 10),
      enterpriseId: currentUser.enterpriseId,
      content,
      excerpt,
    })

    return NextResponse.json({ data: chunk })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_chunk_update_failed"
    const status =
      message === "knowledge_document_not_found"
        ? 404
        : message === "knowledge_chunk_not_found"
          ? 404
          : message === "knowledge_chunk_content_required"
            ? 400
            : 500

    return NextResponse.json({ error: message }, { status })
  }
}
